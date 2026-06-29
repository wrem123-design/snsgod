import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLMText, parseJsonObject } from '../logic/api';
import { appendMessage, findCharacter, findRoom, roomMessages } from '../logic/stateHelpers';
import { makeId } from '../logic/ids';
import { formatPhoneDuration, phoneSummaryFromLines } from '../logic/phone';
import { SNSGodState } from '../types';

type CallLine = { id: string; speaker: 'user' | 'character' | 'system'; text: string; createdAt: number };
type PhoneUiPhase = 'connecting' | 'character_typing' | 'awaiting_user' | 'user_sending' | 'ending';
type InputMode = 'choices' | 'text';
type PhoneTurn = { lines?: string[]; characterLines?: string[]; dialogue?: string[]; line?: string; content?: string; text?: string; choices?: string[]; options?: string[] };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function CallScreen({ state, characterId, roomId, sourceMessageId, onBack, onChange }: {
  state: SNSGodState;
  characterId: string;
  roomId?: string;
  sourceMessageId?: string;
  onBack: () => void;
  onChange?: (next: SNSGodState) => Promise<void> | void;
}) {
  const character = findCharacter(state, characterId);
  const room = findRoom(state, roomId);
  const userName = character ? String(room?.userAlias || character.userName || state.config.userName || '나') : '나';
  const [lines, setLines] = useState<CallLine[]>([]);
  const linesRef = useRef<CallLine[]>([]);
  const [customText, setCustomText] = useState('');
  const [phase, setPhase] = useState<PhoneUiPhase>('connecting');
  const [inputMode, setInputMode] = useState<InputMode>('choices');
  const [choices, setChoices] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [booted, setBooted] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const startedAtRef = useRef(Date.now());
  const endingRef = useRef(false);

  useEffect(() => {
    linesRef.current = lines;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [lines]);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void endCall();
      return true;
    });
    return () => subscription.remove();
  }, [character?.id, roomId, sourceMessageId]);

  useEffect(() => {
    if (!onChange || !roomId || !sourceMessageId) return;
    const roomMessages = state.messages[roomId] || [];
    const target = roomMessages.find(message => message.id === sourceMessageId);
    if (!target || target.callStatus === 'accepted') return;
    void onChange({
      ...state,
      messages: {
        ...state.messages,
        [roomId]: roomMessages.map(message => message.id === sourceMessageId ? {
          ...message,
          callStatus: 'accepted',
          callHandledAt: Date.now()
        } : message)
      }
    });
  }, []);

  useEffect(() => {
    if (!character || booted) return;
    setBooted(true);
    appendUiLine('system', '연결 중...');
    const timer = setTimeout(() => {
      appendUiLine('system', '통화 연결됨');
      void requestCharacterTurn(linesRef.current, true);
    }, 650);
    return () => clearTimeout(timer);
  }, [character?.id, booted]);

  function appendUiLine(speaker: CallLine['speaker'], text: string) {
    const item = { id: makeId('callline'), speaker, text, createdAt: Date.now() };
    const next = [...linesRef.current, item];
    linesRef.current = next;
    setLines(next);
    return next;
  }

  function parsePhoneTurn(text: string): { lines: string[]; choices: string[] } {
    const parsed = parseJsonObject<PhoneTurn>(text);
    const sourceLines = parsed
      ? parsed.lines || parsed.characterLines || parsed.dialogue || [parsed.line || parsed.content || parsed.text || '']
      : [text];
    const parsedChoices = parsed?.choices || parsed?.options || [];
    const nextLines = sourceLines.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4);
    const nextChoices = parsedChoices.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3);
    return {
      lines: nextLines.length ? nextLines : ['여보세요?'],
      choices: nextChoices.length >= 2 ? nextChoices : ['응, 듣고 있어.', '조금 더 말해줘.', '나중에 다시 통화하자.']
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
    setPhase('character_typing');
    setChoices([]);
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
            'Return raw JSON only: {"lines":["character spoken line 1","character spoken line 2"],"choices":["user reply option 1","user reply option 2","user reply option 3"]}.',
            'Lines must contain 2-4 short spoken live phone lines. No narration, no action descriptions, no speaker labels, no phone-call markers, no SNS posts.',
            'Choices must be concise, varied, and directly reply to the spoken lines.',
            'If the user input is emotionally ambiguous, infer natural spoken intent. Do not treat it as narration.',
            `Character profile:\n${character.prompt || '(empty)'}`,
            `User profile:\n${state.config.userDescription || '(empty)'}`,
            room?.relationshipNote ? `Room relationship/context note:\n${room.relationshipNote}` : '',
            `Recent messenger chat before this call:\n${recentChatContext() || '(empty)'}`
          ].join('\n\n')
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
      for (const text of turn.lines) {
        await sleep(linesRef.current.some(item => item.speaker === 'character') ? 520 : 180);
        appendUiLine('character', text);
      }
      setChoices(turn.choices);
      setPhase('awaiting_user');
    } catch (error) {
      setPhase('awaiting_user');
      setChoices(['다시 말해줘.', '괜찮아?', '나중에 다시 통화하자.']);
      Alert.alert('전화 응답 실패', error instanceof Error ? error.message : String(error));
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
    if (!trimmed || phase === 'character_typing' || phase === 'user_sending' || phase === 'ending') return;
    const next = appendUiLine('user', trimmed);
    setCustomText('');
    setInputMode('choices');
    setChoices([]);
    if (looksLikeHangup(trimmed)) {
      await endCall(undefined, next);
      return;
    }
    setPhase('user_sending');
    await sleep(150);
    await requestCharacterTurn(next);
  }

  async function endCall(finalUserText?: string, providedLines?: CallLine[]) {
    if (endingRef.current) return;
    endingRef.current = true;
    setPhase('ending');
    let finalLines = providedLines || (finalUserText?.trim() ? appendUiLine('user', finalUserText.trim()) : linesRef.current);
    let conversationLines = finalLines.filter(item => item.speaker !== 'system');
    if (conversationLines.length && character) {
      const goodbye = await requestGoodbyeLine(finalLines);
      finalLines = appendUiLine('character', goodbye || '알겠어. 나중에 다시 전화할게.');
      conversationLines = finalLines.filter(item => item.speaker !== 'system');
      await sleep(850);
    }
    const endedAt = Date.now();
    if (onChange && character) {
      const startedAt = conversationLines[0]?.createdAt || startedAtRef.current;
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
    onBack();
  }

  if (!character) {
    return (
      <View style={styles.screen}>
        <Text style={styles.name}>캐릭터를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>나가기</Text></Pressable>
      </View>
    );
  }

  const busy = phase === 'connecting' || phase === 'character_typing' || phase === 'user_sending' || phase === 'ending';
  const status = phase === 'connecting'
    ? '연결 중'
    : phase === 'character_typing'
      ? `${character.name}이 말하는 중...`
      : phase === 'user_sending'
        ? `${character.name}이 듣는 중...`
        : phase === 'ending'
          ? '통화 종료 중...'
          : '내 응답을 기다리는 중';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => endCall()} style={styles.headerButton}><Text style={styles.headerButtonText}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>SNSGod 통화</Text>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.hero}>
        <View style={[styles.avatarRing, phase === 'character_typing' && styles.avatarRingSpeaking]}>
          <Avatar character={character} size={104} />
        </View>
        <Text style={styles.name}>{character.name}</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.duration}>통화 연결됨 · {formatElapsed(elapsedSec)}</Text>
      </View>
      <ScrollView ref={scrollRef} style={styles.log} contentContainerStyle={styles.logContent}>
        {lines.map(item => item.speaker === 'system' ? (
          <Text key={item.id} style={styles.systemLine}>{item.text}</Text>
        ) : (
          <View key={item.id} style={[styles.lineBubble, item.speaker === 'user' ? styles.userLine : styles.characterLine]}>
            <Text style={[styles.lineSpeaker, item.speaker === 'user' && styles.userSpeaker]}>{item.speaker === 'user' ? userName : character.name}</Text>
            <Text style={[styles.lineText, item.speaker === 'user' && styles.userLineText]}>{item.text}</Text>
          </View>
        ))}
        {phase === 'character_typing' ? <Text style={styles.systemLine}>{character.name}이 말하는 중...</Text> : null}
      </ScrollView>
      <View style={styles.replyArea}>
        {inputMode === 'choices' ? (
          <>
            {phase === 'awaiting_user' ? choices.map(option => (
              <Pressable key={option} onPress={() => submitUserText(option)} style={styles.choiceButton}>
                <Text style={styles.choiceText}>{option}</Text>
              </Pressable>
            )) : <View style={styles.loadingRow}><ActivityIndicator color="#edf2f6" /><Text style={styles.loadingText}>{status}</Text></View>}
            <Pressable onPress={() => setInputMode('text')} disabled={phase !== 'awaiting_user'} style={[styles.textModeButton, phase !== 'awaiting_user' && styles.disabled]}>
              <Text style={styles.textModeText}>직접 답하기</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.directBox}>
            <TextInput
              value={customText}
              onChangeText={setCustomText}
              style={styles.input}
              placeholder="직접 답변 입력..."
              placeholderTextColor="#a8b2bd"
              multiline
            />
            <Pressable onPress={() => submitUserText(customText)} style={[styles.sendButton, (!customText.trim() || busy) && styles.disabled]} disabled={!customText.trim() || busy}>
              <Text style={styles.sendText}>보내기</Text>
            </Pressable>
            <Pressable onPress={() => setInputMode('choices')} style={styles.backToChoices}>
              <Text style={styles.textModeText}>선택지로 돌아가기</Text>
            </Pressable>
          </View>
        )}
        <Pressable onPress={() => endCall()} style={styles.endButton}><Text style={styles.endText}>끊기</Text></Pressable>
      </View>
    </View>
  );
}

