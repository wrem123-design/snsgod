import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLMText, parseJsonObject } from '../logic/api';
import { appendMessage, findCharacter, findRoom, roomMessages } from '../logic/stateHelpers';
import { makeId } from '../logic/ids';
import { formatPhoneDuration, phoneSummaryFromLines } from '../logic/phone';
import { isRenderableMediaUri } from '../logic/media';
import { CallSession, CallSessionLine, CallSessionPhase, CallSessionUiMode, SNSGodMessage, SNSGodState } from '../types';
import { canonicalPersonaBlocks } from '../logic/canonicalPersona';
import { compilePromptBlocks, PromptBlock } from '../logic/promptCompiler';
import { privateMemoryPromptBlock } from '../logic/memoryBridge';
import { cancelChatJob } from '../logic/chatJobs';
import { cancelPendingReplyJob } from '../logic/pendingReplyJobs';
import { applyLifecycleResultOnce, findResumableCallSession, transitionInteractionLifecycle } from '../logic/interactionLifecycle';

type CallLine = CallSessionLine;
type CallPhase = CallSessionPhase;
type CallTurnUiMode = CallSessionUiMode;
type PhoneTurn = {
  lines?: string[];
  characterLines?: string[];
  dialogue?: string[];
  line?: string;
  content?: string;
  text?: string;
  choices?: string[];
  options?: string[];
  uiMode?: CallTurnUiMode;
  allowDirectReply?: boolean;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Hard cap on character speaking turns (including the first greeting). Prevents endless API loops. */
const MAX_PHONE_CHARACTER_TURNS = 9;
const PHONE_CLOSING_CHOICES = ['그래, 끊자.', '나중에 또 통화하자.', '응, 끊을게.'];
const PHONE_CONNECTION_GLITCH_PATTERN = /(내\s*말\s*들려|목소리\s*들려|말\s*들려|잘\s*안\s*들|안\s*들려|통화\s*(?:상태|품질)|신호(?:가|는)?|끊기|끊겨|지직|노이즈|소리\s*(?:깨|끊))/i;
const REPEATED_GLITCH_REPLACEMENTS = [
  '잠깐만, 방금 하나도 못 들었어.',
  '어어, 통신 상태 왜 이러지? 내 목소리는 잘 들려?',
  '내 말 들려? 방금 좀 끊겼어.'
];

function isPhoneConnectionGlitch(text: string) {
  return PHONE_CONNECTION_GLITCH_PATTERN.test(text);
}

/** 기승전결 guidance for the current character turn (1..MAX). */
function phoneArcGuidance(turnNumber: number, maxTurns: number): string {
  const remaining = Math.max(0, maxTurns - turnNumber);
  const header = `Call length limit: this is character turn ${turnNumber} of ${maxTurns}. Remaining character turns after this: ${remaining}. The call MUST finish within ${maxTurns} character turns total. Never open an endless chat.`;
  if (turnNumber <= 1) {
    return [
      header,
      'Story beat 기 (opening): warm greeting, confirm the reason for the call, set a light mood. Keep it short. Do not dump the whole agenda yet.'
    ].join('\n');
  }
  if (turnNumber <= 3) {
    return [
      header,
      'Story beat 기→승 (setup): react to the user, plant 1 clear topic from recent chat or relationship context, stay live and spoken.'
    ].join('\n');
  }
  if (turnNumber <= 6) {
    return [
      header,
      'Story beat 승→전 (development/turn): deepen emotion or conflict a little, share one concrete reaction or small revelation. Do not start brand-new long side quests.'
    ].join('\n');
  }
  if (turnNumber < maxTurns) {
    return [
      header,
      'Story beat 전→결 (winding down): start closing the call. Resolve or park the main topic, hint that you should hang up soon, and put at least one hang-up oriented choice such as "나중에 통화하자" or "끊자". Do not invent a new major topic.'
    ].join('\n');
  }
  return [
    header,
    'Story beat 결 (finale, LAST turn): this is the final character speech of the call. Give a natural spoken wrap-up and goodbye. No new questions that require a long answer. No new topics. Choices must all be hang-up style. After this turn the app ends the call.'
  ].join('\n');
}

function replaceRepeatedPhoneGlitches(sourceLines: string[], previousLines: CallLine[], allowNewGlitch: boolean) {
  let glitchAlreadyUsed = previousLines.some(line => line.speaker === 'character' && isPhoneConnectionGlitch(line.text));
  let replacementIndex = previousLines.length % REPEATED_GLITCH_REPLACEMENTS.length;
  return sourceLines.map(line => {
    if (!isPhoneConnectionGlitch(line)) return line;
    if (!glitchAlreadyUsed && allowNewGlitch) {
      glitchAlreadyUsed = true;
      return line;
    }
    const replacement = REPEATED_GLITCH_REPLACEMENTS[replacementIndex % REPEATED_GLITCH_REPLACEMENTS.length];
    replacementIndex += 1;
    return replacement;
  });
}

export function CallScreen({ state, characterId, roomId, sourceMessageId, onBack, onChange, onCommitCurrent, onRequestReply }: {
  state: SNSGodState;
  characterId: string;
  roomId?: string;
  sourceMessageId?: string;
  onBack: () => void;
  onChange?: (next: SNSGodState) => Promise<void> | void;
  onCommitCurrent?: (patch: (current: SNSGodState) => SNSGodState) => unknown;
  onRequestReply?: (roomId: string, characterId: string, latestUserInput: string, options?: { sourceMessageId?: string; userMessageCreatedAt?: number }) => void;
}) {
  const character = findCharacter(state, characterId);
  const room = findRoom(state, roomId);
  const resumableSession = findResumableCallSession(state, { characterId, roomId, sourceMessageId }) as CallSession | undefined;
  const callSessionIdRef = useRef(resumableSession?.id || makeId('call'));
  const userName = character ? String(room?.userAlias || character.userName || state.config.userName || '나') : '나';
  const [lines, setLines] = useState<CallLine[]>(resumableSession?.lines || []);
  const linesRef = useRef<CallLine[]>(resumableSession?.lines || []);
  const [phase, setPhase] = useState<CallPhase>(resumableSession?.phase || 'dialing');
  const [displayText, setDisplayText] = useState(() => [...(resumableSession?.lines || [])].reverse().find(item => item.speaker !== 'system')?.text || '');
  const [currentSpeaker, setCurrentSpeaker] = useState<'character' | 'user' | 'system'>(() => [...(resumableSession?.lines || [])].reverse().find(item => item.speaker !== 'system')?.speaker || 'system');
  const [currentFullText, setCurrentFullText] = useState(() => [...(resumableSession?.lines || [])].reverse().find(item => item.speaker !== 'system')?.text || '연결 중...');
  const [pages, setPages] = useState<string[]>(resumableSession?.pages || []);
  const [pageIndex, setPageIndex] = useState(resumableSession?.pageIndex || 0);
  const [choices, setChoices] = useState<string[]>(resumableSession?.choices || []);
  const [uiMode, setUiMode] = useState<CallTurnUiMode>(resumableSession?.uiMode || 'choices');
  const [allowDirectReply, setAllowDirectReply] = useState(resumableSession?.allowDirectReply !== false);
  const [draftText, setDraftText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef(resumableSession?.startedAt || Date.now());
  const connectedAtRef = useRef<number | undefined>(resumableSession?.connectedAt);
  const endingRef = useRef(false);
  const bootedRef = useRef(false);
  const typingTokenRef = useRef(0);
  const characterTurnCountRef = useRef(resumableSession?.turnCount || 0);
  const finalTurnActiveRef = useRef(false);
  const skipExtraGoodbyeRef = useRef(false);
  const connectionGlitchAllowedRef = useRef(Math.random() < 0.25);
  const ring = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(1)).current;
  const backgroundUri = useMemo(() => {
    const uri = character?.coverImage || character?.avatar || character?.profileImage;
    return isRenderableMediaUri(uri) ? String(uri) : '';
  }, [character?.coverImage, character?.avatar, character?.profileImage]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSec(Math.floor((Date.now() - (connectedAtRef.current || startedAtRef.current)) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(ring, {
      toValue: 1,
      duration: phase === 'character_typing' ? 1150 : phase === 'dialing' || phase === 'ringing' ? 1400 : 2600,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true
    }));
    ring.setValue(0);
    animation.start();
    return () => animation.stop();
  }, [phase, ring]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void exitCall();
      return true;
    });
    return () => subscription.remove();
  }, [character?.id, roomId, sourceMessageId]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!character || bootedRef.current) return;
    bootedRef.current = true;
    void bootCall();
  }, [character?.id]);

  async function bootCall() {
    if (resumableSession && (resumableSession.status === 'paused' || resumableSession.status === 'active')) {
      const restoredPhase: CallPhase = resumableSession.phase === 'awaiting_text'
        ? 'awaiting_text'
        : resumableSession.choices.length
          ? 'awaiting_choice'
          : 'awaiting_next';
      setPhase(restoredPhase);
      await persistSession({ phase: restoredPhase, status: 'active' }, { keepPointer: true });
      return;
    }
    await persistSession({ status: 'pending', phase: 'dialing' }, { keepPointer: true });
    await showSystemCard('연결 중...', 'dialing');
    await sleep(700);
    connectedAtRef.current = Date.now();
    await showSystemCard('통화 연결됨', 'connected');
    await persistSession({ status: 'active', phase: 'connected', connectedAt: connectedAtRef.current }, { keepPointer: true });
    await sleep(450);
    await requestCharacterTurn(linesRef.current, true);
  }

  function currentSessionSnapshot(current: SNSGodState, overrides: Partial<CallSession> = {}): CallSession {
    const now = Date.now();
    const existing = (current.callSessions || []).find(item => item.id === callSessionIdRef.current);
    const base: CallSession = existing || {
      id: callSessionIdRef.current,
      characterId,
      roomId,
      sourceMessageId,
      direction: sourceMessageId ? 'incoming' : 'outgoing',
      status: 'pending',
      startedAt: startedAtRef.current,
      turnCount: 0,
      lines: [],
      phase: 'dialing',
      pages: [],
      pageIndex: 0,
      choices: [],
      uiMode: 'choices',
      allowDirectReply: true,
      updatedAt: now
    };
    const requestedStatus = overrides.status;
    const snapshot: CallSession = {
      ...base,
      characterId,
      roomId,
      sourceMessageId,
      lines: linesRef.current,
      connectedAt: connectedAtRef.current,
      turnCount: characterTurnCountRef.current,
      phase,
      pages,
      pageIndex,
      choices,
      uiMode,
      allowDirectReply,
      updatedAt: now,
      ...overrides,
      status: base.status
    };
    return requestedStatus && requestedStatus !== base.status
      ? transitionInteractionLifecycle(snapshot, requestedStatus, now)
      : snapshot;
  }

  async function persistSession(overrides: Partial<CallSession> = {}, options: { keepPointer?: boolean } = {}) {
    const apply = (current: SNSGodState): SNSGodState => {
      const session = currentSessionSnapshot(current, overrides);
      const terminal = session.status === 'cancelled' || session.status === 'finished';
      const alreadyPointed = current.activeCallSessionId === session.id;
      const keepPointer = !terminal && (
        alreadyPointed
        || (options.keepPointer === true && session.status !== 'paused')
      );
      const callStatus = session.status === 'paused'
        ? 'paused'
        : session.status === 'cancelled'
          ? 'rejected'
          : session.status === 'pending'
            ? 'ringing'
            : 'accepted';
      const resumeCardId = `call_resume:${session.id}`;
      let next: SNSGodState = {
        ...current,
        activeCallSessionId: keepPointer ? session.id : current.activeCallSessionId === session.id ? undefined : current.activeCallSessionId,
        callSessions: [session, ...(current.callSessions || []).filter(item => item.id !== session.id)].slice(0, 50),
        messages: roomId ? {
          ...current.messages,
          [roomId]: (current.messages[roomId] || []).map(message => (sourceMessageId && message.id === sourceMessageId) || message.callResumeSessionId === session.id ? {
            ...message,
            callStatus,
            callHandledAt: terminal ? Date.now() : message.callHandledAt
          } : message)
        } : current.messages
      };
      if (session.status === 'paused' && roomId && !sourceMessageId && !(next.messages[roomId] || []).some(message => message.id === resumeCardId)) {
        next = appendMessage(next, roomId, {
          id: resumeCardId,
          role: 'character',
          characterId,
          content: '',
          createdAt: Date.now(),
          callInvite: true,
          callStatus: 'paused',
          callResumeSessionId: session.id,
          callTitle: `${character?.name || '상대'} 통화`,
          callLine: '중단한 통화를 이어갈 수 있습니다.',
          sourceMode: 'phone'
        });
      }
      return next;
    };
    if (onCommitCurrent) {
      await onCommitCurrent(apply);
      return;
    }
    if (onChange) await onChange(apply(state));
  }

  function addLine(speaker: CallLine['speaker'], text: string) {
    const item = { id: makeId('callline'), speaker, text, createdAt: Date.now() };
    const next = [...linesRef.current, item];
    linesRef.current = next;
    setLines(next);
    return next;
  }

  async function fadeCardIn() {
    cardFade.setValue(0);
    Animated.timing(cardFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }

  async function typeText(text: string, speaker: 'character' | 'user' | 'system', nextPhase: CallPhase) {
    const token = typingTokenRef.current + 1;
    typingTokenRef.current = token;
    setCurrentSpeaker(speaker);
    setCurrentFullText(text);
    setDisplayText('');
    await fadeCardIn();
    const chars = Array.from(text);
    let out = '';
    for (const ch of chars) {
      if (typingTokenRef.current !== token) return;
      out += ch;
      setDisplayText(out);
      let delay = speaker === 'system' ? 12 : 24;
      if (/[,.!?…。？！]/.test(ch)) delay += 115;
      if (/\n/.test(ch)) delay += 150;
      await sleep(delay);
    }
    setDisplayText(text);
    setPhase(nextPhase);
  }

  async function showSystemCard(text: string, nextPhase: CallPhase) {
    setPages([]);
    setChoices([]);
    setUiMode('next');
    setAllowDirectReply(false);
    setPhase(nextPhase === 'dialing' || nextPhase === 'connected' ? nextPhase : 'connected');
    await typeText(text, 'system', nextPhase);
  }

  async function showCharacterPage(nextPages: string[], index: number, nextChoices: string[], mode: CallTurnUiMode, directReplyAllowed: boolean) {
    const text = nextPages[index] || '여보세요?';
    setPages(nextPages);
    setPageIndex(index);
    setChoices(nextChoices);
    setUiMode(mode);
    setAllowDirectReply(directReplyAllowed);
    setPhase('character_typing');
    await typeText(text, 'character', index < nextPages.length - 1 ? 'awaiting_next' : mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice');
    const nextLines = addLine('character', text);
    await persistSession({
      lines: nextLines,
      phase: index < nextPages.length - 1 ? 'awaiting_next' : mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice',
      pages: nextPages,
      pageIndex: index,
      choices: nextChoices,
      uiMode: mode,
      allowDirectReply: directReplyAllowed,
      turnCount: characterTurnCountRef.current
    }, { keepPointer: true });
  }

  function sanitizePhoneLines(sourceLines: string[], previousLines: CallLine[]) {
    const latestUserLine = [...previousLines].reverse().find(item => item.speaker === 'user')?.text || '';
    const allowPromptedConnectionCheck = isPhoneConnectionGlitch(latestUserLine);
    const allowNewGlitch = connectionGlitchAllowedRef.current || allowPromptedConnectionCheck;
    const nextLines = replaceRepeatedPhoneGlitches(sourceLines, previousLines, allowNewGlitch);
    const keptNewGlitch = nextLines.some((line, index) => line === sourceLines[index] && isPhoneConnectionGlitch(line));
    if (keptNewGlitch && !allowPromptedConnectionCheck) connectionGlitchAllowedRef.current = false;
    return nextLines;
  }

  function parsePhoneTurn(
    text: string,
    previousLines: CallLine[],
    options?: { finalTurn?: boolean; windDown?: boolean }
  ): { lines: string[]; choices: string[]; uiMode: CallTurnUiMode; allowDirectReply: boolean } {
    const parsed = parseJsonObject<PhoneTurn>(text);
    const sourceLines = parsed
      ? parsed.lines || parsed.characterLines || parsed.dialogue || [parsed.line || parsed.content || parsed.text || '']
      : [text];
    const parsedChoices = parsed?.choices || parsed?.options || [];
    const nextLines = sanitizePhoneLines(sourceLines.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3), previousLines);
    let nextChoices = parsedChoices.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3);
    if (options?.finalTurn) {
      nextChoices = PHONE_CLOSING_CHOICES.slice();
    } else if (options?.windDown) {
      const hangupChoice = nextChoices.find(item => looksLikeHangup(item));
      nextChoices = [
        ...nextChoices.filter(item => !looksLikeHangup(item)).slice(0, 2),
        hangupChoice || '나중에 다시 통화하자.'
      ].slice(0, 3);
      if (nextChoices.length < 2) nextChoices = ['응, 알겠어.', '나중에 다시 통화하자.'];
    } else if (nextChoices.length < 2) {
      nextChoices = ['응, 듣고 있어.', '조금 더 말해줘.', '나중에 다시 통화하자.'];
    }
    const mode = options?.finalTurn
      ? 'choices'
      : parsed?.uiMode === 'next' || parsed?.uiMode === 'input' || parsed?.uiMode === 'mixed' || parsed?.uiMode === 'choices'
        ? parsed.uiMode
        : nextChoices.length >= 2 ? 'choices' : 'next';
    return {
      lines: nextLines.length ? nextLines : (options?.finalTurn ? ['알겠어. 이만 끊을게. 나중에 또 이야기하자.'] : ['여보세요?']),
      choices: nextChoices,
      uiMode: mode === 'mixed' ? 'choices' : mode,
      allowDirectReply: options?.finalTurn ? false : parsed?.allowDirectReply !== false
    };
  }

  function looksLikeHangup(text: string) {
    return /끊|종료|나중|그만|hang\s*up|bye|다음에/i.test(text);
  }

  function recentChatContext() {
    if (!character || !roomId) return '';
    return roomMessages(state, roomId)
      .filter(message => message.role !== 'system' && !message.callInvite && !message.phoneLog)
      .slice(-12)
      .map(message => {
        const speaker = message.role === 'user' ? userName : character.name;
        const body = message.content?.trim()
          || (message.sticker ? `[스티커: ${message.sticker}]` : '')
          || (message.mediaData ? '[사진]' : '');
        return body ? `${speaker}: ${body}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  async function requestCharacterTurn(baseLines: CallLine[], firstTurn = false) {
    if (!character || endingRef.current || phase === 'ending') return;
    // Already used the full 9 character turns — close without another LLM chat turn.
    if (characterTurnCountRef.current >= MAX_PHONE_CHARACTER_TURNS) {
      skipExtraGoodbyeRef.current = true;
      await endCall(undefined, baseLines);
      return;
    }
    const turnNumber = characterTurnCountRef.current + 1;
    const isFinalTurn = turnNumber >= MAX_PHONE_CHARACTER_TURNS;
    const isWindDown = turnNumber >= MAX_PHONE_CHARACTER_TURNS - 2 && !isFinalTurn;
    finalTurnActiveRef.current = isFinalTurn;
    setPhase('listening');
    setChoices([]);
    setUiMode('next');
    setAllowDirectReply(false);
    try {
      const transcript = baseLines
        .filter(item => item.speaker !== 'system')
        .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
        .join('\n');
      const memoryText = (character.memories || []).slice(-10).map(item => `- ${item}`).join('\n');
      const personaBlocks = canonicalPersonaBlocks(character, state.config.language || 'Korean', {
        userVisibleName: userName,
        userProfile: state.config.userDescription,
        relationshipNote: room?.relationshipNote,
        memoryBlock: room ? privateMemoryPromptBlock(state, room, character, transcript) : memoryText,
        memoryVisibility: 'private',
      });
      const systemParts = [
        ...personaBlocks,
        `You are ${character.name} in a private live phone call with ${userName}.`,
        phoneArcGuidance(turnNumber, MAX_PHONE_CHARACTER_TURNS),
        'Return raw JSON only: {"lines":["short spoken line 1","short spoken line 2"],"choices":["user reply option 1","user reply option 2","user reply option 3"],"uiMode":"next|choices|input|mixed","allowDirectReply":true}.',
        'Lines must contain 1-3 short spoken live phone lines. Each line is shown as one card page. No narration, no action descriptions, no speaker labels, no phone-call markers, no SNS posts.',
        'Choices must be concise, varied, and directly reply to the spoken lines.',
        'A bad-connection or hearing-trouble moment such as "Can you hear me?" is a rare live-call flavor. Use it at most once in the entire call, never twice, and do not use it if it already appears in the transcript.',
        firstTurn
          ? 'For the first connected turn, uiMode may be next if the character is starting with a short greeting.'
          : isFinalTurn
            ? 'Final turn: uiMode must be choices. allowDirectReply must be false. All choices must end the call.'
            : 'Use choices when the user should answer meaningfully.',
        `Recent messenger chat before this call:\n${recentChatContext() || '(empty)'}`,
      ];
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: compilePromptBlocks(systemParts.map((part, index): PromptBlock => typeof part === 'string' ? {
            id: `phone.turn.${index}`,
            content: part,
            priority: systemParts.length - index,
          } : part)).content,
        },
        {
          role: 'user',
          content: [
            `Phone call so far:\n${transcript || '(call just connected)'}`,
            firstTurn
              ? 'The call has just connected. Let the character speak first (opening beat 기).'
              : isFinalTurn
                ? 'This is the last allowed character turn. Close the call with a spoken 결 ending. Do not ask a new open question.'
                : `Continue after my selected/direct reply. Stay inside turn ${turnNumber}/${MAX_PHONE_CHARACTER_TURNS} of the 기승전결 arc.`,
            'Return JSON now.'
          ].join('\n\n')
        }
      ]);
      if (endingRef.current) return;
      characterTurnCountRef.current = turnNumber;
      const turn = parsePhoneTurn(result.text, baseLines, { finalTurn: isFinalTurn, windDown: isWindDown });
      await showCharacterPage(turn.lines, 0, turn.choices, turn.uiMode, turn.allowDirectReply);
      if (isFinalTurn) {
        await finishFinalTurnPages(turn.lines, turn.choices);
      }
    } catch {
      if (endingRef.current) return;
      characterTurnCountRef.current = turnNumber;
      const fallbackLines = isFinalTurn
        ? ['알겠어. 이만 끊을게. 나중에 또 이야기하자.']
        : sanitizePhoneLines(['잠깐만, 방금 하나도 못 들었어.'], baseLines);
      await showCharacterPage(
        fallbackLines,
        0,
        isFinalTurn ? PHONE_CLOSING_CHOICES.slice() : ['다시 말해줘.', '괜찮아?', '나중에 다시 통화하자.'],
        'choices',
        !isFinalTurn
      );
      if (isFinalTurn) {
        await finishFinalTurnPages(fallbackLines, PHONE_CLOSING_CHOICES.slice());
      }
    }
  }

  /** After the 9th turn, auto-advance remaining pages then end — no 10th API turn. */
  async function finishFinalTurnPages(nextPages: string[], nextChoices: string[]) {
    if (endingRef.current) return;
    for (let index = 1; index < nextPages.length; index += 1) {
      if (endingRef.current) return;
      await sleep(450);
      await showCharacterPage(nextPages, index, nextChoices, 'choices', false);
    }
    skipExtraGoodbyeRef.current = true;
    await sleep(700);
    if (!endingRef.current) {
      await endCall(undefined, linesRef.current);
    }
  }

  async function requestGoodbyeLine(baseLines: CallLine[]): Promise<string> {
    if (!character) return '';
    const transcript = baseLines
      .filter(item => item.speaker !== 'system')
      .slice(-12)
      .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
      .join('\n');
    try {
      const personaBlocks = canonicalPersonaBlocks(character, state.config.language || 'Korean', {
        userVisibleName: userName,
        userProfile: state.config.userDescription,
        relationshipNote: room?.relationshipNote,
        memoryBlock: room ? privateMemoryPromptBlock(state, room, character, transcript) : '',
        memoryVisibility: 'private',
      });
      const goodbyeParts = [
        ...personaBlocks,
        `You are ${character.name} ending a private live phone call with ${userName}.`,
        'Return raw JSON only: {"line":"one short spoken goodbye line"}.',
        'No narration, no speaker label, no SNS post, no phone marker.',
      ];
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: compilePromptBlocks(goodbyeParts.map((part, index): PromptBlock => typeof part === 'string' ? {
            id: `phone.goodbye.${index}`,
            content: part,
            priority: goodbyeParts.length - index,
          } : part)).content,
        },
        {
          role: 'user',
          content: [
            `Call transcript:\n${transcript || '(empty)'}`,
            'The call is ending now. Give one natural final line.'
          ].join('\n\n')
        }
      ]);
      const parsed = parseJsonObject<{ line?: string; content?: string; text?: string }>(result.text);
      return String(parsed?.line || parsed?.content || parsed?.text || result.text || '').replace(/^["']|["']$/g, '').trim().slice(0, 120);
    } catch {
      return '';
    }
  }

  async function submitUserText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || phase === 'character_typing' || phase === 'user_sending' || phase === 'listening' || phase === 'ending') return;
    setPhase('user_sending');
    setDraftText('');
    setCurrentSpeaker('user');
    setCurrentFullText(trimmed);
    setDisplayText(trimmed);
    const next = addLine('user', trimmed);
    setUiMode('next');
    setChoices([]);
    await persistSession({ lines: next, phase: 'user_sending', choices: [], uiMode: 'next' }, { keepPointer: true });
    if (looksLikeHangup(trimmed) || finalTurnActiveRef.current) {
      await sleep(250);
      await endCall(undefined, next);
      return;
    }
    // No more character turns left — close instead of another API call.
    if (characterTurnCountRef.current >= MAX_PHONE_CHARACTER_TURNS) {
      skipExtraGoodbyeRef.current = true;
      await sleep(250);
      await endCall(undefined, next);
      return;
    }
    await sleep(350);
    await requestCharacterTurn(next);
  }

  async function nextPage() {
    if (phase !== 'awaiting_next') return;
    if (pageIndex < pages.length - 1) {
      await showCharacterPage(pages, pageIndex + 1, choices, uiMode, allowDirectReply);
      return;
    }
    if (finalTurnActiveRef.current) {
      skipExtraGoodbyeRef.current = true;
      await endCall(undefined, linesRef.current);
      return;
    }
    setPhase('awaiting_choice');
    setUiMode('choices');
  }

  async function endCall(finalUserText?: string, providedLines?: CallLine[]) {
    if (endingRef.current || !character) return;
    endingRef.current = true;
    finalTurnActiveRef.current = false;
    setPhase('ending');
    typingTokenRef.current += 1;
    let finalLines = providedLines || (finalUserText?.trim() ? addLine('user', finalUserText.trim()) : linesRef.current);
    let conversationLines = finalLines.filter(item => item.speaker !== 'system');
    if (!conversationLines.length && (onChange || onCommitCurrent) && roomId && !sourceMessageId) {
      const missedContent = `${character.name}에게 부재중 전화를 남겼습니다.`;
      const missedMessage: SNSGodMessage = {
        id: `phone_missed:${callSessionIdRef.current}`,
        role: 'user',
        characterId: character.id,
        content: missedContent,
        createdAt: Date.now(),
        phoneLog: 'missed',
        callDirection: 'outgoing',
        sourceMode: 'phone'
      };
      await showSystemCard('통화 종료 중...', 'ending');
      cancelChatJob(roomId);
      await commitFinishedCall([], missedMessage);
      onRequestReply?.(roomId, character.id, missedContent, {
        sourceMessageId: missedMessage.id,
        userMessageCreatedAt: missedMessage.createdAt,
      });
      setPhase('ended');
      onBack();
      return;
    }
    // Final 9th-turn already delivered a closing line — skip an extra goodbye API call.
    if (conversationLines.length && !skipExtraGoodbyeRef.current) {
      const goodbye = await requestGoodbyeLine(finalLines);
      const goodbyeLine = goodbye || '알겠어. 나중에 다시 전화할게.';
      await typeText(goodbyeLine, 'character', 'ending');
      finalLines = addLine('character', goodbyeLine);
      conversationLines = finalLines.filter(item => item.speaker !== 'system');
      await sleep(700);
    } else if (conversationLines.length && skipExtraGoodbyeRef.current) {
      await showSystemCard('통화 종료', 'ending');
      await sleep(350);
    }
    const endedAt = Date.now();
    await commitFinishedCall(conversationLines, undefined, endedAt);
    setPhase('ended');
    onBack();
  }

  async function commitFinishedCall(conversationLines: CallLine[], missedMessage?: SNSGodMessage, endedAt = Date.now()) {
    if (!character) return;
    const apply = (current: SNSGodState): SNSGodState => {
      const existingSession = (current.callSessions || []).find(item => item.id === callSessionIdRef.current);
      if (existingSession?.status === 'finished' && existingSession.resultAppliedAt) return current;
      const startedAt = conversationLines[0]?.createdAt || connectedAtRef.current || startedAtRef.current;
      const summary = phoneSummaryFromLines(character.name, userName, conversationLines.map(item => ({ speaker: item.speaker, text: item.text })));
      const finished = currentSessionSnapshot(current, {
        lines: conversationLines,
        phase: 'ended',
        endedAt,
        status: 'finished'
      });
      const claimed = applyLifecycleResultOnce(finished, endedAt).session;
      const log = {
        id: `call_log:${claimed.id}`,
        characterId: character.id,
        characterName: character.name,
        roomId,
        sourceMessageId,
        startedAt,
        endedAt,
        lines: conversationLines,
        summary
      };
      const callLogs = Array.isArray(current.callLogs) ? current.callLogs as Array<{ id?: string }> : [];
      let next: SNSGodState = {
        ...current,
        activeCallSessionId: current.activeCallSessionId === claimed.id ? undefined : current.activeCallSessionId,
        callSessions: [claimed, ...(current.callSessions || []).filter(item => item.id !== claimed.id)].slice(0, 50),
        callLogs: [log, ...callLogs.filter(item => item.id !== log.id)].slice(0, 100),
        messages: roomId ? {
          ...current.messages,
          [roomId]: (current.messages[roomId] || []).map(message => (sourceMessageId && message.id === sourceMessageId) || message.callResumeSessionId === claimed.id ? {
            ...message,
            callStatus: 'accepted',
            callHandledAt: endedAt
          } : message)
        } : current.messages
      };
      if (missedMessage && roomId) {
        next = cancelPendingReplyJob(next, roomId, 'newer-user-message');
        if (!(next.messages[roomId] || []).some(message => message.id === missedMessage.id)) next = appendMessage(next, roomId, missedMessage);
      } else if (roomId && !(next.messages[roomId] || []).some(message => message.id === `phone_log:${claimed.id}`)) {
        next = appendMessage(next, roomId, {
          id: `phone_log:${claimed.id}`,
          role: 'character',
          characterId: character.id,
          content: `통화 기록 ${formatPhoneDuration(endedAt - startedAt)}`,
          createdAt: endedAt,
          phoneLog: 'ended',
          phoneSummaryContext: summary,
          phoneStartedAt: startedAt,
          phoneEndedAt: endedAt,
          sourceMode: 'phone'
        });
      }
      return next;
    };
    if (onCommitCurrent) await onCommitCurrent(apply);
    else if (onChange) await onChange(apply(state));
  }

  async function exitCall() {
    if (endingRef.current) return;
    endingRef.current = true;
    typingTokenRef.current += 1;
    setPhase('ended');
    const hasConnected = Boolean(connectedAtRef.current || linesRef.current.some(line => line.speaker !== 'system'));
    await persistSession({
      status: hasConnected ? 'paused' : 'cancelled',
      phase: hasConnected ? (choices.length ? 'awaiting_choice' : 'awaiting_next') : 'ended',
      lines: linesRef.current,
      pages,
      pageIndex,
      choices,
      uiMode,
      allowDirectReply
    }, { keepPointer: false });
    onBack();
  }

  if (!character) {
    return (
      <View style={styles.fallbackScreen}>
        <Text style={styles.name}>캐릭터를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>나가기</Text></Pressable>
      </View>
    );
  }

  const status = statusText(phase, character.name);
  const canAct = phase === 'awaiting_choice' || phase === 'awaiting_next' || phase === 'awaiting_text';
  const keyboardTyping = keyboardVisible && phase === 'awaiting_text';
  const avatarSize = keyboardTyping ? 72 : 116;
  const ringScale = ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, phase === 'dialing' || phase === 'ringing' ? 1.1 : 1.055, 1] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.14, phase === 'character_typing' ? 0.38 : 0.26, 0.14] });
  return (
    <ImageBackground source={backgroundUri ? { uri: backgroundUri } : undefined} blurRadius={24} style={styles.screen}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={[styles.stage, keyboardTyping && styles.stageKeyboard]}>
        <View style={styles.header}>
          <Pressable onPress={() => exitCall()} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></Pressable>
          <View style={styles.headerButton} />
          <View style={styles.headerButton} />
        </View>
        <View style={[styles.hero, keyboardTyping && styles.heroKeyboard]}>
          <View style={[styles.avatarStage, keyboardTyping && styles.avatarStageKeyboard]}>
            <Animated.View style={[styles.ringOuter, keyboardTyping && styles.ringOuterKeyboard, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <Animated.View style={[styles.ringMiddle, keyboardTyping && styles.ringMiddleKeyboard, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <View style={[styles.avatarRing, keyboardTyping && styles.avatarRingKeyboard, phase === 'character_typing' && styles.avatarRingSpeaking]}>
              <Avatar character={character} size={avatarSize} />
            </View>
          </View>
          <Text style={[styles.name, keyboardTyping && styles.nameKeyboard]}>{character.name}</Text>
          <Text style={[styles.status, keyboardTyping && styles.statusKeyboard]}>{status}</Text>
          <Text style={[styles.duration, keyboardTyping && styles.durationKeyboard]}>통화 연결됨 · {formatElapsed(elapsedSec)}</Text>
        </View>
        <Animated.View style={[styles.turnCard, keyboardTyping && styles.turnCardKeyboard, { opacity: cardFade }]}>
          <Text style={[styles.turnText, keyboardTyping && styles.turnTextKeyboard]} numberOfLines={keyboardTyping ? 3 : undefined}>{displayText || currentFullText}</Text>
        </Animated.View>
        <View style={[styles.actionArea, keyboardTyping && styles.actionAreaKeyboard]}>
          {phase === 'listening' || phase === 'user_sending' ? (
            <View style={styles.loadingRow}><ActivityIndicator color="#edf2f6" /><Text style={styles.loadingText}>{status}</Text></View>
          ) : null}
          {phase === 'awaiting_next' ? (
            <Pressable onPress={nextPage} style={styles.choiceButton}>
              <Text style={styles.choiceText}>다음</Text>
            </Pressable>
          ) : null}
          {phase === 'awaiting_choice' ? choices.map(option => (
            <Pressable key={option} onPress={() => submitUserText(option)} style={styles.choiceButton}>
              <Text style={styles.choiceText}>{option}</Text>
            </Pressable>
          )) : null}
          {allowDirectReply && canAct && phase !== 'awaiting_text' ? (
            <Pressable onPress={() => setPhase('awaiting_text')} style={styles.textModeButton}>
              <Text style={styles.textModeText}>직접 답하기</Text>
            </Pressable>
          ) : null}
          {phase === 'awaiting_text' ? (
            <View style={[styles.directBox, keyboardTyping && styles.directBoxKeyboard]}>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                style={[styles.input, keyboardTyping && styles.inputKeyboard]}
                placeholder="직접 답하기"
                placeholderTextColor="#a8b2bd"
                multiline
                scrollEnabled
                textAlignVertical="top"
              />
              <Pressable onPress={() => submitUserText(draftText)} style={[styles.sendButton, !draftText.trim() && styles.disabled]} disabled={!draftText.trim()}>
                <Text style={styles.sendText}>전송</Text>
              </Pressable>
              <Pressable onPress={() => setPhase(choices.length ? 'awaiting_choice' : 'awaiting_next')} style={styles.backToChoices}>
                <Text style={styles.textModeText}>접기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {!keyboardTyping ? <Pressable onPress={() => connectedAtRef.current ? endCall() : exitCall()} style={styles.endButton}><Text style={styles.endText}>끊기</Text></Pressable> : null}
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function statusText(phase: CallPhase, characterName: string) {
  if (phase === 'dialing') return '연결 중...';
  if (phase === 'ringing') return '벨이 울리는 중...';
  if (phase === 'connected') return '통화 연결됨';
  if (phase === 'character_typing') return `${characterName}이 말하는 중...`;
  if (phase === 'listening' || phase === 'user_sending') return '듣는 중...';
  if (phase === 'awaiting_next') return '다음으로 진행 가능';
  if (phase === 'awaiting_text') return '직접 답하기';
  if (phase === 'ending') return '통화 종료 중';
  if (phase === 'ended') return '통화 종료됨';
  return '내 응답을 기다리는 중';
}

function formatElapsed(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = seconds % 60;
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1f2933' },
  fallbackScreen: { flex: 1, backgroundColor: '#27313b', padding: 20, justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,18,24,0.68)' },
  stage: { flex: 1, paddingHorizontal: 20, paddingBottom: 14 },
  stageKeyboard: { paddingBottom: 6 },
  header: { minHeight: 54, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#edf2f6', fontSize: 34, lineHeight: 36, fontWeight: '700' },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 18 },
  heroKeyboard: { paddingTop: 0, paddingBottom: 6 },
  avatarStage: { width: 164, height: 164, alignItems: 'center', justifyContent: 'center' },
  avatarStageKeyboard: { width: 92, height: 92 },
  ringOuter: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(237,242,246,0.68)' },
  ringOuterKeyboard: { width: 90, height: 90, borderRadius: 45 },
  ringMiddle: { position: 'absolute', width: 142, height: 142, borderRadius: 71, borderWidth: 1, borderColor: 'rgba(243,221,114,0.72)' },
  ringMiddleKeyboard: { width: 80, height: 80, borderRadius: 40 },
  avatarRing: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(237,242,246,0.24)', backgroundColor: 'rgba(255,255,255,0.04)' },
  avatarRingKeyboard: { width: 78, height: 78, borderRadius: 39 },
  avatarRingSpeaking: { borderColor: 'rgba(243,221,114,0.7)', backgroundColor: 'rgba(243,221,114,0.08)' },
  name: { marginTop: 8, fontSize: 30, color: '#fff', fontWeight: '900', textAlign: 'center' },
  nameKeyboard: { marginTop: 2, fontSize: 20 },
  status: { marginTop: 6, color: '#d8e1e9', fontSize: 15, lineHeight: 21, textAlign: 'center', fontWeight: '800' },
  statusKeyboard: { marginTop: 1, fontSize: 12, lineHeight: 16 },
  duration: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', color: 'rgba(255,255,255,0.78)', backgroundColor: 'rgba(255,255,255,0.1)', fontSize: 12, fontWeight: '800' },
  durationKeyboard: { marginTop: 4, paddingVertical: 4, fontSize: 11 },
  turnCard: { alignSelf: 'center', width: '88%', minHeight: 132, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 20, backgroundColor: 'rgba(0,0,0,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', justifyContent: 'center' },
  turnCardKeyboard: { width: '100%', minHeight: 76, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  turnText: { color: '#ffffff', fontSize: 19, lineHeight: 29, fontWeight: '800' },
  turnTextKeyboard: { fontSize: 15, lineHeight: 22 },
  actionArea: { flex: 1, justifyContent: 'flex-end', gap: 8, paddingTop: 14, paddingBottom: 10 },
  actionAreaKeyboard: { flex: 0, paddingTop: 8, paddingBottom: 4 },
  choiceButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6' },
  choiceText: { color: '#26313c', fontWeight: '900', fontSize: 15, textAlign: 'center', lineHeight: 20 },
  loadingRow: { minHeight: 54, borderRadius: 16, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  loadingText: { color: '#edf2f6', fontWeight: '800' },
  textModeButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  textModeText: { color: 'rgba(255,255,255,0.78)', fontWeight: '900' },
  directBox: { gap: 8 },
  directBoxKeyboard: { marginBottom: 0 },
  input: { minHeight: 48, maxHeight: 98, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', backgroundColor: 'rgba(58,70,82,0.95)', fontSize: 15 },
  inputKeyboard: { minHeight: 86, maxHeight: 128, fontSize: 16, lineHeight: 22 },
  sendButton: { height: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3dd72' },
  sendText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  backToChoices: { minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  endButton: { height: 58, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff5f61' },
  endText: { color: '#fff', fontWeight: '900', fontSize: 18 }
});
