import { useCallback, useEffect, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** inverted list: contentOffset.y ≈ 0 is the visual bottom (latest). */
const NEAR_BOTTOM_PX = 64;

/**
 * KakaoTalk-style chat list using an *inverted* FlatList.
 *
 * Why inverted:
 * - Newest item is at offset 0 (visual bottom).
 * - Sending / receiving a bubble does NOT need scrollToEnd — the list
 *   stays put and only the new row appears, instead of thrashing the viewport.
 *
 * Room enter still does a silent pin to offset 0 once layout is ready.
 */
export function useStickToBottomList<T>(deps: {
  roomKey: string;
  messageCount: number;
  footerSignal?: number | boolean;
}) {
  const listRef = useRef<FlatList<T>>(null);
  const stickToBottomRef = useRef(true);
  const pinGenerationRef = useRef(0);
  const settleUntilRef = useRef(0);
  const lastRoomKeyRef = useRef(deps.roomKey);
  const lastMessageCountRef = useRef(deps.messageCount);

  const pinToBottom = useCallback((options?: { force?: boolean }) => {
    if (!options?.force && !stickToBottomRef.current) return;
    stickToBottomRef.current = true;
    const generation = ++pinGenerationRef.current;
    requestAnimationFrame(() => {
      if (generation !== pinGenerationRef.current) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Ignore intermediate offsets while we settle after opening a room.
    if (Date.now() < settleUntilRef.current) {
      stickToBottomRef.current = true;
      return;
    }
    const y = event.nativeEvent.contentOffset.y;
    stickToBottomRef.current = y <= NEAR_BOTTOM_PX;
  }, []);

  // Room enter only — one quiet settle, not a multi-step staircase.
  useEffect(() => {
    const roomChanged = lastRoomKeyRef.current !== deps.roomKey;
    lastRoomKeyRef.current = deps.roomKey;
    lastMessageCountRef.current = deps.messageCount;
    stickToBottomRef.current = true;
    if (!roomChanged) return;
    settleUntilRef.current = Date.now() + 350;
    pinToBottom({ force: true });
    const t = setTimeout(() => pinToBottom({ force: true }), 80);
    return () => clearTimeout(t);
  }, [deps.roomKey, pinToBottom]);

  // New messages / typing while inverted:
  // Do NOT call scroll APIs. Newest row is index 0 (visual bottom), so the
  // viewport stays put and only the new bubble appears — like KakaoTalk.
  // Calling scrollToOffset here was what made every send feel like a jump.
  useEffect(() => {
    lastMessageCountRef.current = deps.messageCount;
  }, [deps.messageCount, deps.footerSignal]);

  // No content-size auto-scroll: image loads used to bounce the whole screen.
  const onContentSizeChange = useCallback((_w: number, _h: number) => {}, []);
  const onLayout = useCallback(() => {
    // First layout of a room: ensure we open at the latest bubble.
    if (Date.now() < settleUntilRef.current && stickToBottomRef.current) {
      pinToBottom({ force: true });
    }
  }, [pinToBottom]);

  return {
    listRef,
    onScroll,
    onContentSizeChange,
    onLayout,
    pinToBottom: () => pinToBottom({ force: true }),
    inverted: true as const,
    listProps: {
      // Clipping + inverted often mis-reports initial offset on Android.
      removeClippedSubviews: false as const,
      initialNumToRender: 24,
      maxToRenderPerBatch: 16,
      windowSize: 10,
      style: { flex: 1 } as const
    }
  };
}

/** Newest-first copy for inverted chat lists (visual bottom = latest). */
export function reverseMessagesForInvertedList<T>(messages: T[]): T[] {
  if (!messages.length) return messages;
  return messages.slice().reverse();
}
