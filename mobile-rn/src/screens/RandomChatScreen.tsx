import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodCharacter, SNSGodState } from '../types';
import { callLLMText, parseJsonObject } from '../logic/api';
import { makeId } from '../logic/ids';
import { DEFAULT_PROMPTS } from '../logic/prompts';
import { createRoom } from '../logic/stateHelpers';

function randomCharacters(state: SNSGodState): SNSGodCharacter[] {
  const list = state.randomCharacters;
  return Array.isArray(list) ? list as SNSGodCharacter[] : [];
}

export function RandomChatScreen({ state, onBack, onChange, onOpenRoom }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoom: (roomId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const randoms = randomCharacters(state);

  async function generateRandom() {
    setLoading(true);
    try {
      const { text } = await callLLMText(state, [{
        role: 'system',
        content: [
          state.config.prompts?.profileCreation || DEFAULT_PROMPTS.profileCreation,
          'Create one random temporary chat character. It can be strange, funny, ordinary, suspicious, or lonely, but should be safe fictional roleplay.',
          'Return JSON: {"name":"...","handle":"...","prompt":"...","firstMessage":"..."}'
        ].join('\n')
      }]);
      const parsed = parseJsonObject<Partial<SNSGodCharacter>>(text) || {};
      const id = makeId('random');
      const character: SNSGodCharacter = {
        id,
        name: String(parsed.name || '랜덤 캐릭터'),
        handle: String(parsed.handle || id),
        avatarText: String(parsed.name || '랜덤').slice(0, 2),
        color: '#ff7675',
        prompt: String(parsed.prompt || ''),
        firstMessage: String(parsed.firstMessage || '저기... 혹시 말 걸어도 돼요?'),
        enabled: true,
        proactiveEnabled: false,
        memories: [],
        stickers: []
      };
      await onChange({ ...state, randomCharacters: [character, ...randoms] });
    } catch (error) {
      Alert.alert('랜덤 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function startChat(character: SNSGodCharacter) {
    const exists = state.characters.find(item => item.id === character.id);
    const room = createRoom(character.id, '랜덤 채팅');
    const next: SNSGodState = {
      ...state,
      characters: exists ? state.characters : [...state.characters, character],
      chatRooms: { ...state.chatRooms, [character.id]: [...(state.chatRooms[character.id] || []), room] },
      messages: { ...state.messages, [room.id]: character.firstMessage ? [{ id: makeId('msg'), role: 'character', characterId: character.id, content: character.firstMessage, createdAt: Date.now() }] : [] },
      selectedRoomId: room.id
    };
    await onChange(next);
    onOpenRoom(room.id);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>랜덤채팅</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.help}>기존 캐릭터와 분리된 임시 캐릭터 목록입니다. 채팅을 시작하면 일반 채팅방으로 편입됩니다.</Text>
        <Pressable onPress={generateRandom} style={styles.primary} disabled={loading}>
          {loading ? <ActivityIndicator color="#241a00" /> : <Text style={styles.primaryText}>새 랜덤 캐릭터 추가</Text>}
        </Pressable>
        {randoms.map(character => (
          <View key={character.id} style={styles.row}>
            <Avatar character={character} size={48} />
            <View style={styles.body}>
              <Text style={styles.name}>{character.name}</Text>
              <Text style={styles.prompt} numberOfLines={2}>{character.firstMessage || character.prompt}</Text>
            </View>
            <Pressable onPress={() => startChat(character)} style={styles.smallButton}><Text style={styles.smallButtonText}>채팅</Text></Pressable>
          </View>
        ))}
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
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900', fontSize: 16 },
  row: { minHeight: 78, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1 },
  name: { color: colors.text, fontWeight: '900', fontSize: 16 },
  prompt: { marginTop: 4, color: colors.sub, lineHeight: 18 },
  smallButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 7, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: colors.text, fontWeight: '900' }
});
