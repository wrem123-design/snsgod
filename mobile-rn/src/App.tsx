import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, DevSettings, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CallScreen } from './screens/CallScreen';
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
import { flushSaveState, loadState, saveStateDebounced } from './storage/persist';
import { colors } from './theme';
import { SNSGodCharacter, SNSGodState, SNSPost } from './types';
import { isAutomationQueueBusy, runAutomationQueueTick } from './logic/automationQueue';
import { appendDebugLog } from './logic/debugLog';
import { findRandomChat, promoteRandomChatRoom, removeRandomChatRoom } from './logic/randomChat';
import { deleteCharacter } from './logic/stateHelpers';
import { roomRouteKind } from './logic/roomStore';
import { IncomingPhoneCall, markPhoneCardStatus, missIncomingPhoneCall, newestPendingPhoneCandidate, rejectIncomingPhoneCall } from './logic/phone';
import { markRoomRead, pushNotification } from './logic/notifications';
import { startReplyJob } from './logic/replyEngine';

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
  | { name: 'profile'; characterId: string; returnRoomId?: string }
  | { name: 'call'; characterId: string; roomId?: string; sourceMessageId?: string; returnRoute?: Route }
  | { name: 'notifications' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'chatList' });
  const [state, setState] = useState<SNSGodState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingPhoneCall | null>(null);
  const [runtimeReloadNonce, setRuntimeReloadNonce] = useState(0);
  const stateRef = useRef<SNSGodState | null>(null);
  const routeRef = useRef<Route>(route);
  const routeHistoryRef = useRef<Route[]>([]);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearRuntimeOnlyState(next: SNSGodState): SNSGodState {
    return { ...next, pendingReplies: {} };
  }

  function sameRoute(a: Route, b: Route): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function navigate(next: Route, options?: { replace?: boolean }) {
    setRoute(current => {
      if (!options?.replace && !sameRoute(current, next)) {
        routeHistoryRef.current = [...routeHistoryRef.current, current].slice(-60);
      }
      void appendDebugLog('navigation', `${current.name} -> ${next.name}${options?.replace ? ' (replace)' : ''}`);
      return next;
    });
  }

  function goBack(fallback: Route = { name: 'chatList' }) {
    setRoute(() => routeHistoryRef.current.pop() || fallback);
  }

  useEffect(() => {
    loadState().then(next => {
      const ready = clearRuntimeOnlyState(next);
      setState(ready);
      stateRef.current = ready;
      void appendDebugLog('app', `state loaded: characters=${next.characters.length}, rooms=${Object.values(next.chatRooms).flat().length}`);
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
      if (current) void flushSaveState(current);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!state || incomingCall || route.name === 'call') return;
    const candidate = newestPendingPhoneCandidate(state);
    if (!candidate) return;
    setIncomingCall(candidate);
    const currentMessage = state.messages[candidate.roomId]?.find(message => message.id === candidate.messageId);
    if (currentMessage?.callStatus !== 'ringing') {
      void commit(markPhoneCardStatus(state, candidate.roomId, candidate.messageId, 'ringing'));
    }
  }, [state, incomingCall, route.name]);

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
      __phoneInviteAt: { ...((latest.__phoneInviteAt || {}) as Record<string, unknown>), ...((next.__phoneInviteAt || {}) as Record<string, unknown>) }
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

  async function commit(next: SNSGodState) {
    const committed = withUnreadForNewMessages(stateRef.current, next, visibleRoomIdForRoute(routeRef.current));
    setState(committed);
    stateRef.current = committed;
    saveStateDebounced(committed);
    void appendDebugLog('storage', `state saved: characters=${committed.characters.length}, notifications=${(committed.notifications || []).length}`);
  }

  async function commitCurrent(patch: (current: SNSGodState) => SNSGodState) {
    const current = stateRef.current;
    if (!current) return;
    const next = patch(current);
    await commit(next);
  }

  function requestReply(roomId: string, characterId: string, latestUserInput: string, options?: { randomMode?: boolean }) {
    void startReplyJob({
      roomId,
      characterId,
      latestUserInput,
      randomMode: options?.randomMode,
      getState: () => stateRef.current,
      commitCurrent
    });
  }

  async function reloadSavedState() {
    const current = stateRef.current;
    if (current) await flushSaveState(current);
    const next = clearRuntimeOnlyState(await loadState());
    setState(next);
    stateRef.current = next;
    void appendDebugLog('debug', `saved state reloaded: characters=${next.characters.length}`);
  }

  async function reloadBundle() {
    void appendDebugLog('debug', 'JS bundle reload requested');
    const current = stateRef.current;
    if (current) await flushSaveState(current);
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
    if (route.name === 'etc' || route.name === 'sumgod' || route.name === 'gallery' || route.name === 'debug' || route.name === 'notifications') return 'etc';
    return 'friends';
  }

  const showBottomNav = route.name === 'chatList' || route.name === 'sns' || route.name === 'random' || route.name === 'etc' || route.name === 'sumgod' || route.name === 'gallery' || route.name === 'debug';

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
    await commit(markPhoneCardStatus(current, call.roomId, call.messageId, 'accepted'));
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
          onOpenSumGod={() => navigate({ name: 'sumgod' })}
          onOpenGallery={() => navigate({ name: 'gallery' })}
          onOpenNotifications={() => navigate({ name: 'notifications' })}
          onOpenSettings={() => navigate({ name: 'settings' })}
          onOpenDebug={() => navigate({ name: 'debug' })}
        />
      ) : route.name === 'gallery' ? (
        <GalleryScreen state={state} onBack={goBack} />
      ) : route.name === 'debug' ? (
        <DebugScreen onBack={goBack} onReloadState={reloadSavedState} onReloadBundle={reloadBundle} />
      ) : route.name === 'random' ? (
        <RandomChatScreen state={state} onChange={commit} onBack={goBack} onOpenRoom={roomId => navigate({ name: 'randomChatRoom', roomId })} />
      ) : route.name === 'sumgod' ? (
        <SumGodScreen state={state} onChange={commit} onBack={goBack} />
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
          onBack={goBack}
          onOpenChat={openCharacterChat}
          onOpenCall={character => navigate({ name: 'call', characterId: character.id, returnRoute: route })}
          onOpenSettings={character => navigate({ name: 'characterSettings', characterId: character.id, returnRoomId: route.returnRoomId })}
        />
      ) : route.name === 'call' ? (
        <CallScreen state={state} characterId={route.characterId} roomId={route.roomId} sourceMessageId={route.sourceMessageId} onBack={goBack} onChange={commit} />
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
          onBack={goBack}
          onOpenSettings={roomId => navigate({ name: 'groupRoomSettings', roomId, returnRoomId: route.roomId })}
        />
      ) : route.name === 'chatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commit}
          onBack={goBack}
          onOpenRoomSettings={roomId => navigate({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigate({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigate({ name: 'profile', characterId, returnRoomId: route.roomId })}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigate({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
          onRequestReply={requestReply}
        />
      ) : route.name === 'randomChatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commit}
          onBack={() => navigate({ name: 'random' })}
          onOpenRoomSettings={roomId => navigate({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigate({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigate({ name: 'profile', characterId, returnRoomId: route.roomId })}
          randomMode
          onLeaveRandomRoom={leaveRandomRoom}
          onPromoteRandomRoom={promoteRandomRoom}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigate({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
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
      {showBottomNav ? <BottomNav active={activeBottomTab()} onSelect={openBottomTab} /> : null}
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
