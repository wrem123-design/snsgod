import React, { useEffect, useRef, useState } from 'react';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, AppState, BackHandler, DevSettings, Keyboard, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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
import { DatingAppScreen } from './screens/DatingAppScreen';
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
import { FeedHubScreen } from './screens/FeedHubScreen';
import { flushSaveState, getStoragePaths, importState, loadState, recordSkippedSaveBeforeHydration, saveStateDebounced, SaveStateOptions } from './storage/persist';
import { colors } from './theme';
import { NotificationItem, PendingReplyJob, SNSGodCharacter, SNSGodState, SNSPost } from './types';
import { isAutomationQueueBusy, runAutomationQueueTick } from './logic/automationQueue';
import { cancelAllChatJobs, cancelChatJob } from './logic/chatJobs';
import { maybePromptBatteryOptimizationExemption, setAutomationKeepAliveRunning } from './logic/backgroundAutomation';
import { appendDebugLog } from './logic/debugLog';
import { findRandomChat, promoteRandomChatRoom } from './logic/randomChat';
import { allRooms, findCharacter, isRoomDisabled } from './logic/stateHelpers';
import { deleteCharacterCascade, deleteRoomCascade } from './logic/deletionCascadePolicy';
import { IncomingPhoneCall, markPhoneCardStatus, missIncomingPhoneCall, newestPendingPhoneCandidate, rejectIncomingPhoneCall } from './logic/phone';
import { markRoomRead, notifyRoomMessage, notifySnsDmMessages } from './logic/notifications';
import { resetReplyLlmQueue, startReplyJob } from './logic/replyEngine';
import { createGroupMeetingEventSession, createManualGroupMeetingEventPrompt, createManualMeetingEventPrompt, createMeetingEventSession, shouldStartGroupMeetingEvent, shouldStartMeetingEvent } from './logic/meetingEvent';
import { forceUpdateRoomMemory } from './logic/memoryBridge';
import { maybeCreateBackgroundAutoSNSPost } from './logic/sns';
import { bootstrapServer, enqueueServerMessage, flushServerOutbox, isServerMessagingEnabled, registerServerDevice, syncServerMessages, withServerError } from './logic/serverMessaging';
import {
  applyStateMediaUriReplacements,
  collectStateMediaReferences,
  collectStateMediaUris,
  createStateMediaReplacementCache,
  type StateMediaUriReplacement,
} from './logic/stateMediaPolicy';
import { previewMediaGarbageCollection, purgeMediaTrash, purgeSelectedMediaTrash, readMediaManifest, recoverInterruptedMediaGarbageCollection, restoreMediaTrash, trashUnreachableMedia } from './logic/media';
import type { MediaAlbumAsset } from './logic/mediaAlbum';
import { restoreMediaAlbumTrashRecord, trashMediaAlbumAssets, unlinkMediaAlbumReferences } from './logic/mediaAlbumTrash';
import { hasSameServerIdentity, mergeStaleState } from './logic/staleStateMergePolicy';
import { canCommitRuntimeEpoch } from './logic/runtimeEpochPolicy';
import { getSumGodProgress, invalidateSumGodBackupWrites, replaceSumGodBackup } from './logic/sumgod';
import { resetDatingImageQueue } from './logic/datingApp';
import { importFullBackupZip, type PreparedFullBackupRestore } from './logic/backup';
import { notificationRouteRequestFromUrl, openNotificationRequest, type NotificationRoute, type NotificationRouteRequest } from './logic/notificationRouting';
import { cancelAllPendingReplyJobs, reconcilePendingReplyJobs } from './logic/pendingReplyJobs';
import { normalizePersistedInteractionLifecycles, pauseActiveInteractions, resumePointedInteractions } from './logic/interactionLifecycle';
import { rootForRouteName, routeForRoot, shouldShowBottomNavigation } from './logic/rootNavigation';
import { isRemoteServicesEnabled } from './logic/remoteServicePolicy';
import { carryStateSecrets } from './storage/secureSecrets';

const MEDIA_REPLACEMENT_CACHE_TTL_MS = 30_000;
const MEDIA_REPLACEMENT_CACHE_SWEEP_MS = 5_000;
const MEDIA_REPLACEMENT_CACHE_MAX_ENTRIES = 12;
const MEDIA_REPLACEMENT_CACHE_MAX_DATA_URI_CHARACTERS = 6_000_000;
const MEDIA_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function roomNotificationEventId(roomId: string, messageId: string): string {
  return `room:${roomId}:${messageId}`;
}

function snsDmNotificationEventId(threadId: string, messageId: string): string {
  return `snsdm:${threadId}:${messageId}`;
}

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
  | { name: 'sns'; platform: SNSPost['platform']; postId?: string; threadId?: string }
  | { name: 'feedHub' }
  | { name: 'discoverHub' }
  | { name: 'archiveHub' }
  | { name: 'gallery' }
  | { name: 'debug' }
  | { name: 'random' }
  | { name: 'randomChatRoom'; roomId: string }
  | { name: 'sumgod' }
  | { name: 'streetEncounter' }
  | { name: 'blindDate' }
  | { name: 'datingApp' }
  | { name: 'idealWorldcup' }
  | { name: 'references' }
  | { name: 'profile'; characterId: string; returnRoomId?: string }
  | { name: 'call'; characterId: string; roomId?: string; sourceMessageId?: string; returnRoute?: Route }
  | { name: 'meeting'; sessionId: string; returnRoute?: Route }
  | { name: 'notifications' };

