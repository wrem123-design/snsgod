import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { findCharacter } from '../logic/stateHelpers';
import { isRenderableMediaUri } from '../logic/media';

function imageUri(value?: string) {
  return isRenderableMediaUri(value) ? value : '';
}

export function ProfileScreen({ state, characterId, roomId, onBack, onOpenChat, onOpenCall, onOpenSettings }: {
  state: SNSGodState;
  characterId: string;
  roomId?: string;
  onBack: () => void;
  onOpenChat: (character: SNSGodCharacter) => void;
  onOpenCall: (character: SNSGodCharacter) => void;
  onOpenSettings: (character: SNSGodCharacter) => void;
}) {
  const [viewerImage, setViewerImage] = useState<{ uri: string; title: string } | null>(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState('');
  const [selectedChatImageId, setSelectedChatImageId] = useState('');
  const [chatPromptOpen, setChatPromptOpen] = useState(false);
  const character = findCharacter(state, characterId);
  const roomImageMessages = roomId ? state.messages[roomId] || [] : [];
  const chatImages = useMemo(
    () => collectChatRoomImages(roomImageMessages, character?.name || '채팅'),
    [roomImageMessages, character?.name]
  );
  const selectedChatImage = chatImages.find(item => item.id === selectedChatImageId) || chatImages[0];
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
        {cover ? (
          <Pressable onPress={() => setViewerImage({ uri: cover, title: `${character.name} 배경 사진` })} style={styles.cover}>
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} />
          </Pressable>
        ) : (
          <View style={styles.cover}>
            <View style={styles.coverFallback} />
          </View>
        )}
        <View style={styles.profileCard}>
          <Pressable disabled={!profile} onPress={() => setViewerImage({ uri: profile, title: `${character.name} 프로필 사진` })} style={styles.avatarWrap}>
            {profile ? (
              <Image source={{ uri: profile }} style={styles.profileImage} />
            ) : (
              <Avatar character={character} size={94} />
            )}
          </Pressable>
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
        {roomId ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>채팅 앨범</Text>
            {chatImages.length ? (
              <>
                {selectedChatImage ? <Image source={{ uri: selectedChatImage.uri }} style={styles.chatAlbumLarge} resizeMode="contain" /> : null}
                {selectedChatImage?.caption ? <Text style={styles.bodyText}>{selectedChatImage.caption}</Text> : null}
                <Pressable onPress={() => setChatPromptOpen(value => !value)} style={styles.promptToggle}>
                  <Text style={styles.promptToggleText}>{chatPromptOpen ? '프롬프트 접기' : '프롬프트 보기'}</Text>
                </Pressable>
                {chatPromptOpen ? <Text style={styles.promptText}>{selectedChatImage?.prompt || '프롬프트 없음'}</Text> : null}
                <View style={styles.historyGrid}>
                  {chatImages.map(item => (
                    <Pressable key={item.id} onPress={() => { setSelectedChatImageId(item.id); setChatPromptOpen(false); }} style={styles.historyTile}>
                      <Image source={{ uri: item.uri }} style={styles.historyImage} />
                      <Text style={styles.historyLabel}>{item.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.bodyText}>이 채팅방에 올라간 이미지가 아직 없습니다.</Text>
            )}
          </View>
        ) : null}
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
      {viewerImage ? <ProfileImageViewer item={viewerImage} onClose={() => setViewerImage(null)} /> : null}
    </View>
  );
}

function ProfileImageViewer({ item, onClose }: { item: { uri: string; title: string }; onClose: () => void }) {
  return (
    <View style={styles.viewerOverlay}>
      <View style={styles.viewerHeader}>
        <Text style={styles.viewerTitle}>{item.title}</Text>
        <Pressable onPress={onClose} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
      </View>
      <Image source={{ uri: item.uri }} style={styles.viewerImage} resizeMode="contain" />
    </View>
  );
}

type ProfileRoomImage = {
  id: string;
  uri: string;
  title: string;
  prompt: string;
  caption: string;
  createdAt: number;
};

function collectChatRoomImages(messages: SNSGodMessage[], characterName: string): ProfileRoomImage[] {
  return messages
    .filter(message => isRenderableMediaUri(message.mediaData))
    .map(message => ({
      id: message.id,
      uri: String(message.mediaData || ''),
      title: message.role === 'user' ? '내 사진' : `${characterName}`,
      prompt: String(message.imagePrompt || '').trim(),
      caption: String(message.imageCaption || '').replace(/이미지\s*생성\s*실패[^\n]*/gi, '').trim(),
      createdAt: Number(message.createdAt || 0)
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
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
  profileCard: { marginTop: -48, marginHorizontal: 16, alignItems: 'center', padding: 18, borderRadius: 16, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
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
  chatAlbumLarge: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#eee8dc', marginBottom: 10 },
  promptToggle: { alignSelf: 'flex-start', marginTop: 8, marginBottom: 10, minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#eee8dc', justifyContent: 'center' },
  promptToggleText: { color: colors.text, fontWeight: '900' },
  promptText: { marginBottom: 10, padding: 10, borderRadius: 8, backgroundColor: '#f4efe6', color: colors.sub, lineHeight: 19, fontWeight: '700' },
  historyLarge: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#eee8dc', marginBottom: 10 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyTile: { width: 82, padding: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa' },
  historyImage: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#eee8dc' },
  historyLabel: { marginTop: 4, color: colors.sub, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  viewerOverlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: '#101214', padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerTitle: { flex: 1, color: '#fffefa', fontSize: 18, fontWeight: '900' },
  viewerClose: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center' },
  viewerCloseText: { color: '#111', fontWeight: '900' },
  viewerImage: { width: '100%', flex: 1, borderRadius: 8, backgroundColor: '#050607' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  emptyText: { color: colors.text, fontWeight: '900' },
  primary: { marginTop: 12, height: 42, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' }
});
