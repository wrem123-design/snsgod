import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme';
import { NotificationDisplayPreferences, SNSGodState } from '../../types';
import { AutomationNotificationChannelState, getAutomationNotificationChannelState, openAutomationNotificationChannelSettings } from '../../logic/backgroundAutomation';

type NotificationSettingsSectionProps = {
  state: SNSGodState;
  visible: boolean;
  onCommitCurrent: (patch: (current: SNSGodState) => SNSGodState) => Promise<SNSGodState | undefined> | SNSGodState | undefined;
};

type NotificationPreferenceKey = keyof NotificationDisplayPreferences;

/** Renders system-alert controls while preserving app-internal message behavior. */
export function NotificationSettingsSection({ state, visible, onCommitCurrent }: NotificationSettingsSectionProps) {
  const preferences = state.config.notificationPreferences || {};
  const [automationChannel, setAutomationChannel] = useState<AutomationNotificationChannelState>('unavailable');
  const refreshAutomationChannel = useCallback(async (): Promise<void> => {
    setAutomationChannel(await getAutomationNotificationChannelState());
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    void refreshAutomationChannel();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') void refreshAutomationChannel();
    });
    return () => subscription.remove();
  }, [refreshAutomationChannel, visible]);

  function setPreference(key: NotificationPreferenceKey, value: boolean): void {
    void onCommitCurrent(current => ({
      ...current,
      config: {
        ...current.config,
        notificationPreferences: { ...(current.config.notificationPreferences || {}), [key]: value },
      },
    }));
  }

  return (
    <View style={[styles.card, !visible && styles.hidden]} accessibilityLabel="휴대폰 알림 설정">
      <Text style={styles.title}>휴대폰 알림</Text>
      <Text style={styles.help}>여기서는 휴대폰 상태바와 알림창에 표시할 종류만 고릅니다. 꺼도 메시지 생성과 앱 내부 저장·읽지 않음 표시는 계속 동작합니다.</Text>
      <SwitchRow label="답장 메시지" description="내 메시지에 대한 캐릭터 답장을 휴대폰 알림으로 표시합니다." value={preferences.replies !== false} onChange={value => setPreference('replies', value)} />
      <SwitchRow label="캐릭터 선톡" description="캐릭터가 먼저 보낸 메시지를 휴대폰 알림으로 표시합니다." value={preferences.proactive !== false} onChange={value => setPreference('proactive', value)} />
      <View style={styles.row} accessibilityLabel="백그라운드 자동화 상태 알림">
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>백그라운드 자동화 상태</Text>
          <Text style={styles.rowDescription}>Android 필수 알림입니다. 채널을 꺼도 자동화 처리는 계속되며 Android의 실행 중 앱 목록에는 남을 수 있습니다.</Text>
        </View>
        <Pressable
          onPress={() => void openAutomationNotificationChannelSettings()}
          style={styles.channelButton}
          accessibilityRole="button"
          accessibilityLabel="백그라운드 자동화 알림 Android 설정 열기"
        >
          <Text style={styles.channelButtonText}>{automationChannel === 'enabled' ? '켜짐' : automationChannel === 'disabled' ? '꺼짐' : '설정'}</Text>
        </Pressable>
      </View>
      <View style={styles.systemBox}>
        <Text style={styles.systemTitle}>Android 알림 권한</Text>
        <Text style={styles.help}>{state.config.serverMessaging?.pushPermissionGranted === false ? '현재 휴대폰에서 SNSGod 알림 표시가 차단되어 있습니다.' : '앱 종류별 설정과 별도로 Android 전체 알림 권한을 관리합니다.'}</Text>
        <Pressable onPress={() => void Linking.openSettings()} style={styles.systemButton} accessibilityRole="button">
          <Text style={styles.systemButtonText}>휴대폰 알림 설정 열기</Text>
        </Pressable>
      </View>
      <Text style={styles.footnote}>종류별 메시지 알림과 자동화 상태 알림은 서로 다른 Android 채널을 사용합니다.</Text>
    </View>
  );
}

function SwitchRow({ label, description, value, onChange }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Text style={[styles.switchPill, value && styles.switchPillActive]}>{value ? '켬' : '끔'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  hidden: { display: 'none' },
  title: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  help: { color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 8 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rowDescription: { color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  switchPill: { minWidth: 42, minHeight: 42, borderRadius: 8, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: colors.sub, backgroundColor: colors.surfaceAlt, fontWeight: '900' },
  switchPillActive: { color: colors.accentText, backgroundColor: colors.accent },
  channelButton: { minWidth: 42, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  channelButtonText: { color: colors.text, fontWeight: '900' },
  systemBox: { marginTop: 12, gap: 8, borderRadius: 8, backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.border, padding: 12 },
  systemTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  systemButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.surfaceAlt },
  systemButtonText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  footnote: { marginTop: 12, color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
