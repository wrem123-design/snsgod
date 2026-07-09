import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { appendDebugLog } from './debugLog';

type AutomationKeepAliveNative = {
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  isSupported?: () => Promise<boolean>;
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  requestIgnoreBatteryOptimizations?: () => Promise<string>;
  openBatteryOptimizationSettings?: () => Promise<boolean>;
  openAppDetailsSettings?: () => Promise<boolean>;
};

const nativeModule = (NativeModules.AutomationKeepAlive || null) as AutomationKeepAliveNative | null;

const BATTERY_PROMPT_KEY = 'snsgod.battery_opt_prompt_v1';
const BATTERY_PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

let lastDesiredRunning: boolean | undefined;
let batteryPromptInFlight = false;

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try {
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (granted) return;
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch (error) {
    void appendDebugLog('keepalive.permission', String(error instanceof Error ? error.message : error), 'warn');
  }
}

export function isAutomationKeepAliveAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(nativeModule?.start && nativeModule?.stop);
}

export async function setAutomationKeepAliveRunning(enabled: boolean, options?: { force?: boolean }): Promise<void> {
  if (!isAutomationKeepAliveAvailable() || !nativeModule) return;
  if (!options?.force && lastDesiredRunning === enabled) return;
  lastDesiredRunning = enabled;
  try {
    if (enabled) {
      await ensureNotificationPermission();
      await nativeModule.start();
      void appendDebugLog('keepalive', options?.force ? 'foreground service restarted' : 'foreground service started');
    } else {
      await nativeModule.stop();
      void appendDebugLog('keepalive', 'foreground service stopped');
    }
  } catch (error) {
    lastDesiredRunning = undefined;
    void appendDebugLog('keepalive', String(error instanceof Error ? error.message : error), 'warn');
  }
}

/** Real device check via PowerManager.isIgnoringBatteryOptimizations. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!nativeModule?.isIgnoringBatteryOptimizations) {
    void appendDebugLog('battery', 'native battery check unavailable', 'warn');
    return true;
  }
  try {
    return Boolean(await nativeModule.isIgnoringBatteryOptimizations());
  } catch (error) {
    void appendDebugLog('battery', `check failed: ${String(error instanceof Error ? error.message : error)}`, 'warn');
    // Fail closed for prompting: do not nag when status is unknown.
    return true;
  }
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    return false;
  }
}

export type RecommendedOptimizationStatus = {
  ready: boolean;
  line: string;
  batteryExcluded: boolean;
  notificationsAllowed: boolean;
  keepAliveAvailable: boolean;
};

/**
 * One-line summary of recommended background settings on the real device.
 */
export async function getRecommendedOptimizationStatus(): Promise<RecommendedOptimizationStatus> {
  if (Platform.OS !== 'android') {
    return {
      ready: true,
      line: '추천 설정: Android 전용 (이 기기에서는 해당 없음)',
      batteryExcluded: true,
      notificationsAllowed: true,
      keepAliveAvailable: false
    };
  }

  const [batteryExcluded, notificationsAllowed] = await Promise.all([
    isIgnoringBatteryOptimizations(),
    isNotificationPermissionGranted()
  ]);
  const keepAliveAvailable = isAutomationKeepAliveAvailable();

  const missing: string[] = [];
  if (!batteryExcluded) missing.push('배터리 제외');
  if (!notificationsAllowed) missing.push('알림 허용');
  if (!keepAliveAvailable) missing.push('백그라운드 유지 모듈');

  if (!missing.length) {
    return {
      ready: true,
      line: '추천 설정: 모두 적용됨 · 배터리 제외·알림 허용 OK',
      batteryExcluded,
      notificationsAllowed,
      keepAliveAvailable
    };
  }

  return {
    ready: false,
    line: `추천 설정: 미완료 · ${missing.join(' · ')} 필요`,
    batteryExcluded,
    notificationsAllowed,
    keepAliveAvailable
  };
}

async function markBatteryPrompt(result: 'later' | 'never' | 'opened'): Promise<void> {
  try {
    await AsyncStorage.setItem(BATTERY_PROMPT_KEY, JSON.stringify({
      result,
      at: Date.now()
    }));
  } catch {
    // ignore storage failures
  }
}

