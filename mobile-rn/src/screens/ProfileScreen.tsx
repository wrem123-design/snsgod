import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodCharacter, SNSGodState } from '../types';
import { findCharacter } from '../logic/stateHelpers';
import { isRenderableMediaUri } from '../logic/media';

function imageUri(value?: string) {
  return isRenderableMediaUri(value) ? value : '';
}

export function ProfileScreen({ state, characterId, onBack, onOpenChat, onOpenCall, onOpenSettings }: {
  state: SNSGodState;
  characterId: string;
  onBack: () => void;
  onOpenChat: (character: SNSGodCharacter) => void;
  onOpenCall: (character: SNSGodCharacter) => void;
  onOpenSettings: (character: SNSGodCharacter) => void;
}) {
  const [selectedHistoryImage, setSelectedHistoryImage] = useState('');
  const character = findCharacter(state, characterId);
  if (!character) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>프로필을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>돌아가기</Text></Pressable>
      </View>
    );
  }

  const cover = imageUri(character.coverImage);
  const profile = imageUri(character.avatar || character.profileImage);
  const history = (character.profileImageHistory || []).filter(item => imageUri(item.image));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>프로필</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback} />}
        </View>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {profile ? (
              <Image source={{ uri: profile }} style={styles.profileImage} />
            ) : (
              <Avatar character={character} size={94} />
            )}
          </View>
          <Text style={styles.name}>{character.name}</Text>
          <Text style={styles.handle}>@{character.handle || character.id}</Text>
          <Text style={styles.status}>{character.statusMessage || '접속 중'}</Text>
          {character.profileMessage ? <Text style={styles.profileMessage}>{character.profileMessage}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={() => onOpenChat(character)} style={styles.actionButton}><Text style={styles.actionText}>1:1 대화</Text></Pressable>
            <Pressable onPress={() => onOpenCall(character)} style={styles.actionButton}><Text style={styles.actionText}>전화걸기</Text></Pressable>
            <Pressable onPress={() => onOpenSettings(character)} style={styles.actionButton}><Text style={styles.actionText}>설정</Text></Pressable>
          </View>
        </View>
        {history.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>프로필 앨범</Text>
            {selectedHistoryImage ? <Image source={{ uri: selectedHistoryImage }} style={styles.historyLarge} resizeMode="contain" /> : null}
            <View style={styles.historyGrid}>
              {history.map(item => (
                <Pressable key={item.id} onPress={() => setSelectedHistoryImage(item.image)} style={styles.historyTile}>
                  <Image source={{ uri: item.image }} style={styles.historyImage} />
                  <Text style={styles.historyLabel}>{item.kind === 'cover' ? '배경' : '프로필'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 72, paddingTop: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#eee8dc' },
  backText: { fontSize: 32, color: colors.text, lineHeight: 34 },
  headerTitle: { fontSize: 20, color: colors.text, fontWeight: '900' },
  content: { paddingBottom: 24 },
  cover: { height: 190, backgroundColor: '#e9dccb', overflow: 'hidden' },
  coverFallback: { flex: 1, backgroundColor: '#eadfce' },
  profileCard: { marginTop: -48, marginHorizontal: 16, alignItems: 'center', padding: 18, borderRadius: 16, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  avatarWrap: { width: 102, height: 102, borderRadius: 51, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 4, borderColor: '#fffefa', overflow: 'hidden' },
  profileImage: { width: 94, height: 94, borderRadius: 47 },
  name: { marginTop: 10, fontSize: 24, color: colors.text, fontWeight: '900' },
  handle: { marginTop: 2, color: colors.sub, fontWeight: '800' },
  status: { marginTop: 14, color: colors.text, fontSize: 15, fontWeight: '900' },
  profileMessage: { marginTop: 8, color: colors.sub, textAlign: 'center', lineHeight: 20 },
  actions: { marginTop: 18, flexDirection: 'row', gap: 8 },
  actionButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.text, fontWeight: '900' },
  card: { marginTop: 14, marginHorizontal: 16, padding: 14, borderRadius: 10, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontWeight: '900', marginBottom: 8 },
  bodyText: { color: colors.sub, lineHeight: 20 },
  historyLarge: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#eee8dc', marginBottom: 10 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyTile: { width: 82, padding: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa' },
  historyImage: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#eee8dc' },
  historyLabel: { marginTop: 4, color: colors.sub, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  emptyText: { color: colors.text, fontWeight: '900' },
  primary: { marginTop: 12, height: 42, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' }
});
