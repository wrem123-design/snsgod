import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { isRenderableMediaUri } from '../logic/media';

type GalleryItem = {
  id: string;
  title: string;
  subtitle: string;
  uri?: string;
  prompt?: string;
};

function imageUri(value: unknown): string | undefined {
  return isRenderableMediaUri(value) ? value : undefined;
}

function collectGalleryItems(state: SNSGodState): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const character of state.characters) {
    const profile = imageUri(character.avatar || character.profileImage);
    const cover = imageUri(character.coverImage);
    if (profile) items.push({ id: `${character.id}:profile`, title: character.name, subtitle: '프로필/목록 사진', uri: profile });
    if (cover) items.push({ id: `${character.id}:cover`, title: character.name, subtitle: '배경 사진', uri: cover });
  }
  for (const post of state.snsPosts || []) {
    const character = state.characters.find(item => item.id === post.characterId);
    const uri = imageUri(post.image);
    items.push({
      id: `sns:${post.id}`,
      title: character?.name || 'SNS',
      subtitle: `${post.platform} · ${new Date(post.createdAt).toLocaleString()}`,
      uri,
      prompt: uri ? undefined : post.content
    });
  }
  for (const [roomId, messages] of Object.entries(state.messages || {})) {
    for (const message of messages) {
      const uri = imageUri(message.mediaData);
      if (uri || message.imagePrompt) {
        const character = state.characters.find(item => item.id === message.characterId);
        items.push({
          id: `msg:${roomId}:${message.id}`,
          title: character?.name || '채팅 이미지',
          subtitle: new Date(message.createdAt).toLocaleString(),
          uri,
          prompt: message.imagePrompt || message.imageCaption
        });
      }
    }
  }
  return items.sort((a, b) => b.id.localeCompare(a.id));
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
          <Pressable onPress={() => setSelected(null)} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
          {selected.uri ? <Image source={{ uri: selected.uri }} style={styles.viewerImage} resizeMode="contain" /> : <Text style={styles.viewerPrompt}>{selected.prompt}</Text>}
          <Text style={styles.viewerTitle}>{selected.title} · {selected.subtitle}</Text>
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
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={styles.empty}>아직 표시할 이미지가 없습니다.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={styles.card}>
            <View style={styles.imageBox}>
              {item.uri ? (
                <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={styles.promptText} numberOfLines={6}>{item.prompt || '이미지 프롬프트만 있습니다.'}</Text>
              )}
            </View>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
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
  grid: { padding: 12, paddingBottom: 26 },
  row: { gap: 10 },
  card: { flex: 1, marginBottom: 12, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  imageBox: { aspectRatio: 1, borderRadius: 7, overflow: 'hidden', backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center', padding: 10 },
  promptText: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  itemTitle: { marginTop: 8, color: colors.text, fontWeight: '900' },
  itemSubtitle: { marginTop: 2, color: colors.sub, fontSize: 12, fontWeight: '700' },
  empty: { marginTop: 80, textAlign: 'center', color: colors.sub, fontWeight: '800' },
  viewer: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  viewerClose: { position: 'absolute', top: 18, right: 18, zIndex: 11, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#fff' },
  viewerCloseText: { lineHeight: 40, color: '#111', fontWeight: '900' },
  viewerImage: { width: '100%', height: '76%' },
  viewerPrompt: { color: '#fff', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  viewerTitle: { marginTop: 14, color: '#fff', fontWeight: '900', textAlign: 'center' }
});
