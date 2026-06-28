import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { RandomChatRoom, SNSGodState } from '../types';
import { callLLMText } from '../logic/api';
import {
  addRandomChatRoom,
  buildRandomPrompt,
  parseRandomCharacter,
  randomChatRooms,
  randomGenderLabel,
  randomGenderPreference,
  RANDOM_GENDERS,
  RandomGender,
  randomTraitBundle
} from '../logic/randomChat';

function lastText(state: SNSGodState, room: RandomChatRoom) {
  const messages = state.messages[room.id] || [];
  const last = messages[messages.length - 1];
  return last?.content || room.character.statusMessage || '아직 대화를 시작하지 않았습니다.';
}

export function RandomChatScreen({ state, onBack, onChange, onOpenRoom }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoom: (roomId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState<RandomGender>(randomGenderPreference(state));
  const rooms = useMemo(() => [...randomChatRooms(state)].sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0)), [state]);

  async function generateRandom() {
    if (loading) return;
    setLoading(true);
    try {
      const conceptSeed = randomTraitBundle(state, gender);
      const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: buildRandomPrompt(state, gender, conceptSeed) }]);
      const character = parseRandomCharacter(text, gender, conceptSeed);
      const activeProfile = state.config.apiProfiles[state.config.apiType] || {};
      const { next, roomId } = addRandomChatRoom(
        {
          ...state,
          config: {
            ...state.config,
            randomChatGender: gender,
            apiProfiles: {
              ...state.config.apiProfiles,
              [state.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
            }
          }
        },
        character,
        conceptSeed
      );
      await onChange(next);
      onOpenRoom(roomId);
    } catch (error) {
      const fallbackSeed = randomTraitBundle(state, gender);
      const fallbackCharacter = parseRandomCharacter('{}', gender, fallbackSeed);
      const { next, roomId } = addRandomChatRoom(
        { ...state, config: { ...state.config, randomChatGender: gender } },
        { ...fallbackCharacter, firstMessage: `랜덤 캐릭터 생성에 실패했지만 임시 대화를 열었어요.\n${error instanceof Error ? error.message : String(error)}` },
        fallbackSeed
      );
      await onChange(next);
      onOpenRoom(roomId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>랜덤채팅</Text>
          <Text style={styles.subtitle}>기존 캐릭터와 분리된 임시 만남</Text>
        </View>
        <Pressable onPress={generateRandom} style={styles.primary} disabled={loading}>
          {loading ? <ActivityIndicator color="#241a00" /> : <Text style={styles.primaryText}>새 랜덤</Text>}
        </Pressable>
      </View>

      <View style={styles.options}>
        <Text style={styles.optionLabel}>생성 성별</Text>
        <View style={styles.chips}>
          {RANDOM_GENDERS.map(item => (
            <Pressable
              key={item.value}
              onPress={() => setGender(item.value)}
              style={[styles.chip, gender === item.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, gender === item.value && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.help}>새 랜덤 캐릭터를 만들 때만 적용됩니다. 원본처럼 판타지, 비인간, 해외 배경, 이상한 첫 대화 훅이 섞여 생성됩니다.</Text>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>아직 랜덤채팅 캐릭터가 없습니다.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpenRoom(item.id)} style={styles.row}>
            <Avatar character={item.character} size={54} />
            <View style={styles.body}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.character.name}</Text>
                <Text style={styles.meta}>{String(item.character.genderPreferenceLabel || randomGenderLabel('any'))}</Text>
              </View>
              <Text style={styles.handle} numberOfLines={1}>랜덤채팅 · @{item.character.handle || item.character.id}</Text>
              <Text style={styles.preview} numberOfLines={1}>{lastText(state, item)}</Text>
            </View>
            {(state.unreadCounts[item.id] || 0) > 0 ? <Text style={styles.badge}>{state.unreadCounts[item.id]}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 2, color: colors.sub, fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 42, minWidth: 82, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#241a00', fontWeight: '900' },
  options: { padding: 14, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e2d6', backgroundColor: '#fffefa' },
  optionLabel: { color: colors.text, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, borderRadius: 17, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontWeight: '900' },
  chipTextActive: { color: '#fff' },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  empty: { marginTop: 80, textAlign: 'center', color: colors.sub, fontWeight: '800' },
  row: { minHeight: 86, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontWeight: '900', fontSize: 17, flexShrink: 1 },
  meta: { color: colors.sub, fontSize: 11, fontWeight: '800' },
  handle: { marginTop: 2, color: colors.sub, fontSize: 12, fontWeight: '700' },
  preview: { marginTop: 5, color: '#62676f', fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, color: '#fff', textAlign: 'center', overflow: 'hidden', fontWeight: '900', lineHeight: 22 }
});
