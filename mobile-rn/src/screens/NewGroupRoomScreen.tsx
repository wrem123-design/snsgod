import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { GroupRoom, SNSGodState } from '../types';
import { makeId } from '../logic/ids';

export function NewGroupRoomScreen({ state, onBack, onCreate }: {
  state: SNSGodState;
  onBack: () => void;
  onCreate: (next: SNSGodState, roomId: string) => Promise<void> | void;
}) {
  const availableCharacters = state.characters.filter(character => character.randomTemporary !== true);
  const [name, setName] = useState('새 단톡');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = availableCharacters.filter(character => selected[character.id]).map(character => character.id);

  function create() {
    if (!selectedIds.length) return;
    const now = Date.now();
    const room: GroupRoom = {
      id: makeId('group'),
      name: name.trim() || '새 단톡',
      participantIds: selectedIds,
      createdAt: now,
      lastActivity: now
    };
    const next = {
      ...state,
      groupRooms: [...(state.groupRooms || []), room],
      messages: { ...state.messages, [room.id]: [] },
      unreadCounts: { ...state.unreadCounts, [room.id]: 0 }
    };
    onCreate(next, room.id);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>새 단톡</Text>
        <Pressable onPress={create} disabled={!selectedIds.length} style={[styles.save, !selectedIds.length && styles.disabled]}><Text style={styles.saveText}>생성</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>방 이름</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <Text style={styles.help}>참여 캐릭터를 1명 이상 선택하면 그룹 채팅방이 만들어집니다.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>참여 캐릭터</Text>
          {availableCharacters.length ? availableCharacters.map(character => (
            <View key={character.id} style={styles.row}>
              <View style={styles.avatarText}><Text style={styles.avatarLabel}>{character.avatarText || character.name.slice(0, 2)}</Text></View>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{character.name}</Text>
                <Text style={styles.handle}>@{character.handle || character.id}</Text>
              </View>
              <Switch value={Boolean(selected[character.id])} onValueChange={value => setSelected(prev => ({ ...prev, [character.id]: value }))} />
            </View>
          )) : <Text style={styles.emptyText}>그룹대화에 추가할 수 있는 캐릭터가 없습니다.</Text>}
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
  disabled: { opacity: 0.45 },
  saveText: { color: '#241a00', fontWeight: '900' },
  content: { padding: 14, gap: 14 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  label: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, color: colors.text, backgroundColor: '#fffefa' },
  help: { color: colors.sub, lineHeight: 20 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e0d6' },
  avatarText: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#d8e7ff', alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { color: colors.text, fontWeight: '900' },
  rowBody: { flex: 1 },
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  handle: { marginTop: 3, color: colors.sub, fontWeight: '700' },
  emptyText: { paddingVertical: 18, color: colors.sub, fontWeight: '900', textAlign: 'center' }
});
