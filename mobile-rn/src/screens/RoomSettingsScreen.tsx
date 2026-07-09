import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodRoom, SNSGodState } from '../types';
import { deleteRoom, findCharacter, findRoom, updateRoom } from '../logic/stateHelpers';
import { isRandomRoom, removeRandomChatRoom } from '../logic/randomChat';
import { normalizeRoomPromptForSave, summarizePrivateRoomWithLlm } from '../logic/roomConversationSummary';

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
    setSummarizing(true);
    setStatus('현재 방 대화를 요약하는 중...');
    try {
      const result = await summarizePrivateRoomWithLlm(state, roomId, {
        force: true,
        draft
      });
      if (!result) {
        Alert.alert('대화 요약', '요약할 대화가 아직 없습니다.');
        setStatus('');
        return;
      }
      const nextRoom = findRoom(result.state, roomId);
      if (nextRoom) {
        setDraft({ ...draft, ...nextRoom, roomPrompt: String(nextRoom.roomPrompt || '') });
      }
      await onChange(result.state);
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
            <Text style={styles.help}>누르면 이 방의 대화를 AI가 관계 기억으로 압축해서 아래 관계 요약에 저장합니다. 자동 갱신도 같은 요약 방식을 쓰며, 다시 누르면 자동 요약 블록만 최신 내용으로 교체됩니다.</Text>
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
