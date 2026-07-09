import { callLLM, generateImageDataUri, imagePromptWithoutCharacterName } from './api';
import { beginChatJob, cancelChatJob, endChatJob, isCurrentChatJob, tryLockGeneratingRoom } from './chatJobs';
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
import { chatNowContext, isImplausibleCompletedActivity, repairTimeRealityInstruction, softenImplausibleCompletedActivity } from './timeReality';
import { SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { appendDebugLog } from './debugLog';
import { characterWithConversationRhythm } from './conversationRhythm';

type CommitPatch = (patch: (current: SNSGodState) => SNSGodState, options?: { persist?: boolean }) => Promise<void> | void;

type StartReplyJobInput = {
  roomId: string;
  characterId: string;
  latestUserInput: string;
  latestUserImageData?: string;
  userMessageCreatedAt?: number;
  randomMode?: boolean;
  getState: () => SNSGodState | null;
  commitCurrent: CommitPatch;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const REPLY_LLM_TIMEOUT_MS = 12 * 60 * 1000;
let replyLlmQueue: Promise<void> = Promise.resolve();

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
  if (!isCurrentChatJob(roomId, jobId)) throw new Error('답장 작업이 새 메시지로 교체되었습니다.');
  await appendDebugLog('reply.queue', `LLM reply job started room=${roomId} job=${jobId}`);
  try {
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
  const seconds = Math.max(min, Math.min(max, randomSeconds * speedFactor));
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

function setPending(state: SNSGodState, roomId: string, jobId: string, phase: NonNullable<SNSGodState['pendingReplies']>[string]['phase']) {
  return {
    ...state,
    pendingReplies: {
      ...(state.pendingReplies || {}),
      [roomId]: { jobId, startedAt: Date.now(), phase }
    }
  };
}

function clearPending(state: SNSGodState, roomId: string, jobId: string) {
  if (state.pendingReplies?.[roomId]?.jobId !== jobId) return state;
  const pendingReplies = { ...(state.pendingReplies || {}) };
  delete pendingReplies[roomId];
  return { ...state, pendingReplies };
}

function mergeGeneratedSns(current: SNSGodState, before: SNSGodState, generated: SNSGodState): SNSGodState {
  const beforePostIds = new Set((before.snsPosts || []).map(post => post.id));
  const currentPostIds = new Set((current.snsPosts || []).map(post => post.id));
  const snsPosts = [
    ...(current.snsPosts || []),
    ...(generated.snsPosts || []).filter(post => !beforePostIds.has(post.id) && !currentPostIds.has(post.id))
  ];
  const beforeThreadIds = new Set((before.snsDmThreads || []).map(thread => thread.id));
  const currentThreadIds = new Set((current.snsDmThreads || []).map(thread => thread.id));
  const snsDmThreads = [
    ...(current.snsDmThreads || []),
    ...(generated.snsDmThreads || []).filter(thread => !beforeThreadIds.has(thread.id) && !currentThreadIds.has(thread.id))
  ];
  const notifications = [
    ...(current.notifications || []),
    ...(generated.notifications || []).filter(item => !(current.notifications || []).some(existing => existing.id === item.id))
  ].slice(0, 100);
  return {
    ...current,
    snsPosts,
    snsDmThreads,
    notifications,
    characters: current.characters.map(character => {
      const generatedCharacter = generated.characters.find(item => item.id === character.id);
      const beforeCharacter = before.characters.find(item => item.id === character.id);
      if (!generatedCharacter || !beforeCharacter) return character;
      if (generatedCharacter.lastSnsMessageCount === beforeCharacter.lastSnsMessageCount) return character;
      return { ...character, lastSnsMessageCount: generatedCharacter.lastSnsMessageCount };
    })
  };
}

function roomStillValid(state: SNSGodState | null, roomId: string, characterId: string): { room: SNSGodRoom; character: SNSGodCharacter } | undefined {
  if (!state) return undefined;
  const room = findRoom(state, roomId);
  const character = findCharacter(state, characterId || room?.characterId);
  if (!room || !character) return undefined;
  if (isRoomDisabled(state, roomId)) return undefined;
  return { room, character };
}

export function isReplyPending(state: SNSGodState, roomId: string): boolean {
  return Boolean(state.pendingReplies?.[roomId]);
}

export async function startReplyJob(input: StartReplyJobInput) {
  cancelChatJob(input.roomId);
  const jobId = beginChatJob(input.roomId);
  await input.commitCurrent(current => setPending(current, input.roomId, jobId, 'delay'), { persist: false });
  try {
    const initial = roomStillValid(input.getState(), input.roomId, input.characterId);
    if (!initial) return;
    const replyDelayMs = characterDelayMs(input.getState() || undefined, initial.character);
    const timeline = planReplyTimeline(input.userMessageCreatedAt, replyDelayMs);
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
      await input.commitCurrent(current => markUserMessagesRead(setPending(current, input.roomId, jobId, 'generating'), input.roomId, readAt), { persist: false });
    } else {
      await input.commitCurrent(current => markUserMessagesRead(setPending(current, input.roomId, jobId, 'typing'), input.roomId, readAt), { persist: false });
    }
    const promptState = input.getState();
    const promptTarget = roomStillValid(promptState, input.roomId, input.characterId);
    if (!promptState || !promptTarget || !isCurrentChatJob(input.roomId, jobId)) return;
    const promptMessages = buildChatPrompt(promptState, promptTarget.character, promptTarget.room, input.latestUserInput, { mode: 'reply', replyDelaySeconds: replyDelayMs / 1000, latestUserImageData: input.latestUserImageData });

    if (!tryLockGeneratingRoom(input.roomId, jobId)) return;
    await input.commitCurrent(current => setPending(current, input.roomId, jobId, 'generating'), { persist: false });
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
      const activeProfile = current.config.apiProfiles[current.config.apiType] || {};
      return {
        ...current,
        config: {
          ...current.config,
          apiProfiles: {
            ...current.config.apiProfiles,
            [current.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
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
          role: 'character',
          characterId: latestForBubble.character.id,
          content: phone.textContent || '',
          createdAt: bubbleAt,
          sticker: bubble.sticker,
          imagePrompt: mediaData || (imageAllowed && bubble.imageCaption?.trim()) ? bubble.imagePrompt : undefined,
          imageCaption: mediaData || (imageAllowed && bubble.imageCaption?.trim()) ? bubble.imageCaption : undefined,
          mediaData: mediaData || undefined,
          mediaType: mediaData ? 'image' : undefined,
          sourceMode: timeline.catchUp ? 'reply_catchup' : 'reply'
        };
        await input.commitCurrent(current => appendMessage(current, input.roomId, message));
        deliveredCount += 1;
      }
      if (phone.card) {
        await input.commitCurrent(current => appendMessage(current, input.roomId, phone.card as SNSGodMessage));
        deliveredCount += 1;
      }
      bubbleCursor += bubbleStaggerMs(promptTarget.character, bubble.delay ?? reply.reactionDelay);
    }
    if (deliveredCount === 0 && isCurrentChatJob(input.roomId, jobId)) {
      await input.commitCurrent(current => appendMessage(current, input.roomId, {
        id: makeId('msg'),
        role: 'character',
        characterId: promptTarget.character.id,
        content: '응, 방금 말 계속 생각하고 있었어.',
        createdAt: timeline.catchUp ? Math.min(Date.now(), timeline.deliveryBaseAt) : Date.now(),
        sourceMode: timeline.catchUp ? 'reply_catchup' : 'reply'
      }));
    }

    if (!isCurrentChatJob(input.roomId, jobId)) return;
    if (reply.newMemory?.trim()) {
      await input.commitCurrent(current => {
        const updated = findCharacter(current, input.characterId);
        if (!updated) return current;
        return updateCharacter(current, input.characterId, { memories: [...(updated.memories || []), reply.newMemory?.trim()].filter(Boolean).slice(-80) as string[] });
      });
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
              await input.commitCurrent(current => ({
                ...generated,
                messages: { ...current.messages, ...generated.messages },
                pendingReplies: current.pendingReplies
              }));
              return;
            }
          }
        } catch (error) {
          await appendDebugLog('meeting.reply', `post-reply meeting start failed room=${input.roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
      }
    }

    if (!input.randomMode && isCurrentChatJob(input.roomId, jobId)) {
      const beforeSns = input.getState();
      const snsTarget = roomStillValid(beforeSns, input.roomId, input.characterId);
      if (beforeSns && snsTarget) {
        try {
          const generated = await maybeCreateAutoSNSPost(beforeSns, snsTarget.character, input.roomId);
          if (isCurrentChatJob(input.roomId, jobId)) {
            await input.commitCurrent(current => mergeGeneratedSns(current, beforeSns, generated));
          }
        } catch (error) {
          await appendDebugLog('sns.auto', `auto SNS failed after reply room=${input.roomId} character=${snsTarget.character.id}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
      } else {
        await appendDebugLog('sns.auto', `skip room=${input.roomId} character=${input.characterId}: room or character missing`);
      }
    }
  } catch (error) {
    if (isCurrentChatJob(input.roomId, jobId)) {
      await input.commitCurrent(current => markUserMessagesRead(appendMessage(current, input.roomId, {
        id: makeId('msg'),
        role: 'system',
        content: `답장 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: Date.now(),
        failed: true
      }), input.roomId));
    }
  } finally {
    endChatJob(input.roomId, jobId);
    await input.commitCurrent(current => clearPending(current, input.roomId, jobId), { persist: false });
  }
}

export async function markRoomReadCurrent(roomId: string, commitCurrent: CommitPatch) {
  await commitCurrent(current => markRoomRead(current, roomId));
}
