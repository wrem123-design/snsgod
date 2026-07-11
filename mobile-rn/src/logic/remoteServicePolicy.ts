import type { SNSGodConfig, SNSGodState } from '../types';

export type DataBoundaryMode = 'local-only' | 'remote-assisted';

/**
 * Resolves the app's data boundary while preserving explicitly configured
 * legacy Oracle installations during migration.
 */
export function resolvedDataBoundaryMode(config: SNSGodConfig): DataBoundaryMode {
  if (config.dataBoundaryMode === 'local-only' || config.dataBoundaryMode === 'remote-assisted') {
    return config.dataBoundaryMode;
  }
  return config.serverMessaging?.enabled === true ? 'remote-assisted' : 'local-only';
}

/** Reports whether background server registration or synchronization is allowed. */
export function isRemoteServicesEnabled(state: SNSGodState): boolean {
  return resolvedDataBoundaryMode(state.config) === 'remote-assisted';
}

/**
 * Changes the data boundary. Disabling remote services invalidates pending
 * connection results and drops only the unsent server outbox; local messages
 * and reusable device credentials remain untouched.
 */
export function withDataBoundaryMode(state: SNSGodState, mode: DataBoundaryMode): SNSGodState {
  if (mode === 'remote-assisted') {
    return { ...state, config: { ...state.config, dataBoundaryMode: mode } };
  }
  const serverMessaging = state.config.serverMessaging;
  return {
    ...state,
    config: {
      ...state.config,
      dataBoundaryMode: mode,
      serverMessaging: serverMessaging ? {
        ...serverMessaging,
        enabled: false,
        pairingSecret: '',
        connectionRequestId: undefined,
        outbox: [],
        lastError: '',
      } : serverMessaging,
    },
  };
}
