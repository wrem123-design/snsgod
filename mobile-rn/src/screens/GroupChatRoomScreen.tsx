import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLMText, generateImageDataUri, imagePromptWithoutCharacterName, parseJsonObject } from '../logic/api';
import { makeId } from '../logic/ids';
import { formatMessageTime } from '../logic/time';
import { MAX_CONTEXT_MESSAGES, MAX_GROUP_ROOM_MESSAGES } from '../logic/limits';
import { SNSGodCharacter, SNSGodMessage, SNSGodState, Sticker } from '../types';
import { markRoomRead } from '../logic/notifications';
import { beginChatJob, endChatJob, isCurrentChatJob, tryLockGeneratingRoom } from '../logic/chatJobs';
import { shouldAllowChatImageGeneration } from '../logic/chatImageGuard';
import { appendDebugLog } from '../logic/debugLog';
import { isRenderableMediaUri } from '../logic/media';
import { characterReferenceImageForPrompt } from '../logic/imageReference';
import { characterWithConversationRhythm } from '../logic/conversationRhythm';
import { forceUpdateRoomMemory, groupMemoryPromptBlock, updateRoomMemoryAfterAppend } from '../logic/memoryBridge';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type GroupReplyPayload = {
  messages?: Array<{ characterId?: string; speakerId?: string; name?: string; handle?: string; content?: string; sticker?: string; imagePrompt?: string; imageCaption?: string; delay?: number }>;
};

function clampDelay(value: unknown, fallback: number, max = 2700) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(max, number));
}

