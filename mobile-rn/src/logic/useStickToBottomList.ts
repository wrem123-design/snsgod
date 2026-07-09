import { useCallback, useEffect, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** inverted list: contentOffset.y ≈ 0 means visual bottom (latest). */
const NEAR_BOTTOM_PX = 72;

/**
 * KakaoTalk-style chat stickiness for an *inverted* FlatList.
 *
 * - Room enter: list already opens at latest (offset 0). No staircase scroll.
 * - Send / new bubble while pinned: one silent jump to offset 0.
 * - Never animates. Never chains onContentSizeChange scrolls.
 */
export function useStickToBottomList<T>(deps: {
  roomKey: string;
  messageCount: number;
  footerSignal?: number | boolean;
}) {
  const listRef = useRef<FlatList<T>>(null);
  const stickToBottomRef = useRef(true);
  const pinGenerationRef = useRef(0);
  const lastRoomKeyRef = useRef(deps.roomKey);

  const pinToBottom = useCallback((options?: { force?: boolean }) => {
    if (!options?.force && !stickToBottomRef.current) return;
    stickToBottomRef.current = true;
    const generation = ++pinGenerationRef.current;
    // Coalesce to a single frame — avoids the old multi-step staircase.
    requestAnimationFrame(() => {
      if (generation !== pinGenerationRef.current) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    stickToBottomRef.current = y <= NEAR_BOTTOM_PX;
  }, []);

  // Room change: mark pinned. Inverted lists already show newest at offset 0,
  // so we only do one quiet settle after first paint (for long histories).
  useEffect(() => {
    const roomChanged = lastRoomKeyRef.current !== deps.roomKey;
    lastRoomKeyRef.current = deps.roomKey;
    stickToBottomRef.current = true;
    if (!roomChanged && deps.messageCount === 0) return;
    const t = setTimeout(() => {
      pinToBottom({ force: true });
    }, 16);
    return () => clearTimeout(t);
  }, [deps.roomKey, pinToBottom]);

  // New messages / typing footer: one pin only while user is still at bottom.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    pinToBottom();
  }, [deps.messageCount, deps.footerSignal, pinToBottom]);

  // Intentionally no-op: content-size thrashing was the staircase.
  const onContentSizeChange = useCallback((_w: number, _h: number) => {}, []);
  const onLayout = useCallback(() => {}, []);

  return {
    listRef,
    onScroll,
    onContentSizeChange,
    onLayout,
    pinToBottom: () => pinToBottom({ force: true }),
    /** Screens should pass this to FlatList. */
    inverted: true as const
  };
}

/** Newest-first copy for inverted chat lists. */
export function reverseMessagesForInvertedList<T>(messages: T[]): T[] {
  if (!messages.length) return messages;
  return messages.slice().reverse();
}
