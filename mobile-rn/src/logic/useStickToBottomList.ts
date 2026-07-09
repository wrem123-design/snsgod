import { useCallback, useEffect, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const NEAR_BOTTOM_PX = 96;

/**
 * Keeps a chat FlatList pinned to the latest message without fighting the user
 * or double-firing scrollToEnd (which causes intermittent up/down jitter).
 */
export function useStickToBottomList<T>(deps: {
  roomKey: string;
  messageCount: number;
  footerSignal?: number | boolean;
}) {
  const listRef = useRef<FlatList<T>>(null);
  const stickToBottomRef = useRef(true);
  const scrollingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastOffsetRef = useRef({ y: 0, contentH: 0, layoutH: 0 });

  const isNearBottom = useCallback((event?: {
    contentOffsetY: number;
    contentHeight: number;
    layoutHeight: number;
  }) => {
    const y = event?.contentOffsetY ?? lastOffsetRef.current.y;
    const contentH = event?.contentHeight ?? lastOffsetRef.current.contentH;
    const layoutH = event?.layoutHeight ?? lastOffsetRef.current.layoutH;
    if (contentH <= 0 || layoutH <= 0) return true;
    const distance = contentH - layoutH - y;
    return distance <= NEAR_BOTTOM_PX;
  }, []);

  const scrollToLatest = useCallback((options?: { force?: boolean; animated?: boolean }) => {
    if (!options?.force && !stickToBottomRef.current) return;
    if (scrollingRef.current) {
      pendingRef.current = true;
      return;
    }
    scrollingRef.current = true;
    pendingRef.current = false;
    const animated = options?.animated === true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      // Allow layout to settle before accepting another programmatic scroll.
      setTimeout(() => {
        scrollingRef.current = false;
        if (pendingRef.current && stickToBottomRef.current) {
          pendingRef.current = false;
          scrollToLatest({ force: true, animated: false });
        }
      }, 80);
    });
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    lastOffsetRef.current = {
      y: contentOffset.y,
      contentH: contentSize.height,
      layoutH: layoutMeasurement.height
    };
    // Ignore feedback while we are programmatically scrolling.
    if (scrollingRef.current) return;
    stickToBottomRef.current = isNearBottom({
      contentOffsetY: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height
    });
  }, [isNearBottom]);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    lastOffsetRef.current.contentH = h;
    if (stickToBottomRef.current) {
      scrollToLatest({ force: true, animated: false });
    }
  }, [scrollToLatest]);

  const onLayout = useCallback(() => {
    if (stickToBottomRef.current) {
      scrollToLatest({ force: true, animated: false });
    }
  }, [scrollToLatest]);

  // Enter room: pin to bottom once.
  useEffect(() => {
    stickToBottomRef.current = true;
    scrollToLatest({ force: true, animated: false });
  }, [deps.roomKey, scrollToLatest]);

  // New messages / typing footer: only follow if still pinned.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollToLatest({ force: true, animated: false });
  }, [deps.messageCount, deps.footerSignal, scrollToLatest]);

  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    scrollToLatest({ force: true, animated: false });
  }, [scrollToLatest]);

  return {
    listRef,
    onScroll,
    onContentSizeChange,
    onLayout,
    pinToBottom,
    scrollToLatest
  };
}
