import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { cancelChatJob } from '../logic/chatJobs';
import { deleteRoomCascade } from '../logic/deletionCascadePolicy';
import { forceUpdateRoomMemory } from '../logic/memoryBridge';

export function GroupRoomSettingsScreen({ state, roomId, onBack, onChange }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const room = (state.groupRooms || []).find(item => item.id === roomId);
  const [name, setName] = useState(room?.name || '');
  const [note, setNote] = useState(room?.relationshipNote || '');
  const [status, setStatus] = useState('');
  const participants = useMemo(
    () => state.characters.filter(character => (room?.participantIds || []).includes(character.id)),
    [room?.participantIds, state.characters]
  );
  const groupSummary = useMemo(
    () => (state.groupRoomSummaries || []).filter(summary => summary.roomId === roomId).sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [roomId, state.groupRoomSummaries]
  );
  const groupMemories = useMemo(
    () => (state.characterMemories || [])
      .filter(memory => memory.sourceRoomId === roomId && memory.visibility === 'group_public')
      .sort((a, b) => b.createdAt - a.createdAt),
    [roomId, state.characterMemories]
  );

  async function save() {
    if (!room) return;
    await onChange({
      ...state,
      groupRooms: (state.groupRooms || []).map(item => item.id === roomId ? { ...item, name: name.trim() || item.name, relationshipNote: note.trim() } : item)
    });
    onBack();
  }

  async function refreshMemory() {
    if (!room) return;
    const before = state.groupRoomSummaries?.find(summary => summary.roomId === roomId)?.updatedAt || 0;
    const next = forceUpdateRoomMemory(state, roomId);
    await onChange(next);
    const after = next.groupRoomSummaries?.find(summary => summary.roomId === roomId)?.updatedAt || 0;
    setStatus(after && after !== before ? '단톡방 자동 기억을 갱신했습니다.' : '기억으로 만들 대화가 아직 부족합니다.');
  }

  function confirmDelete() {
    Alert.alert('단톡방 삭제', '이 단톡방의 메시지와 기억 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const deletion = deleteRoomCascade(state, roomId);
          for (const affectedRoomId of deletion.cancelledJobRoomIds) cancelChatJob(affectedRoomId);
          await onChange(deletion.state);
          onBack();
        }
      }
    ]);
  }

  if (!room) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>단톡방을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>돌아가기</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>단톡 설정</Text>
        <Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>방 이름</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <Text style={styles.label}>이 단톡방에만 적용할 관계/상황 메모</Text>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
          <Text style={styles.help}>단톡 답장 생성 때 이 방에서만 쓰는 추가 맥락입니다. 캐릭터 기본 프로필을 대체하지 않습니다.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.memoryHeader}>
            <Text style={styles.cardTitle}>자동 기억 연동</Text>
            <Pressable onPress={refreshMemory} style={styles.memoryButton}><Text style={styles.memoryButtonText}>기억 갱신</Text></Pressable>
          </View>
          <Text style={styles.help}>이 방의 공개 요약은 참여 캐릭터들의 개인톡에서도 참고됩니다. 개인톡 기억은 단톡방에서 직접 공개하지 않고 말투와 맥락 힌트로만 씁니다.</Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
          <Text style={styles.memoryLabel}>참여 캐릭터</Text>
          <Text style={styles.memoryText}>{participants.map(character => character.name).join(', ') || '없음'}</Text>
          <Text style={styles.memoryLabel}>현재 단톡 요약</Text>
          <Text style={styles.memoryText}>{groupSummary?.summary || '아직 자동 요약이 없습니다. 메시지가 6개 이상 쌓이거나 기억 갱신을 누르면 생성됩니다.'}</Text>
          {groupSummary?.publicInfo?.length ? (
            <>
              <Text style={styles.memoryLabel}>공개 정보</Text>
              {groupSummary.publicInfo.slice(0, 6).map((item, index) => <Text key={`${item}-${index}`} style={styles.memoryBullet}>- {item}</Text>)}
            </>
          ) : null}
          <Text style={styles.memoryLabel}>캐릭터별 공유 기억</Text>
          <Text style={styles.memoryText}>{groupMemories.length}개 저장됨</Text>
        </View>
        <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>단톡 설정 저장</Text></Pressable>
        <Pressable onPress={confirmDelete} style={styles.danger}><Text style={styles.dangerText}>단톡방 삭제</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 72, paddingTop: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#eee8dc' },
  backText: { fontSize: 32, color: colors.text, lineHeight: 34 },
  title: { flex: 1, fontSize: 21, color: colors.text, fontWeight: '900' },
  save: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#241a00', fontWeight: '900' },
  content: { padding: 14, gap: 12 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  label: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text },
  textarea: { minHeight: 130 },
  help: { color: colors.sub, lineHeight: 20 },
  memoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memoryButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  memoryButtonText: { color: '#241a00', fontWeight: '900' },
  memoryLabel: { marginTop: 8, color: colors.sub, fontWeight: '900', fontSize: 12 },
  memoryText: { color: colors.text, lineHeight: 20, fontWeight: '700' },
  memoryBullet: { color: colors.text, lineHeight: 19, fontSize: 12 },
  status: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  emptyText: { color: colors.text, fontWeight: '900' },
  primary: { marginTop: 12, height: 42, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900', textAlign: 'center' },
  danger: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' }
});