async function isAutoPromptCooldownActive(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(BATTERY_PROMPT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { result?: string; at?: number };
    if (parsed.result === 'never') return true;
    if (parsed.result !== 'later' && parsed.result !== 'opened') return false;
    const at = Number(parsed.at || 0);
    if (!Number.isFinite(at) || at <= 0) return false;
    return Date.now() - at < BATTERY_PROMPT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Prompt only when the phone reports battery optimization is still ON for this app.
 * force=true (settings button) re-checks the device and skips only when already excluded.
 */
export async function maybePromptBatteryOptimizationExemption(options?: { force?: boolean }): Promise<void> {
  if (Platform.OS !== 'android' || batteryPromptInFlight) return;
  if (!nativeModule?.isIgnoringBatteryOptimizations) return;
  if (!nativeModule.requestIgnoreBatteryOptimizations && !nativeModule.openBatteryOptimizationSettings) return;

  batteryPromptInFlight = true;
  try {
    // Always inspect the real device flag first.
    const ignoring = await isIgnoringBatteryOptimizations();
    if (ignoring) {
      void appendDebugLog('battery', 'already excluded from battery optimization (device check)');
      if (options?.force) {
        Alert.alert('이미 적용됨', '이 기기에서 SNSGod은 배터리 최적화 제외 상태입니다. 추가로 켤 설정이 없습니다.');
      }
      return;
    }

    if (!options?.force) {
      // Auto launch: respect "later / never" cooldown only after device says not excluded.
      if (await isAutoPromptCooldownActive()) {
        void appendDebugLog('battery', 'prompt skipped by user preference cooldown');
        return;
      }
    }

    await ensureNotificationPermission();

    await new Promise<void>(resolve => {
      Alert.alert(
        '백그라운드 안정 실행',
        [
          '지금 기기 설정에서 SNSGod이 배터리 최적화 대상입니다.',
          '선톡·답장·SNS 자동화가 백그라운드에서 끊기지 않으려면 제외가 필요합니다.',
          '',
          '1) 배터리 사용량 최적화에서 SNSGod 제외',
          '2) 알림 허용 (「자동화 실행 중」 표시)',
          '',
          '제조사 절전 앱이 있으면 제외 목록에도 넣어 주세요.'
        ].join('\n'),
        [
          {
            text: '나중에',
            style: 'cancel',
            onPress: () => {
              void markBatteryPrompt('later');
              void appendDebugLog('battery', 'prompt deferred');
              resolve();
            }
          },
          {
            text: '다시 묻지 않기',
            onPress: () => {
              void markBatteryPrompt('never');
              void appendDebugLog('battery', 'prompt dismissed permanently');
              resolve();
            }
          },
          {
            text: '설정 열기',
            onPress: () => {
              void (async () => {
                try {
                  // Re-check right before opening settings in case user changed it.
                  if (await isIgnoringBatteryOptimizations()) {
                    Alert.alert('이미 적용됨', '방금 확인한 결과 배터리 최적화 제외가 이미 켜져 있습니다.');
                    resolve();
                    return;
                  }
                  if (nativeModule?.requestIgnoreBatteryOptimizations) {
                    const result = await nativeModule.requestIgnoreBatteryOptimizations();
                    void appendDebugLog('battery', `request result=${result}`);
                    await markBatteryPrompt('opened');
                  } else if (nativeModule?.openBatteryOptimizationSettings) {
                    await nativeModule.openBatteryOptimizationSettings();
                    await markBatteryPrompt('opened');
                  }
                } catch (error) {
                  void appendDebugLog('battery', String(error instanceof Error ? error.message : error), 'warn');
                  try {
                    await nativeModule?.openAppDetailsSettings?.();
                    await markBatteryPrompt('opened');
                  } catch {
                    // ignore
                  }
                } finally {
                  resolve();
                }
              })();
            }
          }
        ],
        { cancelable: true, onDismiss: () => resolve() }
      );
    });
  } finally {
    batteryPromptInFlight = false;
  }
}
