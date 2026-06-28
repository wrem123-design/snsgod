import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { createRoom } from '../logic/stateHelpers';

export function NewRoomScreen({ state, onBack, onCreate }: {
  state: SNSGodState;
  onBack: () => void;
  onCreate: (next: SNSGodState, roomId: string) => Promise<void> | void;
}) {
  const availableCharacters = state.characters.filter(character => character.randomTemporary !== true);
  const [characterId, setCharacterId] = useState(availableCharacters[0]?.id || '');
  const [name, setName] = useState('새 채팅');

  async function create() {
    if (!characterId) return;
    const room = createRoom(characterId, name.trim() || '새 채팅');
    const chatRooms = { ...state.chatRooms, [characterId]: [...(state.chatRooms[characterId] || []), room] };
    const next: SNSGodState = { ...state, chatRooms, messages: { ...state.messages, [room.id]: [] }, selectedRoomId: room.id };
    await onCreate(next, room.id);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>새 대화방</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>대상 캐릭터</Text>
        <View style={styles.characterList}>
          {availableCharacters.length ? availableCharacters.map(character => (
            <Pressable key={character.id} onPress={() => setCharacterId(character.id)} style={[styles.characterRow, characterId === character.id && styles.characterActive]}>
              <Avatar character={character} size={42} />
              <View style={styles.characterBody}>
                <Text style={styles.characterName}>{character.name}</Text>
                <Text style={styles.characterSub}>대화방 {(state.chatRooms[character.id] || []).length}개</Text>
              </View>
              <Text style={styles.chevron}>{characterId === character.id ? '✓' : '›'}</Text>
            </Pressable>
          )) : <Text style={styles.emptyText}>새 대화방을 만들 수 있는 캐릭터가 없습니다.</Text>}
        </View>
        <Text style={styles.label}>방 이름</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} />
        <Pressable onPress={create} disabled={!characterId} style={[styles.primary, !characterId && styles.disabled]}><Text style={styles.primaryText}>새 대화방 만들기</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  content: { padding: 14, gap: 12 },
  label: { fontSize: 13, color: colors.sub, fontWeight: '900' },
  characterList: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panel },
  characterRow: { minHeight: 66, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  characterActive: { backgroundColor: '#fff4c7' },
  characterBody: { flex: 1 },
  characterName: { fontSize: 16, fontWeight: '900', color: colors.text },
  characterSub: { marginTop: 2, color: colors.sub, fontSize: 12 },
  chevron: { fontSize: 18, color: colors.sub, fontWeight: '900' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  emptyText: { padding: 18, color: colors.sub, fontWeight: '900', textAlign: 'center' }
});
