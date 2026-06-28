import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, DevSettings, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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
import { MenuHubScreen } from './screens/MenuHubScreen';
import { loadState, saveState } from './storage/persist';
import { colors } from './theme';
import { SNSGodCharacter, SNSGodState, SNSPost } from './types';
import { runAutomationTick } from './logic/automation';
import { appendDebugLog } from './logic/debugLog';
import { findRandomChat, removeRandomChatRoom } from './logic/randomChat';
import { deleteCharacter } from './logic/stateHelpers';

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
  | { name: 'call'; characterId: string; returnRoute?: Route }
  | { name: 'notifications' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'chatList' });
  const [state, setState] = useState<SNSGodState | null>(null);
  const stateRef = useRef<SNSGodState | null>(null);
  const routeHistoryRef = useRef<Route[]>([]);
  const automationRunningRef = useRef(false);

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
      setState(next);
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
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'chatList') return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [route]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const current = stateRef.current;
      if (!current || automationRunningRef.current) return;
      const profile = current.config.apiProfiles[current.config.apiType] || {};
      const hasKey = current.config.apiType === 'vertex'
        ? Boolean(String(profile.serviceAccountJson || '').trim())
        : Boolean(profile.apiKey || profile.apiKeys?.some(Boolean));
      if (!hasKey) return;
      automationRunningRef.current = true;
      try {
        const next = await runAutomationTick(current);
        if (next !== current) await commit(next);
      } catch (error) {
        void appendDebugLog('automation', String(error instanceof Error ? error.message : error), 'warn');
        // Automation failures should not interrupt active use; manual chat still reports errors.
      } finally {
        automationRunningRef.current = false;
      }
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  async function commit(next: SNSGodState) {
    setState(next);
    stateRef.current = next;
    await saveState(next);
    void appendDebugLog('storage', `state saved: characters=${next.characters.length}, notifications=${(next.notifications || []).length}`);
  }

  async function reloadSavedState() {
    const next = await loadState();
    setState(next);
    stateRef.current = next;
    void appendDebugLog('debug', `saved state reloaded: characters=${next.characters.length}`);
  }

  function reloadBundle() {
    void appendDebugLog('debug', 'JS bundle reload requested');
    DevSettings.reload();
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

  async function handleDeleteCharacter(characterId: string) {
    const current = stateRef.current;
    if (!current) return;
    const next = deleteCharacter(current, characterId);
    await commit(next);
    routeHistoryRef.current = [];
    navigate({ name: 'chatList' }, { replace: true });
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
      <View style={styles.content}>
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
            const isGroupRoom = (stateRef.current?.groupRooms || []).some(room => room.id === roomId);
            const isRandom = Boolean(stateRef.current && findRandomChat(stateRef.current, roomId));
            navigate(isGroupRoom ? { name: 'groupChatRoom', roomId } : isRandom ? { name: 'randomChatRoom', roomId } : { name: 'chatRoom', roomId });
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
        <CallScreen state={state} characterId={route.characterId} onBack={goBack} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050b16' },
  loadingText: { marginTop: 12, color: '#fff', fontWeight: '900' }
});
