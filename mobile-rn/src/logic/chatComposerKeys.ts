import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

type KeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>;

/**
 * PC / hardware keyboard:
 * - Enter → send
 * - Shift+Enter → newline (default multiline behavior)
 *
 * When Enter-send still inserts a trailing newline on some Android keyboards,
 * strip it in onChangeText via the returned flag.
 */
export function isComposerSendEnter(event: KeyPressEvent): boolean {
  const key = String(event.nativeEvent.key || '');
  if (key !== 'Enter' && key !== 'NumpadEnter') return false;
  return event.nativeEvent.shiftKey !== true;
}

export function stripAccidentalSendNewline(previous: string, next: string): string {
  // Enter-to-send sometimes appends "\n" after we already decided to send.
  if (next === `${previous}\n` || next === `${previous}\r\n`) return previous;
  if (next.endsWith('\n') && next.slice(0, -1) === previous) return previous;
  return next;
}
