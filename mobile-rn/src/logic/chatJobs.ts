import { makeId } from './ids';

const activeJobs = new Map<string, string>();
const generatingRooms = new Map<string, string>();
const jobTimers = new Map<string, ReturnType<typeof setTimeout>>();
const JOB_TTL_MS = 5 * 60 * 1000;

function timerKey(roomId: string, jobId: string) {
  return `${roomId}:${jobId}`;
}

function armJobTimeout(roomId: string, jobId: string) {
  const key = timerKey(roomId, jobId);
  const existing = jobTimers.get(key);
  if (existing) clearTimeout(existing);
  jobTimers.set(key, setTimeout(() => {
    if (activeJobs.get(roomId) === jobId) activeJobs.delete(roomId);
    if (generatingRooms.get(roomId) === jobId) generatingRooms.delete(roomId);
    jobTimers.delete(key);
  }, JOB_TTL_MS));
}

function clearJobTimeout(roomId: string, jobId: string) {
  const key = timerKey(roomId, jobId);
  const timer = jobTimers.get(key);
  if (timer) clearTimeout(timer);
  jobTimers.delete(key);
}

export function beginChatJob(roomId: string): string {
  const jobId = makeId('job');
  activeJobs.set(roomId, jobId);
  armJobTimeout(roomId, jobId);
  return jobId;
}

export function isCurrentChatJob(roomId: string, jobId: string): boolean {
  return activeJobs.get(roomId) === jobId;
}

export function endChatJob(roomId: string, jobId: string): void {
  if (activeJobs.get(roomId) === jobId) activeJobs.delete(roomId);
  if (generatingRooms.get(roomId) === jobId) generatingRooms.delete(roomId);
  clearJobTimeout(roomId, jobId);
}

export function cancelChatJob(roomId: string): void {
  const jobId = activeJobs.get(roomId) || generatingRooms.get(roomId);
  activeJobs.delete(roomId);
  generatingRooms.delete(roomId);
  if (jobId) clearJobTimeout(roomId, jobId);
}

export function tryLockGeneratingRoom(roomId: string, jobId: string): boolean {
  if (generatingRooms.has(roomId)) return false;
  generatingRooms.set(roomId, jobId);
  return true;
}

export function isRoomBusy(roomId: string): boolean {
  return generatingRooms.has(roomId) || activeJobs.has(roomId);
}
