import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { Avatar } from '../components/Avatar';
import { callLLMText, parseJsonObject } from '../logic/api';
import { finishMeetingEventSession, normalizeMeetingVisibleLine } from '../logic/meetingEvent';
import { findCharacter, findRoom } from '../logic/stateHelpers';
import { makeId } from '../logic/ids';
import { isRenderableMediaUri } from '../logic/media';
import { userNameFor } from '../logic/prompts';
import { transitionInteractionLifecycle } from '../logic/interactionLifecycle';
import { MeetingChoice, MeetingChoiceStyle, MeetingEventLine, MeetingEventSession, MeetingResultCard, MeetingScenarioPhase, MeetingStats, SNSGodCharacter, SNSGodState } from '../types';

type MeetingPhase = 'opening' | 'character_typing' | 'awaiting_next' | 'awaiting_choice' | 'awaiting_text' | 'user_sending' | 'thinking' | 'ending' | 'ended';
type MeetingUiMode = 'next' | 'choices' | 'input' | 'mixed';
type MeetingTurn = {
  phase?: MeetingScenarioPhase;
  sceneBeat?: string;
  line?: string;
  lines?: Array<{ speakerType?: 'user' | 'character' | 'narration'; characterId?: string; text?: string; content?: string }>;
  content?: string;
  text?: string;
  situation?: string;
  choices?: Array<string | Partial<MeetingChoice>>;
  options?: Array<string | Partial<MeetingChoice>>;
  uiMode?: MeetingUiMode;
  allowDirectReply?: boolean;
  endEvent?: boolean;
  nextPhaseHint?: MeetingScenarioPhase;
  resultHint?: string;
  relationshipDeltas?: Record<string, { affinity?: number; trust?: number; tension?: number }>;
  groupMood?: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const DEFAULT_STATS: MeetingStats = { affection: 0, trust: 0, tension: 0, awkwardness: 1, intimacy: 0 };

function clampEffect(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-3, Math.min(3, Math.round(number)));
}

function styleFromText(text: string): MeetingChoiceStyle {
  if (/돌아가|가자|끝|그만|집|헤어/.test(text)) return 'exit';
  if (/미안|사과/.test(text)) return 'apology';
  if (/장난|농담|웃|손\s*흔|분위기/.test(text)) return 'playful';
  if (/괜찮|천천히|위로|곁|기다|살핀/.test(text)) return 'comfort';
  if (/말없이|조용히|기다린다|옆에/.test(text)) return 'silent';
  if (/솔직|바로|묻는다|말한다/.test(text)) return 'direct';
  if (/놀리|질투|떠본|티/.test(text)) return 'teasing';
  if (/가까이|잡|다가|확실/.test(text)) return 'bold';
  return 'gentle';
}

function defaultEffectsForStyle(style: MeetingChoiceStyle): Partial<MeetingStats> {
  if (style === 'comfort') return { trust: 2, intimacy: 1, tension: -1, awkwardness: -1 };
  if (style === 'playful') return { affection: 1, awkwardness: -1, tension: -1 };
  if (style === 'direct') return { tension: 1, trust: 1 };
  if (style === 'silent') return { trust: 1, intimacy: 1, awkwardness: -1 };
  if (style === 'teasing') return { affection: 1, tension: 1 };
  if (style === 'apology') return { trust: 2, tension: -1 };
  if (style === 'bold') return { affection: 1, intimacy: 1, tension: 2 };
  if (style === 'exit') return { tension: -1, awkwardness: 1 };
  return { affection: 1 };
}

function normalizeChoice(value: string | Partial<MeetingChoice>, index: number): MeetingChoice | undefined {
  const text = typeof value === 'string' ? value : String(value.text || '').trim();
  if (!text || !hasKorean(text)) return undefined;
  const rawStyle = typeof value === 'string' ? undefined : value.style;
  const style = rawStyle === 'gentle' || rawStyle === 'playful' || rawStyle === 'direct' || rawStyle === 'comfort' || rawStyle === 'silent' || rawStyle === 'teasing' || rawStyle === 'apology' || rawStyle === 'bold' || rawStyle === 'exit'
    ? rawStyle
    : styleFromText(text);
  const rawEffects = typeof value === 'string' ? undefined : value.effects;
  const fallbackEffects = defaultEffectsForStyle(style);
  return {
    id: typeof value === 'string' ? `choice_${index}` : String(value.id || `choice_${index}`),
    text,
    style,
    effects: {
      affection: clampEffect(rawEffects?.affection ?? fallbackEffects.affection),
      trust: clampEffect(rawEffects?.trust ?? fallbackEffects.trust),
      tension: clampEffect(rawEffects?.tension ?? fallbackEffects.tension),
      awkwardness: clampEffect(rawEffects?.awkwardness ?? fallbackEffects.awkwardness),
      intimacy: clampEffect(rawEffects?.intimacy ?? fallbackEffects.intimacy)
    },
    targetCharacterId: typeof value === 'string' ? undefined : value.targetCharacterId,
    hiddenReactionHint: typeof value === 'string' ? undefined : value.hiddenReactionHint
  };
}

function normalizeChoices(values: Array<string | Partial<MeetingChoice>> | undefined, fallback: string[], limit = 3): MeetingChoice[] {
  const source = values && values.length ? values : fallback;
  const choices = source.map((item, index) => normalizeChoice(item, index)).filter(Boolean) as MeetingChoice[];
  return choices.length >= 2 ? choices.slice(0, limit) : fallback.map((item, index) => normalizeChoice(item, index)).filter(Boolean) as MeetingChoice[];
}

