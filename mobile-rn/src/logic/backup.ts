import { SNSGodState } from '../types';

function stripProfileSecrets(profile: Record<string, unknown>) {
  return {
    ...profile,
    apiKey: '',
    apiKeys: [],
    serviceAccountJson: '',
    proxyAccessToken: ''
  };
}

export function stateWithoutSecrets(state: SNSGodState): SNSGodState {
  const apiProfiles = Object.fromEntries(Object.entries(state.config.apiProfiles || {}).map(([key, value]) => [
    key,
    stripProfileSecrets((value || {}) as Record<string, unknown>)
  ]));
  return {
    ...state,
    config: {
      ...state.config,
      apiProfiles,
      imageGeneration: state.config.imageGeneration ? {
        ...state.config.imageGeneration,
        apiKey: ''
      } : state.config.imageGeneration
    }
  };
}

export function createBackupPayload(state: SNSGodState, options: { includeMedia?: boolean } = {}) {
  return {
    version: 'snsgod-rn-backup-v1',
    exportedAt: Date.now(),
    mediaMode: options.includeMedia ? 'inline-or-file-ref' : 'state-only',
    state: stateWithoutSecrets(state)
  };
}
