import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { callLLMText, parseJsonObject } from '../logic/api';
import { finishMeetingEventSession, normalizeMeetingVisibleLine } from '../logic/meetingEvent';
import { findCharacter, findRoom } from '../logic/stateHelpers';
import { makeId } from '../logic/ids';
import { isRenderableMediaUri } from '../logic/media';
import { userNameFor } from '../logic/prompts';
import { MeetingEventLine, SNSGodCharacter, SNSGodState } from '../types';

type MeetingPhase = 'opening' | 'character_typing' | 'awaiting_next' | 'awaiting_choice' | 'awaiting_text' | 'user_sending' | 'thinking' | 'ending' | 'ended';
type MeetingUiMode = 'next' | 'choices' | 'input' | 'mixed';
type MeetingTurn = {
  line?: string;
  content?: string;
  text?: string;
  situation?: string;
  choices?: string[];
  options?: string[];
  uiMode?: MeetingUiMode;
  allowDirectReply?: boolean;
  endEvent?: boolean;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const character = findCharacter(state, session?.characterId);
  const room = findRoom(state, session?.roomId);
  const userName = character ? userNameFor(state, character, room) : '나';
  const [phase, setPhase] = useState<MeetingPhase>('opening');
  const [displayText, setDisplayText] = useState('');
  const [currentFullText, setCurrentFullText] = useState('만남을 준비하는 중...');
  const [choices, setChoices] = useState<string[]>([]);
  const [uiMode, setUiMode] = useState<MeetingUiMode>('choices');
  const [allowDirectReply, setAllowDirectReply] = useState(true);
  const [draftText, setDraftText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const typingTokenRef = useRef(0);
  const bootedRef = useRef(false);
  const endingRef = useRef(false);
  const linesRef = useRef<MeetingEventLine[]>(session?.lines || []);
  const backgroundUri = useMemo(() => {
    const uri = session?.stillImage || character?.coverImage || character?.avatar || character?.profileImage;
    return isRenderableMediaUri(uri) ? String(uri) : '';
  }, [character?.avatar, character?.coverImage, character?.profileImage, session?.stillImage]);

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
    if (!session || bootedRef.current) return;
    bootedRef.current = true;
    const first = normalizeMeetingVisibleLine(session.lines.find(item => item.speaker === 'character')?.text, session.seedSummary || session.mood || '') || '서로 마주 앉은 순간, 대화가 시작된다.';
    void showCharacterText(first, false, firstMeetingChoices(session.seedSummary || first), 'choices', true);
  }, [session?.id]);

  async function fadeIn() {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }

  function stateWithLocalSession(base: SNSGodState): SNSGodState {
    if (!session) return base;
    const localLines = linesRef.current;
    return {
      ...base,
      meetingEventSessions: (base.meetingEventSessions || []).map(item => item.id === session.id ? {
        ...item,
        lines: localLines,
        turnCount: localLines.filter(line => line.speaker === 'user').length
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

  async function showCharacterText(text: string, append = true, nextChoices: string[] = ['조금 더 말해줘.', '괜찮아, 천천히 해.', '이제 돌아가자.'], mode: MeetingUiMode = 'choices', direct = true) {
    if (!session) return;
    setChoices(nextChoices);
    setUiMode(mode);
    setAllowDirectReply(direct);
    setPhase('character_typing');
    if (append) {
      const line = { id: makeId('meetingline'), speaker: 'character' as const, text, createdAt: Date.now() };
      linesRef.current = [...linesRef.current, line];
      await onChange(stateWithLocalSession(state));
    }
    await typeText(text, mode === 'next' ? 'awaiting_next' : mode === 'input' ? 'awaiting_text' : 'awaiting_choice');
  }

  function parseTurn(text: string): { line: string; choices: string[]; uiMode: MeetingUiMode; allowDirectReply: boolean; endEvent: boolean } {
    const parsed = parseJsonObject<MeetingTurn>(text);
    const rawLine = String(parsed?.line || parsed?.situation || parsed?.content || parsed?.text || text || '').trim() || '잠깐 시선이 마주친다.';
    const line = normalizeMeetingVisibleLine(rawLine, transcriptFrom(linesRef.current) || session?.seedSummary || '');
    const parsedChoices = (parsed?.choices || parsed?.options || []).map(item => String(item || '').trim()).filter(item => item && hasKorean(item)).slice(0, 3);
    const choices = parsedChoices.length >= 2 ? parsedChoices : ['다시 말해줘.', '괜찮아, 옆에 있을게.', '이제 슬슬 가자.'];
    const mode = parsed?.uiMode === 'next' || parsed?.uiMode === 'input' || parsed?.uiMode === 'mixed' || parsed?.uiMode === 'choices'
      ? parsed.uiMode
      : choices.length ? 'choices' : 'next';
    return {
      line,
      choices,
      uiMode: mode === 'mixed' ? 'choices' : mode,
      allowDirectReply: parsed?.allowDirectReply !== false,
      endEvent: parsed?.endEvent === true
    };
  }

  function transcriptFrom(lines: MeetingEventLine[]) {
    if (!character) return '';
    return lines
      .filter(item => item.speaker !== 'system')
      .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
      .join('\n');
  }

  async function requestNextTurn(baseLines: MeetingEventLine[]) {
    if (!session || !character || busy || endingRef.current) return;
    const userTurnCount = baseLines.filter(line => line.speaker === 'user').length;
    const maxReached = userTurnCount >= session.maxTurns;
    if (maxReached) {
      await endMeeting();
      return;
    }
    setBusy(true);
    setPhase('thinking');
    setChoices([]);
    try {
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: [
            `You are writing a short in-person meeting event between ${character.name} and ${userName}.`,
            'Return raw JSON only: {"line":"character dialogue and/or brief situation description","choices":["user option 1","user option 2","user option 3"],"uiMode":"choices|input|next|mixed","allowDirectReply":true,"endEvent":false}.',
            'This is a real physical meeting, not messenger chat and not a phone call.',
            'Line may include concise situation description plus character dialogue, in Korean. Keep it emotionally grounded.',
            'Visible line and every choice must be Korean only. Do not output English action descriptions, English dialogue, romanized Korean, or translation notes.',
            'Each turn should move the moment forward. The event should last 3-8 user turns total.',
            'If the scene has reached a natural closing beat, set endEvent true.',
            `Character profile:\n${character.prompt || '(empty)'}`,
            `Meeting setup: location=${session.location || '(unknown)'}, reason=${session.reason || '(unknown)'}, mood=${session.mood || '(unknown)'}`,
            `Previous chat/setup:\n${session.seedSummary || '(empty)'}`
          ].join('\n\n')
        },
        {
          role: 'user',
          content: [
            `Meeting so far:\n${transcriptFrom(baseLines) || '(just started)'}`,
            `User turns used: ${userTurnCount}/${session.maxTurns}`,
            'Continue the meeting event now.'
          ].join('\n\n')
        }
      ]);
      const turn = parseTurn(result.text);
      if (turn.endEvent && session.turnCount >= 2) {
        await endMeeting();
        return;
      }
      await showCharacterText(turn.line, true, turn.choices, turn.uiMode, turn.allowDirectReply);
    } catch {
      await showCharacterText('잠깐 말이 끊기고, 서로의 표정을 살핀다. 괜찮아... 천천히 말해도 돼.', true, ['응, 천천히 말할게.', '지금 여기 와서 다행이야.', '이제 슬슬 가자.'], 'choices', true);
    } finally {
      setBusy(false);
    }
  }

  function looksLikeEnd(text: string) {
    return /돌아가|가자|헤어|끝|종료|집에|갈게|나중에|bye/i.test(text);
  }

  function firstMeetingChoices(context: string) {
    const source = String(context || '');
    if (/빵|선물|커피|음료|케이크|디저트|챙겨|건네|드리|전해/i.test(source)) {
      return ['가져온 걸 조심스럽게 건넨다.', '먼저 가볍게 인사한다.', '시간 괜찮은지 물어본다.'];
    }
    if (/비|우산|젖|춥|추워|더워|힘들|울|속상|괜찮/i.test(source)) {
      return ['괜찮은지 먼저 살핀다.', '천천히 말하자고 한다.', '잠깐 앉을 곳을 찾자고 한다.'];
    }
    return ['먼저 가볍게 인사한다.', '어색하게 웃으며 말을 건다.', '잠깐 걸을지 물어본다.'];
  }

  async function submitUserText(text: string) {
    if (!session || !text.trim() || phase === 'character_typing' || phase === 'thinking' || phase === 'user_sending' || phase === 'ending') return;
    const trimmed = text.trim();
    setDraftText('');
    setPhase('user_sending');
    const line = { id: makeId('meetingline'), speaker: 'user' as const, text: trimmed, createdAt: Date.now() };
    const nextLines = [...linesRef.current, line];
    linesRef.current = nextLines;
    await onChange(stateWithLocalSession(state));
    if (looksLikeEnd(trimmed) && nextLines.filter(item => item.speaker === 'user').length >= 2) {
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
    setPhase('ended');
    onBack();
  }

  if (!session || !character) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>만남 이벤트를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>나가기</Text></Pressable>
      </View>
    );
  }

  const canAct = phase === 'awaiting_choice' || phase === 'awaiting_next' || phase === 'awaiting_text';
  const keyboardTyping = keyboardVisible && phase === 'awaiting_text';
  return (
    <ImageBackground source={backgroundUri ? { uri: backgroundUri } : undefined} blurRadius={24} style={styles.screen}>
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.stage, keyboardTyping && styles.stageKeyboard]}>
        <View style={styles.header}>
          <Pressable onPress={endMeeting} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></Pressable>
          <Text style={styles.headerTitle}>{character.name}와 만남</Text>
          <View style={styles.headerButton} />
        </View>
        {!keyboardTyping ? (
          <View style={styles.stillWrap}>
            {isRenderableMediaUri(session.stillImage) ? (
              <Image source={{ uri: String(session.stillImage) }} style={styles.stillImage} resizeMode="cover" />
            ) : (
              <MeetingSceneFallback
                character={character}
                location={session.location || '만남 장소'}
                mood={session.mood || '첫 만남 분위기'}
                seedSummary={session.seedSummary || session.reason || ''}
                compact={false}
              />
            )}
          </View>
        ) : null}
        <Animated.View style={[styles.turnCard, keyboardTyping && styles.turnCardKeyboard, { opacity: fade }]}>
          <Text style={[styles.turnText, keyboardTyping && styles.turnTextKeyboard]} numberOfLines={keyboardTyping ? 4 : undefined}>{displayText || currentFullText}</Text>
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
  character: SNSGodCharacter;
  location: string;
  mood: string;
  seedSummary: string;
  compact: boolean;
}) {
  const initial = (character.avatarText || character.name || '?').slice(0, 1);
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
  stage: { flex: 1, paddingHorizontal: 18, paddingBottom: 14 },
  stageKeyboard: { paddingBottom: 6 },
  header: { minHeight: 54, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#edf2f6', fontSize: 34, lineHeight: 36, fontWeight: '700' },
  headerTitle: { flex: 1, color: '#edf2f6', fontSize: 16, fontWeight: '900', textAlign: 'center' },
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
