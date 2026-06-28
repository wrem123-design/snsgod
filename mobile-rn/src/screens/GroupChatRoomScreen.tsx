import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLM, generateImageDataUri } from '../logic/api';
import { makeId } from '../logic/ids';
import { SNSGodCharacter, SNSGodMessage, SNSGodState, Sticker } from '../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function clampDelay(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(120, number));
}

function characterDelayMs(character: SNSGodCharacter) {
  const min = clampDelay(character.responseDelayMin, 1);
  const max = Math.max(min, clampDelay(character.responseDelayMax, 8));
  const speed = Math.max(1, Math.min(10, Number(character.responseTime || 6)));
  const randomSeconds = min + Math.random() * Math.max(0, max - min);
  const speedFactor = 1.15 - speed * 0.07;
  return Math.max(350, Math.round(randomSeconds * speedFactor * 1000));
}

function bubbleDelayMs(character: SNSGodCharacter, delay?: number) {
  const thinking = Math.max(1, Math.min(10, Number(character.thinkingTime || 6)));
  const base = Number.isFinite(Number(delay)) && Number(delay) > 0 ? Number(delay) * 1000 : 650 + thinking * 130;
  return Math.max(450, Math.min(8000, base));
}

function markUserMessagesRead(state: SNSGodState, roomId: string) {
  const now = Date.now();
  return {
    ...state,
    messages: {
      ...state.messages,
      [roomId]: (state.messages[roomId] || []).map(message => message.role === 'user' && !message.readAt ? { ...message, readAt: now } : message)
    }
  };
}

function findGroup(state: SNSGodState, roomId: string) {
  return (state.groupRooms || []).find(room => room.id === roomId);
}

function participantNames(participants: SNSGodCharacter[]) {
  return participants.map(character => character.name).join(', ');
}

function buildGroupPrompt(state: SNSGodState, roomId: string, speaker: SNSGodCharacter, participants: SNSGodCharacter[], latestUserText: string) {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const messages = (state.messages[roomId] || []).slice(-Number(profile.contextMessageLimit || 24));
  const transcript = messages.map(message => {
    if (message.role === 'user') return `${state.config.userName || '나'}: ${message.content}`;
    const character = participants.find(item => item.id === message.characterId);
    return `${character?.name || 'Character'}: ${message.content}`;
  }).join('\n');
  const stickerText = [...(speaker.stickers || []), ...(state.userStickers || [])]
    .slice(0, 20)
    .map(item => `- ${item.id}: ${item.name}${item.description ? ` (${item.description})` : ''}`)
    .join('\n');
  const system = [
      'This is a private fictional group messenger. Stay in character and return JSON only.',
      'Return only valid JSON: {"reactionDelay":0,"messages":[{"content":"short Korean chat bubble"}]}. Do not wrap it in markdown.',
      'Do not expose JSON keys as visible chat text. Do not echo, rewrite, summarize, or delete the latest user message.',
      `Group room participants: ${participantNames(participants)}.`,
      `You are ${speaker.name}. Character profile: ${speaker.prompt || '(empty)'}`,
      `User profile: ${state.config.userDescription || '(empty)'}`,
      `Room-only relationship/context note: ${findGroup(state, roomId)?.relationshipNote || '(empty)'}`,
      stickerText ? `Available stickers:\n${stickerText}` : 'Available stickers: none'
  ].join('\n\n');
  const user = [
      `Conversation transcript:\n${transcript || '(empty)'}`,
      `Latest user message: ${latestUserText}`,
      'Reply as only your character. Do not speak for other characters.'
  ].join('\n\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user }
  ];
}

function chooseSpeakers(participants: SNSGodCharacter[], messages: SNSGodMessage[]): SNSGodCharacter[] {
  const lastCharacterId = [...messages].reverse().find(message => message.role === 'character')?.characterId;
  const candidates = participants.filter(character => character.id !== lastCharacterId);
  const pool = candidates.length ? candidates : participants;
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * Math.min(3, pool.length)));
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

