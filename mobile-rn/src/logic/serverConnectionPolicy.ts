import type { SNSGodState } from '../types';

type ServerConnectionInput = {
  baseUrl: string;
  pairingSecret: string;
  requestId?: string;
};

function normalizeServerUrl(value: string | undefined): string {
  return String(value || '').trim().replace(/\/+$/, '');
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
