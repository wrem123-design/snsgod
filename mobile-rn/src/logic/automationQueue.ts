import { SNSGodState } from '../types';
import { runAutomationTick } from './automation';

let automationInFlight: Promise<SNSGodState> | undefined;
let queuedState: SNSGodState | undefined;

export async function runAutomationQueueTick(state: SNSGodState): Promise<SNSGodState> {
  queuedState = state;
  if (automationInFlight) return automationInFlight;
  automationInFlight = (async () => {
    try {
      const current = queuedState || state;
      queuedState = undefined;
      return await runAutomationTick(current);
    } finally {
      automationInFlight = undefined;
    }
  })();
  return automationInFlight;
}

export function isAutomationQueueBusy(): boolean {
  return Boolean(automationInFlight);
}
