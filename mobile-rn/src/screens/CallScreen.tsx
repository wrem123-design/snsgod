import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLMText, parseJsonObject } from '../logic/api';
import { appendMessage, findCharacter, findRoom, roomMessages } from '../logic/stateHelpers';
import { makeId } from '../logic/ids';
import { formatPhoneDuration, phoneSummaryFromLines } from '../logic/phone';
import { isRenderableMediaUri } from '../logic/media';
import { SNSGodState } from '../types';

type CallLine = { id: string; speaker: 'user' | 'character' | 'system'; text: string; createdAt: number };
type CallPhase = 'dialing' | 'ringing' | 'connected' | 'character_typing' | 'awaiting_next' | 'awaiting_choice' | 'awaiting_text' | 'user_sending' | 'listening' | 'ending' | 'ended';
type CallTurnUiMode = 'next' | 'choices' | 'input' | 'mixed';
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

export function CallScreen({ state, characterId, roomId, sourceMessageId, onBack, onChange, onRequestReply }: {
  state: SNSGodState;
  characterId: string;
  roomId?: string;
  sourceMessageId?: string;
  onBack: () => void;
  onChange?: (next: SNSGodState) => Promise<void> | void;
  onRequestReply?: (roomId: string, characterId: string, latestUserInput: string) => void;
}) {
  const character = findCharacter(state, characterId);
  const room = findRoom(state, roomId);
  const userName = character ? String(room?.userAlias || character.userName || state.config.userName || '나') : '나';
  const [lines, setLines] = useState<CallLine[]>([]);
  const linesRef = useRef<CallLine[]>([]);
  const [phase, setPhase] = useState<CallPhase>('dialing');
  const [displayText, setDisplayText] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState<'character' | 'user' | 'system'>('system');
  const [currentFullText, setCurrentFullText] = useState('연결 중...');
  const [pages, setPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [uiMode, setUiMode] = useState<CallTurnUiMode>('choices');
  const [allowDirectReply, setAllowDirectReply] = useState(true);
  const [draftText, setDraftText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef(Date.now());
  const connectedAtRef = useRef<number | undefined>(undefined);
  const endingRef = useRef(false);
  const bootedRef = useRef(false);
  const typingTokenRef = useRef(0);
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
      void cancelCall();
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
    await showSystemCard('연결 중...', 'dialing');
    await sleep(700);
    connectedAtRef.current = Date.now();
    await showSystemCard('통화 연결됨', 'connected');
    await sleep(450);
    await requestCharacterTurn(linesRef.current, true);
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
    addLine('character', text);
  }

  function parsePhoneTurn(text: string): { lines: string[]; choices: string[]; uiMode: CallTurnUiMode; allowDirectReply: boolean } {
    const parsed = parseJsonObject<PhoneTurn>(text);
    const sourceLines = parsed
      ? parsed.lines || parsed.characterLines || parsed.dialogue || [parsed.line || parsed.content || parsed.text || '']
      : [text];
    const parsedChoices = parsed?.choices || parsed?.options || [];
    const nextLines = sourceLines.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3);
    const nextChoices = parsedChoices.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3);
    const mode = parsed?.uiMode === 'next' || parsed?.uiMode === 'input' || parsed?.uiMode === 'mixed' || parsed?.uiMode === 'choices'
      ? parsed.uiMode
      : nextChoices.length >= 2 ? 'choices' : 'next';
    return {
      lines: nextLines.length ? nextLines : ['여보세요?'],
      choices: nextChoices.length >= 2 ? nextChoices : ['응, 듣고 있어.', '조금 더 말해줘.', '나중에 다시 통화하자.'],
      uiMode: mode === 'mixed' ? 'choices' : mode,
      allowDirectReply: parsed?.allowDirectReply !== false
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
    if (!character || phase === 'ending') return;
    setPhase('listening');
    setChoices([]);
    setUiMode('next');
    setAllowDirectReply(false);
    try {
      const transcript = baseLines
        .filter(item => item.speaker !== 'system')
        .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
        .join('\n');
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: [
            `You are ${character.name} in a private live phone call with ${userName}.`,
            `Phone call language: ${character.language || state.config.language || 'Korean'}.`,
            'Return raw JSON only: {"lines":["short spoken line 1","short spoken line 2"],"choices":["user reply option 1","user reply option 2","user reply option 3"],"uiMode":"next|choices|input|mixed","allowDirectReply":true}.',
            'Lines must contain 1-3 short spoken live phone lines. Each line is shown as one card page. No narration, no action descriptions, no speaker labels, no phone-call markers, no SNS posts.',
            'Choices must be concise, varied, and directly reply to the spoken lines.',
            firstTurn ? 'For the first connected turn, uiMode may be next if the character is starting with a short greeting.' : 'Use choices when the user should answer meaningfully.',
            `Character profile:\n${character.prompt || '(empty)'}`,
            `User profile:\n${state.config.userDescription || '(empty)'}`,
            room?.relationshipNote ? `Room relationship/context note:\n${room.relationshipNote}` : '',
            `Recent messenger chat before this call:\n${recentChatContext() || '(empty)'}`
          ].filter(Boolean).join('\n\n')
        },
        {
          role: 'user',
          content: [
            `Phone call so far:\n${transcript || '(call just connected)'}`,
            firstTurn ? 'The call has just connected. Let the character speak first.' : 'Continue after my selected/direct reply.',
            'Return JSON now.'
          ].join('\n\n')
        }
      ]);
      const turn = parsePhoneTurn(result.text);
      await showCharacterPage(turn.lines, 0, turn.choices, turn.uiMode, turn.allowDirectReply);
    } catch {
      await showCharacterPage(['잠깐만... 목소리 들려?'], 0, ['다시 말해줘.', '괜찮아?', '나중에 다시 통화하자.'], 'choices', true);
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
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: [
            `You are ${character.name} ending a private live phone call with ${userName}.`,
            'Return raw JSON only: {"line":"one short spoken goodbye line"}.',
            'No narration, no speaker label, no SNS post, no phone marker.',
            `Character profile:\n${character.prompt || '(empty)'}`
          ].join('\n\n')
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
    if (looksLikeHangup(trimmed)) {
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
    setPhase('awaiting_choice');
    setUiMode('choices');
  }

  async function endCall(finalUserText?: string, providedLines?: CallLine[]) {
    if (endingRef.current || !character) return;
    endingRef.current = true;
    setPhase('ending');
    typingTokenRef.current += 1;
    let finalLines = providedLines || (finalUserText?.trim() ? addLine('user', finalUserText.trim()) : linesRef.current);
    let conversationLines = finalLines.filter(item => item.speaker !== 'system');
    if (!conversationLines.length && onChange && roomId && !sourceMessageId) {
      const missedContent = `${character.name}에게 부재중 전화를 남겼습니다.`;
      await showSystemCard('통화 종료 중...', 'ending');
      await onChange(appendMessage(state, roomId, {
        id: makeId('msg'),
        role: 'user',
        characterId: character.id,
        content: missedContent,
        createdAt: Date.now(),
        phoneLog: 'missed',
        callDirection: 'outgoing',
        sourceMode: 'phone'
      }));
      onRequestReply?.(roomId, character.id, missedContent);
      setPhase('ended');
      onBack();
      return;
    }
    if (conversationLines.length) {
      const goodbye = await requestGoodbyeLine(finalLines);
      const goodbyeLine = goodbye || '알겠어. 나중에 다시 전화할게.';
      await typeText(goodbyeLine, 'character', 'ending');
      finalLines = addLine('character', goodbyeLine);
      conversationLines = finalLines.filter(item => item.speaker !== 'system');
      await sleep(700);
    }
    const endedAt = Date.now();
    if (onChange) {
      const startedAt = conversationLines[0]?.createdAt || connectedAtRef.current || startedAtRef.current;
      const summaryLines = conversationLines.map(item => ({ speaker: item.speaker, text: item.text }));
      const summary = phoneSummaryFromLines(character.name, userName, summaryLines);
      const log = {
        id: `call_${Date.now()}`,
        characterId: character.id,
        characterName: character.name,
        roomId,
        sourceMessageId,
        startedAt,
        endedAt,
        lines: conversationLines,
        summary
      };
      const callLogs = Array.isArray(state.callLogs) ? state.callLogs as unknown[] : [];
      let next: SNSGodState = {
        ...state,
        callLogs: [log, ...callLogs].slice(0, 100),
        messages: roomId && sourceMessageId ? {
          ...state.messages,
          [roomId]: (state.messages[roomId] || []).map(message => message.id === sourceMessageId ? {
            ...message,
            callStatus: 'accepted',
            callHandledAt: endedAt
          } : message)
        } : state.messages
      };
      if (roomId) {
        next = appendMessage(next, roomId, {
          id: makeId('msg'),
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
      await onChange(next);
    }
    setPhase('ended');
    onBack();
  }

  async function cancelCall() {
    if (endingRef.current) return;
    endingRef.current = true;
    typingTokenRef.current += 1;
    setPhase('ended');
    if (onChange && roomId && sourceMessageId) {
      const roomMessageList = state.messages[roomId] || [];
      const target = roomMessageList.find(message => message.id === sourceMessageId);
      if (target && target.callStatus !== 'accepted') {
        await onChange({
          ...state,
          messages: {
            ...state.messages,
            [roomId]: roomMessageList.map(message => message.id === sourceMessageId ? {
              ...message,
              callStatus: 'rejected',
              callHandledAt: Date.now()
            } : message)
          }
        });
      }
    }
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
          <Pressable onPress={() => cancelCall()} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></Pressable>
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
        {!keyboardTyping ? <Pressable onPress={() => endCall()} style={styles.endButton}><Text style={styles.endText}>끊기</Text></Pressable> : null}
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