function applyChoiceEffects(stats: MeetingStats, choice?: MeetingChoice): MeetingStats {
  const effects = choice?.effects || {};
  return {
    affection: (stats.affection || 0) + clampEffect(effects.affection),
    trust: (stats.trust || 0) + clampEffect(effects.trust),
    tension: (stats.tension || 0) + clampEffect(effects.tension),
    awkwardness: (stats.awkwardness || 0) + clampEffect(effects.awkwardness),
    intimacy: (stats.intimacy || 0) + clampEffect(effects.intimacy)
  };
}

function hasKorean(value: string): boolean {
  return /[가-힣]/.test(value);
}

export function MeetingEventScreen({ state, sessionId, onBack, onChange }: {
  state: SNSGodState;
  sessionId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const session = (state.meetingEventSessions || []).find(item => item.id === sessionId);
  const isGroup = session?.mode === 'group' || session?.roomType === 'group';
  const groupParticipants = useMemo(
    () => (session?.presentCharacterIds || []).map(id => findCharacter(state, id)).filter(Boolean) as SNSGodCharacter[],
    [session?.presentCharacterIds, state.characters]
  );
  const character = findCharacter(state, session?.characterId || session?.primaryCharacterId) || groupParticipants[0];
  const room = findRoom(state, session?.roomId);
  const userName = character ? userNameFor(state, character, room) : '나';
  const [phase, setPhase] = useState<MeetingPhase>(session?.resumePhase || 'opening');
  const [displayText, setDisplayText] = useState(session?.resumeDisplayText || '');
  const [currentFullText, setCurrentFullText] = useState(session?.resumeDisplayText || '만남을 준비하는 중...');
  const [currentSpeakerLines, setCurrentSpeakerLines] = useState<MeetingEventLine[]>(session?.resumeSpeakerLines || []);
  const [choices, setChoices] = useState<MeetingChoice[]>(session?.resumeChoices || []);
  const [uiMode, setUiMode] = useState<MeetingUiMode>(session?.resumeUiMode || 'choices');
  const [allowDirectReply, setAllowDirectReply] = useState(session?.resumeAllowDirectReply !== false);
  const [draftText, setDraftText] = useState('');
  const [resultCard, setResultCard] = useState<MeetingResultCard | undefined>(undefined);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const typingTokenRef = useRef(0);
  const bootedRef = useRef(false);
  const endingRef = useRef(false);
  const linesRef = useRef<MeetingEventLine[]>(session?.lines || []);
  const sessionPatchRef = useRef<Partial<MeetingEventSession>>({});
  const backgroundUri = useMemo(() => {
    const uri = session?.stillImage || (!isGroup ? character?.coverImage || character?.avatar || character?.profileImage : '');
    return isRenderableMediaUri(uri) ? String(uri) : '';
  }, [character?.avatar, character?.coverImage, character?.profileImage, isGroup, session?.stillImage]);

  useEffect(() => {
    linesRef.current = session?.lines || [];
  }, [session?.lines]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void pauseMeeting();
      return true;
    });
    return () => subscription.remove();
  }, [session?.id]);

  useEffect(() => {
    if (!session || bootedRef.current) return;
    bootedRef.current = true;
    if (session.status === 'paused' || session.resumeDisplayText) {
      const restoredPhase = session.resumePhase === 'awaiting_text'
        ? 'awaiting_text'
        : session.resumeChoices?.length
          ? 'awaiting_choice'
          : 'awaiting_next';
      const restoredText = session.resumeDisplayText
        || [...session.lines].reverse().find(item => item.speaker === 'character')?.text
        || '이어서 대화를 시작합니다.';
      setCurrentFullText(restoredText);
      setDisplayText(restoredText);
      setCurrentSpeakerLines(session.resumeSpeakerLines || []);
      setChoices(session.resumeChoices || []);
      setUiMode(session.resumeUiMode || (session.resumeChoices?.length ? 'choices' : 'next'));
      setAllowDirectReply(session.resumeAllowDirectReply !== false);
      setPhase(restoredPhase);
      if (session.status === 'paused') {
        const active = transitionInteractionLifecycle(session, 'active');
        void onChange(stateWithLocalSession(state, {
          status: active.status,
          lifecycleRevision: active.lifecycleRevision,
          updatedAt: active.updatedAt
        }));
      }
      return;
    }
    if (isGroup) {
      const firstLines = session.lines.filter(item => item.speaker === 'character').slice(0, 3);
      void showGroupText(firstLines, false, firstMeetingChoices(session.seedSummary || session.mood || ''), 'choices', true);
      return;
    }
    const first = normalizeMeetingVisibleLine(session.lines.find(item => item.speaker === 'character')?.text, session.seedSummary || session.mood || '') || '서로 마주 앉은 순간, 대화가 시작된다.';
    void showCharacterText(first, false, firstMeetingChoices(session.seedSummary || first), 'choices', true);
  }, [session?.id]);

  async function fadeIn() {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }

  function stateWithLocalSession(base: SNSGodState, patch: Partial<MeetingEventSession> = {}): SNSGodState {
    if (!session) return base;
    const localLines = linesRef.current;
    sessionPatchRef.current = { ...sessionPatchRef.current, ...patch };
    return {
      ...base,
      meetingEventSessions: (base.meetingEventSessions || []).map(item => item.id === session.id ? {
        ...item,
        lines: localLines,
        turnCount: localLines.filter(line => line.speaker === 'user').length,
        totalUserTurns: localLines.filter(line => line.speaker === 'user').length,
        resumePhase: phase,
        resumeUiMode: uiMode,
        resumeChoices: choices,
        resumeAllowDirectReply: allowDirectReply,
        resumeDisplayText: displayText || currentFullText,
        resumeSpeakerLines: currentSpeakerLines,
        ...sessionPatchRef.current
      } : item)
    };
  }

  async function typeText(text: string, nextPhase: MeetingPhase) {
    const token = typingTokenRef.current + 1;
    typingTokenRef.current = token;
    setCurrentFullText(text);
    setDisplayText('');
    await fadeIn();
    let out = '';
    for (const ch of Array.from(text)) {
      if (typingTokenRef.current !== token) return;
      out += ch;
      setDisplayText(out);
      let delay = 22;
      if (/[,.!?…。？！]/.test(ch)) delay += 100;
      if (/\n/.test(ch)) delay += 120;
      await sleep(delay);
    }
    setDisplayText(text);
    setPhase(nextPhase);
  }

  async function showCharacterText(text: string, append = true, nextChoices: MeetingChoice[] = normalizeChoices(undefined, ['조금 더 말해줘.', '괜찮아, 천천히 해.', '이제 돌아가자.']), mode: MeetingUiMode = 'choices', direct = true, patch: Partial<MeetingEventSession> = {}) {
    if (!session) return;
    setCurrentSpeakerLines([]);
    setChoices(nextChoices);
    setUiMode(mode);
    setAllowDirectReply(direct);
    setPhase('character_typing');
    if (append) {
      const line = { id: makeId('meetingline'), speaker: 'character' as const, text, createdAt: Date.now() };
      linesRef.current = [...linesRef.current, line];
      await onChange(stateWithLocalSession(state, {
        ...patch,
        resumeChoices: nextChoices,
        resumeUiMode: mode,
        resumeAllowDirectReply: direct,
        resumeDisplayText: text,
        resumeSpeakerLines: [],
        resumePhase: mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice'
      }));
    }
    await typeText(text, mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice');
  }

  function speakerName(line: MeetingEventLine) {
    if (line.speaker === 'user') return userName;
    return line.characterName || groupParticipants.find(item => item.id === line.characterId)?.name || character?.name || '상대';
  }

  function groupTextFor(lines: MeetingEventLine[]) {
    return lines.map(line => `${speakerName(line)}\n${line.text}`).join('\n\n');
  }

  async function showGroupText(lines: MeetingEventLine[], append = true, nextChoices: MeetingChoice[] = normalizeChoices(undefined, ['가볍게 웃으며 받아준다.', '다 같이 안쪽으로 들어가자고 한다.', '잠깐 분위기를 살핀다.']), mode: MeetingUiMode = 'choices', direct = true, patch: Partial<MeetingEventSession> = {}) {
    if (!session) return;
    const fallback = groupParticipants[0];
    const safeLines = (lines.length ? lines : [{
      id: makeId('meetingline'),
      speaker: 'character' as const,
      speakerType: 'character' as const,
      characterId: fallback?.id,
      characterName: fallback?.name,
      text: '잠깐 서로 눈치를 보다가, 누군가 먼저 웃음을 터뜨린다.',
      createdAt: Date.now()
    }]).filter(line => line.text).slice(0, 3);
    setCurrentSpeakerLines(safeLines);
    setChoices(nextChoices);
    setUiMode(mode);
    setAllowDirectReply(direct);
    setPhase('character_typing');
    if (append) {
      linesRef.current = [...linesRef.current, ...safeLines];
      await onChange(stateWithLocalSession(state, {
        ...patch,
        resumeChoices: nextChoices,
        resumeUiMode: mode,
        resumeAllowDirectReply: direct,
        resumeDisplayText: groupTextFor(safeLines),
        resumeSpeakerLines: safeLines,
        resumePhase: mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice'
      }));
    }
    await typeText(groupTextFor(safeLines), mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice');
  }

  function parseTurn(text: string): { line: string; choices: MeetingChoice[]; uiMode: MeetingUiMode; allowDirectReply: boolean; endEvent: boolean; phase?: MeetingScenarioPhase; nextPhaseHint?: MeetingScenarioPhase; resultHint?: string } {
    const parsed = parseJsonObject<MeetingTurn>(text);
    const rawLine = String(parsed?.line || parsed?.situation || parsed?.content || parsed?.text || text || '').trim() || '잠깐 시선이 마주친다.';
    const line = normalizeMeetingVisibleLine(rawLine, transcriptFrom(linesRef.current) || session?.seedSummary || '');
    const choices = normalizeChoices(parsed?.choices || parsed?.options, ['다시 말해줘.', '괜찮아, 옆에 있을게.', '이제 슬슬 가자.'], 3);
    const mode = parsed?.uiMode === 'next' || parsed?.uiMode === 'input' || parsed?.uiMode === 'mixed' || parsed?.uiMode === 'choices'
      ? parsed.uiMode
      : choices.length ? 'choices' : 'next';
    return {
      line,
      choices,
      uiMode: mode === 'mixed' ? 'choices' : mode,
      allowDirectReply: parsed?.allowDirectReply !== false,
      endEvent: parsed?.endEvent === true,
      phase: parsed?.phase,
      nextPhaseHint: parsed?.nextPhaseHint,
      resultHint: parsed?.resultHint
    };
  }

  function transcriptFrom(lines: MeetingEventLine[]) {
    if (!character && !isGroup) return '';
    return lines
      .filter(item => item.speaker !== 'system')
      .map(item => `${item.speaker === 'user' ? userName : speakerName(item)}: ${item.text}`)
      .join('\n');
  }

  function activeSessionPatch(): MeetingEventSession | undefined {
    return session ? ({ ...session, ...sessionPatchRef.current, lines: linesRef.current } as MeetingEventSession) : undefined;
  }

  function phaseForUserTurn(userTurnCount: number): MeetingScenarioPhase {
    const current = activeSessionPatch();
    const plan: MeetingScenarioPhase[] = current?.phasePlan?.length ? current.phasePlan : ['intro', 'warmup', 'tension', 'climax', 'afterglow'];
    return plan[Math.min(Math.max(0, userTurnCount), plan.length - 1)] || 'afterglow';
  }

  function phaseGoalText(phaseName: MeetingScenarioPhase) {
    if (phaseName === 'intro') return '마주친 첫 반응과 공간감을 보여준다. 아직 깊은 감정을 터뜨리지 않는다.';
    if (phaseName === 'warmup') return '어색함을 풀되, 선택지가 행동/감정/분위기 전환으로 갈라지게 만든다.';
    if (phaseName === 'tension') return '캐릭터의 속마음, 갈등, 미묘한 긴장을 드러낸다. 아직 사건을 끝내지 않는다.';
    if (phaseName === 'turning') return '사용자의 이전 선택 때문에 분위기가 바뀌는 전환점을 만든다.';
    if (phaseName === 'climax') return '결정적 선택을 강제한다. 선택지는 결과가 확실히 갈라져야 한다.';
    if (phaseName === 'afterglow') return '결정 이후의 여운과 다음 대화로 이어질 떡밥을 남긴다.';
    return '장면을 자연스럽게 마무리한다.';
  }

  function canEndMeeting(userTurnCount: number) {
    const current = activeSessionPatch();
    const minTurns = current?.minTurns || 5;
    const currentPhase = current?.phase || phaseForUserTurn(userTurnCount);
    return userTurnCount >= minTurns
      && (currentPhase === 'afterglow' || currentPhase === 'ending')
      && current?.hasClimaxChoiceResolved === true;
  }

  function moodFromStats(stats: MeetingStats) {
    return [
      `affection=${stats.affection}`,
      `trust=${stats.trust}`,
      `tension=${stats.tension}`,
      `awkwardness=${stats.awkwardness}`,
      `intimacy=${stats.intimacy}`,
      stats.trust >= 3 ? 'trust is high: she can reveal more honest feelings.' : '',
      stats.tension >= 3 ? 'tension is high: make the air sharper or more charged.' : '',
      stats.awkwardness >= 3 ? 'awkwardness is high: make pauses, eye contact, or hesitant wording visible.' : '',
      stats.intimacy >= 3 ? 'intimacy is high: allow warmer and closer emotional expression.' : ''
    ].filter(Boolean).join(' / ');
  }

  function parseGroupTurn(text: string): { lines: MeetingEventLine[]; choices: MeetingChoice[]; uiMode: MeetingUiMode; allowDirectReply: boolean; endEvent: boolean; phase?: MeetingScenarioPhase; nextPhaseHint?: MeetingScenarioPhase; resultHint?: string } {
    const parsed = parseJsonObject<MeetingTurn>(text);
    const rawLines = Array.isArray(parsed?.lines) ? parsed.lines : [];
    const now = Date.now();
    const lastSpeaker = [...linesRef.current].reverse().find(line => line.speaker === 'character' && line.characterId)?.characterId;
    const fallbackSpeaker = groupParticipants.find(item => item.id !== lastSpeaker) || groupParticipants[0];
    const lines = rawLines
      .map((item, index) => {
        const picked = groupParticipants.find(groupCharacter => groupCharacter.id === item.characterId) || (index === 0 ? fallbackSpeaker : groupParticipants[index % Math.max(1, groupParticipants.length)]);
        const rawText = String(item.text || item.content || '').trim();
        const normalized = normalizeMeetingVisibleLine(rawText, transcriptFrom(linesRef.current) || session?.seedSummary || '');
        if (!picked || !normalized) return undefined;
        return {
          id: makeId('meetingline'),
          speaker: 'character' as const,
          speakerType: 'character' as const,
          characterId: picked.id,
          characterName: picked.name,
          text: normalized,
          createdAt: now + index
        };
      })
      .filter(Boolean) as MeetingEventLine[];
    const fallbackText = normalizeMeetingVisibleLine(parsed?.line || parsed?.content || parsed?.text, transcriptFrom(linesRef.current) || session?.seedSummary || '');
    const finalLines = lines.length ? lines.slice(0, 3) : [{
      id: makeId('meetingline'),
      speaker: 'character' as const,
      speakerType: 'character' as const,
      characterId: fallbackSpeaker?.id,
      characterName: fallbackSpeaker?.name,
      text: fallbackText,
      createdAt: now
    }];
    return {
      lines: finalLines,
      choices: normalizeChoices(parsed?.choices || parsed?.options, ['가볍게 웃으며 분위기를 받아준다.', '한 명에게 먼저 괜찮냐고 묻는다.', '다 같이 안쪽으로 들어가자고 한다.', '잠깐 조용히 분위기를 살핀다.'], 4),
      uiMode: parsed?.uiMode === 'next' || parsed?.uiMode === 'input' || parsed?.uiMode === 'mixed' || parsed?.uiMode === 'choices' ? (parsed.uiMode === 'mixed' ? 'choices' : parsed.uiMode) : 'choices',
      allowDirectReply: parsed?.allowDirectReply !== false,
      endEvent: parsed?.endEvent === true,
      phase: parsed?.phase,
      nextPhaseHint: parsed?.nextPhaseHint,
      resultHint: parsed?.resultHint
    };
  }

  async function requestNextTurn(baseLines: MeetingEventLine[]) {
    if (!session || (!character && !isGroup) || busy || endingRef.current) return;
    const userTurnCount = baseLines.filter(line => line.speaker === 'user').length;
    const nextScenarioPhase = phaseForUserTurn(userTurnCount);
    const currentSession = activeSessionPatch();
    const currentStats = currentSession?.stats || DEFAULT_STATS;
    const maxReached = userTurnCount >= session.maxTurns;
    if (maxReached && canEndMeeting(userTurnCount)) {
      await endMeeting();
      return;
    }
    setBusy(true);
    setPhase('thinking');
    setChoices([]);
    try {
      if (isGroup) {
        const result = await callLLMText(state, [
          {
            role: 'system',
            content: [
              'You are writing a short offline group meeting event from a group chat.',
              'Return raw JSON only: {"phase":"intro|warmup|tension|turning|climax|afterglow|ending","sceneBeat":"","lines":[{"speakerType":"character","characterId":"allowed id","text":"Korean line"}],"choices":[{"text":"Korean option","style":"gentle|playful|direct|comfort|silent|teasing|apology|bold|exit","effects":{"affection":0,"trust":0,"tension":0,"awkwardness":0,"intimacy":0},"targetCharacterId":"","hiddenReactionHint":""}],"uiMode":"choices|input|next|mixed","allowDirectReply":true,"endEvent":false,"nextPhaseHint":"climax","resultHint":"","relationshipDeltas":{},"groupMood":""}.',
              'This is a real physical group meeting, not messenger chat, not SNS, not a phone call.',
              'Write 1 to 3 short lines per turn. Korean only.',
              'Use only allowed present character ids. Do not invent outside speakers.',
              'Do not make the same character dominate. Avoid using the same speaker as the previous turn unless natural.',
              'All present characters should react at least once in the early turns, but do not force everyone to speak every turn.',
              'Choices must include at least one action-centered option, one emotion-centered option, and one mood-shifting option. Do not make all choices spoken dialogue.',
              'Before climax, never end the event. In climax, create a decisive choice. After climax, leave afterglow and future hook.',
              `Event type: ${currentSession?.eventType || 'group_meet'}`,
              `Current phase: ${nextScenarioPhase}`,
              `Current phase purpose: ${phaseGoalText(nextScenarioPhase)}`,
              `Event goal: ${currentSession?.eventGoal || '(empty)'}`,
              `Event conflict: ${currentSession?.eventConflict || '(empty)'}`,
              `Climax question: ${currentSession?.climaxQuestion || '(empty)'}`,
              `Current hidden stats: ${moodFromStats(currentStats)}`,
              `Climax already resolved: ${currentSession?.hasClimaxChoiceResolved === true ? 'yes' : 'no'}`,
              `Allowed present characters:\n${groupParticipants.map(item => `- ${item.id}: ${item.name} / ${item.prompt || '(empty)'}`).join('\n')}`,
              `Meeting setup: location=${session.location || '(unknown)'}, reason=${session.reason || '(unknown)'}, mood=${session.mood || '(unknown)'}`,
              `Previous chat/setup:\n${session.seedSummary || '(empty)'}`
            ].join('\n\n')
          },
          {
            role: 'user',
            content: [
              `Meeting so far:\n${transcriptFrom(baseLines) || '(just started)'}`,
              `User turns used: ${userTurnCount}/${session.maxTurns}; minimum before ending: ${currentSession?.minTurns || 5}`,
              'Continue the group meeting event now.'
            ].join('\n\n')
          }
        ]);
        if (endingRef.current) return;
        const turn = parseGroupTurn(result.text);
        const patch: Partial<MeetingEventSession> = { phase: turn.phase || nextScenarioPhase, phaseTurn: (currentSession?.phaseTurn || 0) + 1 };
        if (turn.endEvent && canEndMeeting(userTurnCount)) {
          await endMeeting();
          return;
        }
        await showGroupText(turn.lines, true, turn.choices, turn.uiMode, turn.allowDirectReply, patch);
        return;
      }
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: [
            `You are writing a short in-person meeting event between ${character.name} and ${userName}.`,
            'Return raw JSON only: {"phase":"intro|warmup|tension|turning|climax|afterglow|ending","sceneBeat":"current scene beat","line":"character dialogue and/or brief situation description","choices":[{"text":"Korean option","style":"gentle|playful|direct|comfort|silent|teasing|apology|bold|exit","effects":{"affection":0,"trust":0,"tension":0,"awkwardness":0,"intimacy":0},"hiddenReactionHint":""}],"uiMode":"choices|input|next|mixed","allowDirectReply":true,"endEvent":false,"nextPhaseHint":"climax","resultHint":""}.',
            'This is a real physical meeting, not messenger chat and not a phone call.',
            'Line may include concise situation description plus character dialogue, in Korean. Keep it emotionally grounded.',
            'Visible line and every choice must be Korean only. Do not output English action descriptions, English dialogue, romanized Korean, or translation notes.',
            'Each turn should move the moment forward through the phase plan, not loop as ordinary chat.',
            'Choices must include at least one action-centered option, one emotion-centered option, and one mood-shifting option. Do not make all choices spoken dialogue.',
            'Before climax, never end the event. In climax, create a decisive choice. After climax, leave afterglow and future hook.',
            `Event type: ${currentSession?.eventType || 'first_meeting'}`,
            `Current phase: ${nextScenarioPhase}`,
            `Current phase purpose: ${phaseGoalText(nextScenarioPhase)}`,
            `Event goal: ${currentSession?.eventGoal || '(empty)'}`,
            `Event conflict: ${currentSession?.eventConflict || '(empty)'}`,
            `Climax question: ${currentSession?.climaxQuestion || '(empty)'}`,
            `Expected ending tone: ${currentSession?.expectedEndingTone || '(empty)'}`,
            `Current hidden stats: ${moodFromStats(currentStats)}`,
            `Climax already resolved: ${currentSession?.hasClimaxChoiceResolved === true ? 'yes' : 'no'}`,
            `Character profile:\n${character.prompt || '(empty)'}`,
            `Meeting setup: location=${session.location || '(unknown)'}, reason=${session.reason || '(unknown)'}, mood=${session.mood || '(unknown)'}`,
            `Previous chat/setup:\n${session.seedSummary || '(empty)'}`
          ].join('\n\n')
        },
        {
          role: 'user',
          content: [
            `Meeting so far:\n${transcriptFrom(baseLines) || '(just started)'}`,
            `User turns used: ${userTurnCount}/${session.maxTurns}; minimum before ending: ${currentSession?.minTurns || 5}`,
            'Continue the meeting event now.'
          ].join('\n\n')
        }
      ]);
      if (endingRef.current) return;
      const turn = parseTurn(result.text);
      const patch: Partial<MeetingEventSession> = { phase: turn.phase || nextScenarioPhase, phaseTurn: (currentSession?.phaseTurn || 0) + 1 };
      if (turn.endEvent && canEndMeeting(userTurnCount)) {
        await endMeeting();
        return;
      }
      await showCharacterText(turn.line, true, turn.choices, turn.uiMode, turn.allowDirectReply, patch);
    } catch {
      if (endingRef.current) return;
      if (isGroup) {
        const speaker = groupParticipants[0];
        await showGroupText([{
          id: makeId('meetingline'),
          speaker: 'character',
          speakerType: 'character',
          characterId: speaker?.id,
          characterName: speaker?.name,
          text: '잠깐 말이 끊기고, 다들 서로의 표정을 살핀다. 일단 천천히 얘기하자.',
          createdAt: Date.now()
        }], true, normalizeChoices(undefined, ['가볍게 웃으며 받아준다.', '다 같이 앉을 곳을 찾는다.', '분위기를 농담으로 풀어본다.']), 'choices', true);
      } else {
        await showCharacterText('잠깐 말이 끊기고, 서로의 표정을 살핀다. 괜찮아... 천천히 말해도 돼.', true, normalizeChoices(undefined, ['응, 천천히 말할게.', '지금 여기 와서 다행이야.', '이제 슬슬 가자.']), 'choices', true);
      }
    } finally {
      setBusy(false);
    }
  }

  function looksLikeEnd(text: string) {
    return /돌아가|가자|헤어|끝|종료|집에|갈게|나중에|bye/i.test(text);
  }

  function firstMeetingChoices(context: string): MeetingChoice[] {
    const source = String(context || '');
    if (/빵|선물|커피|음료|케이크|디저트|챙겨|건네|드리|전해/i.test(source)) {
      return normalizeChoices(undefined, ['가져온 걸 조심스럽게 건넨다.', '먼저 가볍게 인사한다.', '시간 괜찮은지 물어본다.']);
    }
    if (/비|우산|젖|춥|추워|더워|힘들|울|속상|괜찮/i.test(source)) {
      return normalizeChoices(undefined, ['괜찮은지 먼저 살핀다.', '천천히 말하자고 한다.', '잠깐 앉을 곳을 찾자고 한다.']);
    }
    return normalizeChoices(undefined, ['먼저 가볍게 인사한다.', '어색하게 웃으며 말을 건다.', '잠깐 걸을지 물어본다.']);
  }

  async function submitUserText(text: string, selectedChoice?: MeetingChoice) {
    if (!session || !text.trim() || phase === 'character_typing' || phase === 'thinking' || phase === 'user_sending' || phase === 'ending') return;
    const trimmed = text.trim();
    setDraftText('');
    setPhase('user_sending');
    const line = { id: makeId('meetingline'), speaker: 'user' as const, speakerType: 'user' as const, text: trimmed, createdAt: Date.now() };
    const nextLines = [...linesRef.current, line];
    linesRef.current = nextLines;
    const userTurns = nextLines.filter(item => item.speaker === 'user').length;
    const currentSession = activeSessionPatch();
    const currentPhase = currentSession?.phase || phaseForUserTurn(Math.max(0, userTurns - 1));
    const nextStats = applyChoiceEffects(currentSession?.stats || DEFAULT_STATS, selectedChoice);
    const patch: Partial<MeetingEventSession> = {
      stats: nextStats,
      totalUserTurns: userTurns,
      hasClimaxChoiceResolved: currentSession?.hasClimaxChoiceResolved === true || currentPhase === 'climax'
    };
    await onChange(stateWithLocalSession(state, patch));
    if (looksLikeEnd(trimmed) && userTurns >= 2 && canEndMeeting(userTurns)) {
      await sleep(250);
      await endMeeting();
      return;
    }
    await sleep(300);
    await requestNextTurn(nextLines);
  }

  async function endMeeting() {
    if (!session || endingRef.current) return;
    endingRef.current = true;
    setPhase('ending');
    typingTokenRef.current += 1;
    setCurrentFullText('만남을 정리하는 중...');
    setDisplayText('만남을 정리하는 중...');
    const next = await finishMeetingEventSession(stateWithLocalSession(state), session.id);
    await onChange(next);
    const endedSession = (next.meetingEventSessions || []).find(item => item.id === session.id);
    setResultCard(endedSession?.resultCard);
    setPhase('ended');
  }

  async function pauseMeeting() {
    if (!session || endingRef.current) return;
    endingRef.current = true;
    typingTokenRef.current += 1;
    const local = stateWithLocalSession(state, {
      resumePhase: phase === 'awaiting_text' ? 'awaiting_text' : choices.length ? 'awaiting_choice' : 'awaiting_next',
      resumeUiMode: uiMode,
      resumeChoices: choices,
      resumeAllowDirectReply: allowDirectReply,
      resumeDisplayText: displayText || currentFullText,
      resumeSpeakerLines: currentSpeakerLines
    });
    const current = (local.meetingEventSessions || []).find(item => item.id === session.id);
    const paused = current?.status === 'active' ? transitionInteractionLifecycle(current, 'paused') : current;
    await onChange({
      ...local,
      activeMeetingEventId: local.activeMeetingEventId === session.id ? undefined : local.activeMeetingEventId,
      meetingEventSessions: (local.meetingEventSessions || []).map(item => item.id === session.id && paused ? paused : item)
    });
    onBack();
  }

  if (!session || (!character && !isGroup)) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>만남 이벤트를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>나가기</Text></Pressable>
      </View>
    );
  }

  const canAct = phase === 'awaiting_choice' || phase === 'awaiting_next' || phase === 'awaiting_text';
  const keyboardTyping = keyboardVisible && phase === 'awaiting_text';
  if (phase === 'ended' && resultCard) {
    return (
      <ImageBackground source={backgroundUri ? { uri: backgroundUri } : undefined} blurRadius={24} style={styles.screen}>
        <View style={styles.overlay} />
        <View style={styles.resultWrap}>
          <Text style={styles.resultTitle}>{resultCard.title || '오늘의 만남'}</Text>
          <Text style={styles.resultLine}>장소: {resultCard.location}</Text>
          <Text style={styles.resultLine}>분위기: {resultCard.mood}</Text>
          <View style={styles.resultDivider} />
          <Text style={styles.resultLabel}>결정적 순간</Text>
          <Text style={styles.resultBody}>{resultCard.keyMoment}</Text>
          <Text style={styles.resultLabel}>상대의 인상</Text>
          <Text style={styles.resultBody}>{resultCard.characterImpression}</Text>
          <Text style={styles.resultLabel}>후속 떡밥</Text>
          <Text style={styles.resultBody}>{(resultCard.futureHooks || []).join('\n')}</Text>
          <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>채팅으로 돌아가기</Text></Pressable>
        </View>
      </ImageBackground>
    );
  }
  return (
    <ImageBackground source={backgroundUri ? { uri: backgroundUri } : undefined} blurRadius={24} style={styles.screen}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.stage, keyboardTyping && styles.stageKeyboard]}>
        <View style={styles.header}>
          <Pressable onPress={pauseMeeting} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{isGroup ? '단톡 만남' : `${character?.name || '상대'}와 만남`}</Text>
            {isGroup ? <View style={styles.participantRow}>{groupParticipants.map(item => <Avatar key={item.id} character={item} size={24} />)}</View> : null}
          </View>
          <View style={styles.headerButton} />
        </View>
        {!keyboardTyping ? (
          <View style={styles.stillWrap}>
            {isRenderableMediaUri(session.stillImage) ? (
              <Image source={{ uri: String(session.stillImage) }} style={styles.stillImage} resizeMode="cover" />
            ) : (
              <MeetingSceneFallback
                character={character || groupParticipants[0]}
                location={session.location || '만남 장소'}
                mood={session.mood || '첫 만남 분위기'}
                seedSummary={session.seedSummary || session.reason || ''}
                compact={false}
              />
            )}
          </View>
        ) : null}
        <Animated.View style={[styles.turnCard, keyboardTyping && styles.turnCardKeyboard, { opacity: fade }]}>
          {isGroup && currentSpeakerLines.length && !keyboardTyping ? (
            <View style={styles.groupLineList}>
              {currentSpeakerLines.map(line => {
                const speaker = groupParticipants.find(item => item.id === line.characterId);
                return (
                  <View key={line.id} style={styles.groupLineRow}>
                    {speaker ? <Avatar character={speaker} size={28} /> : null}
                    <View style={styles.groupLineTextBlock}>
                      <Text style={styles.groupSpeakerName}>{speakerName(line)}</Text>
                      <Text style={styles.groupLineText}>{line.text}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.turnText, keyboardTyping && styles.turnTextKeyboard]} numberOfLines={keyboardTyping ? 4 : undefined}>{displayText || currentFullText}</Text>
          )}
        </Animated.View>
        <View style={[styles.actionArea, keyboardTyping && styles.actionAreaKeyboard]}>
          {phase === 'thinking' || phase === 'user_sending' ? (
            <View style={styles.loadingRow}><ActivityIndicator color="#edf2f6" /><Text style={styles.loadingText}>상황이 이어지는 중...</Text></View>
          ) : null}
          {phase === 'awaiting_next' ? (
            <Pressable onPress={() => requestNextTurn(linesRef.current)} style={styles.choiceButton}>
              <Text style={styles.choiceText}>다음</Text>
            </Pressable>
          ) : null}
          {phase === 'awaiting_choice' ? choices.map(option => (
            <Pressable key={option.id || option.text} onPress={() => submitUserText(option.text, option)} style={styles.choiceButton}>
              <Text style={styles.choiceText}>{option.text}</Text>
            </Pressable>
          )) : null}
          {allowDirectReply && canAct && phase !== 'awaiting_text' ? (
            <Pressable onPress={() => setPhase('awaiting_text')} style={styles.textModeButton}>
              <Text style={styles.textModeText}>직접 답하기</Text>
            </Pressable>
          ) : null}
          {phase === 'awaiting_text' ? (
            <View style={styles.directBox}>
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
              <Pressable onPress={() => submitUserText(draftText)} disabled={!draftText.trim()} style={[styles.sendButton, !draftText.trim() && styles.disabled]}>
                <Text style={styles.sendText}>전송</Text>
              </Pressable>
              <Pressable onPress={() => setPhase(choices.length ? 'awaiting_choice' : 'awaiting_next')} style={styles.backToChoices}>
                <Text style={styles.textModeText}>접기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {!keyboardTyping ? <Pressable onPress={endMeeting} style={styles.endButton}><Text style={styles.endText}>만남 종료</Text></Pressable> : null}
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function MeetingSceneFallback({ character, location, mood, seedSummary, compact }: {
  character?: SNSGodCharacter;
  location: string;
  mood: string;
  seedSummary: string;
  compact: boolean;
}) {
  const initial = (character?.avatarText || character?.name || '?').slice(0, 1);
  const summary = String(seedSummary || mood || '').replace(/\s+/g, ' ').trim();
  return (
    <View style={[styles.sceneFallback, compact && styles.sceneFallbackCompact]}>
      <View style={styles.sceneSky}>
        <View style={styles.sceneSun} />
        <View style={styles.sceneWindow} />
        <View style={[styles.sceneWindow, styles.sceneWindowSecond]} />
      </View>
      <View style={styles.sceneGround}>
        <View style={styles.scenePersonLeft}>
          <View style={styles.sceneHead}><Text style={styles.sceneHeadText}>나</Text></View>
          <View style={styles.sceneBody} />
        </View>
        <View style={styles.sceneTable}>
          <View style={styles.sceneCup} />
          <View style={styles.sceneCupSmall} />
        </View>
        <View style={styles.scenePersonRight}>
          <View style={[styles.sceneHead, styles.sceneCharacterHead]}><Text style={styles.sceneHeadText}>{initial}</Text></View>
          <View style={[styles.sceneBody, styles.sceneCharacterBody]} />
        </View>
      </View>
      <View style={styles.sceneCaption}>
        <Text style={styles.sceneLocation} numberOfLines={1}>{location}</Text>
        <Text style={styles.sceneMood} numberOfLines={compact ? 1 : 2}>{summary || mood}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#151d27' },
  fallback: { flex: 1, backgroundColor: '#151d27', padding: 20, justifyContent: 'center' },
  fallbackText: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,14,20,0.72)' },
  resultWrap: { flex: 1, margin: 18, justifyContent: 'center', gap: 10 },
  resultTitle: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  resultLine: { color: 'rgba(237,242,246,0.86)', fontSize: 15, lineHeight: 22, fontWeight: '800' },
  resultDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 8 },
  resultLabel: { marginTop: 8, color: '#f3dd72', fontSize: 14, lineHeight: 20, fontWeight: '900' },
  resultBody: { color: '#fff', fontSize: 17, lineHeight: 25, fontWeight: '800' },
  stage: { flex: 1, paddingHorizontal: 18, paddingBottom: 14 },
  stageKeyboard: { paddingBottom: 6 },
  header: { minHeight: 54, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#edf2f6', fontSize: 34, lineHeight: 36, fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#edf2f6', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  participantRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  stillWrap: { width: '100%', aspectRatio: 1.72, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0b0f15', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  stillImage: { width: '100%', height: '100%' },
  sceneFallback: { flex: 1, backgroundColor: '#1c2c37' },
  sceneFallbackCompact: { minHeight: 150 },
  sceneSky: { flex: 1, backgroundColor: '#33475a', position: 'relative' },
  sceneSun: { position: 'absolute', right: 22, top: 18, width: 34, height: 34, borderRadius: 17, backgroundColor: '#f3dd72' },
  sceneWindow: { position: 'absolute', left: 24, top: 22, width: 54, height: 42, borderRadius: 8, backgroundColor: 'rgba(237,242,246,0.18)', borderWidth: 1, borderColor: 'rgba(237,242,246,0.18)' },
  sceneWindowSecond: { left: 88, top: 34, width: 38, height: 30 },
  sceneGround: { height: '48%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 20, paddingBottom: 22, backgroundColor: '#26313c' },
  scenePersonLeft: { alignItems: 'center' },
  scenePersonRight: { alignItems: 'center' },
  sceneHead: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  sceneCharacterHead: { backgroundColor: '#f3dd72' },
  sceneHeadText: { color: '#26313c', fontSize: 13, fontWeight: '900' },
  sceneBody: { marginTop: -2, width: 42, height: 46, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#7995a8' },
  sceneCharacterBody: { backgroundColor: '#d9947a' },
  sceneTable: { width: 66, height: 30, borderRadius: 15, backgroundColor: '#edf2f6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  sceneCup: { width: 12, height: 16, borderRadius: 4, backgroundColor: '#33475a' },
  sceneCupSmall: { width: 10, height: 13, borderRadius: 4, backgroundColor: '#8b5e45' },
  sceneCaption: { position: 'absolute', left: 12, right: 12, bottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(10,14,20,0.62)' },
  sceneLocation: { color: '#edf2f6', fontSize: 15, lineHeight: 20, fontWeight: '900' },
  sceneMood: { marginTop: 1, color: 'rgba(237,242,246,0.76)', fontSize: 11, lineHeight: 15, fontWeight: '800' },
  turnCard: { marginTop: 14, alignSelf: 'center', width: '100%', minHeight: 124, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18, backgroundColor: 'rgba(0,0,0,0.56)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  turnCardKeyboard: { marginTop: 4, minHeight: 88, paddingHorizontal: 16, paddingVertical: 12 },
  turnText: { color: '#fff', fontSize: 18, lineHeight: 28, fontWeight: '800' },
  turnTextKeyboard: { fontSize: 15, lineHeight: 22 },
  groupLineList: { gap: 10 },
  groupLineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  groupLineTextBlock: { flex: 1 },
  groupSpeakerName: { color: 'rgba(237,242,246,0.72)', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  groupLineText: { marginTop: 2, color: '#fff', fontSize: 17, lineHeight: 25, fontWeight: '800' },
  actionArea: { flex: 1, justifyContent: 'flex-end', gap: 8, paddingTop: 14, paddingBottom: 10 },
  actionAreaKeyboard: { flex: 0, paddingTop: 8, paddingBottom: 4 },
  choiceButton: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6' },
  choiceText: { color: '#26313c', fontWeight: '900', fontSize: 15, textAlign: 'center', lineHeight: 20 },
  loadingRow: { minHeight: 54, borderRadius: 16, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  loadingText: { color: '#edf2f6', fontWeight: '800' },
  textModeButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  textModeText: { color: 'rgba(255,255,255,0.78)', fontWeight: '900' },
  directBox: { gap: 8 },
  input: { minHeight: 48, maxHeight: 104, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', backgroundColor: 'rgba(58,70,82,0.95)', fontSize: 15 },
  inputKeyboard: { minHeight: 92, maxHeight: 138, fontSize: 16, lineHeight: 22 },
  sendButton: { height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3dd72' },
  sendText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  backToChoices: { minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  endButton: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff5f61' },
  endText: { color: '#fff', fontWeight: '900', fontSize: 18 }
});
