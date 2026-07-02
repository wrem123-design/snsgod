import React, { useEffect, useRef, useState } from 'react';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import { ActivityIndicator, Alert, AppState, BackHandler, DevSettings, Keyboard, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ChatListScreen } from './screens/ChatListScreen';
import { ChatRoomScreen } from './screens/ChatRoomScreen';
import { CharacterSettingsScreen } from './screens/CharacterSettingsScreen';
import { NewCharacterScreen } from './screens/NewCharacterScreen';
import { NewRoomScreen } from './screens/NewRoomScreen';
import { RoomSettingsScreen } from './screens/RoomSettingsScreen';
import { LorebookScreen } from './screens/LorebookScreen';
import { SNSScreen } from './screens/SNSScreen';
import { RandomChatScreen } from './screens/RandomChatScreen';
import { SumGodScreen } from './screens/SumGodScreen';
import { BlindDateScreen } from './screens/BlindDateScreen';
import { IdealWorldcupScreen } from './screens/IdealWorldcupScreen';
import { ReferenceFaceScreen } from './screens/ReferenceFaceScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CallScreen } from './screens/CallScreen';
import { MeetingEventScreen } from './screens/MeetingEventScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { NewGroupRoomScreen } from './screens/NewGroupRoomScreen';
import { GroupChatRoomScreen } from './screens/GroupChatRoomScreen';
import { GroupRoomSettingsScreen } from './screens/GroupRoomSettingsScreen';
import { PromptSettingsScreen } from './screens/PromptSettingsScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { DebugScreen } from './screens/DebugScreen';
import { BottomNav, BottomTab } from './components/BottomNav';
import { Avatar } from './components/Avatar';
import { MenuHubScreen } from './screens/MenuHubScreen';
import { flushSaveState, getStoragePaths, loadState, recordSkippedSaveBeforeHydration, saveStateDebounced, SaveStateOptions } from './storage/persist';
import { colors } from './theme';
import { SNSGodCharacter, SNSGodState, SNSPost } from './types';
import { isAutomationQueueBusy, runAutomationQueueTick } from './logic/automationQueue';
import { appendDebugLog } from './logic/debugLog';
import { findRandomChat, promoteRandomChatRoom, removeRandomChatRoom } from './logic/randomChat';
import { allRooms, deleteCharacter, findCharacter } from './logic/stateHelpers';
import { roomRouteKind } from './logic/roomStore';
import { IncomingPhoneCall, markPhoneCardStatus, missIncomingPhoneCall, newestPendingPhoneCandidate, rejectIncomingPhoneCall } from './logic/phone';
import { markRoomRead, pushNotification } from './logic/notifications';
import { startReplyJob } from './logic/replyEngine';
import { createManualMeetingEventPrompt, createMeetingEventSession, shouldStartMeetingEvent } from './logic/meetingEvent';
import { forceUpdateRoomMemory } from './logic/memoryBridge';

const INTERRUPTED_REPLY_RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Route =
  | { name: 'chatList' }
  | { name: 'settings' }
  | { name: 'chatRoom'; roomId: string }
  | { name: 'roomSettings'; roomId: string; returnRoomId: string }
  | { name: 'characterSettings'; characterId: string; returnRoomId?: string }
  | { name: 'newRoom' }
  | { name: 'newGroupRoom' }
  | { name: 'newCharacter' }
  | { name: 'groupChatRoom'; roomId: string }
  | { name: 'groupRoomSettings'; roomId: string; returnRoomId: string }
  | { name: 'lorebook' }
  | { name: 'prompts' }
  | { name: 'sns'; platform: SNSPost['platform'] }
  | { name: 'randomHub' }
  | { name: 'etc' }
  | { name: 'gallery' }
  | { name: 'debug' }
  | { name: 'random' }
  | { name: 'randomChatRoom'; roomId: string }
  | { name: 'sumgod' }
  | { name: 'streetEncounter' }
  | { name: 'blindDate' }
  | { name: 'idealWorldcup' }
  | { name: 'references' }
  | { name: 'profile'; characterId: string; returnRoomId?: string }
  | { name: 'call'; characterId: string; roomId?: string; sourceMessageId?: string; returnRoute?: Route }
  | { name: 'meeting'; sessionId: string; returnRoute?: Route }
  | { name: 'notifications' };

