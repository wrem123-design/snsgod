import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const callScreen = readFileSync(new URL('../src/screens/CallScreen.tsx', import.meta.url), 'utf8');
const meetingScreen = readFileSync(new URL('../src/screens/MeetingEventScreen.tsx', import.meta.url), 'utf8');
const meetingLogic = readFileSync(new URL('../src/logic/meetingEvent.ts', import.meta.url), 'utf8');
const chatRoom = readFileSync(new URL('../src/screens/ChatRoomScreen.tsx', import.meta.url), 'utf8');
const groupRoom = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');

test('app background and cold-start routing preserve paused interaction pointers', () => {
  assert.match(app, /pauseActiveInteractions\(current\)/);
  assert.match(app, /resumePointedInteractions\(current\)/);
  assert.match(app, /session\.status !== 'active' && session\.status !== 'paused'/);
  assert.match(app, /state\?\.activeCallSessionId/);
  assert.match(app, /normalizePersistedInteractionLifecycles/);
});

test('calls persist restorable turn state and separate pause, cancel, and finish', () => {
  for (const field of ['lines', 'pages', 'pageIndex', 'choices', 'uiMode', 'allowDirectReply', 'turnCount']) {
    assert.match(callScreen, new RegExp(`${field}:`));
  }
  assert.match(callScreen, /status: hasConnected \? 'paused' : 'cancelled'/);
  assert.match(callScreen, /status: 'finished'/);
  assert.doesNotMatch(callScreen, /void persistSession\(/);
  assert.match(callScreen, /await persistSession\(\{ lines: next, phase: 'user_sending'/);
  assert.match(callScreen, /options\.keepPointer === true && session\.status !== 'paused'/);
  assert.match(callScreen, /if \(endingRef\.current\) return;/);
  assert.match(callScreen, /call_log:\$\{claimed\.id\}/);
  assert.match(callScreen, /phone_log:\$\{claimed\.id\}/);
  assert.match(chatRoom, /통화 이어가기/);
});

test('private and group meetings share pause-resume controls and one-shot finish receipts', () => {
  assert.match(meetingScreen, /transitionInteractionLifecycle\(current, 'paused'\)/);
  assert.match(meetingScreen, /session\.status === 'paused' \|\| session\.resumeDisplayText/);
  assert.match(meetingScreen, /if \(endingRef\.current\) return;/);
  assert.match(chatRoom, /meetingStatus === 'pending' \|\| meetingStatus === 'paused'/);
  assert.match(groupRoom, /meetingStatus === 'pending' \|\| meetingStatus === 'paused'/);
  assert.match(meetingLogic, /session\.status === 'finished' && session\.resultAppliedAt/);
  assert.match(meetingLogic, /claimExistingMeetingResult\(state, session\)/);
  assert.match(meetingLogic, /appendMeetingMessageOnce/);
  assert.match(meetingLogic, /meeting_result:\$\{session\.id\}/);
  assert.match(meetingLogic, /meeting_followup:\$\{session\.id\}/);
});
