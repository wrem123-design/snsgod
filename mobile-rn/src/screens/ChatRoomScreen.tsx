import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodMessage, SNSGodState, Sticker } from '../types';
import { callLLM, generateImageDataUri } from '../logic/api';
import { makeId } from '../logic/ids';
import { appendMessage, findCharacter, findRoom, roomMessages, updateCharacter } from '../logic/stateHelpers';
import { buildChatPrompt, normalizeReplyMessagesForStyle } from '../logic/prompts';
import { isRenderableMediaUri, pickImageDataUri } from '../logic/media';
import { maybeCreateAutoSNSPost } from '../logic/sns';
import { formatMessageTime } from '../logic/time';
import { beginChatJob, endChatJob, isCurrentChatJob, tryLockGeneratingRoom } from '../logic/chatJobs';
import { markRoomRead } from '../logic/notifications';
import { phoneCardFromReply } from '../logic/phone';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function clampDelay(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(120, number));
}

function characterDelayMs(character: NonNullable<ReturnType<typeof findCharacter>>) {
  const min = clampDelay(character.responseDelayMin, 1);
  const max = Math.max(min, clampDelay(character.responseDelayMax, 8));
  const speed = Math.max(1, Math.min(10, Number(character.responseTime || 6)));
  const randomSeconds = min + Math.random() * Math.max(0, max - min);
  const speedFactor = 1.15 - speed * 0.07;
  return Math.max(350, Math.round(randomSeconds * speedFactor * 1000));
}

