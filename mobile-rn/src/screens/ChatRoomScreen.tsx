import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { MeetingEventSession, SNSGodMessage, SNSGodState, Sticker } from '../types';
import { makeId } from '../logic/ids';
import { appendMessage, findCharacter, findRoom, roomMessages } from '../logic/stateHelpers';
import { isRenderableMediaUri, pickImageDataUri } from '../logic/media';
import { formatMessageDateLabel, formatMessageTime, isSameMessageDate } from '../logic/time';
import { chatBubbleLayoutFor, ChatBubbleLayout } from '../logic/chatBubbleLayout';
import { markRoomRead } from '../logic/notifications';
import { generateImageDataUri, imagePromptFor, imagePromptWithoutCharacterName } from '../logic/api';
import { characterReferenceImageForPrompt } from '../logic/imageReference';
import { clearComposerInput, createComposerSendGuard, isComposerSendEnter } from '../logic/chatComposerKeys';
import { reverseMessagesForInvertedList, useStickToBottomList } from '../logic/useStickToBottomList';
import { MessageActionAnchor, MessageActionMenu } from '../components/MessageActionMenu';

const TermuxBridge = NativeModules.TermuxBridge as undefined | {
  copyText: (text: string) => Promise<string>;
};

type RoomImageItem = {
  id: string;
  uri: string;
  title: string;
  prompt: string;
  caption: string;
  createdAt: number;
};