function characterDelayMs(state: SNSGodState | undefined, character: SNSGodCharacter) {
  const timedCharacter = characterWithConversationRhythm(state, character);
  const min = clampDelay(timedCharacter.responseDelayMin, 1, 120);
  const max = Math.max(min, clampDelay(timedCharacter.responseDelayMax, 8, 2700));
  const speed = Math.max(1, Math.min(10, Number(timedCharacter.responseTime || 6)));
  const randomSeconds = min + Math.random() * Math.max(0, max - min);
  const speedFactor = 1.15 - speed * 0.07;
  const seconds = Math.max(min, Math.min(max, randomSeconds * speedFactor));
  return Math.round(seconds * 1000);
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

function clearGroupReadState(state: SNSGodState, roomId: string) {
  return {
    ...markUserMessagesRead(state, roomId),
    unreadCounts: { ...(state.unreadCounts || {}), [roomId]: 0 }
  };
}

function appendGroupMessage(state: SNSGodState, roomId: string, message: SNSGodMessage) {
  return updateRoomMemoryAfterAppend({
    ...state,
    messages: {
      ...state.messages,
      [roomId]: [...(state.messages[roomId] || []), message].slice(-MAX_GROUP_ROOM_MESSAGES)
    },
    groupRooms: (state.groupRooms || []).map(item => item.id === roomId ? { ...item, lastActivity: message.createdAt } : item)
  }, roomId);
}

function findGroup(state: SNSGodState, roomId: string) {
  return (state.groupRooms || []).find(room => room.id === roomId);
}

function groupParticipants(state: SNSGodState, roomId: string) {
  const participantIds = Array.isArray(findGroup(state, roomId)?.participantIds) ? findGroup(state, roomId)?.participantIds || [] : [];
  return state.characters.filter(character => participantIds.includes(character.id));
}

function participantNames(participants: SNSGodCharacter[]) {
  return participants.map(character => character.name).join(', ');
}

function buildGroupPrompt(state: SNSGodState, roomId: string, participants: SNSGodCharacter[], latestUserText: string) {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const messages = (state.messages[roomId] || []).slice(-Number(profile.contextMessageLimit || MAX_CONTEXT_MESSAGES));
  const transcript = messages.map(message => {
    if (message.role === 'user') return `${state.config.userName || 'User'}: ${message.content}`;
    const character = participants.find(item => item.id === message.characterId);
    return `${character?.name || 'Character'}: ${message.content}`;
  }).join('\n');
  const stickerText = participants.flatMap(character => character.stickers || []).concat(state.userStickers || [])
    .slice(0, 20)
    .map(item => `- ${item.id}: ${item.name}${item.description ? ` (${item.description})` : ''}`)
    .join('\n');
  const memoryBlock = groupMemoryPromptBlock(state, roomId, participants, latestUserText);
  const system = [
    'This is a private fictional group messenger. Stay in character and return JSON only.',
    'Return only valid JSON: {"messages":[{"characterId":"one allowed id","content":"short Korean chat bubble","sticker":"","imagePrompt":"","imageCaption":""}]}. Do not wrap it in markdown.',
    state.config.imageGeneration?.enabled === false
      ? 'Image sending is disabled. Do not include imagePrompt or imageCaption.'
      : 'Image sending is strictly opt-in. Include imagePrompt when the latest user message explicitly asks for a photo, selfie, picture, image, visual, drawing, outfit, face, appearance, scene, or asks someone to show/send/take a photo. If the user asks situational questions about food, cafe, outside, travel, scenery, outfit, wearing, or what someone is doing, one relevant phone-photo imagePrompt is allowed occasionally, but not every time. Never add random selfies or atmospheric images during ordinary group chat.',
    'Write 1 to 4 messages. Usually only 1 to 3 members reply. Not everyone needs to answer.',
    'Every message must include characterId from the allowed member list. Do not use outside speakers.',
    'Do not expose JSON keys as visible chat text. Do not echo, rewrite, summarize, or delete the latest user message.',
    `Allowed members:\n${participants.map(character => `- ${character.id} (@${character.handle || character.id}) ${character.name}: ${character.prompt || '(empty)'}`).join('\n')}`,
    `User profile: ${state.config.userDescription || '(empty)'}`,
    `Room-only relationship/context note: ${findGroup(state, roomId)?.relationshipNote || '(empty)'}`,
    memoryBlock,
    stickerText ? `Available stickers:\n${stickerText}` : 'Available stickers: none'
  ].join('\n\n');
  const user = [
    `Conversation transcript:\n${transcript || '(empty)'}`,
    `Latest user message: ${latestUserText}`,
    `Output language: ${state.config.language || 'Korean'}.`
  ].join('\n\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user }
  ];
}

function chooseFallbackSpeaker(participants: SNSGodCharacter[], messages: SNSGodMessage[]): SNSGodCharacter | undefined {
  const lastCharacterId = [...messages].reverse().find(message => message.role === 'character')?.characterId;
  const candidates = participants.filter(character => character.id !== lastCharacterId);
  const pool = candidates.length ? candidates : participants;
  return pool[Math.floor(Math.random() * pool.length)] || participants[0];
}

function resolveGroupSpeaker(participants: SNSGodCharacter[], item: NonNullable<GroupReplyPayload['messages']>[number]): SNSGodCharacter | undefined {
  const raw = String(item.characterId || item.speakerId || '').trim();
  if (raw) {
    const byId = participants.find(character => character.id === raw || character.handle === raw.replace(/^@/, ''));
    if (byId) return byId;
  }
  const name = String(item.name || item.handle || '').replace(/^@/, '').trim();
  if (!name) return undefined;
  return participants.find(character => character.name === name || character.handle === name || character.id === name);
}

export function GroupChatRoomScreen({ state, roomId, onBack, onChange, onCommitCurrent, onOpenSettings }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onCommitCurrent?: (patch: (current: SNSGodState) => SNSGodState) => Promise<SNSGodState | void> | SNSGodState | void;
  onOpenSettings: (roomId: string) => void;
}) {
  const room = findGroup(state, roomId);
  const participantKey = Array.isArray(room?.participantIds) ? room.participantIds.join('|') : '';
  const participants = useMemo(() => {
    const participantIds = participantKey ? participantKey.split('|') : [];
    return state.characters.filter(character => participantIds.includes(character.id));
  }, [state.characters, participantKey]);
  const messages = useMemo(() => state.messages[roomId] || [], [state.messages, roomId]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [typingCharacters, setTypingCharacters] = useState<SNSGodCharacter[]>([]);
  const listRef = useRef<FlatList<SNSGodMessage>>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    scrollToLatest(false);
    const current = stateRef.current;
    if ((current.unreadCounts[roomId] || 0) > 0 || (current.notifications || []).some(item => !item.read && (item.roomId === roomId || item.target?.roomId === roomId))) {
      void commit(markRoomRead(current, roomId));
    }
  }, [roomId]);

  useEffect(() => {
    scrollToLatest(true);
  }, [messages.length, typingCharacters.length]);

  async function commit(next: SNSGodState) {
    stateRef.current = next;
    await onChange(next);
  }

  async function commitCurrent(patch: (current: SNSGodState) => SNSGodState) {
    const localNext = patch(stateRef.current);
    stateRef.current = localNext;
    if (onCommitCurrent) {
      const committed = await onCommitCurrent(current => patch(current));
      if (committed) stateRef.current = committed;
    } else {
      await onChange(localNext);
    }
    return stateRef.current;
  }

  function leaveRoom() {
    void Promise.resolve(commitCurrent(current => forceUpdateRoomMemory(current, roomId))).finally(onBack);
  }

  async function markReadLater(targetRoomId: string, readers: SNSGodCharacter[]) {
    const firstReader = readers[0];
    if (!firstReader) return;
    await sleep(characterDelayMs(stateRef.current, firstReader));
    await commitCurrent(current => markUserMessagesRead(current, targetRoomId));
  }

  async function send() {
    const content = text.trim();
    if (!room || !content || sending || !participants.length) return;
    setText('');
    setSending(true);
    const now = Date.now();
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: now };
    await commitCurrent(current => ({
      ...appendGroupMessage(current, roomId, userMessage),
      unreadCounts: { ...current.unreadCounts, [roomId]: 0 }
    }));
    const jobId = beginChatJob(roomId);
    try {
      const firstSpeaker = chooseFallbackSpeaker(participants, stateRef.current.messages[roomId] || []);
      if (firstSpeaker) {
        setTypingCharacters([firstSpeaker]);
        await sleep(characterDelayMs(stateRef.current, firstSpeaker));
        if (!isCurrentChatJob(roomId, jobId)) return;
        await commitCurrent(current => markUserMessagesRead(current, roomId));
      }
      if (!tryLockGeneratingRoom(roomId, jobId)) return;
      const promptState = stateRef.current;
      const promptParticipants = groupParticipants(promptState, roomId);
      const prompt = buildGroupPrompt(promptState, roomId, promptParticipants, content);
      const { text: rawText, keyIndex } = await callLLMText(promptState, prompt);
      if (!isCurrentChatJob(roomId, jobId)) return;
      await commitCurrent(current => {
        const profile = current.config.apiProfiles[current.config.apiType] || {};
        return {
          ...current,
          config: { ...current.config, apiProfiles: { ...current.config.apiProfiles, [current.config.apiType]: { ...profile, apiKeyIndex: keyIndex } } }
        };
      });
      const parsed = parseJsonObject<GroupReplyPayload>(rawText);
      const replyItems = (parsed?.messages || []).slice(0, 4).filter(item => String(item.content || '').trim());
      const fallbackSpeaker = chooseFallbackSpeaker(groupParticipants(stateRef.current, roomId), stateRef.current.messages[roomId] || []) || chooseFallbackSpeaker(participants, stateRef.current.messages[roomId] || []);
      const normalizedItems = replyItems.length ? replyItems : fallbackSpeaker ? [{
        characterId: fallbackSpeaker.id,
        content: rawText.trim() && !rawText.trim().startsWith('{') ? rawText.trim() : '응.'
      }] : [];
      let deliveredCount = 0;
      for (const item of normalizedItems) {
        const latestParticipants = groupParticipants(stateRef.current, roomId);
        const speaker = resolveGroupSpeaker(latestParticipants, item) || (deliveredCount === 0 ? chooseFallbackSpeaker(latestParticipants, stateRef.current.messages[roomId] || []) : undefined);
        if (!speaker) continue;
        setTypingCharacters(prev => Array.from(new Map([...prev, speaker].map(value => [value.id, value])).values()));
        await sleep(bubbleDelayMs(speaker, item.delay));
        if (!isCurrentChatJob(roomId, jobId)) return;
        let mediaData = '';
        const imageState = stateRef.current;
        const imageAllowed = shouldAllowChatImageGeneration({
          state: imageState,
          roomId,
          characterId: speaker.id,
          latestUserText: content,
          sourceMode: 'reply',
          imagePrompt: item.imagePrompt
        });
        if (!imageAllowed && item.imagePrompt) {
          void appendDebugLog('chat.image.blocked', JSON.stringify({
            roomId,
            characterId: speaker.id,
            latestUserText: content,
            imagePrompt: item.imagePrompt,
            imageCaption: item.imageCaption,
            reason: 'no_explicit_image_intent'
          }), 'info');
          item.imagePrompt = undefined;
          item.imageCaption = undefined;
        }
        if (item.imagePrompt && imageAllowed) {
          item.imagePrompt = imagePromptWithoutCharacterName(item.imagePrompt, speaker);
          try {
            mediaData = await generateImageDataUri(imageState, item.imagePrompt, speaker, {
              referenceImage: characterReferenceImageForPrompt(speaker, item.imagePrompt),
              kind: 'general'
            });
          } catch (error) {
            item.imageCaption = `${item.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim();
          }
        }
        const shouldAppendBubble = Boolean(String(item.content || '').trim()) || Boolean(item.sticker) || isRenderableMediaUri(mediaData) || Boolean(item.imageCaption?.trim());
        if (shouldAppendBubble) {
          const characterMessage: SNSGodMessage = {
            id: makeId('msg'),
            role: 'character',
            characterId: speaker.id,
            content: String(item.content || '').trim(),
            createdAt: Date.now(),
            sticker: item.sticker,
            imagePrompt: mediaData || (imageAllowed && item.imageCaption?.trim()) ? item.imagePrompt : undefined,
            imageCaption: mediaData || (imageAllowed && item.imageCaption?.trim()) ? item.imageCaption : undefined,
            mediaData: mediaData || undefined,
            mediaType: mediaData ? 'image' : undefined
          };
          await commitCurrent(current => appendGroupMessage(current, roomId, characterMessage));
          deliveredCount += 1;
        }
        setTypingCharacters(prev => prev.filter(value => value.id !== speaker.id));
      }
    } catch (error) {
      setTypingCharacters([]);
      const systemMessage: SNSGodMessage = { id: makeId('msg'), role: 'system', content: `그룹 답장 실패: ${error instanceof Error ? error.message : String(error)}`, createdAt: Date.now(), failed: true };
      await commitCurrent(current => clearGroupReadState(appendGroupMessage(current, roomId, systemMessage), roomId));
      Alert.alert('그룹 답장 실패', error instanceof Error ? error.message : String(error));
    } finally {
      const shouldFinalizeRead = isCurrentChatJob(roomId, jobId);
      if (shouldFinalizeRead) {
        await commitCurrent(current => clearGroupReadState(current, roomId));
      }
      endChatJob(roomId, jobId);
      setTypingCharacters([]);
      setSending(false);
    }
  }

  async function sendSticker(sticker: Sticker) {
    if (!room || sending) return;
    setShowStickers(false);
    const now = Date.now();
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content: '', createdAt: now, sticker: sticker.id };
    await commitCurrent(current => ({
      ...appendGroupMessage(current, roomId, userMessage),
      unreadCounts: { ...current.unreadCounts, [roomId]: 0 }
    }));
    void markReadLater(roomId, participants);
  }

  if (!room) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>그룹방을 찾을 수 없습니다.</Text>
        <Pressable onPress={leaveRoom} style={styles.primary}><Text style={styles.primaryText}>목록으로</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={leaveRoom} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{room.name}</Text>
          <Text style={styles.subtitle}>{participants.length}명 · {participantNames(participants)}</Text>
        </View>
        <Pressable onPress={() => onOpenSettings(room.id)} style={styles.settings}><Text style={styles.settingsText}>방 설정</Text></Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollToLatest(false)}
        onLayout={() => scrollToLatest(false)}
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
          {isRenderableMediaUri(sticker.data || sticker.mediaData) ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerThumb} resizeMode="contain" /> : <Text style={styles.stickerThumbText}>S</Text>}
          <Text style={styles.stickerTrayName} numberOfLines={1}>{sticker.name}</Text>
        </Pressable>
      )) : <Text style={styles.emptyStickerText}>설정의 스티커 메뉴에서 내 스티커를 추가하세요.</Text>}
    </View>
  );
}

function GroupBubble({ message, participants, userName, userStickers }: { message: SNSGodMessage; participants: SNSGodCharacter[]; userName: string; userStickers: Sticker[] }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const character = participants.find(item => item.id === message.characterId);
  const sticker = message.sticker ? (mine ? userStickers : character?.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  if (system) return <View style={styles.systemBubble}><Text style={styles.systemText}>{message.content}</Text></View>;
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {!mine ? <Avatar character={character} size={34} /> : null}
      {mine ? (
        <View style={styles.messageMeta}>
          {!message.readAt ? <Text style={styles.readOne}>1</Text> : null}
          <Text style={styles.messageTime}>{formatMessageTime(message.createdAt)}</Text>
        </View>
      ) : null}
      <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
        {!mine ? <Text style={styles.speaker}>{character?.name || 'Character'}</Text> : <Text style={styles.speakerMine}>{userName}</Text>}
        {message.content ? <Text style={styles.bubbleText}>{message.content}</Text> : null}
        {sticker?.data || sticker?.mediaData ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerImage} resizeMode="contain" /> : message.sticker ? <Text style={styles.stickerText}>스티커 · {sticker?.name || message.sticker}</Text> : null}
        {message.mediaData ? (
          <View style={styles.messageImageWrap}>
            <Image source={{ uri: message.mediaData }} style={styles.messageImage} resizeMode="cover" />
            {message.imagePrompt ? (
              <Pressable accessibilityLabel={promptOpen ? '이미지 프롬프트 접기' : '이미지 프롬프트 펼치기'} onPress={() => setPromptOpen(value => !value)} style={styles.promptToggle}>
                <Text style={styles.promptToggleText}>{promptOpen ? '⌃' : '⌄'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {message.imagePrompt && promptOpen ? <Text style={styles.imageHint}>이미지 프롬프트: {message.imagePrompt}</Text> : null}
        {message.imageCaption ? <Text style={styles.imageHint}>{message.imageCaption}</Text> : null}
      </View>
      {!mine ? <Text style={styles.messageTime}>{formatMessageTime(message.createdAt)}</Text> : null}
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
  messageMeta: { minWidth: 42, alignItems: 'flex-end', justifyContent: 'flex-end', gap: 1, marginBottom: 2 },
  messageTime: { color: '#30445a', fontSize: 11, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  theirBubble: { backgroundColor: '#fff' },
  myBubble: { backgroundColor: '#fee56a' },
  speaker: { marginBottom: 3, color: colors.sub, fontSize: 11, fontWeight: '900' },
  speakerMine: { display: 'none' },
  bubbleText: { fontSize: 16, lineHeight: 22, color: '#222' },
  stickerText: { marginTop: 6, color: '#6c4f00', fontWeight: '900' },
  stickerImage: { marginTop: 8, width: 128, height: 128, borderRadius: 12 },
  readOne: { color: '#7b6a21', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  typingBubble: { minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  typingDots: { color: '#656565', fontWeight: '900', fontSize: 20, lineHeight: 22 },
  messageImageWrap: { marginTop: 8, position: 'relative', alignSelf: 'flex-start' },
  messageImage: { width: 210, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#eee' },
  promptToggle: { position: 'absolute', right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(86,92,99,0.78)' },
  promptToggleText: { color: '#e5e7eb', fontSize: 16, lineHeight: 20, fontWeight: '900' },
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
