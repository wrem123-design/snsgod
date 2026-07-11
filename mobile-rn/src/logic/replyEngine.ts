import { callLLM, generateImageDataUri, imagePromptWithoutCharacterName } from './api';
import { beginChatJob, cancelChatJob, endChatJob, isCurrentChatJob, tryLockGeneratingRoom, tryResumeChatJob } from './chatJobs';
import { shouldAllowChatImageGeneration } from './chatImageGuard';
import { characterReferenceImageForPrompt } from './imageReference';
import { makeId } from './ids';
import { isRenderableMediaUri } from './media';
import { markRoomRead } from './notifications';
import { phoneCardFromReply } from './phone';
import { buildChatPrompt, normalizeReplyMessagesForStyle } from './prompts';
import { createMeetingEventSession, shouldStartMeetingEvent } from './meetingEvent';
import { maybeCreateAutoSNSPost } from './sns';
import { appendMessage, findCharacter, findRoom, isRoomDisabled, roomMessages, updateCharacter } from './stateHelpers';
import { maybeRefreshPrivateRoomLlmSummary } from './roomConversationSummary';
import { chatNowContext, isImplausibleCompletedActivity, repairTimeRealityInstruction, softenImplausibleCompletedActivity } from './timeReality';
import { PendingReplyJob, PendingReplyPhase, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { appendDebugLog } from './debugLog';
import { characterWithConversationRhythm } from './conversationRhythm';
import { resolveCharacterRuntimeState } from './characterWorld';
import { ingestCharacterMemory } from './memoryPolicy';
import { mergeStaleState, preserveLatestDeletionInvariants } from './staleStateMergePolicy';
import { createPendingReplyJob, isPendingReplyActive, transitionPendingReplyJob } from './pendingReplyJobs';

type CommitPatch = (patch: (current: SNSGodState) => SNSGodState, options?: {
  persist?: boolean;
  save?: { important?: boolean; reason?: string };
  flush?: boolean;
}) => Promise<void> | void;

type StartReplyJobInput = {
  roomId: string;
  characterId: string;
  sourceMessageId?: string;
  latestUserInput: string;
  latestUserImageData?: string;
  userMessageCreatedAt?: number;
  randomMode?: boolean;
  resumeJob?: PendingReplyJob;
  getState: () => SNSGodState | null;
  commitCurrent: CommitPatch;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const REPLY_LLM_TIMEOUT_MS = 12 * 60 * 1000;
let replyLlmQueue: Promise<void> = Promise.resolve();

/** Starts a fresh reply generation queue after a full state-generation change. */
export function resetReplyLlmQueue(): void {
  replyLlmQueue = Promise.resolve();
}

async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 시간이 너무 오래 걸려 중단했습니다.`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runQueuedReplyLlm<T>(roomId: string, jobId: string, task: () => Promise<T>): Promise<T> {
  const previous = replyLlmQueue;
  let release: () => void = () => undefined;
  replyLlmQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    if (!isCurrentChatJob(roomId, jobId)) throw new Error('답장 작업이 새 메시지로 교체되었습니다.');
    await appendDebugLog('reply.queue', `LLM reply job started room=${roomId} job=${jobId}`);
    return await withTimeout(task(), REPLY_LLM_TIMEOUT_MS, 'AI 답장 생성');
  } finally {
    release();
  }
}

function clampDelay(value: unknown, fallback: number, max = 2700) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(max, number));
}

function characterDelayMs(state: SNSGodState | undefined, character: SNSGodCharacter) {
  const timedCharacter = characterWithConversationRhythm(state, character);
  const min = clampDelay(timedCharacter.responseDelayMin, 1, 120);
  const max = Math.max(min, clampDelay(timedCharacter.responseDelayMax, 8, 2700));
  const speed = Math.max(1, Math.min(10, Number(timedCharacter.responseTime || 6)));
  const randomSeconds = min + Math.random() * Math.max(0, max - min);
  const speedFactor = 1.15 - speed * 0.07;
  const availability = state ? resolveCharacterRuntimeState(state, character).phoneAvailability : 'available';
  const availabilityFactor = availability === 'sleeping' || availability === 'offline' ? 2.4 : availability === 'busy' ? 1.8 : availability === 'brief' ? 1.25 : 1;
  const seconds = Math.max(min, Math.min(max, randomSeconds * speedFactor * availabilityFactor));
  return Math.round(seconds * 1000);
}

function bubbleDelayMs(character: SNSGodCharacter, delay?: number) {
  const thinking = Math.max(1, Math.min(10, Number(character.thinkingTime || 6)));
  const base = Number.isFinite(Number(delay)) && Number(delay) > 0 ? Number(delay) * 1000 : 650 + thinking * 130;
  return Math.max(450, Math.min(8000, base));
}

/** Virtual gap between multi-bubble catch-up messages (timestamp only, not real wait). */
function bubbleStaggerMs(character: SNSGodCharacter, delay?: number) {
  const thinking = Math.max(1, Math.min(10, Number(character.thinkingTime || 6)));
  const base = Number.isFinite(Number(delay)) && Number(delay) > 0 ? Number(delay) * 1000 : 900 + thinking * 80;
  return Math.max(700, Math.min(4500, base));
}

function markUserMessagesRead(state: SNSGodState, roomId: string, readAt = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(state.messages, roomId)) return state;
  const at = Number(readAt) || Date.now();
  return {
    ...state,
    messages: {
      ...state.messages,
      [roomId]: (state.messages[roomId] || []).map(message => message.role === 'user' && !message.readAt ? { ...message, readAt: at } : message)
    }
  };
}

/**
 * Planned delivery clock for immersion:
 * character "should have" replied at userMessage time + personality delay.
 * Catch-up (app was dead) uses that past timestamp instead of "now when user opened the app".
 */
function planReplyTimeline(userMessageCreatedAt: number | undefined, replyDelayMs: number) {
  const now = Date.now();
  const userAt = Math.max(0, Number(userMessageCreatedAt || now) || now);
  const plannedReplyAt = userAt + Math.max(0, replyDelayMs);
  const remainingWaitMs = Math.max(0, plannedReplyAt - now);
  // Treat nearly-due replies as catch-up so reopening the app doesn't show a long fake type.
  const catchUp = remainingWaitMs <= 1500;
  const deliveryBaseAt = catchUp
    ? Math.min(now, Math.max(userAt + 800, plannedReplyAt))
    : plannedReplyAt;
  return { now, userAt, plannedReplyAt, remainingWaitMs, catchUp, deliveryBaseAt };
}

function planPersistedReplyTimeline(job: PendingReplyJob) {
  const now = Date.now();
  const userAt = Math.max(0, Number(job.sourceMessageCreatedAt || now) || now);
  const plannedReplyAt = Math.max(userAt, Number(job.scheduledAt || userAt));
  const remainingWaitMs = Math.max(0, plannedReplyAt - now);
  const catchUp = remainingWaitMs <= 1500;
  const deliveryBaseAt = catchUp ? Math.min(now, Math.max(userAt + 800, plannedReplyAt)) : plannedReplyAt;
  return { now, userAt, plannedReplyAt, remainingWaitMs, catchUp, deliveryBaseAt };
}

function storePendingJob(state: SNSGodState, job: PendingReplyJob) {
  return {
    ...state,
    pendingReplies: {
      ...(state.pendingReplies || {}),
      [job.roomId]: job,
    }
  };
}

function transitionPending(
  state: SNSGodState,
  roomId: string,
  jobId: string,
  phase: PendingReplyPhase,
  failureReason?: string,
) {
  const current = state.pendingReplies?.[roomId];
  if (!current || current.jobId !== jobId) return state;
  const next = transitionPendingReplyJob(current, phase, Date.now(), failureReason);
  return next === current ? state : storePendingJob(state, next);
}

function mergeGeneratedSns(current: SNSGodState, before: SNSGodState, generated: SNSGodState): SNSGodState {
  if (!Object.is(current.__importedAt, before.__importedAt)) return current;
  const mergedState = mergeStaleState(current, before, generated, { conflict: 'latest' });
  const beforePostIds = new Set((before.snsPosts || []).map(post => post.id));
  const currentPostIds = new Set((current.snsPosts || []).map(post => post.id));
  const newPosts = (generated.snsPosts || []).filter(post => !beforePostIds.has(post.id) && !currentPostIds.has(post.id));
  // Newest first, matching generateSNSPost ordering.
  const snsPosts = [...newPosts, ...(current.snsPosts || [])].slice(0, 120);
  const beforeThreadIds = new Set((before.snsDmThreads || []).map(thread => thread.id));
  const currentThreadIds = new Set((current.snsDmThreads || []).map(thread => thread.id));
  const newThreads = (generated.snsDmThreads || []).filter(thread => !beforeThreadIds.has(thread.id) && !currentThreadIds.has(thread.id));
  const snsDmThreads = [...newThreads, ...(current.snsDmThreads || [])].slice(0, 120);
  const notifications = [
    ...(generated.notifications || []).filter(item => !(current.notifications || []).some(existing => existing.id === item.id)),
    ...(current.notifications || [])
  ].slice(0, 100);
  const candidate: SNSGodState = {
    ...current,
    snsPosts,
    snsDmThreads,
    notifications,
    config: mergedState.config,
    characters: current.characters.map(character => {
      const generatedCharacter = generated.characters.find(item => item.id === character.id);
      if (!generatedCharacter) return character;
      const generatedCount = Number(generatedCharacter.lastSnsMessageCount || 0);
      const currentCount = Number(character.lastSnsMessageCount || 0);
      if (generatedCount <= currentCount) return character;
      return { ...character, lastSnsMessageCount: generatedCount };
    })
  };
  return preserveLatestDeletionInvariants(candidate, current, before);
}

function roomStillValid(state: SNSGodState | null, roomId: string, characterId: string): { room: SNSGodRoom; character: SNSGodCharacter } | undefined {
  if (!state) return undefined;
  const room = findRoom(state, roomId);
  const character = findCharacter(state, characterId || room?.characterId);
  if (!room || !character) return undefined;
  if (isRoomDisabled(state, roomId)) return undefined;
  return { room, character };
}

function appendPrivateMessageIfValid(
  state: SNSGodState,
  roomId: string,
  characterId: string,
  message: SNSGodMessage,
): SNSGodState {
  return roomStillValid(state, roomId, characterId)
    ? appendMessage(state, roomId, message)
    : state;
}

export function isReplyPending(state: SNSGodState, roomId: string): boolean {
  return isPendingReplyActive(state.pendingReplies?.[roomId]);
}

export async function startReplyJob(input: StartReplyJobInput) {
  const initialState = input.getState();
  const initial = roomStillValid(initialState, input.roomId, input.characterId);
  if (!initialState || !initial) return;
  const userMessages = (initialState.messages[input.roomId] || []).filter(message => message.role === 'user');
  const sourceMessage = input.sourceMessageId
    ? userMessages.find(message => message.id === input.sourceMessageId)
    : userMessages[userMessages.length - 1];
  if (!sourceMessage) return;
  if (userMessages[userMessages.length - 1]?.id !== sourceMessage.id) return;

  let job: PendingReplyJob;
  let replyDelayMs: number;
  if (input.resumeJob) {
    job = input.resumeJob;
    if (!tryResumeChatJob(input.roomId, job.jobId)) return;
    replyDelayMs = Math.max(0, job.scheduledAt - job.sourceMessageCreatedAt);
  } else {
    cancelChatJob(input.roomId);
    const jobId = beginChatJob(input.roomId);
    replyDelayMs = characterDelayMs(initialState, initial.character);
    const timeline = planReplyTimeline(sourceMessage.createdAt, replyDelayMs);
    job = createPendingReplyJob({
      jobId,
      roomId: input.roomId,
      characterId: input.characterId,
      sourceMessageId: sourceMessage.id,
      sourceMessageCreatedAt: sourceMessage.createdAt,
      latestUserInput: input.latestUserInput,
      scheduledAt: timeline.plannedReplyAt,
      stateImportedAt: initialState.__importedAt,
      creationMode: input.randomMode ? 'random' : 'direct',
    });
  }
  const jobId = job.jobId;
  try {
    if (!input.resumeJob) {
      await input.commitCurrent(current => storePendingJob(current, job), {
        save: { reason: 'pending reply scheduled' },
        flush: true,
      });
    }
    const timeline = planPersistedReplyTimeline(job);
    if (timeline.catchUp) {
      void appendDebugLog(
        'reply.catchup',
        `room=${input.roomId} delayMs=${replyDelayMs} plannedAt=${new Date(timeline.deliveryBaseAt).toISOString()} overdueMs=${Math.max(0, Date.now() - timeline.deliveryBaseAt)}`
      );
    } else {
      await sleep(timeline.remainingWaitMs);
    }
    if (!isCurrentChatJob(input.roomId, jobId)) return;

    // Read receipt sits slightly before the character's first bubble on the planned clock.
    const readAt = Math.max(timeline.userAt + 200, timeline.deliveryBaseAt - Math.min(2500, Math.max(400, replyDelayMs * 0.08)));
    if (timeline.catchUp) {
      // Skip long typing theatre when this reply is already "late" in story time.
      await input.commitCurrent(current => markUserMessagesRead(transitionPending(current, input.roomId, jobId, 'generating'), input.roomId, readAt));
    } else {
      await input.commitCurrent(current => markUserMessagesRead(transitionPending(current, input.roomId, jobId, 'typing'), input.roomId, readAt));
    }
    const promptState = input.getState();
    const promptTarget = roomStillValid(promptState, input.roomId, input.characterId);
    if (!promptState || !promptTarget || !isCurrentChatJob(input.roomId, jobId)) return;
    const promptMessages = buildChatPrompt(promptState, promptTarget.character, promptTarget.room, input.latestUserInput, { mode: 'reply', replyDelaySeconds: replyDelayMs / 1000, latestUserImageData: input.latestUserImageData });

    if (!tryLockGeneratingRoom(input.roomId, jobId)) return;
    await input.commitCurrent(current => transitionPending(current, input.roomId, jobId, 'generating'), {
      save: { reason: 'pending reply generating' },
      flush: true,
    });
    let { reply, keyIndex } = await runQueuedReplyLlm(input.roomId, jobId, () => callLLM(promptState, promptMessages));
    if (!isCurrentChatJob(input.roomId, jobId)) return;
    const nowContext = chatNowContext(promptState, promptTarget.character);
    const replyText = () => reply.messages.map(message => message.content || '').join('\n');
    if (isImplausibleCompletedActivity(replyText(), nowContext, 'reply', input.latestUserInput)) {
      await appendDebugLog('time-reality.retry', `room=${input.roomId} mode=reply\n${replyText()}`, 'warn');
      const repaired = await runQueuedReplyLlm(input.roomId, jobId, () => callLLM(promptState, [
        ...promptMessages,
        { role: 'system' as const, content: repairTimeRealityInstruction(nowContext) }
      ]));
      reply = repaired.reply;
      keyIndex = repaired.keyIndex;
    }
    if (isImplausibleCompletedActivity(replyText(), nowContext, 'reply', input.latestUserInput)) {
      await appendDebugLog('time-reality.softened', `room=${input.roomId} mode=reply\n${replyText()}`, 'warn');
      reply = {
        ...reply,
        messages: reply.messages.map(message => ({ ...message, content: softenImplausibleCompletedActivity(message.content) }))
      };
    }

    await input.commitCurrent(current => {
      const requestProvider = promptState.config.apiType;
      const activeProfile = current.config.apiProfiles[requestProvider] || {};
      return {
        ...current,
        config: {
          ...current.config,
          apiProfiles: {
            ...current.config.apiProfiles,
            [requestProvider]: { ...activeProfile, apiKeyIndex: keyIndex }
          }
        }
      };
    });

    if (!reply.messages.length) throw new Error('모델 응답에서 표시할 메시지를 찾지 못했습니다. ETC > 디버그에서 llm.response 원문을 확인하세요.');
    const bubbles = normalizeReplyMessagesForStyle(reply.messages, promptTarget.character);
    let deliveredCount = 0;
    let bubbleCursor = timeline.deliveryBaseAt;
    for (const bubble of bubbles) {
      if (!timeline.catchUp) {
        await sleep(bubbleDelayMs(promptTarget.character, bubble.delay ?? reply.reactionDelay));
      }
      if (!isCurrentChatJob(input.roomId, jobId)) return;
      const latestForBubble = roomStillValid(input.getState(), input.roomId, input.characterId);
      if (!latestForBubble) return;
      const bubbleAt = timeline.catchUp
        ? Math.min(Date.now(), bubbleCursor)
        : Date.now();
      const phone = phoneCardFromReply(input.getState() || promptState, latestForBubble.character, bubble, 'reply', { createdAt: bubbleAt });
      let mediaData = '';
      const imageState = input.getState() || promptState;
      const imageAllowed = shouldAllowChatImageGeneration({
        state: imageState,
        roomId: input.roomId,
        characterId: latestForBubble.character.id,
        latestUserText: input.latestUserInput,
        sourceMode: 'reply',
        imagePrompt: bubble.imagePrompt
      });
      if (!imageAllowed && bubble.imagePrompt) {
        void appendDebugLog('chat.image.blocked', JSON.stringify({
          roomId: input.roomId,
          characterId: latestForBubble.character.id,
          latestUserText: input.latestUserInput,
          imagePrompt: bubble.imagePrompt,
          imageCaption: bubble.imageCaption,
          reason: 'image_context_not_matched'
        }), 'info');
        bubble.imagePrompt = undefined;
        bubble.imageCaption = undefined;
      }
      if (bubble.imagePrompt && imageAllowed) {
        bubble.imagePrompt = imagePromptWithoutCharacterName(bubble.imagePrompt, latestForBubble.character);
        try {
          mediaData = await generateImageDataUri(imageState, bubble.imagePrompt, latestForBubble.character, {
            referenceImage: characterReferenceImageForPrompt(latestForBubble.character, bubble.imagePrompt),
            kind: 'general'
          });
          if (!isCurrentChatJob(input.roomId, jobId)) return;
        } catch (error) {
          bubble.imageCaption = `${bubble.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim();
        }
      }
      const shouldAppendBubble = Boolean(phone.textContent?.trim()) || Boolean(bubble.sticker) || isRenderableMediaUri(mediaData) || Boolean(bubble.imageCaption?.trim());
      if (shouldAppendBubble) {
        const message: SNSGodMessage = {
          id: makeId('msg'),
          replyJobId: jobId,
          role: 'character',
          characterId: latestForBubble.character.id,
          content: phone.textContent || '',
          createdAt: bubbleAt,
          sticker: bubble.sticker,
          imagePrompt: mediaData || (imageAllowed && bubble.imageCaption?.trim()) ? bubble.imagePrompt : undefined,
          imageCaption: mediaData || (imageAllowed && bubble.imageCaption?.trim()) ? bubble.imageCaption : undefined,
          mediaData: mediaData || undefined,
          mediaType: mediaData ? 'image' : undefined,
          sourceMode: timeline.catchUp ? 'reply_catchup' : 'reply',
          generationInfo: {
            provider: promptState.config.apiType,
            model: String(promptState.config.apiProfiles[promptState.config.apiType]?.apiModel || ''),
            mode: 'reply',
            generatedAt: Date.now(),
            stateUpdatedAt: resolveCharacterRuntimeState(promptState, promptTarget.character).lastUpdatedAt
          }
        };
        await input.commitCurrent(current => {
          const currentTarget = roomStillValid(current, input.roomId, input.characterId);
          if (!currentTarget) return current;
          let next = appendMessage(current, input.roomId, message);
          if (mediaData) {
            const currentCharacter = findCharacter(next, currentTarget.character.id);
            if (currentCharacter) {
              const runtime = resolveCharacterRuntimeState(next, currentCharacter);
              next = updateCharacter(next, currentCharacter.id, {
                imageContinuity: {
                  dayKey: runtime.dayKey,
                  currentOutfit: runtime.currentOutfit,
                  hairStyle: runtime.hairStyle,
                  accessories: runtime.accessories,
                  location: runtime.location,
                  lastImageAt: bubbleAt,
                  lastImagePrompt: bubble.imagePrompt
                }
              });
            }
          }
          return next;
        });
        deliveredCount += 1;
      }
      if (phone.card) {
        await input.commitCurrent(current => appendPrivateMessageIfValid(
          current,
          input.roomId,
          input.characterId,
          { ...(phone.card as SNSGodMessage), replyJobId: jobId },
        ));
        deliveredCount += 1;
      }
      bubbleCursor += bubbleStaggerMs(promptTarget.character, bubble.delay ?? reply.reactionDelay);
    }
    if (deliveredCount === 0 && isCurrentChatJob(input.roomId, jobId)) {
      await input.commitCurrent(current => appendPrivateMessageIfValid(current, input.roomId, input.characterId, {
        id: makeId('msg'),
        replyJobId: jobId,
        role: 'character',
        characterId: promptTarget.character.id,
        content: '응, 방금 말 계속 생각하고 있었어.',
        createdAt: timeline.catchUp ? Math.min(Date.now(), timeline.deliveryBaseAt) : Date.now(),
        sourceMode: timeline.catchUp ? 'reply_catchup' : 'reply',
        generationInfo: {
          provider: promptState.config.apiType,
          model: String(promptState.config.apiProfiles[promptState.config.apiType]?.apiModel || ''),
          mode: 'reply_fallback',
          generatedAt: Date.now(),
          stateUpdatedAt: resolveCharacterRuntimeState(promptState, promptTarget.character).lastUpdatedAt
        }
      }));
    }

    await input.commitCurrent(current => transitionPending(current, input.roomId, jobId, 'delivered'), {
      save: { reason: 'pending reply delivered' },
      flush: true,
    });

    if (!isCurrentChatJob(input.roomId, jobId)) return;
    if (reply.newMemory?.trim()) {
      await input.commitCurrent(current => roomStillValid(current, input.roomId, input.characterId)
        ? ingestCharacterMemory(current, input.characterId, reply.newMemory || '', input.roomId)
        : current);
    }

    if (input.randomMode) {
      await appendDebugLog('sns.auto', `skip room=${input.roomId} character=${input.characterId}: random mode`);
    }

    if (!input.randomMode && isCurrentChatJob(input.roomId, jobId)) {
      const beforeMeeting = input.getState();
      if (beforeMeeting && !beforeMeeting.activeMeetingEventId) {
        try {
          const meeting = await shouldStartMeetingEvent(beforeMeeting, input.roomId, input.latestUserInput);
          if (meeting.shouldStart && isCurrentChatJob(input.roomId, jobId)) {
            const sourceState = input.getState() || beforeMeeting;
            const generated = await createMeetingEventSession(sourceState, input.roomId, meeting);
            if (generated !== sourceState) {
              await input.commitCurrent(current => {
                if (!roomStillValid(current, input.roomId, input.characterId)) return current;
                if ((current.meetingEventSessions || []).some(session => (
                  session.roomId === input.roomId
                  && (session.status === 'pending' || session.status === 'active')
                ))) return current;
                return mergeStaleState(current, sourceState, generated, { conflict: 'latest' });
              });
              return;
            }
          }
        } catch (error) {
          await appendDebugLog('meeting.reply', `post-reply meeting start failed room=${input.roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
      }
    }

    // Auto SNS is independent of the chat job lifetime: even if the user sent another
    // message while SNS was generating, still merge posts so generation is not discarded.
    if (!input.randomMode) {
      const beforeSns = input.getState();
      const snsTarget = roomStillValid(beforeSns, input.roomId, input.characterId);
      if (beforeSns && snsTarget) {
        try {
          await appendDebugLog('sns.auto', `reply-hook try room=${input.roomId} character=${snsTarget.character.id}`);
          const generated = await maybeCreateAutoSNSPost(beforeSns, snsTarget.character, input.roomId);
          if (generated !== beforeSns) {
            await input.commitCurrent(current => roomStillValid(current, input.roomId, input.characterId)
              ? mergeGeneratedSns(current, beforeSns, generated)
              : current);
            await appendDebugLog('sns.auto', `reply-hook committed room=${input.roomId} character=${snsTarget.character.id}`);
          }
        } catch (error) {
          await appendDebugLog('sns.auto', `auto SNS failed after reply room=${input.roomId} character=${snsTarget.character.id}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
      } else {
        await appendDebugLog('sns.auto', `skip room=${input.roomId} character=${input.characterId}: room or character missing`);
      }
    }

    // Relationship summary (관계 요약): same LLM path as room-settings "현재 대화 요약".
    if (!input.randomMode && isCurrentChatJob(input.roomId, jobId)) {
      const beforeSummary = input.getState();
      if (beforeSummary) {
        try {
          const summarized = await maybeRefreshPrivateRoomLlmSummary(beforeSummary, input.roomId);
          if (summarized && isCurrentChatJob(input.roomId, jobId)) {
            await input.commitCurrent(current => (
              mergeStaleState(current, beforeSummary, summarized, { conflict: 'latest' })
            ));
          }
        } catch (error) {
          await appendDebugLog('memory.summary', `llm room summary failed room=${input.roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
      }
    }
  } catch (error) {
    if (isCurrentChatJob(input.roomId, jobId)) {
      try {
        await input.commitCurrent(current => markUserMessagesRead(appendPrivateMessageIfValid(current, input.roomId, input.characterId, {
          id: makeId('msg'),
          replyJobId: jobId,
          role: 'system',
          content: `답장 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
          createdAt: Date.now(),
          failed: true
        }), input.roomId));
        await input.commitCurrent(current => transitionPending(
          current,
          input.roomId,
          jobId,
          'failed',
          error instanceof Error ? error.message : String(error),
        ), { save: { reason: 'pending reply failed' }, flush: true });
      } catch (recordError) {
        await appendDebugLog('reply.persist', `failed to record reply error room=${input.roomId}: ${recordError instanceof Error ? recordError.message : String(recordError)}`, 'error');
      }
    }
  } finally {
    endChatJob(input.roomId, jobId);
    try {
      await input.commitCurrent(current => transitionPending(
        current,
        input.roomId,
        jobId,
        'cancelled',
        'runtime-ended-before-terminal-state',
      ));
    } catch (recordError) {
      await appendDebugLog('reply.persist', `failed to record reply cancellation room=${input.roomId}: ${recordError instanceof Error ? recordError.message : String(recordError)}`, 'error');
    }
  }
}

export async function markRoomReadCurrent(roomId: string, commitCurrent: CommitPatch) {
  await commitCurrent(current => markRoomRead(current, roomId));
}
