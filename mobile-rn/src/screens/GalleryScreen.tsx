import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { isRenderableMediaUri, type MediaGarbageCollectionResult } from '../logic/media';

type GalleryItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string;
  prompt: string;
  createdAt: number;
  source: string;
  kind: 'profile' | 'sns' | 'message';
  characterId?: string;
  historyId?: string;
  historyKind?: 'profile' | 'cover';
  postId?: string;
  roomId?: string;
  messageId?: string;
};

function imageUri(value: unknown): string | undefined {
  return isRenderableMediaUri(value) ? value : undefined;
}

function collectGalleryItems(state: SNSGodState): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const character of state.characters) {
    for (const history of character.profileImageHistory || []) {
      const uri = imageUri(history.image);
      const prompt = String(history.prompt || '').trim();
      if (!uri || !prompt) continue;
      items.push({
        id: `profile:${character.id}:${history.id}`,
        title: character.name,
        subtitle: `${history.kind === 'cover' ? '커버' : '프로필'} · ${new Date(history.createdAt).toLocaleString()}`,
        uri,
        prompt,
        createdAt: Number(history.createdAt || 0),
        source: history.kind === 'cover' ? '프로필 커버' : '프로필',
        kind: 'profile',
        characterId: character.id,
        historyId: history.id,
        historyKind: history.kind === 'cover' ? 'cover' : 'profile'
      });
    }
  }
  for (const post of state.snsPosts || []) {
    const character = state.characters.find(item => item.id === post.characterId);
    const uri = imageUri(post.image);
    const prompt = String(post.imagePrompt || '').trim();
    if (!uri || !prompt) continue;
    items.push({
      id: `sns:${post.id}`,
      title: character?.name || 'SNS',
      subtitle: `${post.platform} · ${new Date(post.createdAt).toLocaleString()}`,
      uri,
      prompt,
      createdAt: Number(post.createdAt || 0),
      source: post.platform === 'instagram' ? 'Instagram' : 'X',
      kind: 'sns',
      postId: post.id
    });
  }
  for (const [roomId, messages] of Object.entries(state.messages || {})) {
    for (const message of messages) {
      const uri = imageUri(message.mediaData);
      const prompt = String(message.imagePrompt || '').trim();
      if (!uri || !prompt || message.role !== 'character') continue;
      const character = state.characters.find(item => item.id === message.characterId);
      items.push({
        id: `msg:${roomId}:${message.id}`,
        title: character?.name || '채팅 이미지',
        subtitle: new Date(message.createdAt).toLocaleString(),
        uri,
        prompt,
        createdAt: Number(message.createdAt || 0),
        source: '채팅',
        kind: 'message',
        roomId,
        messageId: message.id
      });
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

function removeGalleryItem(state: SNSGodState, item: GalleryItem): SNSGodState {
  if (item.kind === 'profile') {
    return {
      ...state,
      characters: state.characters.map(character => {
        if (character.id !== item.characterId) return character;
        const nextHistory = (character.profileImageHistory || []).filter(history => history.id !== item.historyId);
        return {
          ...character,
          profileImageHistory: nextHistory,
          profileImage: item.historyKind === 'profile' && character.profileImage === item.uri ? undefined : character.profileImage,
          avatar: item.historyKind === 'profile' && character.avatar === item.uri ? undefined : character.avatar,
          coverImage: item.historyKind === 'cover' && character.coverImage === item.uri ? undefined : character.coverImage
        };
      })
    };
  }
  if (item.kind === 'sns') {
    return {
      ...state,
      snsPosts: (state.snsPosts || []).map(post => {
        if (post.id !== item.postId) return post;
        return { ...post, image: undefined, imagePrompt: undefined, imageCaption: undefined };
      })
    };
  }
  return {
    ...state,
    messages: Object.fromEntries(Object.entries(state.messages || {}).map(([roomId, messages]) => {
      if (roomId !== item.roomId) return [roomId, messages];
      return [roomId, messages.map(message => {
        if (message.id !== item.messageId) return message;
        return { ...message, mediaData: undefined, mediaType: undefined, imagePrompt: undefined, imageCaption: undefined };
      })];
    }))
  };
}

export function GalleryScreen({
  state,
  onBack,
  onChange,
  onPreviewMediaCleanup,
  onTrashMediaCleanup,
}: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onPreviewMediaCleanup: () => Promise<MediaGarbageCollectionResult>;
  onTrashMediaCleanup: () => Promise<MediaGarbageCollectionResult>;
}) {
  const items = useMemo(
    () => collectGalleryItems(state),
    [state.characters, state.snsPosts, state.messages]
  );
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  async function deleteItem(item: GalleryItem) {
    await onChange(removeGalleryItem(state, item));
    setSelected(current => current?.id === item.id ? null : current);
  }

  function confirmDelete(item: GalleryItem) {
    Alert.alert(
      '이미지 연결 해제',
      item.kind === 'sns'
        ? 'SNS 글은 남기고 이미지와 생성 프롬프트 연결만 해제합니다. 공유 파일은 유지되며, 실제 미사용 파일은 “미사용 정리”에서 휴지통으로 옮길 수 있습니다.'
        : '이 이미지를 갤러리에서 연결 해제합니다. 공유 파일은 유지되며, 실제 미사용 파일은 “미사용 정리”에서 휴지통으로 옮길 수 있습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '연결 해제', style: 'destructive', onPress: () => { void deleteItem(item); } }
      ]
    );
  }

  async function moveUnusedMediaToTrash() {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    try {
      const preview = await onPreviewMediaCleanup();
      const count = preview.candidateEntries.length;
      if (!count) {
        Alert.alert('미디어 정리', '정리할 미사용 파일이 없습니다.');
        return;
      }
      const sizeText = preview.totalCandidateBytes > 0
        ? ` · 약 ${(preview.totalCandidateBytes / 1024 / 1024).toFixed(1)}MB`
        : '';
      Alert.alert(
        '미사용 파일 정리',
        `${count}개${sizeText}를 앱 휴지통으로 옮길까요?\n\n공유 중인 파일은 유지되며, 다른 폴더의 파일은 건드리지 않습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '휴지통으로 이동',
            style: 'destructive',
            onPress: () => {
              setCleanupBusy(true);
              void onTrashMediaCleanup()
                .then(result => {
                  Alert.alert(
                    '정리 완료',
                    `${result.trashedEntries.length}개 파일을 휴지통으로 옮겼습니다.${result.missingCandidateEntries.length ? `\n이미 없던 기록 ${result.missingCandidateEntries.length}개도 정리했습니다.` : ''}`,
                  );
                })
                .catch(error => {
                  Alert.alert('미디어 정리 실패', error instanceof Error ? error.message : String(error));
                })
                .finally(() => setCleanupBusy(false));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('미디어 검사 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      {selected ? (
        <View style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleBlock}>
              <Text style={styles.viewerTitle}>{selected.title}</Text>
              <Text style={styles.viewerSubtitle}>{selected.source} · {selected.subtitle}</Text>
            </View>
            <Pressable onPress={() => confirmDelete(selected)} style={styles.viewerDelete}><Text style={styles.viewerDeleteText}>삭제</Text></Pressable>
            <Pressable onPress={() => setSelected(null)} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
          </View>
          <Image source={{ uri: selected.uri }} style={styles.viewerImage} resizeMode="contain" />
          <ScrollView style={styles.promptPanel} contentContainerStyle={styles.promptPanelContent}>
            <Text style={styles.promptLabel}>프롬프트</Text>
            <Text style={styles.viewerPrompt}>{selected.prompt}</Text>
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>갤러리</Text>
          <Text style={styles.subtitle}>{items.length}개</Text>
        </View>
        <Pressable
          disabled={cleanupBusy}
          onPress={() => { void moveUnusedMediaToTrash(); }}
          style={({ pressed }) => [
            styles.cleanupButton,
            pressed && styles.cleanupButtonPressed,
            cleanupBusy && styles.cleanupButtonDisabled,
          ]}
        >
          <Text style={styles.cleanupButtonText}>{cleanupBusy ? '검사 중' : '미사용 정리'}</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={styles.empty}>아직 AI가 생성한 이미지가 없습니다.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={styles.albumTile}>
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <Pressable onPress={(event) => { event.stopPropagation?.(); confirmDelete(item); }} style={styles.tileDelete}>
              <Text style={styles.tileDeleteText}>삭제</Text>
            </Pressable>
            <View style={styles.tileShade}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.itemSubtitle} numberOfLines={1}>{item.source}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceAlt },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  titleBlock: { flex: 1 },
  title: { fontSize: 21, color: colors.text, fontWeight: '900' },
  subtitle: { marginTop: 2, color: colors.sub, fontWeight: '800' },
  cleanupButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cleanupButtonPressed: { opacity: 0.78 },
  cleanupButtonDisabled: { opacity: 0.5 },
  cleanupButtonText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  grid: { padding: 10, paddingBottom: 26, gap: 4 },
  row: { gap: 4 },
  albumTile: { flex: 1, aspectRatio: 1, marginBottom: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: '#eee8dc' },
  tileDelete: { position: 'absolute', top: 5, right: 5, zIndex: 2, minHeight: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  tileDeleteText: { color: '#d14444', fontSize: 11, fontWeight: '900' },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.48)' },
  itemTitle: { color: '#fff', fontSize: 11, fontWeight: '900' },
  itemSubtitle: { marginTop: 1, color: 'rgba(255,255,255,0.82)', fontSize: 9, fontWeight: '800' },
  empty: { marginTop: 80, textAlign: 'center', color: colors.sub, fontWeight: '800' },
  viewer: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: '#101214', padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerTitleBlock: { flex: 1 },
  viewerDelete: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#f0b7b7' },
  viewerDeleteText: { lineHeight: 36, color: '#d14444', fontWeight: '900' },
  viewerClose: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#fff' },
  viewerCloseText: { lineHeight: 38, color: '#111', fontWeight: '900' },
  viewerImage: { width: '100%', flex: 1, backgroundColor: '#050607', borderRadius: 6 },
  promptPanel: { marginTop: 10, maxHeight: 150, borderRadius: 8, backgroundColor: '#f7f2e9' },
  promptPanelContent: { padding: 10 },
  promptLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  viewerPrompt: { marginTop: 5, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  viewerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  viewerSubtitle: { marginTop: 2, color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800' }
});