type CommitOptions = {
  persist?: boolean;
  save?: SaveStateOptions;
};

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'chatList' });
  const [state, setState] = useState<SNSGodState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingPhoneCall | null>(null);
  const [runtimeReloadNonce, setRuntimeReloadNonce] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const stateRef = useRef<SNSGodState | null>(null);
  const routeRef = useRef<Route>(route);
  const routeHistoryRef = useRef<Route[]>([]);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  function clearRuntimeOnlyState(next: SNSGodState): SNSGodState {
    return { ...next, pendingReplies: {} };
  }

  function sameRoute(a: Route, b: Route): boolean {
    if (a.name !== b.name) return false;
    if ('roomId' in a || 'roomId' in b) return ('roomId' in a ? a.roomId : undefined) === ('roomId' in b ? b.roomId : undefined);
    if ('platform' in a || 'platform' in b) return ('platform' in a ? a.platform : undefined) === ('platform' in b ? b.platform : undefined);
    if ('characterId' in a || 'characterId' in b) return ('characterId' in a ? a.characterId : undefined) === ('characterId' in b ? b.characterId : undefined);
    if ('sessionId' in a || 'sessionId' in b) return ('sessionId' in a ? a.sessionId : undefined) === ('sessionId' in b ? b.sessionId : undefined);
    return true;
  }

  function navigate(next: Route, options?: { replace?: boolean }) {
    setRoute(current => {
      if (!options?.replace && !sameRoute(current, next)) {
        routeHistoryRef.current = [...routeHistoryRef.current, current].slice(-60);
      }
      return next;
    });
  }

  function goBack(fallback: Route = { name: 'chatList' }) {
    setRoute(() => routeHistoryRef.current.pop() || fallback);
  }

  useEffect(() => {
    const storagePaths = getStoragePaths();
    console.log('[SNSGod storage identity]', {
      applicationId: Application.applicationId,
      nativeApplicationVersion: Application.nativeApplicationVersion,
      nativeBuildVersion: Application.nativeBuildVersion,
      documentDirectory: FileSystem.documentDirectory,
      ...storagePaths
    });
    void appendDebugLog('storage.identity', `applicationId=${Application.applicationId || 'unknown'} version=${Application.nativeApplicationVersion || 'unknown'} build=${Application.nativeBuildVersion || 'unknown'} documentDirectory=${FileSystem.documentDirectory || 'unknown'} sqlite=${storagePaths.sqliteDatabaseName} asyncKey=${storagePaths.asyncStorageKey} media=${storagePaths.mediaDirectory} backup=${storagePaths.backupDirectory}`);
    loadState().then(next => {
      const ready = clearRuntimeOnlyState(next);
      setState(ready);
      stateRef.current = ready;
      hydratedRef.current = true;
      setHydrated(true);
      void appendDebugLog('app', `state loaded: characters=${next.characters.length}, rooms=${Object.values(next.chatRooms).flat().length}`);
      setTimeout(() => resumeInterruptedReplies(ready), 0);
    }).catch(error => {
      void appendDebugLog('app', `start failed: ${String(error?.message || error)}`, 'error');
      Alert.alert('시작 실패', String(error?.message || error));
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'chatList') return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [route]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') return;
      const current = stateRef.current;
      if (current) {
        const summarized = summarizeRoomsBeforeFlush(current);
        const snapshot = summarized === current ? current : withNextRevision(summarized, current);
        stateRef.current = snapshot;
        setState(snapshot);
        void flushSaveState(snapshot, { backup: 'force', verify: 'full', reason: 'app background' });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!state || incomingCall || route.name === 'call' || route.name === 'meeting') return;
    const candidate = newestPendingPhoneCandidate(state);
    if (!candidate) return;
    setIncomingCall(candidate);
    const currentMessage = state.messages[candidate.roomId]?.find(message => message.id === candidate.messageId);
    if (currentMessage?.callStatus !== 'ringing') {
      void commit(markPhoneCardStatus(state, candidate.roomId, candidate.messageId, 'ringing'));
    }
  }, [state, incomingCall, route.name]);

  useEffect(() => {
    if (!state?.activeMeetingEventId || route.name === 'meeting' || route.name === 'call') return;
    const session = (state.meetingEventSessions || []).find(item => item.id === state.activeMeetingEventId);
    if (!session || session.status !== 'active') return;
    navigate({ name: 'meeting', sessionId: session.id, returnRoute: routeRef.current });
  }, [state?.activeMeetingEventId, route.name]);

  useEffect(() => {
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    if (!incomingCall) return;
    incomingTimerRef.current = setTimeout(async () => {
      const current = stateRef.current;
      if (!current) return;
      await commit(missIncomingPhoneCall(current, incomingCall));
      setIncomingCall(null);
    }, 15000);
    return () => {
      if (incomingTimerRef.current) {
        clearTimeout(incomingTimerRef.current);
        incomingTimerRef.current = null;
      }
    };
  }, [incomingCall]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const current = stateRef.current;
      if (!current || isAutomationQueueBusy()) return;
      const profile = current.config.apiProfiles[current.config.apiType] || {};
      const hasKey = current.config.apiType === 'vertex'
        ? Boolean(String(profile.serviceAccountJson || '').trim())
        : Boolean(profile.apiKey || profile.apiKeys?.some(Boolean));
      if (!hasKey) return;
      try {
        const next = await runAutomationQueueTick(current);
        if (next !== current) {
          const latest = stateRef.current;
          await commit(latest && latest !== current ? mergeAutomationResult(latest, current, next) : next);
        }
      } catch (error) {
        void appendDebugLog('automation', String(error instanceof Error ? error.message : error), 'warn');
        // Automation failures should not interrupt active use; manual chat still reports errors.
      }
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  function visibleRoomIdForRoute(currentRoute: Route): string | undefined {
    if (currentRoute.name === 'chatRoom' || currentRoute.name === 'groupChatRoom' || currentRoute.name === 'randomChatRoom') return currentRoute.roomId;
    return undefined;
  }

  function summarizeRoomsBeforeFlush(current: SNSGodState): SNSGodState {
    return Object.keys(current.messages || {}).reduce((next, roomId) => forceUpdateRoomMemory(next, roomId), current);
  }

  type Identified = { id?: unknown };

  function sameSnapshot(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  function mergeIdentifiedArray<T extends Identified>(latest: T[] = [], base: T[] = [], next: T[] = []): T[] {
    const latestIds = new Set(latest.map(item => String(item.id || '')));
    const baseIds = new Set(base.map(item => String(item.id || '')));
    const additions = next.filter(item => {
      const id = String(item.id || '');
      return id && !baseIds.has(id) && !latestIds.has(id);
    });
    return additions.length ? [...latest, ...additions] : latest;
  }

  function mergeChangedById<T extends Identified>(latest: T[] = [], base: T[] = [], next: T[] = []): T[] {
    let changed = false;
    const baseById = new Map(base.map(item => [String(item.id || ''), item]));
    const nextById = new Map(next.map(item => [String(item.id || ''), item]));
    const merged = latest.map(item => {
      const id = String(item.id || '');
      const nextItem = nextById.get(id);
      if (!nextItem || sameSnapshot(nextItem, baseById.get(id))) return item;
      if (!sameSnapshot(item, baseById.get(id))) return item;
      changed = true;
      return nextItem;
    });
    for (const item of next) {
      const id = String(item.id || '');
      if (id && !merged.some(existing => String(existing.id || '') === id)) {
        merged.push(item);
        changed = true;
      }
    }
    return changed ? merged : latest;
  }

  function mergeAutomationResult(latest: SNSGodState, base: SNSGodState, next: SNSGodState): SNSGodState {
    const messages = { ...latest.messages };
    for (const [roomId, nextMessages] of Object.entries(next.messages || {})) {
      const merged = mergeIdentifiedArray(messages[roomId] || [], base.messages?.[roomId] || [], nextMessages || []);
      if (merged !== messages[roomId]) messages[roomId] = merged;
    }
    const unreadCounts = { ...(latest.unreadCounts || {}) };
    for (const [roomId, count] of Object.entries(next.unreadCounts || {})) {
      unreadCounts[roomId] = Math.max(Number(unreadCounts[roomId] || 0), Number(count || 0));
    }
    return {
      ...latest,
      messages,
      unreadCounts,
      characters: mergeChangedById(latest.characters, base.characters, next.characters),
      groupRooms: mergeChangedById(latest.groupRooms || [], base.groupRooms || [], next.groupRooms || []),
      randomChats: mergeChangedById(latest.randomChats || [], base.randomChats || [], next.randomChats || []),
      snsPosts: mergeIdentifiedArray(latest.snsPosts || [], base.snsPosts || [], next.snsPosts || []),
      snsDmThreads: mergeIdentifiedArray(latest.snsDmThreads || [], base.snsDmThreads || [], next.snsDmThreads || []),
      notifications: mergeIdentifiedArray(latest.notifications || [], base.notifications || [], next.notifications || []).slice(0, 100),
      callLogs: mergeIdentifiedArray(
        (Array.isArray(latest.callLogs) ? latest.callLogs : []) as Identified[],
        (Array.isArray(base.callLogs) ? base.callLogs : []) as Identified[],
        (Array.isArray(next.callLogs) ? next.callLogs : []) as Identified[]
      ).slice(0, 100),
      __randomFirstSent: { ...((latest.__randomFirstSent || {}) as Record<string, unknown>), ...((next.__randomFirstSent || {}) as Record<string, unknown>) },
      __calendarSent: { ...((latest.__calendarSent || {}) as Record<string, unknown>), ...((next.__calendarSent || {}) as Record<string, unknown>) },
      __phoneInviteAt: { ...((latest.__phoneInviteAt || {}) as Record<string, unknown>), ...((next.__phoneInviteAt || {}) as Record<string, unknown>) },
      __phoneGlobalInviteAt: next.__phoneGlobalInviteAt || latest.__phoneGlobalInviteAt
    };
  }

  function withUnreadForNewMessages(previous: SNSGodState | null, next: SNSGodState, visibleRoomId?: string): SNSGodState {
    if (!previous) return next;
    let result = next;
    const unreadCounts = { ...(next.unreadCounts || {}) };
    let changed = false;
    for (const [roomId, messages] of Object.entries(next.messages || {})) {
      const previousIds = new Set((previous.messages?.[roomId] || []).map(message => message.id));
      const incoming = messages.filter(message =>
        !previousIds.has(message.id)
        && message.role === 'character'
        && (message.content?.trim() || message.mediaData || message.sticker || message.callInvite || message.phoneLog)
      );
      if (!incoming.length) continue;
      if (roomId === visibleRoomId) {
        result = markRoomRead(result, roomId);
        if (unreadCounts[roomId]) {
          unreadCounts[roomId] = 0;
          changed = true;
        }
        continue;
      }
      const minimum = (previous.unreadCounts?.[roomId] || 0) + incoming.length;
      if ((unreadCounts[roomId] || 0) < minimum) {
        unreadCounts[roomId] = minimum;
        changed = true;
      }
      const latestIncoming = incoming[incoming.length - 1];
      const character = next.characters.find(item => item.id === latestIncoming.characterId);
      const isRandomRoom = (next.randomChats || []).some(room => room.id === roomId);
      result = pushNotification(result, {
        type: isRandomRoom ? 'randomchat' : 'chat',
        title: character?.name || '새 메시지',
        body: latestIncoming.content || latestIncoming.imageCaption || (latestIncoming.mediaData ? '사진' : latestIncoming.sticker ? '스티커' : '새 메시지'),
        app: isRandomRoom ? 'randomchat' : 'messenger',
        roomId,
        characterId: latestIncoming.characterId,
        target: { app: isRandomRoom ? 'randomchat' : 'messenger', roomId, characterId: latestIncoming.characterId },
        collapseKey: `room:${roomId}`
      });
      changed = true;
    }
    return changed ? { ...result, unreadCounts } : result;
  }

  function withNextRevision(next: SNSGodState, previous: SNSGodState | null): SNSGodState {
    const previousRevision = Number(previous?.__revision || 0);
    const incomingRevision = Number(next.__revision || 0);
    return {
      ...next,
      __revision: Math.max(previousRevision, incomingRevision) + 1
    };
  }

  async function commit(next: SNSGodState, options: CommitOptions = {}) {
    if (options.persist === false) {
      setState(next);
      stateRef.current = next;
      return;
    }
    const previous = stateRef.current;
    const committed = withNextRevision(withUnreadForNewMessages(previous, next, visibleRoomIdForRoute(routeRef.current)), previous);
    setState(committed);
    stateRef.current = committed;
    if (!hydratedRef.current) {
      recordSkippedSaveBeforeHydration();
      void appendDebugLog('storage', 'skip save before hydration', 'warn');
      return;
    }
    saveStateDebounced(committed, options.save);
  }

  async function commitCurrent(patch: (current: SNSGodState) => SNSGodState, options?: CommitOptions) {
    const current = stateRef.current;
    if (!current) return;
    const next = patch(current);
    await commit(next, options);
  }

  async function commitCurrentForScreen(patch: (current: SNSGodState) => SNSGodState) {
    await commitCurrent(patch);
    return stateRef.current || undefined;
  }

  async function commitAndFlush(next: SNSGodState) {
    await commit(next, { save: { important: true, reason: 'important screen change' } });
    await flushSaveState(stateRef.current || next, { backup: 'force', verify: 'full', important: true, reason: 'important screen flush' });
  }

  function requestReply(roomId: string, characterId: string, latestUserInput: string, options?: { randomMode?: boolean; userMessageCreatedAt?: number; latestUserImageData?: string }) {
    void startReplyJob({
      roomId,
      characterId,
      latestUserInput,
      latestUserImageData: options?.latestUserImageData,
      userMessageCreatedAt: options?.userMessageCreatedAt,
      randomMode: options?.randomMode,
      getState: () => stateRef.current,
      commitCurrent
    });
  }

  async function maybeStartMeetingEvent(roomId: string, latestUserInput: string): Promise<boolean> {
    const current = stateRef.current;
    if (!current) return false;
    const room = allRooms(current).find(item => item.id === roomId);
    if (!room || room.type === 'random') return false;
    if ((current.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active'))) return false;
    const result = await shouldStartMeetingEvent(current, roomId, latestUserInput);
    if (!result.shouldStart) return false;
    const latest = stateRef.current || current;
    const next = await createMeetingEventSession(latest, roomId, result);
    await commit(next);
    return true;
  }

  async function requestManualMeetingEvent(roomId: string): Promise<boolean> {
    const current = stateRef.current;
    if (!current) return false;
    const room = allRooms(current).find(item => item.id === roomId);
    if (!room || room.type === 'random') return false;
    if ((current.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active'))) return true;
    const next = await createManualMeetingEventPrompt(current, roomId);
    if (next === current) return false;
    await commit(next);
    return true;
  }

  function resumeInterruptedReplies(snapshot: SNSGodState) {
    const now = Date.now();
    for (const room of allRooms(snapshot)) {
      if (snapshot.pendingReplies?.[room.id]) continue;
      const messages = snapshot.messages[room.id] || [];
      const userIndex = [...messages].map((message, index) => ({ message, index })).reverse().find(item => item.message.role === 'user')?.index ?? -1;
      if (userIndex < 0) continue;
      const userMessage = messages[userIndex];
      if (userMessage.readAt || now - Number(userMessage.createdAt || 0) > INTERRUPTED_REPLY_RECOVERY_WINDOW_MS) continue;
      const newerMessages = messages.slice(userIndex + 1);
      if (newerMessages.some(message => message.role === 'character' || (message.role === 'system' && message.failed))) continue;
      const character = findCharacter(snapshot, room.characterId);
      if (!character || character.enabled === false) continue;
      const promptText = [
        userMessage.content || (userMessage.mediaData ? '사진을 보냈습니다.' : ''),
        userMessage.mediaData ? '[사용자가 사진을 보냈습니다.]' : '',
        userMessage.sticker ? `[스티커: ${userMessage.sticker}]` : ''
      ].filter(Boolean).join('\n');
      if (!promptText) continue;
      void appendDebugLog('reply.recover', `resume room=${room.id} character=${character.id} message=${userMessage.id}`);
      requestReply(room.id, character.id, promptText, {
        randomMode: room.type === 'random',
        userMessageCreatedAt: userMessage.createdAt,
        latestUserImageData: typeof userMessage.mediaData === 'string' ? userMessage.mediaData : undefined
      });
    }
  }

  async function reloadSavedState() {
    const current = stateRef.current;
    if (current) await flushSaveState(current, { backup: 'force', verify: 'full', reason: 'reload saved state' });
    const next = clearRuntimeOnlyState(await loadState());
    setState(next);
    stateRef.current = next;
    void appendDebugLog('debug', `saved state reloaded: characters=${next.characters.length}`);
  }

  async function reloadBundle() {
    void appendDebugLog('debug', 'JS bundle reload requested');
    const current = stateRef.current;
    if (current) await flushSaveState(current, { backup: 'force', verify: 'full', reason: 'reload bundle' });
    try {
      DevSettings.reload();
    } catch (error) {
      void appendDebugLog('debug', `DevSettings reload unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
    const next = clearRuntimeOnlyState(await loadState());
    routeHistoryRef.current = [];
    setIncomingCall(null);
    setRoute({ name: 'chatList' });
    setState(next);
    stateRef.current = next;
    setRuntimeReloadNonce(value => value + 1);
    void appendDebugLog('debug', `runtime fallback reload completed: characters=${next.characters.length}`);
  }

  function openCharacterChat(character: SNSGodCharacter) {
    const room = stateRef.current?.chatRooms[character.id]?.[0];
    if (room) navigate({ name: 'chatRoom', roomId: room.id });
    else navigate({ name: 'newRoom' });
  }

  function openBottomTab(tab: BottomTab) {
    if (tab === 'friends') navigate({ name: 'chatList' });
    if (tab === 'instagram') navigate({ name: 'sns', platform: 'instagram' });
    if (tab === 'twitter') navigate({ name: 'sns', platform: 'twitter' });
    if (tab === 'random') navigate({ name: 'random' });
    if (tab === 'etc') navigate({ name: 'etc' });
  }

  function activeBottomTab(): BottomTab {
    if (route.name === 'sns') return route.platform === 'twitter' ? 'twitter' : 'instagram';
    if (route.name === 'random' || route.name === 'randomHub' || route.name === 'randomChatRoom') return 'random';
    if (route.name === 'etc' || route.name === 'streetEncounter' || route.name === 'sumgod' || route.name === 'gallery' || route.name === 'debug' || route.name === 'notifications' || route.name === 'references') return 'etc';
    return 'friends';
  }

  const showBottomNav = route.name === 'chatList' || route.name === 'sns' || route.name === 'random' || route.name === 'etc' || route.name === 'streetEncounter' || route.name === 'sumgod' || route.name === 'gallery' || route.name === 'debug' || route.name === 'references';

  async function leaveRandomRoom(roomId: string) {
    const current = stateRef.current;
    if (!current) return;
    const next = removeRandomChatRoom(current, roomId);
    await commit(next);
    navigate({ name: 'random' }, { replace: true });
  }

  async function promoteRandomRoom(roomId: string) {
    const current = stateRef.current;
    if (!current) return;
    const { next, newRoomId } = promoteRandomChatRoom(current, roomId);
    if (!newRoomId) {
      Alert.alert('승격 실패', '랜덤채팅 방을 찾지 못했습니다.');
      return;
    }
    await commit(next);
    navigate({ name: 'chatRoom', roomId: newRoomId }, { replace: true });
  }

  async function handleDeleteCharacter(characterId: string) {
    const current = stateRef.current;
    if (!current) return;
    const next = deleteCharacter(current, characterId);
    await commit(next);
    routeHistoryRef.current = [];
    navigate({ name: 'chatList' }, { replace: true });
  }

  async function acceptIncomingCall(call: IncomingPhoneCall) {
    const current = stateRef.current;
    if (!current) return;
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    setIncomingCall(null);
    navigate({ name: 'call', characterId: call.characterId, roomId: call.roomId, sourceMessageId: call.messageId, returnRoute: route });
  }

  async function rejectIncomingCall(call: IncomingPhoneCall) {
    const current = stateRef.current;
    if (!current) return;
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    await commit(rejectIncomingPhoneCall(current, call));
    setIncomingCall(null);
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>SNSGod 준비 중</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View key={runtimeReloadNonce} style={styles.content}>
      {route.name === 'settings' ? (
        <SettingsScreen
          state={state}
          onChange={commit}
          onBack={goBack}
          onOpenLorebook={() => navigate({ name: 'lorebook' })}
          onOpenPrompts={() => navigate({ name: 'prompts' })}
          onOpenCharacterSettings={characterId => navigate({ name: 'characterSettings', characterId })}
        />
      ) : route.name === 'lorebook' ? (
        <LorebookScreen state={state} onChange={commit} onBack={goBack} />
      ) : route.name === 'prompts' ? (
        <PromptSettingsScreen state={state} onChange={commit} onBack={goBack} />
      ) : route.name === 'sns' ? (
        <SNSScreen
          state={state}
          platform={route.platform}
          onChange={commit}
          onOpenSettings={() => navigate({ name: 'settings' })}
          onOpenNotifications={() => navigate({ name: 'notifications' })}
        />
      ) : route.name === 'randomHub' || route.name === 'etc' ? (
        <MenuHubScreen
          mode="etc"
          onOpenEncounter={() => navigate({ name: 'streetEncounter' })}
          onOpenBlindDate={() => navigate({ name: 'blindDate' })}
          onOpenIdealWorldcup={() => navigate({ name: 'idealWorldcup' })}
          onOpenReferences={() => navigate({ name: 'references' })}
          onOpenSumGod={() => navigate({ name: 'sumgod' })}
          onOpenGallery={() => navigate({ name: 'gallery' })}
          onOpenNotifications={() => navigate({ name: 'notifications' })}
          onOpenSettings={() => navigate({ name: 'settings' })}
          onOpenDebug={() => navigate({ name: 'debug' })}
        />
      ) : route.name === 'gallery' ? (
        <GalleryScreen state={state} onChange={commit} onBack={goBack} />
      ) : route.name === 'debug' ? (
        <DebugScreen state={state} onBack={goBack} onReloadState={reloadSavedState} onReloadBundle={reloadBundle} onSaveNow={() => flushSaveState(stateRef.current || undefined, { backup: 'force', verify: 'full', reason: 'debug manual save' })} />
      ) : route.name === 'random' ? (
        <RandomChatScreen state={state} onChange={commit} onBack={goBack} onOpenRoom={roomId => navigate({ name: 'randomChatRoom', roomId })} />
      ) : route.name === 'sumgod' ? (
        <SumGodScreen state={state} onChange={commit} onCommitCurrent={commitCurrentForScreen} onBack={goBack} />
      ) : route.name === 'streetEncounter' ? (
        <BlindDateScreen state={state} onChange={commit} onBack={goBack} onOpenRoom={roomId => navigate({ name: 'chatRoom', roomId }, { replace: true })} entryMode="encounter" />
      ) : route.name === 'blindDate' ? (
        <BlindDateScreen state={state} onChange={commit} onBack={goBack} onOpenRoom={roomId => navigate({ name: 'chatRoom', roomId }, { replace: true })} />
      ) : route.name === 'idealWorldcup' ? (
        <IdealWorldcupScreen state={state} onChange={commit} onBack={goBack} onOpenRoom={roomId => navigate({ name: 'chatRoom', roomId }, { replace: true })} />
      ) : route.name === 'references' ? (
        <ReferenceFaceScreen state={state} onChange={commitAndFlush} onBack={goBack} />
      ) : route.name === 'notifications' ? (
        <NotificationsScreen
          state={state}
          onChange={commit}
          onBack={goBack}
          onOpenRoom={roomId => {
            const current = stateRef.current;
            const kind = current ? roomRouteKind(current, roomId) : 'chatRoom';
            navigate({ name: kind, roomId } as Route);
          }}
        />
      ) : route.name === 'profile' ? (
        <ProfileScreen
          state={state}
          characterId={route.characterId}
          roomId={route.returnRoomId}
          onBack={goBack}
          onOpenChat={openCharacterChat}
          onOpenCall={character => navigate({ name: 'call', characterId: character.id, roomId: route.returnRoomId, returnRoute: route })}
          onOpenSettings={character => navigate({ name: 'characterSettings', characterId: character.id, returnRoomId: route.returnRoomId })}
        />
      ) : route.name === 'call' ? (
        <CallScreen state={state} characterId={route.characterId} roomId={route.roomId} sourceMessageId={route.sourceMessageId} onBack={goBack} onChange={commit} onRequestReply={requestReply} />
      ) : route.name === 'meeting' ? (
        <MeetingEventScreen state={state} sessionId={route.sessionId} onBack={goBack} onChange={commit} />
      ) : route.name === 'roomSettings' ? (
        <RoomSettingsScreen state={state} roomId={route.roomId} onChange={commit} onBack={goBack} />
      ) : route.name === 'groupRoomSettings' ? (
        <GroupRoomSettingsScreen state={state} roomId={route.roomId} onChange={commit} onBack={goBack} />
      ) : route.name === 'characterSettings' ? (
        <CharacterSettingsScreen state={state} characterId={route.characterId} onChange={commit} onBack={goBack} onDelete={handleDeleteCharacter} />
      ) : route.name === 'newRoom' ? (
        <NewRoomScreen state={state} onBack={goBack} onCreate={async (next, roomId) => { await commit(next); navigate({ name: 'chatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'newGroupRoom' ? (
        <NewGroupRoomScreen state={state} onBack={goBack} onCreate={async (next, roomId) => { await commit(next); navigate({ name: 'groupChatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'newCharacter' ? (
        <NewCharacterScreen state={state} onBack={goBack} onCreate={async (next, roomId) => { await commit(next); navigate({ name: 'chatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'groupChatRoom' ? (
        <GroupChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commit}
          onCommitCurrent={commitCurrentForScreen}
          onBack={goBack}
          onOpenSettings={roomId => navigate({ name: 'groupRoomSettings', roomId, returnRoomId: route.roomId })}
        />
      ) : route.name === 'chatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commit}
          onCommitCurrent={commitCurrent}
          onBack={goBack}
          onOpenRoomSettings={roomId => navigate({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigate({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigate({ name: 'profile', characterId, returnRoomId: route.roomId })}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigate({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
          onOpenMeeting={sessionId => navigate({ name: 'meeting', sessionId, returnRoute: route })}
          onMaybeStartMeeting={maybeStartMeetingEvent}
          onRequestMeetingPrompt={requestManualMeetingEvent}
          onRequestReply={requestReply}
        />
      ) : route.name === 'randomChatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commit}
          onCommitCurrent={commitCurrent}
          onBack={() => navigate({ name: 'random' })}
          onOpenRoomSettings={roomId => navigate({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigate({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigate({ name: 'profile', characterId, returnRoomId: route.roomId })}
          randomMode
          onLeaveRandomRoom={leaveRandomRoom}
          onPromoteRandomRoom={promoteRandomRoom}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigate({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
          onOpenMeeting={sessionId => navigate({ name: 'meeting', sessionId, returnRoute: route })}
          onMaybeStartMeeting={maybeStartMeetingEvent}
          onRequestMeetingPrompt={requestManualMeetingEvent}
          onRequestReply={requestReply}
        />
      ) : (
        <ChatListScreen
          state={state}
          onOpenSettings={() => navigate({ name: 'settings' })}
          onOpenRoom={roomId => navigate({ name: 'chatRoom', roomId })}
          onNewRoom={() => navigate({ name: 'newRoom' })}
          onNewGroupRoom={() => navigate({ name: 'newGroupRoom' })}
          onNewCharacter={() => navigate({ name: 'newCharacter' })}
          onOpenProfile={characterId => navigate({ name: 'profile', characterId })}
          onOpenNotifications={() => navigate({ name: 'notifications' })}
          onOpenGroupRoom={roomId => navigate({ name: 'groupChatRoom', roomId })}
        />
      )}
      </View>
      {showBottomNav && !keyboardVisible ? <BottomNav active={activeBottomTab()} onSelect={openBottomTab} /> : null}
      {incomingCall ? (
        <IncomingCallOverlay
          state={state}
          incoming={incomingCall}
          onAccept={() => acceptIncomingCall(incomingCall)}
          onReject={() => rejectIncomingCall(incomingCall)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function IncomingCallOverlay({ state, incoming, onAccept, onReject }: {
  state: SNSGodState;
  incoming: IncomingPhoneCall;
  onAccept: () => void;
  onReject: () => void;
}) {
  const character = state.characters.find(item => item.id === incoming.characterId);
  return (
    <View style={styles.incomingOverlay}>
      <View style={styles.incomingPanel}>
        <Text style={styles.incomingKicker}>수신 전화</Text>
        {character ? (
          <View style={styles.incomingAvatarWrap}>
            <Avatar character={character} size={96} />
          </View>
        ) : null}
        <Text style={styles.incomingTitle}>{incoming.title || `${character?.name || '캐릭터'} 전화`}</Text>
        <Text style={styles.incomingLine}>{incoming.line}</Text>
        <View style={styles.incomingActions}>
          <Pressable onPress={onReject} style={[styles.incomingButton, styles.incomingReject]}>
            <Text style={styles.incomingRejectText}>거절</Text>
          </Pressable>
          <Pressable onPress={onAccept} style={[styles.incomingButton, styles.incomingAccept]}>
            <Text style={styles.incomingAcceptText}>받기</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050b16' },
  loadingText: { marginTop: 12, color: '#fff', fontWeight: '900' },
  incomingOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: 'rgba(5,11,22,0.76)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  incomingPanel: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 24, backgroundColor: '#f7f2e9', alignItems: 'center', borderWidth: 1, borderColor: '#dbcdb9' },
  incomingKicker: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  incomingAvatarWrap: { marginTop: 14, width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 2, borderColor: '#e1d4bf' },
  incomingTitle: { marginTop: 10, color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  incomingLine: { marginTop: 12, color: colors.sub, fontSize: 15, lineHeight: 22, textAlign: 'center', fontWeight: '700' },
  incomingActions: { marginTop: 22, flexDirection: 'row', gap: 12, width: '100%' },
  incomingButton: { flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  incomingReject: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8c7b0' },
  incomingAccept: { backgroundColor: colors.accent },
  incomingRejectText: { color: colors.text, fontWeight: '900', fontSize: 16 },
  incomingAcceptText: { color: '#241a00', fontWeight: '900', fontSize: 16 }
});
