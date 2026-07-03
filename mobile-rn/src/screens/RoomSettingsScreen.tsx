import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodRoom, SNSGodState } from '../types';
import { deleteRoom, findCharacter, findRoom, updateRoom } from '../logic/stateHelpers';
import { isRandomRoom, removeRandomChatRoom } from '../logic/randomChat';
import { callLLMText } from '../logic/api';
import { replaceAutoSummaryBlock } from '../logic/memoryBridge';

export function RoomSettingsScreen({ state, roomId, onBack, onChange }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const [draft, setDraft] = useState<SNSGodRoom | null>(room ? { ...room } : null);
  const [summarizing, setSummarizing] = useState(false);
  const [status, setStatus] = useState('');

  if (!room || !draft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>방을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>돌아가기</Text></Pressable>
      </View>
    );
  }

  async function save() {
    if (!draft) return;
    const roomPatch = {
      name: draft.name.trim() || '기본 채팅',
      userAlias: String(draft.userAlias || '').trim(),
      relationshipNote: String(draft.relationshipNote || '').trim(),
      roomPrompt: normalizeRoomPromptForSave(String(draft.roomPrompt || '').trim()),
      disabled: draft.disabled === true,
      disabledAt: draft.disabled === true ? Number(draft.disabledAt || Date.now()) : undefined
    };
    let next = updateRoom(state, roomId, roomPatch);
    if (roomPatch.disabled) {
      const pendingReplies = { ...(next.pendingReplies || {}) };
      delete pendingReplies[roomId];
      next = { ...next, pendingReplies };
    }
    await onChange(next);
    onBack();
  }

  function set<K extends keyof SNSGodRoom>(key: K, value: SNSGodRoom[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function confirmDelete() {
    Alert.alert('채팅방 삭제', '이 채팅방 자체를 삭제할까요? 메시지와 안읽음 기록도 함께 삭제되며 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const next = isRandomRoom(state, room) ? removeRandomChatRoom(state, roomId) : deleteRoom(state, roomId);
          await onChange(next);
          onBack();
        }
      }
    ]);
  }

  function confirmCleanRoom() {
    const count = state.messages[roomId]?.length || 0;
    Alert.alert('방 청소', `이 방의 대화내역 ${count}개를 모두 지울까요?\n\n방 설정과 관계 요약은 유지됩니다. 필요하면 먼저 "현재 대화 요약"을 누르고 저장한 뒤 청소하세요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '청소',
        style: 'destructive',
        onPress: async () => {
          await onChange(cleanRoomConversation(state, roomId));
          setStatus('방 대화내역을 비웠습니다.');
        }
      }
    ]);
  }

  async function summarizeCurrentRoom() {
    if (!draft || !room || !character || summarizing) return;
    const transcript = roomTranscript(state, room, draft, character.name);
    if (!transcript) {
      Alert.alert('대화 요약', '요약할 대화가 아직 없습니다.');
      return;
    }
    setSummarizing(true);
    setStatus('현재 방 대화를 요약하는 중...');
    try {
      const { text, keyIndex } = await callLLMText(state, [
        {
          role: 'system',
          content: [
            'Summarize this private chat room into durable relationship memory for future roleplay replies.',
            'Write in Korean. Return plain text only. No markdown table, no JSON.',
            'Focus on facts the characters should remember: relationship changes, promises, nicknames, boundaries, emotional events, unresolved topics, preferences, important phone-call memories, and recurring inside jokes.',
            'Do not include trivial line-by-line recap. Do not invent facts. If uncertain, phrase it as uncertain.',
            'Keep it compact but useful, around 8-16 bullet lines.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `Room: ${room.name}`,
            `User visible name: ${String(draft.userAlias || state.config.userName || '나')}`,
            `Character: ${character.name}`,
            draft.relationshipNote ? `Existing room relationship note:\n${draft.relationshipNote}` : '',
            draft.roomPrompt ? `Existing additional room prompt:\n${draft.roomPrompt}` : '',
            `Current room conversation:\n${transcript}`
          ].filter(Boolean).join('\n\n')
        }
      ]);
      const summary = cleanSummary(text);
      if (!summary) throw new Error('요약 결과가 비어 있습니다.');
      const roomPrompt = replaceAutoSummaryBlock(String(draft.roomPrompt || ''), summary);
      const nextDraft = { ...draft, roomPrompt };
      setDraft(nextDraft);
      const activeProfile = state.config.apiProfiles[state.config.apiType] || {};
      await onChange(updateRoom({
        ...state,
        config: {
          ...state.config,
          apiProfiles: {
            ...state.config.apiProfiles,
            [state.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
          }
        }
      }, roomId, {
        name: nextDraft.name.trim() || '기본 채팅',
        userAlias: String(nextDraft.userAlias || '').trim(),
        relationshipNote: String(nextDraft.relationshipNote || '').trim(),
        roomPrompt: String(nextDraft.roomPrompt || '').trim()
      }));
      setStatus('대화 요약을 추가 방 프롬프트에 저장했습니다.');
    } catch (error) {
      setStatus(`대화 요약 실패: ${error instanceof Error ? error.message : String(error)}`);
      Alert.alert('대화 요약 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>방 설정</Text>
        <Pressable onPress={save} style={styles.saveTop}><Text style={styles.saveTopText}>저장</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{character?.name || '캐릭터'} · {room.name}</Text>
          <Text style={styles.help}>이 설정은 이 채팅방 안에서만 적용됩니다. 캐릭터 설정의 이름/프로필보다 방 설정의 관계/호칭 메모가 대화 프롬프트에서 더 구체적인 지시로 들어갑니다.</Text>
          <Field label="방 이름" value={draft.name} onChangeText={value => set('name', value)} />
          <Field label="이 방에서 나를 부를 이름" value={String(draft.userAlias || '')} onChangeText={value => set('userAlias', value)} help="예: 오빠, 선배, 찐따. 빈칸이면 캐릭터 설정의 내 이름, 그것도 빈칸이면 기본 내 프로필 이름을 씁니다." />
          <Field label="이 채팅방에서만 적용할 관계/호칭 메모" value={String(draft.relationshipNote || '')} onChangeText={value => set('relationshipNote', value)} multiline help="단어만 써도 되지만, 보통 “나를 찐따라고 부름”, “서로 오래 알고 지낸 전 연인처럼 말함”처럼 문장으로 쓰는 게 확실합니다." />
          <View style={styles.summaryBox}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>방 대화 히스토리</Text>
              <Pressable onPress={summarizeCurrentRoom} disabled={summarizing} style={[styles.summaryButton, summarizing && styles.disabled]}>
                <Text style={styles.summaryButtonText}>{summarizing ? '요약 중...' : '현재 대화 요약'}</Text>
              </Pressable>
            </View>
            <Text style={styles.help}>누르면 이 방의 대화를 AI가 관계 기억으로 압축해서 아래 관계 요약에 저장합니다. 다시 누르면 자동 요약 블록만 최신 내용으로 교체됩니다.</Text>
            {status ? <Text style={styles.status}>{status}</Text> : null}
          </View>
          <Field label="관계 요약" value={String(draft.roomPrompt || '')} onChangeText={value => set('roomPrompt', value)} multiline />
        </View>
        <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>방 설정 저장</Text></Pressable>
        <View style={styles.dangerRow}>
          <Pressable onPress={confirmCleanRoom} style={styles.cleanButton}><Text style={styles.cleanText}>방 청소</Text></Pressable>
          <Pressable onPress={() => setDraft(prev => prev ? { ...prev, disabled: prev.disabled !== true, disabledAt: prev.disabled === true ? undefined : Date.now() } : prev)} style={[styles.cleanButton, draft.disabled === true && styles.disabledRoomButton]}><Text style={styles.cleanText}>{draft.disabled === true ? '방 활성화' : '방 비활성화'}</Text></Pressable>
          <Pressable onPress={confirmDelete} style={styles.danger}><Text style={styles.dangerText}>채팅방 삭제</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function cleanRoomConversation(state: SNSGodState, roomId: string): SNSGodState {
  const messages = { ...state.messages, [roomId]: [] };
  const unreadCounts = { ...state.unreadCounts };
  delete unreadCounts[roomId];
  const pendingReplies = { ...(state.pendingReplies || {}) };
  delete pendingReplies[roomId];
  return {
    ...state,
    messages,
    unreadCounts,
    pendingReplies,
    notifications: (state.notifications || []).filter(item => item.roomId !== roomId && item.target?.roomId !== roomId)
  };
}

function roomTranscript(state: SNSGodState, room: SNSGodRoom, draft: SNSGodRoom, characterName: string) {
  const userName = String(draft.userAlias || state.config.userName || '나');
  return (state.messages[room.id] || []).slice(-220).map(message => {
    const speaker = message.role === 'user' ? userName : message.role === 'character' ? characterName : '시스템';
    const pieces = [
      message.content,
      message.imageCaption ? `사진 설명: ${message.imageCaption}` : '',
      message.mediaData ? '사진/미디어 첨부 있음' : '',
      message.phoneLog ? phoneLogText(message) : ''
    ].map(value => String(value || '').trim()).filter(Boolean);
    return pieces.length ? `${speaker}: ${pieces.join(' / ')}` : '';
  }).filter(Boolean).join('\n');
}

function phoneLogText(message: { [key: string]: unknown; content?: string; phoneLog?: unknown }) {
  const summary = String(message.phoneSummaryContext || '').trim();
  const startedAt = Number(message.phoneStartedAt || 0);
  const endedAt = Number(message.phoneEndedAt || 0);
  const duration = startedAt && endedAt && endedAt > startedAt ? ` / 통화 시간: ${Math.round((endedAt - startedAt) / 1000)}초` : '';
  return [
    `통화 기록: ${String(message.content || message.phoneLog || '').trim()}`,
    summary ? `통화 대화 내용 요약: ${summary}` : '',
    duration.trim()
  ].filter(Boolean).join(' / ');
}

function cleanSummary(value: string) {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, match => match.replace(/```[a-z]*|```/gi, '').trim())
    .replace(/^\s*(요약|summary)\s*[:：]\s*/i, '')
    .trim();
  return summaryFromJsonish(text) || normalizePlainSummary(text);
}

function normalizePlainSummary(value: string) {
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s*/, '- '))
    .join('\n')
    .trim();
}

function summaryFromJsonish(value: string) {
  const source = String(value || '').trim();
  const candidates = [
    source,
    sliceJsonCandidate(source, '[', ']'),
    sliceJsonCandidate(source, '{', '}')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const lines = summaryValueToLines(JSON.parse(candidate)).filter(Boolean);
      if (lines.length) return lines.join('\n');
    } catch {
      // The model sometimes returns plain text; keep falling back gracefully.
    }
  }
  return '';
}

function sliceJsonCandidate(source: string, open: string, close: string) {
  const start = source.indexOf(open);
  const end = source.lastIndexOf(close);
  return start >= 0 && end > start ? source.slice(start, end + 1) : '';
}

function summaryValueToLines(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [toSummaryLine('', value)] : [];
  if (Array.isArray(value)) return value.flatMap(item => summaryValueToLines(item));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return [toSummaryLine(key, String(item))];
    }
    return summaryValueToLines(item);
  });
}

function toSummaryLine(key: string, value: string) {
  const text = String(value || '').trim().replace(/[。]+$/g, '.');
  if (!text) return '';
  const label = summaryLabelFor(key);
  return label ? `- ${label}: ${text}` : `- ${text}`;
}

function summaryLabelFor(key: string) {
  const normalized = key.toLowerCase();
  if (!normalized || /^fact_\d+$/.test(normalized)) return '';
  if (normalized === 'summary') return '요약';
  if (/^preference/.test(normalized)) return '선호';
  if (/^promise/.test(normalized)) return '약속';
  if (/^boundary/.test(normalized)) return '경계';
  if (/^unresolved/.test(normalized)) return '미해결';
  if (/inside_joke|joke/.test(normalized)) return '둘만의 에피소드';
  if (/memory/.test(normalized)) return '기억';
  return '';
}

function normalizeRoomPromptForSave(prompt: string) {
  return String(prompt || '').replace(
    /\[자동 대화 요약\]([\s\S]*?)\[\/자동 대화 요약\]/g,
    (_match, body) => replaceAutoSummaryBlock('', cleanSummary(String(body || '')))
  ).trim();
}

function Field({ label, value, onChangeText, help, multiline }: { label: string; value: string; onChangeText: (value: string) => void; help?: string; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} />
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: colors.text },
  saveTop: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveTopText: { color: '#241a00', fontWeight: '900' },
  content: { padding: 14, gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  summaryBox: { gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#fff8e5', padding: 12 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTitle: { flex: 1, color: colors.text, fontWeight: '900', fontSize: 14 },
  summaryButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  summaryButtonText: { color: '#241a00', fontWeight: '900' },
  disabled: { opacity: 0.55 },
  status: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  field: { gap: 6 },
  label: { fontSize: 12, color: colors.sub, fontWeight: '900' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  textarea: { minHeight: 130 },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900', fontSize: 16 },
  dangerRow: { flexDirection: 'row', gap: 8 },
  cleanButton: { flex: 1, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: '#d8c6a8', backgroundColor: '#fffaf0', alignItems: 'center', justifyContent: 'center' },
  cleanText: { color: colors.text, fontWeight: '900', fontSize: 16 },
  disabledRoomButton: { backgroundColor: '#eee8dc', borderColor: '#c6b48f' },
  danger: { flex: 1, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900', fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { color: colors.text, fontWeight: '900', marginBottom: 14 }
});
