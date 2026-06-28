import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodMessage, SNSGodState } from '../types';
import { callLLM, generateImageDataUri } from '../logic/api';
import { makeId } from '../logic/ids';
import { appendMessage, findCharacter, findRoom, roomMessages, updateCharacter } from '../logic/stateHelpers';
import { buildChatPrompt } from '../logic/prompts';
import { pickImageDataUri } from '../logic/media';

export function ChatRoomScreen({ state, roomId, onBack, onChange, onOpenRoomSettings, onOpenCharacterSettings, onOpenProfile }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoomSettings: (roomId: string) => void;
  onOpenCharacterSettings: (characterId: string) => void;
  onOpenProfile: (characterId: string) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const currentStateRef = useRef(state);
  currentStateRef.current = state;
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const messages = useMemo(() => roomMessages(state, roomId), [state, roomId]);

  async function commit(next: SNSGodState) {
    currentStateRef.current = next;
    await onChange(next);
  }

  async function send() {
    const content = text.trim();
    if (!content || !room || !character || sending) return;
    setText('');
    setSending(true);
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: Date.now() };
    let next = appendMessage(currentStateRef.current, room.id, userMessage);
    next = { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
    await commit(next);
    try {
      const promptMessages = buildChatPrompt(next, character, room, content);
      const { reply, keyIndex } = await callLLM(next, promptMessages);
      const activeProfile = next.config.apiProfiles[next.config.apiType] || {};
      next = {
        ...next,
        config: {
          ...next.config,
          apiProfiles: {
            ...next.config.apiProfiles,
            [next.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
          }
        }
      };
      const bubbles = reply.messages.length ? reply.messages : [{ content: '응.' }];
      for (const bubble of bubbles) {
        let mediaData = '';
        if (bubble.imagePrompt && next.config.imageGeneration?.enabled !== false) {
          try {
            mediaData = await generateImageDataUri(next, bubble.imagePrompt, character);
          } catch (error) {
            bubble.imageCaption = `${bubble.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim();
          }
        }
        next = appendMessage(next, room.id, {
          id: makeId('msg'),
          role: 'character',
          characterId: character.id,
          content: bubble.content || '',
          createdAt: Date.now(),
          sticker: bubble.sticker,
          imagePrompt: bubble.imagePrompt,
          imageCaption: bubble.imageCaption,
          mediaData: mediaData || undefined,
          mediaType: mediaData ? 'image' : undefined
        });
      }
      if (reply.newMemory?.trim()) {
        const updated = findCharacter(next, character.id);
        next = updateCharacter(next, character.id, { memories: [...(updated?.memories || []), reply.newMemory.trim()].slice(-80) });
      }
      await commit(next);
    } catch (error) {
      const failed = appendMessage(currentStateRef.current, room.id, {
        id: makeId('msg'),
        role: 'system',
        content: `답장 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: Date.now(),
        failed: true
      });
      await commit(failed);
      Alert.alert('답장 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  async function attachImage() {
    if (!room || !character || sending) return;
    try {
      const image = await pickImageDataUri();
      if (!image) return;
      const content = text.trim() || '사진을 보냈습니다.';
      setText('');
      const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: Date.now(), mediaData: image };
      let next = appendMessage(currentStateRef.current, room.id, userMessage);
      next = { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
      await commit(next);
    } catch (error) {
      Alert.alert('사진 첨부 실패', error instanceof Error ? error.message : String(error));
    }
  }

  if (!room || !character) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>채팅방을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.emptyButton}><Text style={styles.emptyButtonText}>목록으로</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.iconButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Pressable onPress={() => onOpenProfile(character.id)}>
          <Avatar character={character} size={42} />
        </Pressable>
        <Pressable style={styles.titleBlock} onPress={() => onOpenCharacterSettings(character.id)}>
          <Text style={styles.title}>{room.name === '기본 채팅' ? character.name : room.name}</Text>
          <Text style={styles.subtitle}>{character.statusMessage || '접속 중'}</Text>
        </Pressable>
        <Pressable onPress={() => onOpenProfile(character.id)} style={styles.profileButton}><Text style={styles.profileText}>프로필</Text></Pressable>
        <Pressable onPress={() => onOpenRoomSettings(room.id)} style={styles.settingsButton}><Text style={styles.settingsText}>방 설정</Text></Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => <MessageBubble message={item} character={character} />}
      />

      <View style={styles.composer}>
        <Pressable onPress={attachImage} disabled={sending} style={[styles.attachButton, sending && styles.sendDisabled]}><Text style={styles.attachText}>사진</Text></Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.composerInput}
          placeholder="메시지 입력"
          placeholderTextColor="#9b9b9b"
          multiline
        />
        <Pressable onPress={send} style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]} disabled={!text.trim() || sending}>
          {sending ? <ActivityIndicator color="#241a00" /> : <Text style={styles.sendText}>전송</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, character }: { message: SNSGodMessage; character: NonNullable<ReturnType<typeof findCharacter>> }) {
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const sticker = message.sticker ? (character.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  if (system) {
    return <View style={styles.systemBubble}><Text style={styles.systemText}>{message.content}</Text></View>;
  }
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {!mine ? <Avatar character={character} size={34} /> : null}
      <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, mine && styles.myText]}>{message.content}</Text>
        {sticker?.data || sticker?.mediaData ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerImage} resizeMode="contain" /> : message.sticker ? <Text style={styles.stickerText}>스티커 · {sticker?.name || message.sticker}</Text> : null}
        {message.mediaData ? <Image source={{ uri: message.mediaData }} style={styles.messageImage} resizeMode="cover" /> : null}
        {message.imagePrompt ? <Text style={styles.imageHint}>이미지 프롬프트: {message.imagePrompt}</Text> : null}
        {message.imageCaption ? <Text style={styles.imageHint}>{message.imageCaption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#b8c7d9' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f7f2e9', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  titleBlock: { flex: 1, minHeight: 46, justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.sub, fontWeight: '700' },
  profileButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  profileText: { fontWeight: '900', color: colors.text },
  settingsButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontWeight: '900', color: colors.text },
  messages: { padding: 12, gap: 8 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  theirBubble: { backgroundColor: '#fff' },
  myBubble: { backgroundColor: '#fee56a' },
  bubbleText: { fontSize: 16, lineHeight: 22, color: '#222' },
  myText: { color: '#211b00' },
  stickerText: { marginTop: 6, color: '#6c4f00', fontWeight: '900' },
  stickerImage: { marginTop: 8, width: 128, height: 128, borderRadius: 12 },
  messageImage: { marginTop: 8, width: 210, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#eee' },
  imageHint: { marginTop: 6, fontSize: 12, color: colors.sub },
  systemBubble: { alignSelf: 'center', maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.45)' },
  systemText: { color: '#4f5a62', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  attachButton: { minWidth: 54, minHeight: 42, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  attachText: { color: colors.text, fontWeight: '900' },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 112, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: '#fff', color: colors.text, fontSize: 16 },
  sendButton: { minWidth: 64, minHeight: 42, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#241a00', fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { fontSize: 16, color: colors.text, fontWeight: '800' },
  emptyButton: { marginTop: 14, paddingHorizontal: 16, height: 42, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  emptyButtonText: { color: '#241a00', fontWeight: '900' }
});
