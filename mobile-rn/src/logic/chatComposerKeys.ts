import type { RefObject } from 'react';
import { NativeSyntheticEvent, TextInput, TextInputKeyPressEventData } from 'react-native';

type KeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>;

/**
 * PC / hardware keyboard:
 * - Enter → send
 * - Shift+Enter → newline (default multiline behavior)
 */
export function isComposerSendEnter(event: KeyPressEvent): boolean {
  const key = String(event.nativeEvent.key || '');
  if (key !== 'Enter' && key !== 'NumpadEnter') return false;
  return event.nativeEvent.shiftKey !== true;
}

/**
 * Tracks residual TextInput updates after Enter-to-send.
 * Android/RN often re-applies previous text (+ trailing "\\n") after setText('').
 * When React state is already '', setText('') alone does not re-render, so the
 * native field can keep residual text unless setNativeProps clears it too.
 */
export type ComposerSendGuard = {
  /** Call immediately before clearing the composer on send. */
  arm: (sentRawText: string) => void;
  /** Filter onChangeText values; returns the text that should remain in the box. */
  filterChange: (next: string) => string;
  /** Whether residual suppression is currently active. */
  isArmed: () => boolean;
};

export function createComposerSendGuard(): ComposerSendGuard {
  let armedUntil = 0;
  let sentRaw = '';

  return {
    arm(sentRawText: string) {
      sentRaw = String(sentRawText || '');
      // Native Enter/newline can arrive after a short delay on slow devices.
      armedUntil = Date.now() + 800;
    },
    isArmed() {
      return Date.now() <= armedUntil;
    },
    filterChange(next: string) {
      if (Date.now() > armedUntil) return next;
      const normalized = next.replace(/\r\n/g, '\n');
      const sent = sentRaw.replace(/\r\n/g, '\n');
      // Empty, only newline(s), or re-applied sent text (+ optional trailing newlines).
      if (!normalized.trim()) return '';
      if (normalized === sent || normalized === `${sent}\n` || normalized === `${sent}\n\n`) return '';
      if (normalized.trimEnd() === sent.trimEnd()) return '';
      // Prefix residual: "안녕" + newline variants the IME may insert.
      if (sent && (normalized === `${sent.trim()}\n` || normalized.startsWith(sent) && !normalized.slice(sent.length).trim())) {
        return '';
      }
      // User started typing something new — stop suppressing.
      armedUntil = 0;
      return next;
    }
  };
}

/** Clear controlled composer state and force native TextInput to match. */
export function clearComposerInput(
  inputRef: RefObject<TextInput | null>,
  textRef: { current: string },
  setText: (value: string) => void
) {
  textRef.current = '';
  setText('');
  // Controlled value may already be '' when residual arrives; force native clear.
  inputRef.current?.setNativeProps({ text: '' });
  // Second pass after the Enter newline is applied by the native layer.
  requestAnimationFrame(() => {
    if (!textRef.current) {
      inputRef.current?.setNativeProps({ text: '' });
    }
  });
  setTimeout(() => {
    if (!textRef.current) {
      inputRef.current?.setNativeProps({ text: '' });
    }
  }, 50);
}
