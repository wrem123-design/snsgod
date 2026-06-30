import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSGodMessage, SNSGodState, Sticker } from '../types';
import { makeId } from '../logic/ids';
import { appendMessage, findCharacter, findRoom, roomMessages } from '../logic/stateHelpers';
import { isRenderableMediaUri, pickImageDataUri } from '../logic/media';
import { formatMessageTime } from '../logic/time';
import { markRoomRead } from '../logic/notifications';
import { generateImageDataUri, imagePromptFor, imagePromptWithoutCharacterName } from '../logic/api';
import { characterReferenceImageForPrompt } from '../logic/imageReference';

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

export function ChatRoomScreen({ state, roomId, onBack, onChange, onCommitCurrent, onOpenRoomSettings, onOpenCharacterSettings, onOpenProfile, randomMode, onLeaveRandomRoom, onPromoteRandomRoom, onOpenCall, onRequestReply }: {
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
  onRequestReply: (roomId: string, characterId: string, latestUserInput: string, options?: { randomMode?: boolean; userMessageCreatedAt?: number }) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [viewerImage, setViewerImage] = useState<RoomImageItem | null>(null);
  const [regeneratingImageId, setRegeneratingImageId] = useState('');
  const [imageRetryDraft, setImageRetryDraft] = useState<{ messageId: string; prompt: string } | null>(null);
  const listRef = useRef<FlatList<SNSGodMessage>>(null);
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const isRandomRoom = randomMode || room?.type === 'random';
  const messages = useMemo(() => roomMessages(state, roomId), [state, roomId]);
  const pendingReplyPhase = state.pendingReplies?.[roomId]?.phase;
  const typing = pendingReplyPhase === 'typing' || pendingReplyPhase === 'generating';

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    scrollToLatest(false);
    if ((state.unreadCounts[roomId] || 0) > 0 || (state.notifications || []).some(item => !item.read && (item.roomId === roomId || item.target?.roomId === roomId))) {
      void commitCurrent(current => markRoomRead(current, roomId));
    }
  }, [roomId]);

  useEffect(() => {
    scrollToLatest(true);
  }, [messages.length, typing]);

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
    const content = text.trim();
    if (!content || !room || !character || sending) return;
    setText('');
    setSending(true);
    const userMessage: SNSGodMessage = { id: makeId('msg'), role: 'user', content, createdAt: Date.now() };
    await commitCurrent(current => {
      const next = appendMessage(current, room.id, userMessage);
      return { ...next, unreadCounts: { ...next.unreadCounts, [room.id]: 0 } };
    });
    setSending(false);
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
      onRequestReply(room.id, character.id, `${content}\n[사용자가 사진을 보냈습니다.]`, { randomMode: isRandomRoom, userMessageCreatedAt: userMessage.createdAt });
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
    onRequestReply(room.id, character.id, `[스티커: ${sticker.name || sticker.id}]`, { randomMode: isRandomRoom, userMessageCreatedAt: userMessage.createdAt });
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
    onRequestReply(room.id, character.id, promptText, { randomMode: isRandomRoom, userMessageCreatedAt: previousUserMessage.createdAt });
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
    ? imagePromptFor(state.config.imageGeneration || {}, character, imageRetryDraft.prompt, { usesReference: Boolean(retryReferencePreview) })
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
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollToLatest(false)}
        onLayout={() => scrollToLatest(false)}
        ListHeaderComponent={room.name !== '기본 채팅' ? <View style={styles.roomNotice}><Text style={styles.roomNoticeText}>{room.name}</Text></View> : null}
        renderItem={({ item }) => <MessageBubble message={item} character={character} userStickers={state.userStickers || []} roomId={room.id} onOpenCall={onOpenCall} onRejectCall={rejectCall} onRetryFailed={retryFailedReply} onOpenImage={setViewerImage} onRetryImage={openImageRetryEditor} regeneratingImageId={regeneratingImageId} />}
        ListFooterComponent={typing ? <TypingBubble character={character} /> : null}
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
        <Text style={styles.promptEditorHelp}>검열로 거부된 표현을 순화하거나 구체적인 장면으로 바꾼 뒤 다시 생성하세요.</Text>
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

function MessageBubble({ message, character, userStickers, roomId, onOpenCall, onRejectCall, onRetryFailed, onOpenImage, onRetryImage, regeneratingImageId }: {
  message: SNSGodMessage;
  character: NonNullable<ReturnType<typeof findCharacter>>;
  userStickers: Sticker[];
  roomId: string;
  onOpenCall?: (characterId: string, roomId?: string, messageId?: string) => void;
  onRejectCall?: (message: SNSGodMessage) => void;
  onRetryFailed?: (message: SNSGodMessage) => void;
  onOpenImage?: (item: RoomImageItem) => void;
  onRetryImage?: (message: SNSGodMessage) => void;
  regeneratingImageId?: string;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const mine = message.role === 'user';
  const system = message.role === 'system';
  const sticker = message.sticker ? (mine ? userStickers : character.stickers || []).find(item => String(item.id) === String(message.sticker)) : undefined;
  const copyValue = [message.content, message.imageCaption].filter(Boolean).join('\n').trim();
  const imageItem = imageItemFromMessage(message, character.name);
  const imageFailed = hasImageGenerationFailure(message);
  const regenerating = regeneratingImageId === message.id;
  async function copyMessageText() {
    if (!copyValue) return;
    try {
      if (!TermuxBridge) throw new Error('클립보드 브릿지가 준비되지 않았습니다.');
      await TermuxBridge.copyText(copyValue);
      Alert.alert('복사 완료', '말풍선 텍스트를 복사했습니다.');
    } catch (error) {
      Alert.alert('복사 실패', error instanceof Error ? error.message : String(error));
    }
  }
  if (system) {
    return (
      <Pressable onLongPress={copyMessageText} delayLongPress={380} style={styles.systemBubble}>
        <Text style={styles.systemText}>{message.content}</Text>
        {message.failed ? (
          <Pressable accessibilityLabel="답장 재생성" onPress={() => onRetryFailed?.(message)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>!</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
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
      <Pressable onLongPress={copyMessageText} delayLongPress={380} style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
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
        {imageFailed ? (
          <Pressable accessibilityLabel="이미지 재생성" onPress={() => onRetryImage?.(message)} disabled={regenerating} style={[styles.imageRetryButton, regenerating && styles.sendDisabled]}>
            {regenerating ? <ActivityIndicator color="#073d24" size="small" /> : <Text style={styles.imageRetryButtonText}>↻</Text>}
          </Pressable>
        ) : null}
      </Pressable>
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
