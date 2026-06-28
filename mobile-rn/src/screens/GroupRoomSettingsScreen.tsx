import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';

export function GroupRoomSettingsScreen({ state, roomId, onBack, onChange }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const room = (state.groupRooms || []).find(item => item.id === roomId);
  const [name, setName] = useState(room?.name || '');
  const [note, setNote] = useState(room?.relationshipNote || '');

  async function save() {
    if (!room) return;
    const next = {
      ...state,
      groupRooms: (state.groupRooms || []).map(item => item.id === roomId ? { ...item, name: name.trim() || item.name, relationshipNote: note.trim() } : item)
    };
    await onChange(next);
    onBack();
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
          <Text style={styles.label}>이 단톡방에서만 적용할 관계/상황 메모</Text>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
          <Text style={styles.help}>단톡 답장 생성 때 이 방에서만 쓰는 추가 맥락입니다. 기본 프로필을 대체하지 않습니다.</Text>
        </View>
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
  content: { padding: 14 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 10 },
  label: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text },
  textarea: { minHeight: 130 },
  help: { color: colors.sub, lineHeight: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  emptyText: { color: colors.text, fontWeight: '900' },
  primary: { marginTop: 12, height: 42, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' }
});