export function GroupChatRoomScreen({ state, roomId, onBack, onChange, onOpenSettings }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenSettings: (roomId: string) => void;
}) {
  const room = findGroup(state, roomId);
  const participants = useMemo(() => {
    const participantIds = Array.isArray(room?.participantIds) ? room.participantIds : [];
    return state.characters.filter(character => participantIds.includes(character.id));
  }, [state.characters, room]);
  const messages = state.messages[roomId] || [];
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [typingCharacters, setTypingCharacters] = useState<SNSGodCharacter[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  async function commit(next: SNSGodState) {
    stateRef.current = next;
    await onChange(next);
  }

  async function markReadLater(targetRoomId: string, readers: SNSGodCharacter[]) {
    const firstReader = readers[0];
    if (!firstReader) return;
    await sleep(characterDelayMs(firstReader));
    await commit(markUserMessagesRead(stateRef.current, targetRoomId));
  }

  async function send() {
    const content = text.trim();
    if (!room || !content || sending || !participants.length) return;
    setText('');
    setSending(true);
    const now = Date.now();
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: now };
    let next: SNSGodState = {
      ...stateRef.current,
      messages: {
        ...stateRef.current.messages,
        [roomId]: [...(stateRef.current.messages[roomId] || []), userMessage].slice(-180)
      },
      groupRooms: (stateRef.current.groupRooms || []).map(item => item.id === roomId ? { ...item, lastActivity: now } : item),
      unreadCounts: { ...stateRef.current.unreadCounts, [roomId]: 0 }
    };
    await commit(next);
    try {
      const speakers = chooseSpeakers(participants, next.messages[roomId] || []);
      const firstSpeaker = speakers[0];
      if (firstSpeaker) {
        await sleep(characterDelayMs(firstSpeaker));
        next = markUserMessagesRead(stateRef.current, roomId);
        await commit(next);
      }
      for (const speaker of speakers) {
        setTypingCharacters(prev => Array.from(new Map([...prev, speaker].map(item => [item.id, item])).values()));
        const prompt = buildGroupPrompt(next, roomId, speaker, participants, content);
        const { reply, keyIndex } = await callLLM(next, prompt);
        const profile = next.config.apiProfiles[next.config.apiType] || {};
        next = {
          ...next,
          config: { ...next.config, apiProfiles: { ...next.config.apiProfiles, [next.config.apiType]: { ...profile, apiKeyIndex: keyIndex } } }
        };
        if (!reply.messages.length) throw new Error('모델 응답에서 표시할 메시지를 찾지 못했습니다. ETC > 디버그에서 llm.response 원문을 확인하세요.');
        for (const bubble of reply.messages.slice(0, 2)) {
          await sleep(bubbleDelayMs(speaker, bubble.delay ?? reply.reactionDelay));
          let mediaData = '';
          if (bubble.imagePrompt && next.config.imageGeneration?.enabled !== false) {
            try {
              mediaData = await generateImageDataUri(next, bubble.imagePrompt, speaker);
            } catch (error) {
              bubble.imageCaption = `${bubble.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim();
            }
          }
          const characterMessage: SNSGodMessage = { id: makeId('msg'), role: 'character', characterId: speaker.id, content: bubble.content || '', createdAt: Date.now(), sticker: bubble.sticker, imagePrompt: bubble.imagePrompt, imageCaption: bubble.imageCaption, mediaData: mediaData || undefined, mediaType: mediaData ? 'image' : undefined };
          next = {
            ...next,
            messages: {
              ...next.messages,
              [roomId]: [...(next.messages[roomId] || []), characterMessage].slice(-180)
            },
            groupRooms: (next.groupRooms || []).map(item => item.id === roomId ? { ...item, lastActivity: Date.now() } : item)
          };
        }
        setTypingCharacters(prev => prev.filter(item => item.id !== speaker.id));
      }
      await commit(next);
    } catch (error) {
      setTypingCharacters([]);
      const systemMessage: SNSGodMessage = { id: makeId('msg'), role: 'system', content: `그룹 답장 실패: ${error instanceof Error ? error.message : String(error)}`, createdAt: Date.now(), failed: true };
      const failed: SNSGodState = {
        ...stateRef.current,
        messages: {
          ...stateRef.current.messages,
          [roomId]: [...(stateRef.current.messages[roomId] || []), systemMessage].slice(-180)
        }
      };
      await commit(failed);
      Alert.alert('그룹 답장 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setTypingCharacters([]);
      setSending(false);
    }
  }

  async function sendSticker(sticker: Sticker) {
    if (!room || sending) return;
    setShowStickers(false);
    const now = Date.now();
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content: '', createdAt: now, sticker: sticker.id };
    const next: SNSGodState = {
      ...stateRef.current,
      messages: {
        ...stateRef.current.messages,
        [roomId]: [...(stateRef.current.messages[roomId] || []), userMessage].slice(-180)
      },
      groupRooms: (stateRef.current.groupRooms || []).map(item => item.id === roomId ? { ...item, lastActivity: now } : item),
      unreadCounts: { ...stateRef.current.unreadCounts, [roomId]: 0 }
    };
    await commit(next);
    void markReadLater(roomId, participants);
  }

  if (!room) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>단톡방을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>목록으로</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{room.name}</Text>
          <Text style={styles.subtitle}>{participants.length}명 · {participantNames(participants)}</Text>
        </View>
        <Pressable onPress={() => onOpenSettings(room.id)} style={styles.settings}><Text style={styles.settingsText}>방 설정</Text></Pressable>
      </View>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => <GroupBubble message={item} participants={participants} userName={state.config.userName || '나'} userStickers={state.userStickers || []} />}
        ListFooterComponent={typingCharacters.length ? <GroupTypingBubble characters={typingCharacters} /> : null}
      />
      {showStickers ? <StickerTray stickers={state.userStickers || []} onPick={sendSticker} /> : null}
      <View style={styles.composer}>
        <Pressable onPress={() => setShowStickers(value => !value)} disabled={sending} style={[styles.stickerToggle, sending && styles.disabled]}><Text style={styles.stickerToggleText}>스티커</Text></Pressable>
        <TextInput value={text} onChangeText={setText} style={styles.input} placeholder="메시지 입력" multiline />
        <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && styles.disabled]}>
          <Text style={styles.sendText}>전송</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function GroupTypingBubble({ characters }: { characters: SNSGodCharacter[] }) {
  const character = characters[0];
  return (
    <View style={styles.messageRow}>
      <Avatar character={character} size={34} />
      <View style={[styles.bubble, styles.theirBubble, styles.typingBubble]}>
        <Text style={styles.speaker}>{characters.map(item => item.name).join(', ')}</Text>
        <TypingDots />
      </View>
    </View>
  );
}

function TypingDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => setCount(value => value >= 3 ? 1 : value + 1), 420);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.typingDots}>{'.'.repeat(count)}</Text>;
}

function StickerTray({ stickers, onPick }: { stickers: Sticker[]; onPick: (sticker: Sticker) => void }) {
  return (
    <View style={styles.stickerTray}>
      {stickers.length ? stickers.map(sticker => (
        <Pressable key={sticker.id} onPress={() => onPick(sticker)} style={styles.stickerTrayItem}>
          {String(sticker.data || sticker.mediaData || '').startsWith('data:') ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerThumb} resizeMode="contain" /> : <Text style={styles.stickerThumbText}>S</Text>}
          <Text style={styles.stickerTrayName} numberOfLines={1}>{sticker.name}</Text>
        </Pressable>
      )) : <Text style={styles.emptyStickerText}>설정의 스티커 메뉴에서 내 스티커를 추가하세요.</Text>}
    </View>
  );
}

function GroupBubble({ message, participants, userName, userStickers }: { message: SNSGodMessage; participants: SNSGodCharacter[]; userName: string; userStickers: Sticker[] }) {
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const character = participants.find(item => item.id === message.characterId);
  const sticker = message.sticker ? (mine ? userStickers : character?.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  if (system) return <View style={styles.systemBubble}><Text style={styles.systemText}>{message.content}</Text></View>;
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {!mine ? <Avatar character={character} size={34} /> : null}
      <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
        {!mine ? <Text style={styles.speaker}>{character?.name || 'Character'}</Text> : <Text style={styles.speakerMine}>{userName}</Text>}
        {message.content ? <Text style={styles.bubbleText}>{message.content}</Text> : null}
        {sticker?.data || sticker?.mediaData ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerImage} resizeMode="contain" /> : message.sticker ? <Text style={styles.stickerText}>스티커 · {sticker?.name || message.sticker}</Text> : null}
        {message.mediaData ? <Image source={{ uri: message.mediaData }} style={styles.messageImage} resizeMode="cover" /> : null}
        {message.imagePrompt ? <Text style={styles.imageHint}>이미지 프롬프트: {message.imagePrompt}</Text> : null}
        {message.imageCaption ? <Text style={styles.imageHint}>{message.imageCaption}</Text> : null}
        {mine && !message.readAt ? <Text style={styles.readOne}>1</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#b8c7d9' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f7f2e9', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  titleBlock: { flex: 1 },
  title: { fontSize: 19, fontWeight: '900', color: colors.text },
  subtitle: { marginTop: 2, color: colors.sub, fontSize: 12, fontWeight: '700' },
  settings: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  settingsText: { color: colors.text, fontWeight: '900' },
  messages: { padding: 12, gap: 8 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  theirBubble: { backgroundColor: '#fff' },
  myBubble: { backgroundColor: '#fee56a' },
  speaker: { marginBottom: 3, color: colors.sub, fontSize: 11, fontWeight: '900' },
  speakerMine: { display: 'none' },
  bubbleText: { fontSize: 16, lineHeight: 22, color: '#222' },
  stickerText: { marginTop: 6, color: '#6c4f00', fontWeight: '900' },
  stickerImage: { marginTop: 8, width: 128, height: 128, borderRadius: 12 },
  readOne: { position: 'absolute', left: -14, bottom: 2, color: '#7b6a21', fontSize: 11, fontWeight: '900' },
  typingBubble: { minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  typingDots: { color: '#656565', fontWeight: '900', fontSize: 20, lineHeight: 22 },
  messageImage: { marginTop: 8, width: 210, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#eee' },
  imageHint: { marginTop: 6, fontSize: 12, color: colors.sub },
  systemBubble: { alignSelf: 'center', maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.45)' },
  systemText: { color: '#4f5a62', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerToggle: { minWidth: 58, minHeight: 42, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  stickerToggleText: { color: colors.text, fontWeight: '900' },
  stickerTray: { maxHeight: 144, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerTrayItem: { width: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', padding: 6, alignItems: 'center' },
  stickerThumb: { width: 48, height: 48, borderRadius: 8 },
  stickerThumbText: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', textAlign: 'center', lineHeight: 48, backgroundColor: '#eee8dc', color: colors.text, fontWeight: '900' },
  stickerTrayName: { marginTop: 4, color: colors.sub, fontSize: 11, fontWeight: '800' },
  emptyStickerText: { color: colors.sub, fontWeight: '800', padding: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 112, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: '#fff', color: colors.text, fontSize: 16 },
  send: { minWidth: 64, minHeight: 42, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  disabled: { opacity: 0.5 },
  sendText: { color: '#241a00', fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { color: colors.text, fontWeight: '900' },
  primary: { marginTop: 14, paddingHorizontal: 16, height: 42, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' }
});
