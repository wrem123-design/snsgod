import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MESSAGE_CHANNEL_ID = 'snsgod_messages';

export type PushNotificationInitialization = {
  pushToken?: string;
  permissionGranted: boolean;
  canAskAgain: boolean;
  registrationError: string;
  removeTokenListener: () => void;
};

export type PushNotificationRegistration = Omit<PushNotificationInitialization, 'removeTokenListener'>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

function androidFcmToken(token: Notifications.DevicePushToken): string | undefined {
  if (Platform.OS !== 'android' || token.type !== 'android' || typeof token.data !== 'string') return undefined;
  const value = token.data.trim();
  return value || undefined;
}

/**
 * Reads notification permission and the native FCM token independently.
 *
 * Android can issue an FCM token even when notification display permission is
 * disabled. Keeping the two states separate lets Oracle retain a valid device
 * registration while the settings screen explains how to restore alerts.
 */
export async function refreshPushNotificationRegistration(
  requestPermission: boolean
): Promise<PushNotificationRegistration> {
  if (Platform.OS !== 'android') {
    return { permissionGranted: true, canAskAgain: false, registrationError: '' };
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission = requestPermission && !existingPermission.granted && existingPermission.canAskAgain !== false
    ? await Notifications.requestPermissionsAsync()
    : existingPermission;
  try {
    const pushToken = androidFcmToken(await Notifications.getDevicePushTokenAsync());
    return {
      pushToken,
      permissionGranted: permission.granted,
      canAskAgain: permission.canAskAgain !== false,
      registrationError: pushToken ? '' : 'FCM 기기 토큰을 발급받지 못했습니다.'
    };
  } catch (error) {
    return {
      permissionGranted: permission.granted,
      canAskAgain: permission.canAskAgain !== false,
      registrationError: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Prepares Android notifications and returns the native FCM registration token.
 * The token is intentionally never logged because it identifies an app install.
 */
export async function initializePushNotifications(
  onTokenChanged: (pushToken: string) => void,
  requestPermission: boolean
): Promise<PushNotificationInitialization> {
  if (Platform.OS !== 'android') {
    return {
      permissionGranted: true,
      canAskAgain: false,
      registrationError: '',
      removeTokenListener: () => undefined
    };
  }

  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: '메시지',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250]
  });

  const subscription = Notifications.addPushTokenListener(token => {
    const nextToken = androidFcmToken(token);
    if (nextToken) onTokenChanged(nextToken);
  });
  const registration = await refreshPushNotificationRegistration(requestPermission);
  const registrationAvailable = Boolean(registration.pushToken);
  console.info(`[SNSGod push] native registration ${registrationAvailable ? 'ready' : 'unavailable'}`);
  return {
    ...registration,
    removeTokenListener: () => subscription.remove()
  };
}
