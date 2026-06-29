import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { isRenderableMediaUri } from '../logic/media';

type GalleryItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string;
  prompt: string;
  createdAt: number;
  source: string;
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
        source: history.kind === 'cover' ? '프로필 커버 AI 생성' : '프로필 사진 AI 생성'
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
      source: post.platform === 'instagram' ? 'Instagram AI 이미지' : 'X AI 이미지'
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
        source: '채팅 AI 이미지'
      });
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function GalleryScreen({ state, onBack }: {
  state: SNSGodState;
  onBack: () => void;
}) {
  const items = useMemo(() => collectGalleryItems(state), [state]);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  return (
    <View style={styles.screen}>
      {selected ? (
        <View style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleBlock}>
              <Text style={styles.viewerTitle}>{selected.title}</Text>
              <Text style={styles.viewerSubtitle}>{selected.source} · {selected.subtitle}</Text>
            </View>
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
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  titleBlock: { flex: 1 },
  title: { fontSize: 21, color: colors.text, fontWeight: '900' },
  subtitle: { marginTop: 2, color: colors.sub, fontWeight: '800' },
  grid: { padding: 10, paddingBottom: 26, gap: 4 },
  row: { gap: 4 },
  albumTile: { flex: 1, aspectRatio: 1, marginBottom: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: '#eee8dc' },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.48)' },
  itemTitle: { color: '#fff', fontSize: 11, fontWeight: '900' },
  itemSubtitle: { marginTop: 1, color: 'rgba(255,255,255,0.82)', fontSize: 9, fontWeight: '800' },
  empty: { marginTop: 80, textAlign: 'center', color: colors.sub, fontWeight: '800' },
  viewer: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: '#101214', padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerTitleBlock: { flex: 1 },
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
