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

test('Android chat screens resize above the software keyboard while iOS keeps padding behavior', () => {
  for (const [name, source] of chatScreens) {
    assert.match(
      source,
      /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/,
      `${name} 화면은 Android height 키보드 회피 동작을 사용해야 합니다.`,
    );
    assert.match(
      source,
      /keyboardVerticalOffset=\{0\}/,
      `${name} 화면은 루트 SafeAreaView 기준 오프셋을 명시해야 합니다.`,
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
