import type { SNSGodState } from '../types';

type ServerConnectionInput = {
  baseUrl: string;
  pairingSecret: string;
  requestId?: string;
};

function normalizeServerUrl(value: string | undefined): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

const EXPIRED_DEVICE_MESSAGE = '기기 인증이 만료되었습니다. 서버 연결 키를 입력해 기기를 다시 등록하세요.';

/** Identifies a rejected registered-device credential without exposing it. */
export class ServerAuthenticationError extends Error {
  constructor() {
    super(EXPIRED_DEVICE_MESSAGE);
    this.name = 'ServerAuthenticationError';
  }
}

/** Returns true only when a complete saved device identity is unavailable. */
export function requiresServerRegistration(state: SNSGodState): boolean {
  const config = state.config.serverMessaging;
  return !String(config?.deviceId || '').trim() || !String(config?.deviceToken || '').trim();
}

/** Converts a server response into a safe user-facing error classification. */
export function serverRequestError(status: number, payload: unknown): Error {
  if (status === 401) return new ServerAuthenticationError();
  const message = payload && typeof payload === 'object'
    ? String((payload as { error?: unknown }).error || '')
    : '';
  return new Error(message || `서버 요청 실패 (${status})`);
}

/** Clears only credentials and progress bound to a rejected device token. */
export function invalidateServerRegistration(state: SNSGodState): SNSGodState {
  const existing = state.config.serverMessaging || {};
  return {
    ...state,
    config: {
      ...state.config,
      serverMessaging: {
        ...existing,
        deviceToken: undefined,
        syncCursor: 0,
        lastSyncAt: undefined,
        lastError: EXPIRED_DEVICE_MESSAGE,
      },
    },
  };
}

/** Applies an authentication failure only to the exact identity that sent it. */
export function invalidateServerRegistrationForRequest(
  current: SNSGodState,
  requested: SNSGodState,
  requestId: string,
): SNSGodState {
  const currentConfig = current.config.serverMessaging;
  const requestedConfig = requested.config.serverMessaging;
  if (!requestId || currentConfig?.connectionRequestId !== requestId) return current;
  if (normalizeServerUrl(currentConfig?.baseUrl) !== normalizeServerUrl(requestedConfig?.baseUrl)) return current;
  if (currentConfig?.deviceId !== requestedConfig?.deviceId) return current;
  if (currentConfig?.deviceToken !== requestedConfig?.deviceToken) return current;
  return invalidateServerRegistration(current);
}

/**
 * Applies user-entered server settings and clears credentials and progress that
 * are only valid for the previous endpoint.
 */
export function withServerConnectionSettings(
  state: SNSGodState,
  input: ServerConnectionInput,
): SNSGodState {
  const existing = state.config.serverMessaging || {};
  const baseUrl = normalizeServerUrl(input.baseUrl);
  const serverChanged = baseUrl !== normalizeServerUrl(existing.baseUrl);
  return {
    ...state,
    config: {
      ...state.config,
      serverMessaging: {
        ...existing,
        enabled: true,
        baseUrl,
        connectionRequestId: input.requestId || existing.connectionRequestId,
        pairingSecret: input.pairingSecret.trim()
          || (serverChanged ? '' : existing.pairingSecret || ''),
        lastError: '',
        ...(serverChanged ? {
          deviceId: undefined,
          deviceToken: undefined,
          syncCursor: 0,
          lastSyncAt: undefined,
          outbox: [],
        } : {}),
      },
    },
  };
}