export function ChatRoomScreen({ state, roomId, onBack, onChange, onCommitCurrent, onOpenRoomSettings, onOpenCharacterSettings, onOpenProfile, randomMode, onLeaveRandomRoom, onPromoteRandomRoom, onOpenCall, onOpenMeeting, onMaybeStartMeeting, onRequestMeetingPrompt, onRequestReply }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onCommitCurrent?: (patch: (current: SNSGodState) => SNSGodState) => Promise<void> | void;
  onOpenRoomSettings: (roomId: string) => void;
  onOpenCharacterSettings: (characterId: string) => void;
  onOpenProfile: (characterId: string) => void;
  randomMode?: boolean;
  onLeaveRandomRoom?: (roomId: string) => void;
  onPromoteRandomRoom?: (roomId: string) => void;
  onOpenCall?: (characterId: string, roomId?: string, messageId?: string) => void;
  onOpenMeeting?: (sessionId: string) => void;
  onMaybeStartMeeting?: (roomId: string, latestUserInput: string) => Promise<boolean>;
  onRequestMeetingPrompt?: (roomId: string) => Promise<boolean>;
  onRequestReply: (roomId: string, characterId: string, latestUserInput: string, options?: { randomMode?: boolean; userMessageCreatedAt?: number; latestUserImageData?: string }) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [requestingMeeting, setRequestingMeeting] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [viewerImage, setViewerImage] = useState<RoomImageItem | null>(null);
  const [regeneratingImageId, setRegeneratingImageId] = useState('');
  const [imageRetryDraft, setImageRetryDraft] = useState<{ messageId: string; prompt: string } | null>(null);
  const textRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const sendGuardRef = useRef(createComposerSendGuard());
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const isRandomRoom = randomMode || room?.type === 'random';
  const messages = useMemo(() => roomMessages(state, roomId), [state.messages, roomId]);
  // inverted FlatList: newest-first so offset 0 is the latest bubble (no scroll thrash on send).
  const listMessages = useMemo(() => reverseMessagesForInvertedList(messages), [messages]);
  const messageMetaById = useMemo(() => {
    const meta = new Map<string, {
      previous?: SNSGodMessage;
      next?: SNSGodMessage;
      showDateDivider: boolean;
      layout: ChatBubbleLayout;
    }>();
    messages.forEach((message, index) => {
      const previous = index > 0 ? messages[index - 1] : undefined;
      const next = index < messages.length - 1 ? messages[index + 1] : undefined;
      meta.set(message.id, {
        previous,
        next,
        showDateDivider: index === 0 || !isSameMessageDate(previous?.createdAt, message.createdAt),
        layout: chatBubbleLayoutFor(message, previous, next)
      });
    });
    return meta;
  }, [messages]);
  const meetingStatusById = useMemo(() => {
    const status = new Map<string, string | undefined>();
    for (const session of state.meetingEventSessions || []) {
      status.set(session.id, session.status);
    }
    return status;
  }, [state.meetingEventSessions]);
  const pendingReplyPhase = state.pendingReplies?.[roomId]?.phase;
  const typing = pendingReplyPhase === 'typing' || pendingReplyPhase === 'generating';
  const {
    listRef,
    onScroll,
    onContentSizeChange,
    onLayout,
    pinToBottom,
    inverted,
    listProps
  } = useStickToBottomList<SNSGodMessage>({
    roomKey: roomId,
    messageCount: messages.length,
    footerSignal: typing
  });

  function updateComposerText(value: string) {
    const cleaned = sendGuardRef.current.filterChange(value);
    textRef.current = cleaned;
    // Residual Enter text often arrives while React state is already ''.
    // setText('') alone will not re-render, so force native clear.
    if (cleaned !== value) {
      inputRef.current?.setNativeProps({ text: cleaned });
    }
    setText(cleaned);
  }

  useEffect(() => {
    if ((state.unreadCounts[roomId] || 0) > 0 || (state.notifications || []).some(item => !item.read && (item.roomId === roomId || item.target?.roomId === roomId))) {
      void commitCurrent(current => markRoomRead(current, roomId));
    }
  }, [roomId]);

  async function commit(next: SNSGodState) {
    await onChange(next);
  }

  async function commitCurrent(patch: (current: SNSGodState) => SNSGodState) {
    if (onCommitCurrent) {
      await onCommitCurrent(patch);
    } else {
      await commit(patch(state));
    }
  }

  async function send() {
    const raw = textRef.current || text;
    const content = raw.trim();
    if (!content || !room || !character || sending) return;
    sendGuardRef.current.arm(raw);
    clearComposerInput(inputRef, textRef, setText);
    setSending(true);
    pinToBottom();
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: Date.now() };
    await commitCurrent(current => {
      const next = appendMessage(current, room.id, userMessage);
      return { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
    });
    setSending(false);
    if (room.disabled === true) return;
    if (!isRandomRoom && onMaybeStartMeeting && await onMaybeStartMeeting(room.id, content)) return;
    onRequestReply(room.id, character.id, content, { randomMode: isRandomRoom, userMessageCreatedAt: userMessage.createdAt });
  }

  async function attachImage() {
    if (!room || !character || sending) return;
    try {
      const image = await pickImageDataUri();
      if (!image) return;
      const content = text.trim() || '사진을 보냈습니다.';
      setText('');
      const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: Date.now(), mediaData: image };
      await commitCurrent(current => {
        const next = appendMessage(current, room.id, userMessage);
        return { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
      });
      const promptText = `${content}\n[사용자가 사진을 보냈습니다.]`;
      if (room.disabled === true) return;
      if (!isRandomRoom && onMaybeStartMeeting && await onMaybeStartMeeting(room.id, promptText)) return;
      onRequestReply(room.id, character.id, promptText, { randomMode: isRandomRoom, userMessageCreatedAt: userMessage.createdAt, latestUserImageData: image });
    } catch (error) {
      Alert.alert('사진 첨부 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  async function sendSticker(sticker: Sticker) {
    if (!room || !character || sending) return;
    setShowStickers(false);
    setSending(true);
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content: '', createdAt: Date.now(), sticker: sticker.id };
    await commitCurrent(current => {
      const next = appendMessage(current, room.id, userMessage);
      return { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
    });
    setSending(false);
    if (room.disabled === true) return;
    if (!isRandomRoom && onMaybeStartMeeting && await onMaybeStartMeeting(room.id, `[스티커: ${sticker.name || sticker.id}]`)) return;
    onRequestReply(room.id, character.id, `[스티커: ${sticker.name || sticker.id}]`, { randomMode: isRandomRoom, userMessageCreatedAt: userMessage.createdAt });
  }

  async function requestMeetingPrompt() {
    if (!room || isRandomRoom || !onRequestMeetingPrompt || requestingMeeting) return;
    setRequestingMeeting(true);
    setShowStickers(false);
    setShowQuickActions(false);
    try {
      const created = await onRequestMeetingPrompt(room.id);
      if (!created) Alert.alert('만남 이벤트', '현재 채팅에서는 만남 이벤트를 준비할 수 없습니다.');
    } catch (error) {
      Alert.alert('만남 이벤트 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setRequestingMeeting(false);
    }
  }

  function openCallFromComposer() {
    setShowQuickActions(false);
    setShowStickers(false);
    if (!room || !character || !onOpenCall) return;
    onOpenCall(character.id, room.id);
  }

  async function rejectCall(message: SNSGodMessage) {
    if (!room || !character) return;
    await commitCurrent(current => {
      const next = {
        ...current,
        messages: {
          ...current.messages,
          [room.id]: (current.messages[room.id] || []).map(item => item.id === message.id ? {
            ...item,
            callStatus: 'rejected',
            callHandledAt: Date.now()
          } : item)
        }
      };
      return appendMessage(next, room.id, {
        id: makeId('msg'),
        role: 'character',
        characterId: character.id,
        content: '통화 취소',
        createdAt: Date.now(),
        phoneLog: 'rejected',
        sourceMode: 'phone'
      });
    });
  }

  async function retryFailedReply(message: SNSGodMessage) {
    if (!room || !character) return;
    const index = messages.findIndex(item => item.id === message.id);
    const previousUserMessage = messages.slice(0, index < 0 ? undefined : index).reverse().find(item => item.role === 'user');
    if (!previousUserMessage) {
      Alert.alert('재생성 실패', '다시 답장할 사용자 메시지를 찾지 못했습니다.');
      return;
    }
    await commitCurrent(current => ({
      ...current,
      messages: {
        ...current.messages,
        [room.id]: (current.messages[room.id] || []).filter(item => item.id !== message.id)
      }
    }));
    const promptText = [
      previousUserMessage.content || (previousUserMessage.mediaData ? '사진을 보냈습니다.' : ''),
      previousUserMessage.mediaData ? '[사용자가 사진을 보냈습니다.]' : ''
    ].filter(Boolean).join('\n');
    onRequestReply(room.id, character.id, promptText, {
      randomMode: isRandomRoom,
      userMessageCreatedAt: previousUserMessage.createdAt,
      latestUserImageData: typeof previousUserMessage.mediaData === 'string' ? previousUserMessage.mediaData : undefined
    });
  }

  async function startMeetingEvent(sessionId: string) {
    await commitCurrent(current => ({
      ...current,
      activeMeetingEventId: sessionId,
      meetingEventSessions: (current.meetingEventSessions || []).map(session => session.id === sessionId ? { ...session, status: 'active' } : session)
    }));
    onOpenMeeting?.(sessionId);
  }

  async function cancelMeetingEvent(sessionId: string, messageId: string) {
    await commitCurrent(current => ({
      ...current,
      meetingEventSessions: (current.meetingEventSessions || []).map(session => session.id === sessionId ? { ...session, status: 'dismissed', endedAt: Date.now() } : session),
      messages: {
        ...current.messages,
        [roomId]: (current.messages[roomId] || []).map(message => message.id === messageId ? {
          ...message,
          content: '만남 이벤트를 취소했습니다.',
          meetingEventPrompt: false,
          meetingEventCancelled: true
        } : message)
      }
    }));
  }

  /** Remove bubble from room history so future context/memory prompts cannot see it. */
  async function deleteMessage(messageId: string) {
    if (!roomId || !messageId) return;
    await commitCurrent(current => {
      const roomList = current.messages[roomId] || [];
      const target = roomList.find(item => item.id === messageId);
      if (!target) return current;
      const meetingId = String(target.meetingEventId || '');
      return {
        ...current,
        messages: {
          ...current.messages,
          [roomId]: roomList.filter(item => item.id !== messageId)
        },
        // Drop dismissed/pending prompt sessions only tied to this deleted card.
        meetingEventSessions: meetingId
          ? (current.meetingEventSessions || []).filter(session => {
            if (session.id !== meetingId) return true;
            // Keep active/ended live sessions; remove orphan pending prompt shells.
            return session.status === 'active' || session.status === 'ended';
          })
          : current.meetingEventSessions
      };
    });
  }

  function openImageRetryEditor(message: SNSGodMessage) {
    if (!room || !character || !message.imagePrompt || regeneratingImageId) return;
    setImageRetryDraft({
      messageId: message.id,
      prompt: imagePromptWithoutCharacterName(String(message.imagePrompt || ''), character)
    });
  }

  async function submitImageRetryPrompt() {
    if (!room || !character || !imageRetryDraft || regeneratingImageId) return;
    const prompt = imagePromptWithoutCharacterName(imageRetryDraft.prompt, character);
    if (!prompt) {
      Alert.alert('프롬프트 필요', '수정할 이미지 프롬프트를 입력해 주세요.');
      return;
    }
    const targetMessage = messages.find(item => item.id === imageRetryDraft.messageId);
    if (!targetMessage) {
      Alert.alert('이미지 재생성 실패', '재생성할 메시지를 찾지 못했습니다.');
      setImageRetryDraft(null);
      return;
    }
    setRegeneratingImageId(targetMessage.id);
    try {
      const mediaData = await generateImageDataUri(state, prompt, character, {
        referenceImage: characterReferenceImageForPrompt(character, prompt),
        kind: 'general'
      });
      await commitCurrent(current => ({
        ...current,
        messages: {
          ...current.messages,
          [room.id]: (current.messages[room.id] || []).map(item => item.id === targetMessage.id ? {
            ...item,
            imagePrompt: prompt,
            mediaData,
            mediaType: 'image',
            imageCaption: cleanImageFailureCaption(String(item.imageCaption || ''))
          } : item)
        }
      }));
      setImageRetryDraft(null);
    } catch (error) {
      Alert.alert('이미지 재생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setRegeneratingImageId('');
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

  const retryReferencePreview = imageRetryDraft ? characterReferenceImageForPrompt(character, imageRetryDraft.prompt) : undefined;
  const retryFinalPrompt = imageRetryDraft
    ? imagePromptFor(state.config.imageGeneration || {}, character, imageRetryDraft.prompt, { usesReference: Boolean(retryReferencePreview), state })
    : '';

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
        {...listProps}
        inverted={inverted}
        data={listMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        keyboardShouldPersistTaps="handled"
        // inverted: footer = visual top, header = visual bottom (typing near composer)
        ListFooterComponent={room.name !== '기본 채팅' ? <View style={styles.roomNotice}><Text style={styles.roomNoticeText}>{room.name}</Text></View> : null}
        ListHeaderComponent={typing ? <TypingBubble character={character} /> : null}
        renderItem={({ item }) => {
          const meetingSessionId = String(item.meetingEventId || '');
          const messageMeta = messageMetaById.get(item.id);
          const showDateDivider = messageMeta?.showDateDivider ?? false;
          const layout = messageMeta?.layout || chatBubbleLayoutFor(item, messageMeta?.previous, messageMeta?.next);
          return (
            <View>
              {showDateDivider ? <DateDivider timestamp={item.createdAt} /> : null}
              <MessageBubble message={item} layout={layout} character={character} userStickers={state.userStickers || []} roomId={room.id} meetingSession={meetingSessionId ? (state.meetingEventSessions || []).find(session => session.id === meetingSessionId) : undefined} meetingStatus={meetingSessionId ? meetingStatusById.get(meetingSessionId) : undefined} onOpenCall={onOpenCall} onStartMeeting={startMeetingEvent} onCancelMeeting={cancelMeetingEvent} onRejectCall={rejectCall} onRetryFailed={retryFailedReply} onOpenImage={setViewerImage} onRetryImage={openImageRetryEditor} regeneratingImageId={regeneratingImageId} onDeleteMessage={deleteMessage} />
            </View>
          );
        }}
      />

      {viewerImage ? <ImageViewer item={viewerImage} onClose={() => setViewerImage(null)} /> : null}
      {imageRetryDraft ? (
        <ImagePromptRetryEditor
          prompt={imageRetryDraft.prompt}
          finalPrompt={retryFinalPrompt}
          busy={Boolean(regeneratingImageId)}
          onChangePrompt={prompt => setImageRetryDraft(current => current ? { ...current, prompt } : current)}
          onCancel={() => setImageRetryDraft(null)}
          onSubmit={submitImageRetryPrompt}
        />
      ) : null}
      {showStickers ? <StickerTray stickers={state.userStickers || []} onPick={sendSticker} /> : null}
      {showQuickActions ? (
        <View pointerEvents="box-none" style={styles.quickActionLayer}>
          <Pressable accessibilityLabel="빠른 액션 닫기" onPress={() => setShowQuickActions(false)} style={styles.quickActionBackdrop} />
          <View style={styles.quickActionMenu}>
            <Pressable onPress={openCallFromComposer} style={styles.quickActionItem}>
              <Text style={styles.quickActionText}>전화걸기</Text>
            </Pressable>
            <View style={styles.quickActionDivider} />
            <Pressable onPress={requestMeetingPrompt} disabled={requestingMeeting} style={[styles.quickActionItem, requestingMeeting && styles.sendDisabled]}>
              <Text style={styles.quickActionText}>{requestingMeeting ? '준비 중' : '만남이벤트'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable accessibilityLabel="스티커" onPress={() => { setShowQuickActions(false); setShowStickers(value => !value); }} disabled={sending} style={[styles.attachIconButton, sending && styles.sendDisabled]}><Text style={styles.attachIconText}>☺</Text></Pressable>
        {!isRandomRoom ? (
          <Pressable accessibilityLabel="전화와 만남 메뉴" onPress={() => { setShowStickers(false); setShowQuickActions(value => !value); }} disabled={sending || requestingMeeting} style={[styles.attachIconButton, (sending || requestingMeeting) && styles.sendDisabled]}>
            <Text style={styles.attachIconText}>{requestingMeeting ? '…' : '👥'}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel="사진 추가" onPress={() => { setShowQuickActions(false); void attachImage(); }} disabled={sending} style={[styles.attachIconButton, sending && styles.sendDisabled]}><Text style={styles.attachIconText}>+</Text></Pressable>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={updateComposerText}
          style={styles.composerInput}
          placeholder="메시지 입력"
          placeholderTextColor="#9b9b9b"
          multiline
          submitBehavior="newline"
          blurOnSubmit={false}
          onKeyPress={event => {
            if (!isComposerSendEnter(event)) return;
            if (typeof event.preventDefault === 'function') event.preventDefault();
            void send();
          }}
        />
        <Pressable onPress={() => { void send(); }} style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]} disabled={!text.trim() || sending}>
          <Text style={styles.sendText}>전송</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function DateDivider({ timestamp }: { timestamp: number }) {
  return (
    <View style={styles.dateDivider}>
      <Text style={styles.dateDividerText}>{formatMessageDateLabel(timestamp)}</Text>
    </View>
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

function collectRoomImages(messages: SNSGodMessage[], characterName: string): RoomImageItem[] {
  return messages
    .filter(message => isRenderableMediaUri(message.mediaData))
    .map(message => ({
      id: message.id,
      uri: String(message.mediaData || ''),
      title: message.role === 'user' ? '내가 보낸 사진' : `${characterName}의 사진`,
      prompt: String(message.imagePrompt || '').trim(),
      caption: cleanImageFailureCaption(String(message.imageCaption || '')).trim(),
      createdAt: Number(message.createdAt || 0)
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function cleanImageFailureCaption(value: string): string {
  return String(value || '')
    .split('\n')
    .filter(line => !/이미지\s*생성\s*실패/i.test(line))
    .join('\n')
    .trim();
}

function hasImageGenerationFailure(message: SNSGodMessage): boolean {
  return Boolean(message.imagePrompt && !message.mediaData && /이미지\s*생성\s*실패/i.test(String(message.imageCaption || '')));
}

function imageItemFromMessage(message: SNSGodMessage, characterName: string): RoomImageItem | undefined {
  if (!isRenderableMediaUri(message.mediaData)) return undefined;
  return {
    id: message.id,
    uri: String(message.mediaData || ''),
    title: message.role === 'user' ? '내가 보낸 사진' : `${characterName}의 사진`,
    prompt: String(message.imagePrompt || '').trim(),
    caption: cleanImageFailureCaption(String(message.imageCaption || '')).trim(),
    createdAt: Number(message.createdAt || 0)
  };
}

function RoomAlbum({ images, characterName, onClose, onOpenImage }: {
  images: RoomImageItem[];
  characterName: string;
  onClose: () => void;
  onOpenImage: (item: RoomImageItem) => void;
}) {
  return (
    <View style={styles.albumPanel}>
      <View style={styles.albumHeader}>
        <View>
          <Text style={styles.albumTitle}>{characterName} 앨범</Text>
          <Text style={styles.albumSubtitle}>{images.length}장</Text>
        </View>
        <Pressable onPress={onClose} style={styles.albumClose}><Text style={styles.albumCloseText}>닫기</Text></Pressable>
      </View>
      {images.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumStrip}>
          {images.map(item => (
            <Pressable key={item.id} onPress={() => onOpenImage(item)} style={styles.albumTile}>
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.albumEmpty}>이 채팅방에 저장된 사진이 없습니다.</Text>
      )}
    </View>
  );
}

function ImageViewer({ item, onClose }: { item: RoomImageItem; onClose: () => void }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const prompt = item.prompt || '프롬프트 없음';
  return (
    <View style={styles.viewerOverlay}>
      <View style={styles.viewerHeader}>
        <View style={styles.viewerTitleBlock}>
          <Text style={styles.viewerTitle}>{item.title}</Text>
          <Text style={styles.viewerSubtitle}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
      </View>
      <Image source={{ uri: item.uri }} style={styles.viewerImage} resizeMode="contain" />
      {item.caption ? <Text style={styles.viewerCaption}>{item.caption}</Text> : null}
      <Pressable onPress={() => setPromptOpen(value => !value)} style={styles.viewerPromptToggle}>
        <Text style={styles.viewerPromptToggleText}>{promptOpen ? '프롬프트 접기' : '프롬프트 보기'}</Text>
      </Pressable>
      {promptOpen ? (
        <ScrollView style={styles.viewerPromptBox} contentContainerStyle={styles.viewerPromptContent}>
          <Text style={styles.viewerPromptText}>{prompt}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function ImagePromptRetryEditor({ prompt, finalPrompt, busy, onChangePrompt, onCancel, onSubmit }: {
  prompt: string;
  finalPrompt: string;
  busy: boolean;
  onChangePrompt: (prompt: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.promptEditorOverlay}>
      <View style={styles.promptEditorPanel}>
        <Text style={styles.promptEditorTitle}>이미지 프롬프트 수정</Text>
        <Text style={styles.promptEditorHelp}>원하는 장면, 분위기, 구도, 의상을 더 구체적으로 적은 뒤 다시 생성하세요.</Text>
        <TextInput
          value={prompt}
          onChangeText={onChangePrompt}
          style={styles.promptEditorInput}
          multiline
          editable={!busy}
          textAlignVertical="top"
          placeholder="이미지 프롬프트"
          placeholderTextColor="#8a8174"
        />
        <Text style={styles.promptEditorFinalLabel}>최종 전송 프롬프트</Text>
        <ScrollView style={styles.promptEditorFinalBox} contentContainerStyle={styles.promptEditorFinalContent}>
          <Text selectable style={styles.promptEditorFinalText}>{finalPrompt || '프롬프트 없음'}</Text>
        </ScrollView>
        <View style={styles.promptEditorActions}>
          <Pressable onPress={onCancel} disabled={busy} style={[styles.promptEditorSecondary, busy && styles.sendDisabled]}>
            <Text style={styles.promptEditorSecondaryText}>취소</Text>
          </Pressable>
          <Pressable onPress={onSubmit} disabled={busy || !prompt.trim()} style={[styles.promptEditorPrimary, (busy || !prompt.trim()) && styles.sendDisabled]}>
            {busy ? <ActivityIndicator color="#241a00" size="small" /> : <Text style={styles.promptEditorPrimaryText}>생성</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message, layout, character, userStickers, roomId, meetingSession, meetingStatus, onOpenCall, onStartMeeting, onCancelMeeting, onRejectCall, onRetryFailed, onOpenImage, onRetryImage, regeneratingImageId, onDeleteMessage }: {
  message: SNSGodMessage;
  layout: ChatBubbleLayout;
  character: NonNullable<ReturnType<typeof findCharacter>>;
  userStickers: Sticker[];
  roomId: string;
  meetingSession?: MeetingEventSession;
  meetingStatus?: string;
  onOpenCall?: (characterId: string, roomId?: string, messageId?: string) => void;
  onStartMeeting?: (sessionId: string) => void;
  onCancelMeeting?: (sessionId: string, messageId: string) => void;
  onRejectCall?: (message: SNSGodMessage) => void;
  onRetryFailed?: (message: SNSGodMessage) => void;
  onOpenImage?: (item: RoomImageItem) => void;
  onRetryImage?: (message: SNSGodMessage) => void;
  regeneratingImageId?: string;
  onDeleteMessage?: (messageId: string) => void;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MessageActionAnchor | null>(null);
  const bubbleRef = useRef<View>(null);
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const sticker = message.sticker ? (mine ? userStickers : character.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  const copyValue = [
    message.content,
    message.imageCaption,
    message.phoneSummaryContext ? `통화 요약: ${message.phoneSummaryContext}` : '',
    message.callTitle ? String(message.callTitle) : '',
    message.callLine ? String(message.callLine) : ''
  ].filter(Boolean).join('\n').trim();
  const imageItem = imageItemFromMessage(message, character.name);
  const imageFailed = hasImageGenerationFailure(message);
  const regenerating = regeneratingImageId === message.id;

  function openMessageMenu() {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  }

  async function copyMessageText() {
    if (!copyValue) {
      Alert.alert('복사', '복사할 텍스트가 없습니다.');
      return;
    }
    try {
      if (!TermuxBridge) throw new Error('클립보드 브릿지가 준비되지 않았습니다.');
      await TermuxBridge.copyText(copyValue);
      Alert.alert('복사 완료', '말풍선 텍스트를 복사했습니다.');
    } catch (error) {
      Alert.alert('복사 실패', error instanceof Error ? error.message : String(error));
    }
  }

  function deleteMessage() {
    onDeleteMessage?.(message.id);
  }

  const actionMenu = (
    <MessageActionMenu
      visible={menuOpen}
      anchor={menuAnchor}
      align={system ? 'center' : mine ? 'right' : 'left'}
      onCopy={() => { void copyMessageText(); }}
      onInfo={message.generationInfo ? () => Alert.alert(
        '생성 정보',
        [
          'API: ' + (message.generationInfo?.provider || '-'),
          '모델: ' + (message.generationInfo?.model || '-'),
          '방식: ' + (message.generationInfo?.mode || '-'),
          message.generationInfo?.proactiveStage ? '선톡 단계: ' + message.generationInfo.proactiveStage : '',
          message.generationInfo?.generatedAt ? '생성 시각: ' + new Date(message.generationInfo.generatedAt).toLocaleString() : ''
        ].filter(Boolean).join(String.fromCharCode(10))
      ) : undefined}
      onDelete={deleteMessage}
      onClose={() => {
        setMenuOpen(false);
        setMenuAnchor(null);
      }}
    />
  );

  if (system) {
    const meetingSessionId = String(message.meetingEventId || '');
    const pendingMeeting = Boolean(message.meetingEventPrompt && meetingSessionId && meetingStatus === 'pending');
    return (
      <View ref={bubbleRef} collapsable={false} style={[styles.bubbleAnchor, styles.systemAnchor]}>
        {actionMenu}
        <Pressable
          onPress={() => menuOpen && setMenuOpen(false)}
          onLongPress={openMessageMenu}
          delayLongPress={380}
          style={styles.systemBubble}
        >
          {pendingMeeting && meetingSession ? <MeetingPromptPreview session={meetingSession} character={character} /> : null}
          <Text style={[styles.systemText, pendingMeeting && styles.meetingSystemText]}>{message.content}</Text>
          {pendingMeeting ? (
            <View style={styles.meetingActions}>
              <Pressable onPress={() => onStartMeeting?.(meetingSessionId)} style={styles.meetingPrimary}>
                <Text style={styles.meetingPrimaryText}>이벤트</Text>
              </Pressable>
              <Pressable onPress={() => onCancelMeeting?.(meetingSessionId, message.id)} style={styles.meetingSecondary}>
                <Text style={styles.meetingSecondaryText}>취소</Text>
              </Pressable>
            </View>
          ) : null}
          {message.failed ? (
            <Pressable accessibilityLabel="답장 재생성" onPress={() => onRetryFailed?.(message)} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>!</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </View>
    );
  }

  const bubbleShape = [
    styles.bubble,
    mine ? styles.myBubble : styles.theirBubble,
    mine
      ? (layout.clusterStart ? styles.myBubbleStart : styles.myBubbleFollow)
      : (layout.clusterStart ? styles.theirBubbleStart : styles.theirBubbleFollow)
  ];

  return (
    <View style={[
      styles.messageRow,
      mine && styles.messageRowMine,
      layout.tightTop ? styles.messageRowTight : styles.messageRowLoose
    ]}>
      {!mine ? (
        layout.showAvatar
          ? <Avatar character={character} size={32} />
          : <View style={styles.avatarSpacer} />
      ) : null}
      {mine && (layout.showTime || layout.showRead) ? (
        <View style={styles.messageMeta}>
          {layout.showRead ? <Text style={styles.readOne}>1</Text> : null}
          {layout.showTime ? <Text style={styles.messageTime}>{formatMessageTime(message.createdAt)}</Text> : null}
        </View>
      ) : null}
      <View ref={bubbleRef} collapsable={false} style={styles.bubbleAnchor}>
        {actionMenu}
        <Pressable
          onPress={() => menuOpen && setMenuOpen(false)}
          onLongPress={openMessageMenu}
          delayLongPress={380}
          style={bubbleShape}
        >
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
              <Pressable onPress={() => imageItem && onOpenImage?.(imageItem)}>
                <Image source={{ uri: message.mediaData }} style={styles.messageImage} resizeMode="cover" />
              </Pressable>
              {message.imagePrompt ? (
                <Pressable accessibilityLabel={promptOpen ? '이미지 프롬프트 접기' : '이미지 프롬프트 펼치기'} onPress={() => setPromptOpen(value => !value)} style={styles.promptToggle}>
                  <Text style={styles.promptToggleText}>{promptOpen ? '⌃' : '⌄'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {message.imagePrompt && promptOpen ? <Text style={styles.imageHint}>이미지 프롬프트: {message.imagePrompt}</Text> : null}
          {message.imageCaption ? <Text style={styles.imageHint}>{message.imageCaption}</Text> : null}
          {message.phoneLog || message.phoneSummaryContext ? (
            <Text style={styles.imageHint}>
              {[message.phoneLog ? `통화 기록 · ${String(message.phoneLog)}` : '', message.phoneSummaryContext ? String(message.phoneSummaryContext) : ''].filter(Boolean).join('\n')}
            </Text>
          ) : null}
          {imageFailed ? (
            <Pressable accessibilityLabel="이미지 재생성" onPress={() => onRetryImage?.(message)} disabled={regenerating} style={[styles.imageRetryButton, regenerating && styles.sendDisabled]}>
              {regenerating ? <ActivityIndicator color="#073d24" size="small" /> : <Text style={styles.imageRetryButtonText}>↻</Text>}
            </Pressable>
          ) : null}
        </Pressable>
      </View>
      {!mine && layout.showTime ? <Text style={styles.messageTime}>{formatMessageTime(message.createdAt)}</Text> : null}
    </View>
  );
}

function MeetingPromptPreview({ session, character }: { session: MeetingEventSession; character: NonNullable<ReturnType<typeof findCharacter>> }) {
  const location = session.location || '만남 장소';
  const mood = session.mood || '첫 만남 분위기';
  const summary = String(session.seedSummary || session.reason || mood).replace(/\s+/g, ' ').trim();
  const fallbackImage = [
    character.profileImage,
    character.profileReferenceImage,
    ...(Array.isArray(character.profileReferenceImages) ? character.profileReferenceImages : []),
    character.avatar
  ].map(value => String(value || '')).find(isRenderableMediaUri);
  const previewImage = isRenderableMediaUri(session.stillImage) ? String(session.stillImage) : fallbackImage;
  return (
    <View style={styles.meetingPreview}>
      {previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.meetingPreviewImage} resizeMode="cover" />
      ) : (
        <View style={styles.meetingPreviewFallback}>
          <View style={styles.meetingPreviewSky}>
            <View style={styles.meetingPreviewSun} />
            <View style={styles.meetingPreviewWindow} />
          </View>
          <View style={styles.meetingPreviewGround}>
            <View style={styles.meetingPreviewPerson}><Text style={styles.meetingPreviewPersonText}>나</Text></View>
            <View style={styles.meetingPreviewTable} />
            <View style={[styles.meetingPreviewPerson, styles.meetingPreviewCharacter]}><Text style={styles.meetingPreviewPersonText}>{character.name.slice(0, 1)}</Text></View>
          </View>
        </View>
      )}
      <View style={styles.meetingPreviewText}>
        <Text style={styles.meetingPreviewTitle} numberOfLines={1}>{location}</Text>
        <Text style={styles.meetingPreviewMood} numberOfLines={2}>{summary || mood}</Text>
      </View>
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
  // Kakao-like density: tight clusters, modest list padding.
  messages: { flexGrow: 1, paddingHorizontal: 8, paddingVertical: 6 },
  dateDivider: { alignSelf: 'center', marginVertical: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(94,109,126,0.26)' },
  dateDividerText: { color: '#425163', fontSize: 11, lineHeight: 14, fontWeight: '600' },
  roomNotice: { alignSelf: 'center', maxWidth: '88%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  roomNoticeText: { color: '#4f5a62', fontSize: 12, fontWeight: '700' },
  bubbleAnchor: { position: 'relative', zIndex: 1, maxWidth: '72%' },
  systemAnchor: { maxWidth: '88%', alignSelf: 'center' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 2 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTight: { marginTop: 2, marginBottom: 1 },
  messageRowLoose: { marginTop: 8, marginBottom: 2 },
  avatarSpacer: { width: 32, height: 1 },
  messageMeta: { minWidth: 36, maxWidth: 52, alignItems: 'flex-end', justifyContent: 'flex-end', gap: 1, marginBottom: 1 },
  messageTime: { color: 'rgba(48,68,90,0.72)', fontSize: 10, fontWeight: '500', marginHorizontal: 2 },
  bubble: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 7 },
  theirBubble: { backgroundColor: '#fff' },
  myBubble: { backgroundColor: '#fee500' },
  // Kakao-ish cluster corners: first bubble of a run has a sharper “tail” corner.
  theirBubbleStart: { borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  theirBubbleFollow: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  myBubbleStart: { borderTopLeftRadius: 14, borderTopRightRadius: 5, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  myBubbleFollow: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  bubbleText: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: '#191919' },
  myText: { color: '#191919' },
  stickerText: { marginTop: 4, color: '#6c4f00', fontWeight: '700', fontSize: 13 },
  stickerImage: { marginTop: 6, width: 120, height: 120, borderRadius: 10 },
  readOne: { color: '#b8860b', fontSize: 10, fontWeight: '700', lineHeight: 12 },
  typingBubble: { minWidth: 52, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  typingDots: { color: '#656565', fontWeight: '700', fontSize: 18, lineHeight: 20 },
  messageImageWrap: { marginTop: 8, position: 'relative', alignSelf: 'flex-start' },
  messageImage: { width: 210, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#eee' },
  promptToggle: { position: 'absolute', right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(86,92,99,0.78)' },
  promptToggleText: { color: '#e5e7eb', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  imageHint: { marginTop: 6, fontSize: 12, color: colors.sub },
  imageRetryButton: { marginTop: 7, alignSelf: 'flex-start', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#dcfce7' },
  imageRetryButtonText: { color: '#073d24', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  callCard: { minWidth: 190, gap: 6 },
  callTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  callBody: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  callActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  callButton: { flex: 1, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27313b' },
  callRejectButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5c6b1' },
  callButtonText: { color: '#fff', fontWeight: '900' },
  callRejectText: { color: colors.text, fontWeight: '900' },
  callStatus: { marginTop: 4, color: colors.sub, fontSize: 12, fontWeight: '900' },
  systemBubble: { alignSelf: 'center', maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.45)', position: 'relative' },
  systemText: { color: '#4f5a62', fontSize: 12, fontWeight: '700' },
  meetingSystemText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  meetingPreview: { width: 236, maxWidth: '100%', marginBottom: 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#26313c', borderWidth: 1, borderColor: '#d8cbb9' },
  meetingPreviewImage: { width: '100%', height: 132, backgroundColor: '#e8dfd0' },
  meetingPreviewFallback: { height: 132, backgroundColor: '#26313c' },
  meetingPreviewSky: { flex: 1, backgroundColor: '#405a6c', position: 'relative' },
  meetingPreviewSun: { position: 'absolute', right: 16, top: 13, width: 24, height: 24, borderRadius: 12, backgroundColor: '#f1d15b' },
  meetingPreviewWindow: { position: 'absolute', left: 18, top: 18, width: 48, height: 34, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)' },
  meetingPreviewGround: { height: 54, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14, paddingBottom: 12, backgroundColor: '#26313c' },
  meetingPreviewPerson: { width: 36, height: 52, borderTopLeftRadius: 18, borderTopRightRadius: 18, alignItems: 'center', paddingTop: 5, backgroundColor: '#edf2f6' },
  meetingPreviewCharacter: { backgroundColor: '#f1d15b' },
  meetingPreviewPersonText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  meetingPreviewTable: { width: 52, height: 24, borderRadius: 12, backgroundColor: '#fffdf7' },
  meetingPreviewText: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fffdf7' },
  meetingPreviewTitle: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meetingPreviewMood: { marginTop: 2, color: colors.sub, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  meetingActions: { marginTop: 9, flexDirection: 'row', gap: 8, minWidth: 210 },
  meetingPrimary: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  meetingPrimaryText: { color: '#241a00', fontWeight: '900' },
  meetingSecondary: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  meetingSecondaryText: { color: colors.text, fontWeight: '900' },
  retryButton: { position: 'absolute', right: -8, top: -8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, borderWidth: 2, borderColor: '#fff' },
  retryButtonText: { color: '#fff', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  albumPanel: { maxHeight: 168, paddingTop: 10, paddingBottom: 10, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  albumHeader: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  albumTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  albumSubtitle: { marginTop: 1, color: colors.sub, fontSize: 11, fontWeight: '800' },
  albumClose: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  albumCloseText: { color: colors.text, fontWeight: '900' },
  albumStrip: { paddingHorizontal: 12, paddingTop: 9, gap: 8 },
  albumTile: { width: 82, height: 82, borderRadius: 8, overflow: 'hidden', backgroundColor: '#e8dfd0', borderWidth: 1, borderColor: '#d9cbb8' },
  albumEmpty: { paddingHorizontal: 12, paddingTop: 12, color: colors.sub, fontWeight: '800' },
  viewerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, backgroundColor: '#101214', padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerTitleBlock: { flex: 1, minWidth: 0 },
  viewerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  viewerSubtitle: { marginTop: 2, color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800' },
  viewerClose: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center' },
  viewerCloseText: { color: '#111', fontWeight: '900' },
  viewerImage: { width: '100%', flex: 1, borderRadius: 8, backgroundColor: '#050607' },
  viewerCaption: { marginTop: 9, color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  viewerPromptToggle: { marginTop: 10, minHeight: 40, borderRadius: 20, backgroundColor: '#f7f2e9', alignItems: 'center', justifyContent: 'center' },
  viewerPromptToggleText: { color: colors.text, fontWeight: '900' },
  viewerPromptBox: { marginTop: 8, maxHeight: 132, borderRadius: 8, backgroundColor: '#f7f2e9' },
  viewerPromptContent: { padding: 10 },
  viewerPromptText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  promptEditorOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 35, backgroundColor: 'rgba(17,18,20,0.54)', padding: 14, justifyContent: 'center' },
  promptEditorPanel: { borderRadius: 18, padding: 14, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  promptEditorTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  promptEditorHelp: { marginTop: 5, color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  promptEditorInput: { marginTop: 12, minHeight: 132, maxHeight: 220, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', color: colors.text, fontSize: 14, lineHeight: 20 },
  promptEditorFinalLabel: { marginTop: 10, color: colors.text, fontSize: 12, fontWeight: '900' },
  promptEditorFinalBox: { marginTop: 6, maxHeight: 128, borderRadius: 10, borderWidth: 1, borderColor: '#d8cbb9', backgroundColor: '#eee8dc' },
  promptEditorFinalContent: { paddingHorizontal: 10, paddingVertical: 8 },
  promptEditorFinalText: { color: '#4a4338', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  promptEditorActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  promptEditorSecondary: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  promptEditorSecondaryText: { color: colors.text, fontWeight: '900' },
  promptEditorPrimary: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  promptEditorPrimaryText: { color: '#241a00', fontWeight: '900' },
  quickActionLayer: { ...StyleSheet.absoluteFillObject, zIndex: 26 },
  quickActionBackdrop: { ...StyleSheet.absoluteFillObject },
  quickActionMenu: { position: 'absolute', left: 58, bottom: 64, minWidth: 118, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fffdf7', borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  quickActionItem: { minHeight: 42, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  quickActionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerTray: { maxHeight: 144, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#f7f2e9', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stickerTrayItem: { width: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', padding: 6, alignItems: 'center' },
  stickerThumb: { width: 48, height: 48, borderRadius: 8 },
  stickerThumbText: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', textAlign: 'center', lineHeight: 48, backgroundColor: '#eee8dc', color: colors.text, fontWeight: '900' },
  stickerTrayName: { marginTop: 4, color: colors.sub, fontSize: 11, fontWeight: '800' },
  emptyStickerText: { color: colors.sub, fontWeight: '800', padding: 8 },
  attachIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  attachIconText: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 112, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: '#fff', color: colors.text, fontSize: 16 },
  sendButton: { minWidth: 64, minHeight: 42, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#241a00', fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { fontSize: 16, color: colors.text, fontWeight: '800' },
  emptyButton: { marginTop: 14, paddingHorizontal: 16, height: 42, borderRadius: 8, backgroundColor: colors.accent, justifyContent: 'center' },
  emptyButtonText: { color: '#241a00', fontWeight: '900' }
});