type CommitOptions = {
  conflict?: 'incoming' | 'latest';
  persist?: boolean;
  save?: SaveStateOptions;
  flush?: boolean;
};

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'chatList' });
  const [state, setState] = useState<SNSGodState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingPhoneCall | null>(null);
  const [runtimeReloadNonce, setRuntimeReloadNonce] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const stateRef = useRef<SNSGodState | null>(null);
  const restoringRef = useRef(false);
  const runtimeEpochRef = useRef(0);
  const persistedMediaUrisRef = useRef(createStateMediaReplacementCache({
    ttlMs: MEDIA_REPLACEMENT_CACHE_TTL_MS,
    maxEntries: MEDIA_REPLACEMENT_CACHE_MAX_ENTRIES,
    maxDataUriCharacters: MEDIA_REPLACEMENT_CACHE_MAX_DATA_URI_CHARACTERS,
  }));
  const routeRef = useRef<Route>(route);
  const routeEpochRef = useRef(0);
  const routeHistoryRef = useRef<Route[]>([]);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const serverPolicySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverPolicyFingerprintRef = useRef('');
  const oracleSyncInFlightRef = useRef(false);
  const oracleSyncPendingReasonRef = useRef<{ reason: string; epoch: number } | null>(null);
  const meetingEventWorkRef = useRef(new Map<string, Promise<boolean>>());
  const pendingNotificationRequestRef = useRef<NotificationRouteRequest | null>(null);

  function reconcileLoadedState(next: SNSGodState): { state: SNSGodState; resumable: PendingReplyJob[] } {
    const reconciled = reconcilePendingReplyJobs(next);
    return { ...reconciled, state: normalizePersistedInteractionLifecycles(reconciled.state) as SNSGodState };
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
    if (routeRef.current.name === 'datingApp' && next.name !== 'datingApp') resetDatingImageQueue();
    routeEpochRef.current += 1;
    setRoute(current => {
      if (!options?.replace && !sameRoute(current, next)) {
        routeHistoryRef.current = [...routeHistoryRef.current, current].slice(-60);
      }
      return next;
    });
  }

  function goBack(fallback: Route = { name: 'chatList' }) {
    if (routeRef.current.name === 'datingApp') resetDatingImageQueue();
    routeEpochRef.current += 1;
    setRoute(() => routeHistoryRef.current.pop() || fallback);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      persistedMediaUrisRef.current.active(Date.now());
    }, MEDIA_REPLACEMENT_CACHE_SWEEP_MS);
    return () => {
      clearInterval(timer);
      persistedMediaUrisRef.current.clear();
    };
  }, []);

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
    void recoverInterruptedMediaGarbageCollection()
      .then(async recovery => {
        const purge = await purgeMediaTrash(Date.now() - MEDIA_TRASH_RETENTION_MS);
        if (recovery.restoredCount || recovery.committedCount || purge.deletedCount || purge.failedCount) {
          void appendDebugLog('media.gc', `startup recovery restored=${recovery.restoredCount} committed=${recovery.committedCount} purged=${purge.deletedCount} failed=${purge.failedCount}`);
        }
      })
      .catch(error => {
        void appendDebugLog('media.gc', `startup recovery failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      });
    loadState().then(next => {
      const recoveredReplies = reconcileLoadedState(next);
      const ready = isServerMessagingEnabled(recoveredReplies.state)
        ? cancelAllPendingReplyJobs(recoveredReplies.state, 'server-messaging-enabled')
        : recoveredReplies.state;
      if (ready !== next) {
        saveStateDebounced(ready, { important: true, reason: 'pending reply startup reconciliation' });
      }
      setState(ready);
      stateRef.current = ready;
      hydratedRef.current = true;
      setHydrated(true);
      const pendingNotificationRequest = pendingNotificationRequestRef.current;
      pendingNotificationRequestRef.current = null;
      if (pendingNotificationRequest) setTimeout(() => void openNotificationRouteRequest(pendingNotificationRequest), 0);
      void appendDebugLog('app', `state loaded: characters=${next.characters.length}, rooms=${Object.values(next.chatRooms).flat().length}`);
      if (isServerMessagingEnabled(ready)) {
        void syncOracleMessages('startup');
      } else {
        setTimeout(() => resumeInterruptedReplies(ready, recoveredReplies.resumable), 0);
      }
      // Only after real device battery-opt check; skips when already excluded.
      setTimeout(() => {
        void maybePromptBatteryOptimizationExemption();
      }, 2500);
    }).catch(error => {
      void appendDebugLog('app', `start failed: ${String(error?.message || error)}`, 'error');
      Alert.alert('시작 실패', String(error?.message || error));
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    function handleUrl(url: string) {
      const request = notificationRouteRequestFromUrl(url);
      if (request) void openNotificationRouteRequest(request);
    }
    void Linking.getInitialURL().then(url => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  async function openNotificationRouteRequest(request: NotificationRouteRequest) {
    if (!stateRef.current) {
      pendingNotificationRequestRef.current = request;
      return;
    }
    let resolvedRoute: NotificationRoute = { name: 'notifications' };
    await commitCurrent(latest => {
      const opened = openNotificationRequest(latest, request);
      resolvedRoute = opened.route;
      return opened.state;
    });
    navigate(resolvedRoute);
  }

  function openNotificationItem(item: NotificationItem) {
    void openNotificationRouteRequest({ kind: 'item', notificationId: item.id });
  }
  const serverPolicyFingerprint = state ? JSON.stringify({
    server: {
      enabled: state.config.serverMessaging?.enabled === true,
      baseUrl: state.config.serverMessaging?.baseUrl || '',
      registered: Boolean(state.config.serverMessaging?.deviceToken)
    },
    automation: {
      enabled: state.config.autoEnabled !== false,
      privateFirst: state.config.privateFirst === true,
      groupFirst: state.config.groupFirst === true
    },
    textGeneration: {
      provider: state.config.apiType,
      profile: state.config.apiProfiles[state.config.apiType] || {}
    },
    characters: state.characters.map(character => ({
      id: character.id,
      enabled: character.enabled !== false,
      proactiveEnabled: character.proactiveEnabled !== false,
      responseDelayMin: character.responseDelayMin,
      responseDelayMax: character.responseDelayMax,
      frequencyMinutes: character.frequencyMinutes,
      initiative: character.initiative,
      proactivePatience: character.proactivePatience
    })),
    directRooms: Object.values(state.chatRooms || {}).flat().map(room => ({ id: room.id, disabled: room.disabled === true })),
    groupRooms: (state.groupRooms || []).map(room => ({ id: room.id, disabled: room.disabled === true, participantIds: room.participantIds }))
  }) : '';

  useEffect(() => {
    if (!hydrated || !serverPolicyFingerprint) return;
    if (!serverPolicyFingerprintRef.current) {
      serverPolicyFingerprintRef.current = serverPolicyFingerprint;
      return;
    }
    if (serverPolicyFingerprintRef.current === serverPolicyFingerprint) return;
    serverPolicyFingerprintRef.current = serverPolicyFingerprint;
    if (serverPolicySyncTimerRef.current) clearTimeout(serverPolicySyncTimerRef.current);
    if (!stateRef.current || !isServerMessagingEnabled(stateRef.current)) return;
    serverPolicySyncTimerRef.current = setTimeout(() => {
      serverPolicySyncTimerRef.current = null;
      void syncOracleMessages('automation-settings-changed');
    }, 900);
    return () => {
      if (serverPolicySyncTimerRef.current) {
        clearTimeout(serverPolicySyncTimerRef.current);
        serverPolicySyncTimerRef.current = null;
      }
    };
  }, [hydrated, serverPolicyFingerprint]);

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
      if (restoringRef.current) return;
      if (nextState === 'active') {
        const current = stateRef.current;
        if (current) {
          const resumed = resumePointedInteractions(current) as SNSGodState;
          if (resumed !== current) {
            const snapshot = withNextRevision(resumed, current);
            stateRef.current = snapshot;
            setState(snapshot);
            saveStateDebounced(snapshot, { important: true, reason: 'app foreground interaction resume' });
          }
        }
        // Server mode receives messages that were generated while the app was closed.
        if (stateRef.current && isServerMessagingEnabled(stateRef.current)) {
          void syncOracleMessages('app-active');
        } else {
          void runAutomationTickOnce('app-active');
        }
        return;
      }
      const current = stateRef.current;
      if (current) {
        const pausedInteractions = pauseActiveInteractions(current) as SNSGodState;
        const summarized = summarizeRoomsBeforeFlush(pausedInteractions);
        const snapshot = summarized === current ? current : withNextRevision(summarized, current);
        stateRef.current = snapshot;
        setState(snapshot);
        void flushSaveState(snapshot, {
          backup: 'force',
          verify: 'full',
          reason: 'app background',
          onMediaExternalized: applyPersistedMediaUris,
        });
        // Keep process priority high so setInterval/reply delays continue after Home.
        if (current.config.autoEnabled !== false && !isServerMessagingEnabled(current)) {
          void setAutomationKeepAliveRunning(true, { force: true });
          void runAutomationTickOnce('app-background');
        }
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
    if (!session || (session.status !== 'active' && session.status !== 'paused')) return;
    navigate({ name: 'meeting', sessionId: session.id, returnRoute: routeRef.current });
  }, [state?.activeMeetingEventId, route.name]);

  useEffect(() => {
    if (!state?.activeCallSessionId || route.name === 'call' || route.name === 'meeting') return;
    const session = (state.callSessions || []).find(item => item.id === state.activeCallSessionId);
    if (!session || (session.status !== 'active' && session.status !== 'paused')) return;
    navigate({
      name: 'call',
      characterId: session.characterId,
      roomId: session.roomId,
      sourceMessageId: session.sourceMessageId,
      returnRoute: routeRef.current
    });
  }, [state?.activeCallSessionId, route.name]);

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
    if (!hydrated) return;
    const autoOn = Boolean(state && state.config.autoEnabled !== false && !isServerMessagingEnabled(state));
    // Defer native service start slightly so first paint/JS boot is stable.
    const timer = setTimeout(() => {
      void setAutomationKeepAliveRunning(autoOn);
    }, 1500);
    return () => {
      clearTimeout(timer);
      void setAutomationKeepAliveRunning(false);
    };
  }, [hydrated, state?.config.autoEnabled]);

  useEffect(() => {
    if (!hydrated || (state && isServerMessagingEnabled(state))) return;
    // First tick soon after load, then every minute while the process lives.
    const initial = setTimeout(() => {
      void runAutomationTickOnce('startup');
    }, 5000);
    const timer = setInterval(() => {
      void runAutomationTickOnce('interval');
    }, 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [hydrated]);

  async function runAutomationTickOnce(reason: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current || isServerMessagingEnabled(current) || isAutomationQueueBusy()) return;
    const profile = current.config.apiProfiles[current.config.apiType] || {};
    const hasKey = current.config.apiType === 'vertex'
      ? Boolean(String(profile.serviceAccountJson || '').trim())
      : current.config.apiType === 'grok' || Boolean(profile.apiKey || profile.apiKeys?.some(Boolean));
    if (!hasKey) return;
    try {
      // Global auto off: still allow SNS-only background posts when SNS auto is enabled.
      if (current.config.autoEnabled === false) {
        if (current.config.snsAutoPostEnabled === false) return;
        const snsOnly = await maybeCreateBackgroundAutoSNSPost(current);
        if (!isRuntimeEpochCurrent(operationEpoch)) return;
        if (snsOnly && snsOnly !== current) {
          const latest = stateRef.current;
          await commit(latest && latest !== current ? mergeAutomationResult(latest, current, snsOnly) : snsOnly);
          void appendDebugLog('sns.auto', `background sns-only tick applied reason=${reason}`);
        }
        return;
      }
      const next = await runAutomationQueueTick(current);
      if (!isRuntimeEpochCurrent(operationEpoch)) return;
      if (next !== current) {
        const latest = stateRef.current;
        await commit(latest && latest !== current ? mergeAutomationResult(latest, current, next) : next);
        void appendDebugLog('automation', `tick applied reason=${reason}`);
      }
    } catch (error) {
      void appendDebugLog('automation', `${reason}: ${String(error instanceof Error ? error.message : error)}`, 'warn');
      // Automation failures should not interrupt active use; manual chat still reports errors.
    }
  }

  function visibleRoomIdForRoute(currentRoute: Route): string | undefined {
    if (currentRoute.name === 'chatRoom' || currentRoute.name === 'groupChatRoom' || currentRoute.name === 'randomChatRoom') return currentRoute.roomId;
    return undefined;
  }

  function summarizeRoomsBeforeFlush(current: SNSGodState): SNSGodState {
    return Object.keys(current.messages || {}).reduce((next, roomId) => forceUpdateRoomMemory(next, roomId), current);
  }

  function mergeAutomationResult(latest: SNSGodState, base: SNSGodState, next: SNSGodState): SNSGodState {
    if (!Object.is(latest.__importedAt, base.__importedAt)) return latest;
    const candidate = mergeStaleState(latest, base, next, { conflict: 'latest' });
    const candidateRoomIds = new Set([
      ...Object.values(candidate.chatRooms || {}).flat().map(room => room.id),
      ...(candidate.groupRooms || []).map(room => room.id),
      ...(candidate.randomChats || []).map(room => room.id),
    ]);
    const unreadCounts = { ...(candidate.unreadCounts || {}) };
    for (const [roomId, count] of Object.entries(next.unreadCounts || {})) {
      if (!candidateRoomIds.has(roomId)) continue;
      unreadCounts[roomId] = Math.max(Number(unreadCounts[roomId] || 0), Number(count || 0));
    }
    return {
      ...candidate,
      unreadCounts,
      notifications: (candidate.notifications || []).slice(0, 100),
      callLogs: (Array.isArray(candidate.callLogs) ? candidate.callLogs : []).slice(0, 100),
    };
  }

  function mergeServerSyncResult(latest: SNSGodState, base: SNSGodState, next: SNSGodState): SNSGodState {
    if (!hasSameServerIdentity(latest, base)) return latest;
    return mergeStaleState(latest, base, next, { conflict: 'latest' });
  }

  function withUnreadForNewMessages(previous: SNSGodState | null, next: SNSGodState, visibleRoomId?: string): SNSGodState {
    if (!previous) return next;
    let result = next;
    for (const [roomId, messages] of Object.entries(next.messages || {})) {
      const previousIds = new Set((previous.messages?.[roomId] || []).map(message => message.id));
      const incoming = messages.filter(message =>
        !previousIds.has(message.id)
        && message.role === 'character'
        && (message.content?.trim() || message.mediaData || message.sticker || message.callInvite || message.phoneLog)
      );
      if (!incoming.length) continue;
      const minimum = (previous.unreadCounts?.[roomId] || 0) + incoming.length;
      const latestIncoming = incoming[incoming.length - 1];
      const character = next.characters.find(item => item.id === latestIncoming.characterId);
      const isRandomRoom = (next.randomChats || []).some(room => room.id === roomId);
      result = notifyRoomMessage(result, {
        roomId,
        characterId: latestIncoming.characterId,
        title: character?.name || '새 메시지',
        body: latestIncoming.content || latestIncoming.imageCaption || (latestIncoming.mediaData ? '사진' : latestIncoming.sticker ? '스티커' : '새 메시지'),
        app: isRandomRoom ? 'randomchat' : 'messenger',
        visibleRoomId,
        eventIds: incoming.map(message => roomNotificationEventId(roomId, message.id)),
        unreadFloor: minimum,
      });
    }
    for (const thread of next.snsDmThreads || []) {
      const previousThread = (previous.snsDmThreads || []).find(item => item.id === thread.id);
      const previousIds = new Set((previousThread?.messages || []).map(message => message.id));
      const incoming = thread.messages.filter(message => !previousIds.has(message.id) && message.from !== 'user');
      if (!incoming.length) continue;
      const latestIncoming = incoming[incoming.length - 1];
      const character = next.characters.find(item => item.id === thread.characterId);
      const unreadFloor = Number(previousThread?.unread || 0) + incoming.length;
      result = notifySnsDmMessages(result, {
        threadId: thread.id,
        characterId: thread.characterId,
        title: `${character?.name || thread.title} DM`,
        body: latestIncoming.body,
        eventIds: incoming.map(message => snsDmNotificationEventId(thread.id, message.id)),
        unreadFloor,
      });
    }
    return result;
  }

  function withNextRevision(next: SNSGodState, previous: SNSGodState | null): SNSGodState {
    const previousRevision = Number(previous?.__revision || 0);
    const incomingRevision = Number(next.__revision || 0);
    return {
      ...next,
      __revision: Math.max(previousRevision, incomingRevision) + 1
    };
  }

  function applyPersistedMediaUris(replacements: readonly StateMediaUriReplacement[]): void {
    const now = Date.now();
    persistedMediaUrisRef.current.add(replacements, now);
    const current = stateRef.current;
    if (!current) return;
    const patched = applyStateMediaUriReplacements(current, replacements);
    persistedMediaUrisRef.current.active(now, collectStateMediaUris(patched));
    if (patched === current) return;
    stateRef.current = patched;
    setState(patched);
  }

  async function commitFromRenderedSnapshot(
    base: SNSGodState,
    next: SNSGodState,
    options: CommitOptions = {},
  ): Promise<void> {
    if (restoringRef.current) return;
    const current = stateRef.current;
    const intent = next.__importedAt !== base.__importedAt ? 'import' : 'screen';
    const candidate = current && current !== base
      ? mergeStaleState(current, base, next, { conflict: options.conflict, intent })
      : next;
    const baseReferenceIds = new Set((base.referenceFaceSlots || []).map(slot => slot.id));
    const candidateReferenceIds = new Set((candidate.referenceFaceSlots || []).map(slot => slot.id));
    const rejectedReferenceSlotCount = intent === 'screen'
      ? (next.referenceFaceSlots || []).filter(slot => (
        !baseReferenceIds.has(slot.id) && !candidateReferenceIds.has(slot.id)
      )).length
      : 0;
    await commit(candidate, options);
    if (rejectedReferenceSlotCount > 0) {
      Alert.alert(
        '레퍼런스 슬롯 가득 참',
        `다른 추가 작업으로 50개 슬롯이 먼저 찼습니다. 일부 사진을 추가하지 못했어요. (${rejectedReferenceSlotCount}장)`,
      );
    }
  }

  async function commit(next: SNSGodState, options: CommitOptions = {}) {
    if (restoringRef.current) return;
    const now = Date.now();
    const knownMediaReplacements = persistedMediaUrisRef.current.active(now);
    const mediaAwareNext = applyStateMediaUriReplacements(next, knownMediaReplacements);
    persistedMediaUrisRef.current.active(now, collectStateMediaUris(mediaAwareNext));
    if (options.persist === false) {
      setState(mediaAwareNext);
      stateRef.current = mediaAwareNext;
      return;
    }
    const previous = stateRef.current;
    const committed = withNextRevision(withUnreadForNewMessages(previous, mediaAwareNext, visibleRoomIdForRoute(routeRef.current)), previous);
    setState(committed);
    stateRef.current = committed;
    if (!hydratedRef.current) {
      recordSkippedSaveBeforeHydration();
      void appendDebugLog('storage', 'skip save before hydration', 'warn');
      return;
    }
    saveStateDebounced(committed, {
      ...options.save,
      onMediaExternalized: applyPersistedMediaUris,
    });
    if (options.flush) {
      await flushSaveState(committed, {
        backup: 'skip',
        verify: 'sqlite',
        defer: false,
        reason: options.save?.reason || 'critical state transition',
        onMediaExternalized: applyPersistedMediaUris,
      });
    }
  }

  async function commitCurrent(patch: (current: SNSGodState) => SNSGodState, options?: CommitOptions) {
    const current = stateRef.current;
    if (!current) return;
    const next = patch(current);
    if (next === current) return;
    await commit(next, options);
  }

  async function commitCurrentAtEpoch(
    epoch: number,
    patch: (current: SNSGodState) => SNSGodState,
    options?: CommitOptions,
  ): Promise<void> {
    if (!isRuntimeEpochCurrent(epoch)) return;
    await commitCurrent(patch, options);
  }

  function isRuntimeEpochCurrent(epoch: number): boolean {
    return canCommitRuntimeEpoch(runtimeEpochRef.current, epoch, restoringRef.current);
  }

  async function commitAndFlush(base: SNSGodState, next: SNSGodState) {
    await commitFromRenderedSnapshot(base, next, {
      save: { important: true, reason: 'important screen change' },
    });
    await flushSaveState(stateRef.current || next, {
      backup: 'force',
      verify: 'full',
      important: true,
      reason: 'important screen flush',
      onMediaExternalized: applyPersistedMediaUris,
    });
  }

  async function previewCurrentMediaCleanup() {
    const current = stateRef.current;
    if (!current) throw new Error('미디어를 검사할 앱 상태가 아직 준비되지 않았습니다.');
    return previewMediaGarbageCollection(collectStateMediaReferences(current));
  }

  async function trashCurrentUnreachableMedia() {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current) {
      throw new Error('미디어 정리 요청이 더 이상 현재 상태가 아닙니다.');
    }
    await flushSaveState(current, {
      backup: 'force',
      verify: 'full',
      reason: 'before media garbage collection',
      onMediaExternalized: applyPersistedMediaUris,
    });
    if (!isRuntimeEpochCurrent(operationEpoch) || !stateRef.current) {
      throw new Error('저장 상태가 바뀌어 미디어 정리를 취소했습니다.');
    }
    const references = collectStateMediaReferences(stateRef.current || current);
    return trashUnreachableMedia(references);
  }

  async function unlinkCurrentAlbumReference(asset: MediaAlbumAsset, referenceId: string) {
    const operationEpoch = runtimeEpochRef.current;
    let result: ReturnType<typeof unlinkMediaAlbumReferences> | undefined;
    await commitCurrentAtEpoch(operationEpoch, current => {
      result = unlinkMediaAlbumReferences(current, asset, [referenceId]);
      return result.state;
    }, { save: { important: true, reason: 'album reference unlink' } });
    if (!result) throw new Error('이미지 연결 해제 요청이 더 이상 현재 상태가 아닙니다.');
    return result;
  }

  async function trashCurrentAlbumAssets(assets: readonly MediaAlbumAsset[]) {
    const operationEpoch = runtimeEpochRef.current;
    const manifest = await readMediaManifest();
    const managedMediaIds = Object.fromEntries(manifest.map(entry => [entry.fileUri, entry.mediaId]));
    let result: ReturnType<typeof trashMediaAlbumAssets> | undefined;
    await commitCurrentAtEpoch(operationEpoch, current => {
      result = trashMediaAlbumAssets(current, assets, { now: Date.now(), managedMediaIds });
      return result.state;
    }, { save: { important: true, reason: 'album assets moved to trash' } });
    if (!result || !isRuntimeEpochCurrent(operationEpoch) || !stateRef.current) {
      throw new Error('앨범 휴지통 요청이 더 이상 현재 상태가 아닙니다.');
    }
    await flushSaveState(stateRef.current, {
      backup: 'force', verify: 'full', important: true, reason: 'before album media trash', onMediaExternalized: applyPersistedMediaUris,
    });
    const garbageCollection = await trashUnreachableMedia(collectStateMediaReferences(stateRef.current));
    return { ...result, garbageCollection };
  }

  async function restoreCurrentAlbumTrash(recordId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    const record = current?.mediaAlbumTrash?.find(item => item.id === recordId);
    if (!current || !record || !isRuntimeEpochCurrent(operationEpoch)) {
      throw new Error('복원할 앨범 휴지통 항목을 찾지 못했습니다.');
    }
    if (record.managedMediaId) {
      const physical = await restoreMediaTrash([record.managedMediaId]);
      if (physical.missingMediaIds.length) {
        const manifest = await readMediaManifest();
        if (!manifest.some(entry => entry.mediaId === record.managedMediaId)) {
          throw new Error('보관 기간이 지났거나 원본 파일이 없어 복원할 수 없습니다.');
        }
      }
    }
    let result: ReturnType<typeof restoreMediaAlbumTrashRecord> | undefined;
    await commitCurrentAtEpoch(operationEpoch, latest => {
      result = restoreMediaAlbumTrashRecord(latest, recordId);
      return result.state;
    }, { save: { important: true, reason: 'album trash restore' } });
    if (!result || !stateRef.current) throw new Error('앨범 휴지통 복원을 완료하지 못했습니다.');
    await flushSaveState(stateRef.current, {
      backup: 'force', verify: 'full', important: true, reason: 'after album trash restore', onMediaExternalized: applyPersistedMediaUris,
    });
    return result;
  }

  async function purgeCurrentAlbumTrash(recordId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    const record = current?.mediaAlbumTrash?.find(item => item.id === recordId);
    if (!current || !record || !isRuntimeEpochCurrent(operationEpoch)) {
      throw new Error('영구 삭제할 앨범 휴지통 항목을 찾지 못했습니다.');
    }
    if (record.managedMediaId) {
      await flushSaveState(current, {
        backup: 'force', verify: 'full', important: true, reason: 'before album permanent delete', onMediaExternalized: applyPersistedMediaUris,
      });
      await trashUnreachableMedia(collectStateMediaReferences(stateRef.current || current));
      const purge = await purgeSelectedMediaTrash([record.managedMediaId]);
      if (purge.failedCount) throw new Error('관리 파일을 영구 삭제하지 못했습니다.');
    }
    await commitCurrentAtEpoch(operationEpoch, latest => ({
      ...latest,
      mediaAlbumTrash: (latest.mediaAlbumTrash || []).filter(item => item.id !== recordId),
    }), { save: { important: true, reason: 'album trash record permanent delete' } });
    return { managedFileDeleted: Boolean(record.managedMediaId) };
  }

  async function syncOracleMessages(reason: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current || !isServerMessagingEnabled(current)) return;
    if (oracleSyncInFlightRef.current) {
      oracleSyncPendingReasonRef.current = { reason, epoch: operationEpoch };
      void appendDebugLog('server.sync', 'sync skipped while another sync is running reason=' + reason);
      return;
    }
    oracleSyncInFlightRef.current = true;
    try {
      let next = current;
      if (!next.config.serverMessaging?.deviceToken) {
        if (!String(next.config.serverMessaging?.pairingSecret || '').trim()) return;
        next = await registerServerDevice(next);
        if (!isRuntimeEpochCurrent(operationEpoch) || !stateRef.current || !isRemoteServicesEnabled(stateRef.current)) return;
      }
      next = (next.config.serverMessaging?.outbox || []).length ? await flushServerOutbox(next) : await bootstrapServer(next);
      next = await syncServerMessages(next);
      if (!isRuntimeEpochCurrent(operationEpoch) || !stateRef.current || !isRemoteServicesEnabled(stateRef.current)) return;
      const latest = stateRef.current || current;
      await commit(latest === current ? next : mergeServerSyncResult(latest, current, next));
      void appendDebugLog('server.sync', 'sync completed reason=' + reason);
    } catch (error) {
      if (!isRuntimeEpochCurrent(operationEpoch)) return;
      const latest = stateRef.current || current;
      if (!hasSameServerIdentity(latest, current)) {
        void appendDebugLog('server.sync', reason + ': stale server error discarded after connection change', 'warn');
        return;
      }
      const failed = withServerError(latest, error);
      await commit(failed);
      void appendDebugLog('server.sync', reason + ': ' + String(error instanceof Error ? error.message : error), 'warn');
    } finally {
      oracleSyncInFlightRef.current = false;
      const pendingRequest = oracleSyncPendingReasonRef.current;
      oracleSyncPendingReasonRef.current = null;
      if (pendingRequest && isRuntimeEpochCurrent(pendingRequest.epoch)) {
        setTimeout(() => void syncOracleMessages(pendingRequest.reason), 0);
      }
    }
  }

  async function requestServerReply(roomId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current || !isServerMessagingEnabled(current) || isRoomDisabled(current, roomId)) return false;
    const userMessage = [...(current.messages[roomId] || [])].reverse().find(message => message.role === 'user');
    if (!userMessage) return false;
    const queued = enqueueServerMessage(current, userMessage, roomId);
    await commit(queued);
    if (!isRuntimeEpochCurrent(operationEpoch)) return true;
    const base = stateRef.current || queued;
    try {
      const next = await flushServerOutbox(base);
      if (!isRuntimeEpochCurrent(operationEpoch)) return true;
      if (!hasSameServerIdentity(stateRef.current || base, base)) return true;
      await commitFromRenderedSnapshot(base, next, { conflict: 'latest' });
      void appendDebugLog('server.reply', 'queued room=' + roomId + ' message=' + userMessage.id);
      return true;
    } catch (error) {
      if (!isRuntimeEpochCurrent(operationEpoch)) return true;
      if (!hasSameServerIdentity(stateRef.current || base, base)) return true;
      const failed = withServerError(base, error);
      await commitFromRenderedSnapshot(base, failed, { conflict: 'latest' });
      void appendDebugLog('server.reply', 'queue failed room=' + roomId + ': ' + String(error instanceof Error ? error.message : error), 'warn');
      return true;
    }
  }
  function requestReply(roomId: string, characterId: string, latestUserInput: string, options?: { randomMode?: boolean; sourceMessageId?: string; userMessageCreatedAt?: number; latestUserImageData?: string }) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current || state;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current || isRoomDisabled(current, roomId)) return;
    if (!options?.randomMode && isServerMessagingEnabled(current)) {
      void requestServerReply(roomId);
      return;
    }
    void startReplyJob({
      roomId,
      characterId,
      latestUserInput,
      sourceMessageId: options?.sourceMessageId,
      latestUserImageData: options?.latestUserImageData,
      userMessageCreatedAt: options?.userMessageCreatedAt,
      randomMode: options?.randomMode,
      getState: () => isRuntimeEpochCurrent(operationEpoch) ? stateRef.current : null,
      commitCurrent: (patch, commitOptions) => commitCurrentAtEpoch(operationEpoch, patch, commitOptions),
    });
  }

  function meetingRoomExists(snapshot: SNSGodState, roomId: string): boolean {
    if (isRoomDisabled(snapshot, roomId)) return false;
    return (snapshot.groupRooms || []).some(room => room.id === roomId)
      || allRooms(snapshot).some(room => room.id === roomId && room.type !== 'random');
  }

  function hasOpenMeeting(snapshot: SNSGodState, roomId: string): boolean {
    return (snapshot.meetingEventSessions || []).some(session => (
      session.roomId === roomId && (session.status === 'pending' || session.status === 'active' || session.status === 'paused')
    ));
  }

  async function runMeetingEventWork(
    roomId: string,
    waitForBusy: boolean,
    work: () => Promise<boolean>,
  ): Promise<boolean> {
    let running = meetingEventWorkRef.current.get(roomId);
    if (running && !waitForBusy) return false;
    while (running) {
      await running.catch(() => false);
      running = meetingEventWorkRef.current.get(roomId);
    }
    const task = work();
    meetingEventWorkRef.current.set(roomId, task);
    try {
      return await task;
    } finally {
      if (meetingEventWorkRef.current.get(roomId) === task) {
        meetingEventWorkRef.current.delete(roomId);
      }
    }
  }

  async function maybeStartMeetingEvent(roomId: string, latestUserInput: string): Promise<boolean> {
    const operationEpoch = runtimeEpochRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch)) return false;
    return runMeetingEventWork(roomId, false, async () => {
      if (!isRuntimeEpochCurrent(operationEpoch)) return false;
      const current = stateRef.current;
      if (!current) return false;
      const groupRoom = (current.groupRooms || []).find(item => item.id === roomId);
      if (groupRoom) {
        if (hasOpenMeeting(current, roomId)) return false;
        const result = await shouldStartGroupMeetingEvent(current, roomId, latestUserInput);
        if (!isRuntimeEpochCurrent(operationEpoch)) return false;
        if (!result.shouldStartNow) return false;
        const latest = stateRef.current || current;
        if (!meetingRoomExists(latest, roomId)) return false;
        if (hasOpenMeeting(latest, roomId)) return true;
        const next = await createGroupMeetingEventSession(latest, roomId, result);
        if (!isRuntimeEpochCurrent(operationEpoch)) return false;
        const beforeCommit = stateRef.current || latest;
        if (!meetingRoomExists(beforeCommit, roomId)) return false;
        if (hasOpenMeeting(beforeCommit, roomId)) return true;
        await commitFromRenderedSnapshot(latest, next, { conflict: 'latest' });
        return true;
      }
      const room = allRooms(current).find(item => item.id === roomId);
      if (!room || room.type === 'random') return false;
      if (hasOpenMeeting(current, roomId)) return false;
      const result = await shouldStartMeetingEvent(current, roomId, latestUserInput);
      if (!isRuntimeEpochCurrent(operationEpoch)) return false;
      if (!result.shouldStart) return false;
      const latest = stateRef.current || current;
      if (!meetingRoomExists(latest, roomId)) return false;
      if (hasOpenMeeting(latest, roomId)) return true;
      const next = await createMeetingEventSession(latest, roomId, result);
      if (!isRuntimeEpochCurrent(operationEpoch)) return false;
      const beforeCommit = stateRef.current || latest;
      if (!meetingRoomExists(beforeCommit, roomId)) return false;
      if (hasOpenMeeting(beforeCommit, roomId)) return true;
      await commitFromRenderedSnapshot(latest, next, { conflict: 'latest' });
      return true;
    });
  }

  async function requestManualMeetingEvent(roomId: string): Promise<boolean> {
    const operationEpoch = runtimeEpochRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch)) return false;
    return runMeetingEventWork(roomId, true, async () => {
      if (!isRuntimeEpochCurrent(operationEpoch)) return false;
      const current = stateRef.current;
      if (!current) return false;
      const groupRoom = (current.groupRooms || []).find(item => item.id === roomId);
      if (groupRoom) {
        if (hasOpenMeeting(current, roomId)) return true;
        const next = await createManualGroupMeetingEventPrompt(current, roomId);
        if (!isRuntimeEpochCurrent(operationEpoch)) return false;
        if (next === current) return false;
        const beforeCommit = stateRef.current || current;
        if (!meetingRoomExists(beforeCommit, roomId)) return false;
        if (hasOpenMeeting(beforeCommit, roomId)) return true;
        await commitFromRenderedSnapshot(current, next, { conflict: 'latest' });
        return true;
      }
      const room = allRooms(current).find(item => item.id === roomId);
      if (!room || room.type === 'random') return false;
      if (hasOpenMeeting(current, roomId)) return true;
      const next = await createManualMeetingEventPrompt(current, roomId);
      if (!isRuntimeEpochCurrent(operationEpoch)) return false;
      if (next === current) return false;
      const beforeCommit = stateRef.current || current;
      if (!meetingRoomExists(beforeCommit, roomId)) return false;
      if (hasOpenMeeting(beforeCommit, roomId)) return true;
      await commitFromRenderedSnapshot(current, next, { conflict: 'latest' });
      return true;
    });
  }

  function resumeInterruptedReplies(snapshot: SNSGodState, jobs: PendingReplyJob[]) {
    if (isServerMessagingEnabled(snapshot)) return;
    const operationEpoch = runtimeEpochRef.current;
    for (const job of jobs) {
      const sourceMessage = (snapshot.messages[job.roomId] || []).find(message => message.id === job.sourceMessageId);
      void appendDebugLog('reply.recover', `resume room=${job.roomId} character=${job.characterId} message=${job.sourceMessageId} attempt=${job.attempt}`);
      void startReplyJob({
        roomId: job.roomId,
        characterId: job.characterId,
        sourceMessageId: job.sourceMessageId,
        latestUserInput: job.latestUserInput,
        latestUserImageData: job.latestUserImageData
          || (typeof sourceMessage?.mediaData === 'string' ? sourceMessage.mediaData : undefined),
        userMessageCreatedAt: job.sourceMessageCreatedAt,
        randomMode: job.creationMode === 'random',
        resumeJob: job,
        getState: () => isRuntimeEpochCurrent(operationEpoch) ? stateRef.current : null,
        commitCurrent: (patch, commitOptions) => commitCurrentAtEpoch(operationEpoch, patch, commitOptions),
      });
    }
  }

  async function executeImportedStateRestore(
    base: SNSGodState,
    prepare: () => Promise<Pick<PreparedFullBackupRestore, 'state'> & Partial<Pick<PreparedFullBackupRestore, 'rollback'>>>,
  ): Promise<void> {
    if (restoringRef.current) throw new Error('다른 백업을 복원하는 중입니다.');
    const currentBeforeRestore = stateRef.current;
    if (currentBeforeRestore && !Object.is(currentBeforeRestore.__importedAt, base.__importedAt)) {
      throw new Error('이 파일을 읽는 동안 다른 복구가 완료되어 이전 복구 요청을 취소했습니다.');
    }
    restoringRef.current = true;
    runtimeEpochRef.current += 1;
    cancelAllChatJobs();
    resetReplyLlmQueue();
    resetDatingImageQueue();
    const sumGodBackupGeneration = invalidateSumGodBackupWrites();
    meetingEventWorkRef.current.clear();
    oracleSyncPendingReasonRef.current = null;
    persistedMediaUrisRef.current.clear();
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
    let prepared: Awaited<ReturnType<typeof prepare>> | undefined;
    let stateImportStarted = false;
    try {
      await flushSaveState(undefined, { reason: 'before full backup import' });
      prepared = await prepare();
      const restoredCandidate = currentBeforeRestore && currentBeforeRestore !== base
        ? mergeStaleState(currentBeforeRestore, base, prepared.state, { intent: 'import' })
        : prepared.state;
      const candidate = currentBeforeRestore ? carryStateSecrets(currentBeforeRestore, restoredCandidate) : restoredCandidate;
      stateImportStarted = true;
      await importState(candidate, JSON.stringify(candidate));
      const next = reconcileLoadedState(await loadState()).state;
      await flushSaveState(next, { important: true, reason: 'pending reply restore reconciliation' });
      await replaceSumGodBackup(
        getSumGodProgress(next),
        next.__importedAt,
        sumGodBackupGeneration,
      ).catch(error => {
        void appendDebugLog('sumgod.backup', `restore sidecar replacement failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      });
      routeHistoryRef.current = [];
      routeEpochRef.current += 1;
      routeRef.current = { name: 'chatList' };
      setIncomingCall(null);
      setRoute({ name: 'chatList' });
      setState(next);
      stateRef.current = next;
      serverPolicyFingerprintRef.current = '';
      setRuntimeReloadNonce(value => value + 1);
      void appendDebugLog('debug', `full backup restored: characters=${next.characters.length}`);
    } catch (error) {
      const rollbackErrors: Error[] = [];
      if (prepared?.rollback) {
        try {
          await prepared.rollback();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
        }
      }
      if (stateImportStarted && currentBeforeRestore) {
        try {
          await importState(currentBeforeRestore, JSON.stringify(currentBeforeRestore));
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
        }
      }
      if (currentBeforeRestore) {
        const recovered = cancelAllPendingReplyJobs(currentBeforeRestore, 'restore-runtime-reset');
        stateRef.current = recovered;
        setState(recovered);
      }
      setRuntimeReloadNonce(value => value + 1);
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error instanceof Error ? error : new Error(String(error)), ...rollbackErrors],
          '백업 복원에 실패했고 일부 rollback도 완료하지 못했습니다.',
        );
      }
      throw error;
    } finally {
      restoringRef.current = false;
    }
  }

  async function restoreImportedState(base: SNSGodState, imported: SNSGodState): Promise<void> {
    await executeImportedStateRestore(base, async () => ({ state: imported }));
  }

  async function restoreFullBackup(base: SNSGodState, uri: string, password?: string): Promise<void> {
    await executeImportedStateRestore(base, () => importFullBackupZip(uri, password));
  }

  async function reloadSavedState(options: { discardRuntime?: boolean } = {}) {
    const current = stateRef.current;
    if (current && options.discardRuntime !== true) await flushSaveState(current, {
      backup: 'force',
      verify: 'full',
      reason: 'reload saved state',
      onMediaExternalized: applyPersistedMediaUris,
    });
    const next = reconcileLoadedState(await loadState()).state;
    setState(next);
    stateRef.current = next;
    void appendDebugLog('debug', `saved state reloaded: characters=${next.characters.length}`);
  }

  async function reloadBundle() {
    void appendDebugLog('debug', 'JS bundle reload requested');
    const current = stateRef.current;
    if (current) await flushSaveState(current, {
      backup: 'force',
      verify: 'full',
      reason: 'reload bundle',
      onMediaExternalized: applyPersistedMediaUris,
    });
    try {
      DevSettings.reload();
    } catch (error) {
      void appendDebugLog('debug', `DevSettings reload unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
    const next = reconcileLoadedState(await loadState()).state;
    routeHistoryRef.current = [];
    routeEpochRef.current += 1;
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
    routeHistoryRef.current = [];
    navigate({ name: routeForRoot(tab) }, { replace: true });
  }

  function activeBottomTab(): BottomTab {
    return rootForRouteName(route.name);
  }

  const showBottomNav = shouldShowBottomNavigation(route.name);

  async function leaveRandomRoom(roomId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current) return;
    const deletion = deleteRoomCascade(current, roomId);
    for (const affectedRoomId of deletion.cancelledJobRoomIds) cancelChatJob(affectedRoomId);
    await commit(deletion.state);
    if (!isRuntimeEpochCurrent(operationEpoch)) return;
    navigate({ name: 'random' }, { replace: true });
  }

  async function promoteRandomRoom(roomId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current) return;
    const { next, newRoomId } = promoteRandomChatRoom(current, roomId);
    if (!newRoomId) {
      Alert.alert('승격 실패', '랜덤채팅 방을 찾지 못했습니다.');
      return;
    }
    await commit(next);
    if (!isRuntimeEpochCurrent(operationEpoch)) return;
    navigate({ name: 'chatRoom', roomId: newRoomId }, { replace: true });
  }

  async function handleDeleteCharacter(characterId: string) {
    const operationEpoch = runtimeEpochRef.current;
    const current = stateRef.current;
    if (!isRuntimeEpochCurrent(operationEpoch) || !current) return;
    const deletion = deleteCharacterCascade(current, characterId);
    for (const roomId of deletion.cancelledJobRoomIds) cancelChatJob(roomId);
    await commit(deletion.state);
    if (!isRuntimeEpochCurrent(operationEpoch)) return;
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
        <View style={styles.loadingBrandMark}>
          <Text style={styles.loadingBrandText}>sns</Text>
        </View>
        <Text style={styles.loadingSystemText}>시스템 초기화 중</Text>
      </SafeAreaView>
    );
  }

  const renderedEpoch = runtimeEpochRef.current;
  const renderedRouteEpoch = routeEpochRef.current;
  const isRenderedScreenCurrent = (): boolean => (
    isRuntimeEpochCurrent(renderedEpoch) && routeEpochRef.current === renderedRouteEpoch
  );
  const commitRenderedState = (next: SNSGodState, options: CommitOptions = {}): Promise<void> => (
    isRuntimeEpochCurrent(renderedEpoch)
      ? commitFromRenderedSnapshot(state, next, options)
      : Promise.resolve()
  );
  const commitRenderedRouteState = (next: SNSGodState, options: CommitOptions = {}): Promise<void> => (
    isRenderedScreenCurrent()
      ? commitFromRenderedSnapshot(state, next, options)
      : Promise.resolve()
  );
  const commitRenderedStateAndFlush = (next: SNSGodState): Promise<void> => (
    isRuntimeEpochCurrent(renderedEpoch)
      ? commitAndFlush(state, next)
      : Promise.resolve()
  );
  const commitRenderedCurrent = (
    patch: (current: SNSGodState) => SNSGodState,
    options?: CommitOptions,
  ): Promise<void> => commitCurrentAtEpoch(renderedEpoch, patch, options);
  const commitRenderedCurrentForScreen = async (
    patch: (current: SNSGodState) => SNSGodState,
  ): Promise<SNSGodState | undefined> => {
    await commitCurrentAtEpoch(renderedEpoch, patch);
    return isRuntimeEpochCurrent(renderedEpoch) ? stateRef.current || undefined : undefined;
  };
  const requestRenderedReply = (...args: Parameters<typeof requestReply>): void => {
    if (isRuntimeEpochCurrent(renderedEpoch)) requestReply(...args);
  };
  const maybeStartRenderedMeeting = (...args: Parameters<typeof maybeStartMeetingEvent>): Promise<boolean> => (
    isRenderedScreenCurrent() ? maybeStartMeetingEvent(...args) : Promise.resolve(false)
  );
  const requestRenderedMeeting = (...args: Parameters<typeof requestManualMeetingEvent>): Promise<boolean> => (
    isRenderedScreenCurrent() ? requestManualMeetingEvent(...args) : Promise.resolve(false)
  );
  const requestRenderedServerReply = (...args: Parameters<typeof requestServerReply>): Promise<boolean> => (
    isRuntimeEpochCurrent(renderedEpoch) ? requestServerReply(...args) : Promise.resolve(false)
  );
  const deleteRenderedCharacter = (...args: Parameters<typeof handleDeleteCharacter>): Promise<void> => (
    isRenderedScreenCurrent() ? handleDeleteCharacter(...args) : Promise.resolve()
  );
  const leaveRenderedRandomRoom = (...args: Parameters<typeof leaveRandomRoom>): Promise<void> => (
    isRenderedScreenCurrent() ? leaveRandomRoom(...args) : Promise.resolve()
  );
  const promoteRenderedRandomRoom = (...args: Parameters<typeof promoteRandomRoom>): Promise<void> => (
    isRenderedScreenCurrent() ? promoteRandomRoom(...args) : Promise.resolve()
  );
  const navigateRendered = (...args: Parameters<typeof navigate>): void => {
    if (isRenderedScreenCurrent()) navigate(...args);
  };
  const goBackRendered = (): void => {
    if (isRenderedScreenCurrent()) goBack();
  };
  const openRenderedCharacterChat = (character: SNSGodCharacter): void => {
    if (isRenderedScreenCurrent()) openCharacterChat(character);
  };
  const openRenderedBottomTab = (tab: BottomTab): void => {
    if (isRenderedScreenCurrent()) openBottomTab(tab);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View key={runtimeReloadNonce} style={styles.content}>
      {route.name === 'settings' ? (
        <SettingsScreen
          state={state}
          onChange={commitRenderedState}
          onCommitCurrent={commitRenderedCurrentForScreen}
          onRestoreState={restoreImportedState}
          onRestoreFullBackup={restoreFullBackup}
          onBack={goBackRendered}
          onOpenLorebook={() => navigateRendered({ name: 'lorebook' })}
          onOpenPrompts={() => navigateRendered({ name: 'prompts' })}
          onOpenCharacterSettings={characterId => navigateRendered({ name: 'characterSettings', characterId })}
        />
      ) : route.name === 'lorebook' ? (
        <LorebookScreen state={state} onChange={commitRenderedState} onBack={goBackRendered} />
      ) : route.name === 'prompts' ? (
        <PromptSettingsScreen state={state} onChange={commitRenderedState} onBack={goBackRendered} />
      ) : route.name === 'feedHub' ? (
        <FeedHubScreen
          onOpenInstagram={() => navigateRendered({ name: 'sns', platform: 'instagram' })}
          onOpenX={() => navigateRendered({ name: 'sns', platform: 'twitter' })}
        />
      ) : route.name === 'sns' ? (
        <SNSScreen
          state={state}
          platform={route.platform}
          initialPostId={route.postId}
          initialThreadId={route.threadId}
          onChange={commitRenderedState}
        />
      ) : route.name === 'discoverHub' || route.name === 'archiveHub' ? (
        <MenuHubScreen
          mode={route.name === 'discoverHub' ? 'discover' : 'archive'}
          onOpenRandom={() => navigateRendered({ name: 'random' })}
          onOpenEncounter={() => navigateRendered({ name: 'streetEncounter' })}
          onOpenBlindDate={() => navigateRendered({ name: 'blindDate' })}
          onOpenDatingApp={() => navigateRendered({ name: 'datingApp' })}
          onOpenIdealWorldcup={() => navigateRendered({ name: 'idealWorldcup' })}
          onOpenReferences={() => navigateRendered({ name: 'references' })}
          onOpenSumGod={() => navigateRendered({ name: 'sumgod' })}
          onOpenGallery={() => navigateRendered({ name: 'gallery' })}
          onOpenSettings={() => navigateRendered({ name: 'settings' })}
          onOpenDebug={() => navigateRendered({ name: 'debug' })}
        />
      ) : route.name === 'gallery' ? (
        <GalleryScreen
          state={state}
          onChange={commitRenderedState}
          onCommitCurrent={commitRenderedCurrentForScreen}
          onBack={goBackRendered}
          onPreviewMediaCleanup={previewCurrentMediaCleanup}
          onTrashMediaCleanup={trashCurrentUnreachableMedia}
          onUnlinkAlbumReference={unlinkCurrentAlbumReference}
          onTrashAlbumAssets={trashCurrentAlbumAssets}
          onRestoreAlbumTrash={restoreCurrentAlbumTrash}
          onPurgeAlbumTrash={purgeCurrentAlbumTrash}
        />
      ) : route.name === 'debug' ? (
        <DebugScreen state={state} onBack={goBackRendered} onRestoreFullBackup={restoreFullBackup} onReloadState={reloadSavedState} onReloadBundle={reloadBundle} onSaveNow={() => flushSaveState(stateRef.current || undefined, {
          backup: 'force',
          verify: 'full',
          reason: 'debug manual save',
          onMediaExternalized: applyPersistedMediaUris,
        })} />
      ) : route.name === 'random' ? (
        <RandomChatScreen state={state} onChange={commitRenderedState} onBack={goBackRendered} onOpenRoom={roomId => navigateRendered({ name: 'randomChatRoom', roomId })} />
      ) : route.name === 'sumgod' ? (
        <SumGodScreen state={state} onChange={commitRenderedState} onCommitCurrent={commitRenderedCurrentForScreen} onBack={goBackRendered} />
      ) : route.name === 'streetEncounter' ? (
        <BlindDateScreen state={state} onChange={commitRenderedRouteState} onBack={goBackRendered} onOpenRoom={roomId => navigateRendered({ name: 'chatRoom', roomId }, { replace: true })} entryMode="encounter" />
      ) : route.name === 'blindDate' ? (
        <BlindDateScreen state={state} onChange={commitRenderedRouteState} onBack={goBackRendered} onOpenRoom={roomId => navigateRendered({ name: 'chatRoom', roomId }, { replace: true })} />
      ) : route.name === 'datingApp' ? (
        <DatingAppScreen state={state} onChange={commitRenderedRouteState} onBack={goBackRendered} onOpenRoom={roomId => navigateRendered({ name: 'chatRoom', roomId }, { replace: true })} />
      ) : route.name === 'idealWorldcup' ? (
        <IdealWorldcupScreen state={state} onChange={commitRenderedRouteState} onBack={goBackRendered} onOpenRoom={roomId => navigateRendered({ name: 'chatRoom', roomId }, { replace: true })} />
      ) : route.name === 'references' ? (
        <ReferenceFaceScreen state={state} onChange={commitRenderedStateAndFlush} onBack={goBackRendered} />
      ) : route.name === 'notifications' ? (
        <NotificationsScreen
          state={state}
          onChange={commitRenderedState}
          onBack={goBackRendered}
          onOpenNotification={openNotificationItem}
        />
      ) : route.name === 'profile' ? (
        <ProfileScreen
          state={state}
          characterId={route.characterId}
          roomId={route.returnRoomId}
          onBack={goBackRendered}
          onOpenChat={openRenderedCharacterChat}
          onOpenCall={character => navigateRendered({ name: 'call', characterId: character.id, roomId: route.returnRoomId, returnRoute: route })}
          onOpenSettings={character => navigateRendered({ name: 'characterSettings', characterId: character.id, returnRoomId: route.returnRoomId })}
        />
      ) : route.name === 'call' ? (
        <CallScreen state={state} characterId={route.characterId} roomId={route.roomId} sourceMessageId={route.sourceMessageId} onBack={goBackRendered} onChange={commitRenderedState} onCommitCurrent={commitRenderedCurrentForScreen} onRequestReply={requestRenderedReply} />
      ) : route.name === 'meeting' ? (
        <MeetingEventScreen state={state} sessionId={route.sessionId} onBack={goBackRendered} onChange={commitRenderedState} />
      ) : route.name === 'roomSettings' ? (
        <RoomSettingsScreen state={state} roomId={route.roomId} onChange={commitRenderedState} onCommitCurrent={commitRenderedCurrentForScreen} onBack={goBackRendered} />
      ) : route.name === 'groupRoomSettings' ? (
        <GroupRoomSettingsScreen state={state} roomId={route.roomId} onChange={commitRenderedState} onBack={goBackRendered} />
      ) : route.name === 'characterSettings' ? (
        <CharacterSettingsScreen state={state} characterId={route.characterId} onChange={commitRenderedState} onBack={goBackRendered} onDelete={deleteRenderedCharacter} />
      ) : route.name === 'newRoom' ? (
        <NewRoomScreen state={state} onBack={goBackRendered} onCreate={async (next, roomId) => { await commitRenderedState(next); navigateRendered({ name: 'chatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'newGroupRoom' ? (
        <NewGroupRoomScreen state={state} onBack={goBackRendered} onCreate={async (next, roomId) => { await commitRenderedState(next); navigateRendered({ name: 'groupChatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'newCharacter' ? (
        <NewCharacterScreen state={state} onBack={goBackRendered} onCreate={async (next, roomId) => { await commitRenderedState(next); navigateRendered({ name: 'chatRoom', roomId }, { replace: true }); }} />
      ) : route.name === 'groupChatRoom' ? (
        <GroupChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commitRenderedState}
          onCommitCurrent={commitRenderedCurrentForScreen}
          onBack={goBackRendered}
          onOpenSettings={roomId => navigateRendered({ name: 'groupRoomSettings', roomId, returnRoomId: route.roomId })}
          onOpenMeeting={sessionId => navigateRendered({ name: 'meeting', sessionId, returnRoute: route })}
          onMaybeStartMeeting={maybeStartRenderedMeeting}
          onRequestMeetingPrompt={requestRenderedMeeting}
          onRequestServerReply={requestRenderedServerReply}
        />
      ) : route.name === 'chatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commitRenderedState}
          onCommitCurrent={commitRenderedCurrent}
          onBack={goBackRendered}
          onOpenRoomSettings={roomId => navigateRendered({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigateRendered({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigateRendered({ name: 'profile', characterId, returnRoomId: route.roomId })}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigateRendered({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
          onOpenMeeting={sessionId => navigateRendered({ name: 'meeting', sessionId, returnRoute: route })}
          onMaybeStartMeeting={maybeStartRenderedMeeting}
          onRequestMeetingPrompt={requestRenderedMeeting}
          onRequestReply={requestRenderedReply}
        />
      ) : route.name === 'randomChatRoom' ? (
        <ChatRoomScreen
          state={state}
          roomId={route.roomId}
          onChange={commitRenderedState}
          onCommitCurrent={commitRenderedCurrent}
          onBack={() => navigateRendered({ name: 'random' })}
          onOpenRoomSettings={roomId => navigateRendered({ name: 'roomSettings', roomId, returnRoomId: route.roomId })}
          onOpenCharacterSettings={characterId => navigateRendered({ name: 'characterSettings', characterId, returnRoomId: route.roomId })}
          onOpenProfile={characterId => navigateRendered({ name: 'profile', characterId, returnRoomId: route.roomId })}
          randomMode
          onLeaveRandomRoom={leaveRenderedRandomRoom}
          onPromoteRandomRoom={promoteRenderedRandomRoom}
          onOpenCall={(characterId, callRoomId, sourceMessageId) => navigateRendered({ name: 'call', characterId, roomId: callRoomId, sourceMessageId, returnRoute: route })}
          onOpenMeeting={sessionId => navigateRendered({ name: 'meeting', sessionId, returnRoute: route })}
          onMaybeStartMeeting={maybeStartRenderedMeeting}
          onRequestMeetingPrompt={requestRenderedMeeting}
          onRequestReply={requestRenderedReply}
        />
      ) : (
        <ChatListScreen
          state={state}
          onOpenRoom={roomId => navigateRendered({ name: 'chatRoom', roomId })}
          onNewRoom={() => navigateRendered({ name: 'newRoom' })}
          onNewGroupRoom={() => navigateRendered({ name: 'newGroupRoom' })}
          onNewCharacter={() => navigateRendered({ name: 'newCharacter' })}
          onOpenProfile={characterId => navigateRendered({ name: 'profile', characterId })}
          onOpenNotifications={() => navigateRendered({ name: 'notifications' })}
          onOpenGroupRoom={roomId => navigateRendered({ name: 'groupChatRoom', roomId })}
          onOpenGroupSettings={roomId => navigateRendered({ name: 'groupRoomSettings', roomId, returnRoomId: roomId })}
          onOpenCall={(characterId, roomId) => navigateRendered({ name: 'call', characterId, roomId, returnRoute: { name: 'chatRoom', roomId } })}
          onOpenCharacterSettings={characterId => navigateRendered({ name: 'characterSettings', characterId })}
          onChange={commitRenderedState}
        />
      )}
      </View>
      {showBottomNav && !keyboardVisible ? <BottomNav active={activeBottomTab()} onSelect={openRenderedBottomTab} /> : null}
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0877f2' },
  loadingBrandMark: { alignItems: 'center', justifyContent: 'center' },
  loadingBrandText: { color: '#fff', fontSize: 86, lineHeight: 96, fontWeight: '900', letterSpacing: 0 },
  loadingSystemText: { position: 'absolute', bottom: 42, left: 24, right: 24, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  incomingOverlay: { ...StyleSheet.absoluteFill, zIndex: 50, backgroundColor: 'rgba(5,11,22,0.76)', alignItems: 'center', justifyContent: 'center', padding: 24 },
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