function formatElapsed(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = seconds % 60;
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#27313b', paddingHorizontal: 20, paddingBottom: 14 },
  header: { minHeight: 52, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#edf2f6', fontSize: 34, lineHeight: 36, fontWeight: '700' },
  headerTitle: { color: '#edf2f6', fontSize: 16, fontWeight: '900' },
  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 14 },
  avatarRing: { width: 122, height: 122, borderRadius: 61, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(237,242,246,0.18)' },
  avatarRingSpeaking: { borderColor: 'rgba(243,221,114,0.55)', backgroundColor: 'rgba(243,221,114,0.06)' },
  name: { marginTop: 14, fontSize: 30, color: '#fff', fontWeight: '900', textAlign: 'center' },
  status: { marginTop: 6, color: '#d8e1e9', fontSize: 15, lineHeight: 21, textAlign: 'center', fontWeight: '800' },
  duration: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, overflow: 'hidden', color: 'rgba(255,255,255,0.76)', backgroundColor: 'rgba(255,255,255,0.08)', fontSize: 12, fontWeight: '800' },
  log: { alignSelf: 'stretch', flex: 1 },
  logContent: { paddingVertical: 12, gap: 10 },
  systemLine: { alignSelf: 'center', maxWidth: '86%', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  lineBubble: { maxWidth: '78%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 13 },
  characterLine: { alignSelf: 'flex-start', backgroundColor: 'rgba(57,71,89,0.92)' },
  userLine: { alignSelf: 'flex-end', backgroundColor: '#f3dd72' },
  lineSpeaker: { color: 'rgba(255,255,255,0.64)', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  userSpeaker: { color: 'rgba(31,28,10,0.58)' },
  lineText: { color: '#fff', fontSize: 16, lineHeight: 24, fontWeight: '700' },
  userLineText: { color: '#201b06' },
  replyArea: { alignSelf: 'stretch', gap: 10, paddingTop: 10 },
  choiceButton: { minHeight: 50, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6' },
  choiceText: { color: '#26313c', fontWeight: '900', fontSize: 15, textAlign: 'center', lineHeight: 20 },
  loadingRow: { minHeight: 50, borderRadius: 20, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  loadingText: { color: '#edf2f6', fontWeight: '800' },
  textModeButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  textModeText: { color: 'rgba(255,255,255,0.78)', fontWeight: '900' },
  directBox: { gap: 8 },
  input: { minHeight: 46, maxHeight: 96, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', backgroundColor: '#3a4652', fontSize: 15 },
  sendButton: { height: 46, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6' },
  sendText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  backToChoices: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  endButton: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff6b6b' },
  endText: { color: '#fff', fontWeight: '900', fontSize: 17 }
});
