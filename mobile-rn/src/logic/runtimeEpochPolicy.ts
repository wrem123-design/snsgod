/** True only while an async operation still belongs to the active runtime state generation. */
export function canCommitRuntimeEpoch(
  currentEpoch: number,
  operationEpoch: number,
  restoring: boolean,
): boolean {
  return !restoring && currentEpoch === operationEpoch;
}
