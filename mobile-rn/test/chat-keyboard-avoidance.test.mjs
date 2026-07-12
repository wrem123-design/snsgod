import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chatRoom = readFileSync(new URL('../src/screens/ChatRoomScreen.tsx', import.meta.url), 'utf8');
const groupRoom = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const stickToBottom = readFileSync(new URL('../src/logic/useStickToBottomList.ts', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

const chatScreens = [
  ['일반·랜덤 채팅', chatRoom],
  ['단체 채팅', groupRoom],
];

test('chat screens pad above the full Galaxy IME including its toolbar', () => {
  for (const [name, source] of chatScreens) {
    assert.match(
      source,
      /behavior="padding"/,
      `${name} 화면은 Galaxy IME 툴바까지 composer 아래 padding으로 회피해야 합니다.`,
    );
    assert.match(
      source,
      /keyboardVerticalOffset=\{Platform\.OS === 'android' \? 56 : 0\}/,
      `${name} 화면은 Galaxy IME 툴바 높이까지 포함한 Android 오프셋을 적용해야 합니다.`,
    );
  }
});

test('composer focus keeps the latest message visible without overriding scrolled history', () => {
  assert.match(stickToBottom, /pinToBottomIfNeeded: \(\) => pinToBottom\(\)/);
  for (const [name, source] of chatScreens) {
    assert.match(
      source,
      /onFocus=\{pinToBottomIfNeeded\}/,
      `${name} 입력창은 현재 최신 위치에 있을 때만 하단을 다시 맞춰야 합니다.`,
    );
  }
});

test('Android activity remains configured for native window resizing', () => {
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
});