function bubbleDelayMs(character: NonNullable<ReturnType<typeof findCharacter>>, delay?: number) {
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

export function ChatRoomScreen({ state, roomId, onBack, onChange, onOpenRoomSettings, onOpenCharacterSettings, onOpenProfile, randomMode, onLeaveRandomRoom, onPromoteRandomRoom, onOpenCall }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoomSettings: (roomId: string) => void;
  onOpenCharacterSettings: (characterId: string) => void;
  onOpenProfile: (characterId: string) => void;
  randomMode?: boolean;
  onLeaveRandomRoom?: (roomId: string) => void;
  onPromoteRandomRoom?: (roomId: string) => void;
  onOpenCall?: (characterId: string, roomId?: string, messageId?: string) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList<SNSGodMessage>>(null);
  const currentStateRef = useRef(state);
  currentStateRef.current = state;
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const isRandomRoom = randomMode || room?.type === 'random';
  const messages = useMemo(() => roomMessages(state, roomId), [state, roomId]);

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    scrollToLatest(false);
    const current = currentStateRef.current;
    if ((current.unreadCounts[roomId] || 0) > 0 || (current.notifications || []).some(item => !item.read && (item.roomId === roomId || item.target?.roomId === roomId))) {
      void commit(markRoomRead(current, roomId));
    }
  }, [roomId]);

  useEffect(() => {
    scrollToLatest(true);
  }, [messages.length, typing]);

  async function commit(next: SNSGodState) {
    currentStateRef.current = next;
    await onChange(next);
  }

  async function markReadLater(targetRoomId: string, targetCharacter: NonNullable<ReturnType<typeof findCharacter>>) {
    await sleep(characterDelayMs(targetCharacter));
    await commit(markUserMessagesRead(currentStateRef.current, targetRoomId));
  }

  async function requestCharacterReply(
    baseState: SNSGodState,
    targetRoom: NonNullable<typeof room>,
    targetCharacter: NonNullable<typeof character>,
    latestUserInput: string
  ) {
    const jobId = beginChatJob(targetRoom.id);
    try {
      const replyDelayMs = characterDelayMs(targetCharacter);
      const promptMessages = buildChatPrompt(baseState, targetCharacter, targetRoom, latestUserInput, { mode: 'reply', replyDelaySeconds: replyDelayMs / 1000 });
      await sleep(replyDelayMs);
      if (!isCurrentChatJob(targetRoom.id, jobId)) return;
      let next = markUserMessagesRead(currentStateRef.current, targetRoom.id);
      await commit(next);
      setTyping(true);
      if (!tryLockGeneratingRoom(targetRoom.id, jobId)) return;
      const { reply, keyIndex } = await callLLM(next, promptMessages);
      if (!isCurrentChatJob(targetRoom.id, jobId)) return;
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
      if (!reply.messages.length) throw new Error('모델 응답에서 표시할 메시지를 찾지 못했습니다. ETC > 디버그에서 llm.response 원문을 확인하세요.');
      const bubbles = normalizeReplyMessagesForStyle(reply.messages, targetCharacter);
      for (const bubble of bubbles) {
        await sleep(bubbleDelayMs(targetCharacter, bubble.delay ?? reply.reactionDelay));
        if (!isCurrentChatJob(targetRoom.id, jobId)) return;
        const phone = phoneCardFromReply(next, targetCharacter, bubble, 'reply');
        let mediaData = '';
        if (bubble.imagePrompt && next.config.imageGeneration?.enabled !== false) {
          try {
            mediaData = await generateImageDataUri(next, bubble.imagePrompt, targetCharacter);
            if (!isCurrentChatJob(targetRoom.id, jobId)) return;
          } catch (error) {
            bubble.imageCaption = `${bubble.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim();
          }
        }
        if (phone.textContent || bubble.sticker || bubble.imagePrompt || bubble.imageCaption || mediaData) {
          next = appendMessage(next, targetRoom.id, {
            id: makeId('msg'),
            role: 'character',
            characterId: targetCharacter.id,
            content: phone.textContent || '',
            createdAt: Date.now(),
            sticker: bubble.sticker,
            imagePrompt: bubble.imagePrompt,
            imageCaption: bubble.imageCaption,
            mediaData: mediaData || undefined,
            mediaType: mediaData ? 'image' : undefined
          });
        }
        if (phone.card) next = appendMessage(next, targetRoom.id, phone.card);
      }
      if (!isCurrentChatJob(targetRoom.id, jobId)) return;
      if (reply.newMemory?.trim()) {
        const updated = findCharacter(next, targetCharacter.id);
        next = updateCharacter(next, targetCharacter.id, { memories: [...(updated?.memories || []), reply.newMemory.trim()].slice(-80) });
      }
      if (!isRandomRoom) {
        const snsCharacter = findCharacter(next, targetCharacter.id) || targetCharacter;
        next = await maybeCreateAutoSNSPost(next, snsCharacter, targetRoom.id);
      }
      if (!isCurrentChatJob(targetRoom.id, jobId)) return;
      await commit(next);
    } catch (error) {
      setTyping(false);
      const failed = appendMessage(currentStateRef.current, targetRoom.id, {
        id: makeId('msg'),
        role: 'system',
        content: `답장 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: Date.now(),
        failed: true
      });
      await commit(failed);
      Alert.alert('답장 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      endChatJob(targetRoom.id, jobId);
      setTyping(false);
      setSending(false);
    }
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
    await requestCharacterReply(next, room, character, content);
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
      setSending(true);
      await requestCharacterReply(next, room, character, `${content}\n[사용자가 사진을 보냈습니다.]`);
    } catch (error) {
      setSending(false);
      Alert.alert('사진 첨부 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function sendSticker(sticker: Sticker) {
    if (!room || !character || sending) return;
    setShowStickers(false);
    setSending(true);
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content: '', createdAt: Date.now(), sticker: sticker.id };
    let next = appendMessage(currentStateRef.current, room.id, userMessage);
    next = { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
    await commit(next);
    await requestCharacterReply(next, room, character, `[스티커: ${sticker.name || sticker.id}]`);
  }

  async function rejectCall(message: SNSGodMessage) {
    if (!room || !character) return;
    let next = {
      ...currentStateRef.current,
      messages: {
        ...currentStateRef.current.messages,
        [room.id]: (currentStateRef.current.messages[room.id] || []).map(item => item.id === message.id ? {
          ...item,
          callStatus: 'rejected',
          callHandledAt: Date.now()
        } : item)
      }
    };
    next = appendMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: '통화 취소',
      createdAt: Date.now(),
      phoneLog: 'rejected',
      sourceMode: 'phone'
    });
    await commit(next);
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
          <Text style={styles.title}>{character.name}</Text>
          <Text style={styles.subtitle}>{room.name === '기본 채팅' ? character.statusMessage || '접속 중' : `${room.name} · ${character.statusMessage || '접속 중'}`}</Text>
        </Pressable>
        {randomMode ? (
          <Pressable onPress={() => onPromoteRandomRoom?.(room.id)} style={styles.profileButton}>
            <Text style={styles.profileText}>정식 추가</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => onOpenProfile(character.id)} style={styles.profileButton}>
            <Text style={styles.profileText}>프로필</Text>
          </Pressable>
        )}
        {randomMode ? (
          <Pressable onPress={() => onLeaveRandomRoom?.(room.id)} style={[styles.profileButton, styles.leaveButton]}>
            <Text style={[styles.profileText, styles.leaveText]}>삭제</Text>
          </Pressable>
        ) : null}
        {!isRandomRoom ? <Pressable onPress={() => onOpenRoomSettings(room.id)} style={styles.settingsButton}><Text style={styles.settingsText}>방 설정</Text></Pressable> : null}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollToLatest(false)}
        onLayout={() => scrollToLatest(false)}
        ListHeaderComponent={room.name !== '기본 채팅' ? <View style={styles.roomNotice}><Text style={styles.roomNoticeText}>{room.name}</Text></View> : null}
        renderItem={({ item }) => <MessageBubble message={item} character={character} userStickers={state.userStickers || []} roomId={room.id} onOpenCall={onOpenCall} onRejectCall={rejectCall} />}
        ListFooterComponent={typing ? <TypingBubble character={character} /> : null}
      />

      {showStickers ? <StickerTray stickers={state.userStickers || []} onPick={sendSticker} /> : null}
      <View style={styles.composer}>
        <Pressable onPress={() => setShowStickers(value => !value)} disabled={sending} style={[styles.attachButton, sending && styles.sendDisabled]}><Text style={styles.attachText}>스티커</Text></Pressable>
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
          <Text style={styles.sendText}>전송</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function TypingBubble({ character }: { character: NonNullable<ReturnType<typeof findCharacter>> }) {
  return (
    <View style={styles.messageRow}>
      <Avatar character={character} size={34} />
      <View style={[styles.bubble, styles.theirBubble, styles.typingBubble]}>
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

function MessageBubble({ message, character, userStickers, roomId, onOpenCall, onRejectCall }: {
  message: SNSGodMessage;
  character: NonNullable<ReturnType<typeof findCharacter>>;
  userStickers: Sticker[];
  roomId: string;
  onOpenCall?: (characterId: string, roomId?: string, messageId?: string) => void;
  onRejectCall?: (message: SNSGodMessage) => void;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const sticker = message.sticker ? (mine ? userStickers : character.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  if (system) {
    return <View style={styles.systemBubble}><Text style={styles.systemText}>{message.content}</Text></View>;
  }
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
        {message.callInvite ? (
          <View style={styles.callCard}>
            <Text style={styles.callTitle}>{String(message.callTitle || message.mediaName || `${character.name} 전화`)}</Text>
            <Text style={styles.callBody}>{String(message.callLine || '통화 요청이 도착했습니다.')}</Text>
            {message.callStatus ? <Text style={styles.callStatus}>{callStatusLabel(String(message.callStatus))}</Text> : (
              <View style={styles.callActions}>
                <Pressable onPress={() => onOpenCall?.(String(message.characterId || character.id), roomId, message.id)} style={styles.callButton}>
                  <Text style={styles.callButtonText}>받기</Text>
                </Pressable>
                <Pressable onPress={() => onRejectCall?.(message)} style={[styles.callButton, styles.callRejectButton]}>
                  <Text style={styles.callRejectText}>거절</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
        {message.content && !message.callInvite ? <Text style={[styles.bubbleText, mine && styles.myText]}>{message.content}</Text> : null}
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

function callStatusLabel(status: string) {
  if (status === 'accepted') return '통화 연결됨';
  if (status === 'rejected') return '통화 취소';
  if (status === 'missed') return '부재중 전화';
  if (status === 'ringing') return '수신 중';
  return status;
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
  leaveButton: { backgroundColor: '#fff1f1', borderColor: '#efb9b9' },
  leaveText: { color: colors.danger },
  settingsButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontWeight: '900', color: colors.text },
  messages: { padding: 12, gap: 8 },
  roomNotice: { alignSelf: 'center', maxWidth: '88%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  roomNoticeText: { color: '#4f5a62', fontSize: 12, fontWeight: '900' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageMeta: { minWidth: 42, alignItems: 'flex-end', justifyContent: 'flex-end', gap: 1, marginBottom: 2 },
  messageTime: { color: '#30445a', fontSize: 11, fontWeight: '700' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  theirBubble: { backgroundColor: '#fff' },
  myBubble: { backgroundColor: '#fee56a' },
  bubbleText: { fontSize: 16, lineHeight: 22, color: '#222' },
  myText: { color: '#211b00' },
  stickerText: { marginTop: 6, color: '#6c4f00', fontWeight: '900' },
  stickerImage: { marginTop: 8, width: 128, height: 128, borderRadius: 12 },
  readOne: { color: '#7b6a21', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  typingBubble: { minWidth: 58, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  typingDots: { color: '#656565', fontWeight: '900', fontSize: 20, lineHeight: 22 },
  messageImageWrap: { marginTop: 8, position: 'relative', alignSelf: 'flex-start' },
  messageImage: { width: 210, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#eee' },
  promptToggle: { position: 'absolute', right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(86,92,99,0.78)' },
  promptToggleText: { color: '#e5e7eb', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  imageHint: { marginTop: 6, fontSize: 12, color: colors.sub },
  callCard: { minWidth: 190, gap: 6 },
  callTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  callBody: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  callActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  callButton: { flex: 1, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27313b' },
  callRejectButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5c6b1' },
  callButtonText: { color: '#fff', fontWeight: '900' },
  callRejectText: { color: colors.text, fontWeight: '900' },
  callStatus: { marginTop: 4, color: colors.sub, fontSize: 12, fontWeight: '900' },
  systemBubble: { alignSelf: 'center', maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.45)' },
  systemText: { color: '#4f5a62', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerTray: { maxHeight: 144, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerTrayItem: { width: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', padding: 6, alignItems: 'center' },
  stickerThumb: { width: 48, height: 48, borderRadius: 8 },
  stickerThumbText: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', textAlign: 'center', lineHeight: 48, backgroundColor: '#eee8dc', color: colors.text, fontWeight: '900' },
  stickerTrayName: { marginTop: 4, color: colors.sub, fontSize: 11, fontWeight: '800' },
  emptyStickerText: { color: colors.sub, fontWeight: '800', padding: 8 },
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
