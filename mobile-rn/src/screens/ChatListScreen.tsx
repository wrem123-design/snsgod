import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { GroupRoom, SNSGodCharacter, SNSGodRoom, SNSGodState } from '../types';
import { cancelChatJob } from '../logic/chatJobs';
import { deleteRoom, updateRoom } from '../logic/stateHelpers';

type Row = {
  kind: 'direct';
  character: SNSGodCharacter;
  room: SNSGodRoom;
  lastText: string;
  unread: number;
  lastActivity: number;
};

type GroupRow = {
  kind: 'group';
  room: GroupRoom;
  participants: SNSGodCharacter[];
  lastText: string;
  unread: number;
  lastActivity: number;
};

type DisabledToggleRow = { kind: 'disabledToggle'; count: number; expanded: boolean };
type ListRow = Row | GroupRow | DisabledToggleRow;
type RoomContextMenu = { row: Row | GroupRow; top: number };

function rowsFromState(state: SNSGodState): { activeRows: Array<Row | GroupRow>; inactiveRows: Array<Row | GroupRow> } {
  const randomRoomIds = new Set((state.randomChats || []).map(room => room.id));
  const directRows = state.characters.filter(character => character.randomTemporary !== true).flatMap(character => {
    const rooms = state.chatRooms[character.id] || [];
    return rooms.filter(room => room.type !== 'random' && room.randomChat !== true && !randomRoomIds.has(room.id)).map(room => {
      const messages = state.messages[room.id] || [];
      const last = messages[messages.length - 1];
      return { kind: 'direct' as const, character, room, lastText: last?.content || '새 채팅', unread: state.unreadCounts[room.id] || 0, lastActivity: room.lastActivity || room.createdAt || 0 };
    });
  });
  const groupRows = (state.groupRooms || []).map(room => {
    const messages = state.messages[room.id] || [];
    const last = messages[messages.length - 1];
    const participantIds = Array.isArray(room.participantIds) ? room.participantIds : [];
    return {
      kind: 'group' as const,
      room: { ...room, participantIds },
      participants: state.characters.filter(character => participantIds.includes(character.id)),
      lastText: last?.content || `${participantIds.length}명의 단톡방`,
      unread: state.unreadCounts[room.id] || 0,
      lastActivity: room.lastActivity || room.createdAt || 0
    };
  });
  const sorted = [...directRows, ...groupRows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
    return b.lastActivity - a.lastActivity;
  });
  return {
    activeRows: sorted.filter(item => item.room.disabled !== true),
    inactiveRows: sorted.filter(item => item.room.disabled === true)
  };
}

export function ChatListScreen({ state, onOpenSettings, onOpenRoom, onNewRoom, onNewGroupRoom, onNewCharacter, onOpenProfile, onOpenNotifications, onOpenGroupRoom, onOpenGroupSettings, onOpenCall, onOpenCharacterSettings, onChange }: {
  state: SNSGodState;
  onOpenSettings: () => void;
  onOpenRoom: (roomId: string) => void;
  onNewRoom: () => void;
  onNewGroupRoom: () => void;
  onNewCharacter: () => void;
  onOpenProfile: (characterId: string) => void;
  onOpenNotifications: () => void;
  onOpenGroupRoom: (roomId: string) => void;
  onOpenGroupSettings: (roomId: string) => void;
  onOpenCall: (characterId: string, roomId: string) => void;
  onOpenCharacterSettings: (characterId: string) => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const { activeRows, inactiveRows } = useMemo(
    () => rowsFromState(state),
    [state.characters, state.chatRooms, state.groupRooms, state.messages, state.randomChats, state.unreadCounts]
  );
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [menu, setMenu] = useState<RoomContextMenu | null>(null);
  const rows: ListRow[] = inactiveRows.length
    ? [...activeRows, { kind: 'disabledToggle', count: inactiveRows.length, expanded: inactiveExpanded }, ...(inactiveExpanded ? inactiveRows : [])]
    : activeRows;
  const kakaoTheme = state.config.snsTheme === 'kakao';
  const headerActions = [
    { label: '새 개인채팅', icon: '1:1', onPress: onNewRoom },
    { label: '새 그룹채팅', icon: 'G', onPress: onNewGroupRoom },
    { label: '새 캐릭터', icon: '+', onPress: onNewCharacter },
    { label: '설정', icon: '⚙', onPress: onOpenSettings }
  ];

  function openRoom(row: Row | GroupRow) {
    setMenu(null);
    row.kind === 'group' ? onOpenGroupRoom(row.room.id) : onOpenRoom(row.room.id);
  }

  function openRowMenu(row: Row | GroupRow, pageY: number) {
    setMenu({ row, top: Math.max(78, Math.min(pageY - 8, 520)) });
  }

  async function toggleRoomDisabled(row: Row | GroupRow) {
    setMenu(null);
    const disabled = row.room.disabled !== true;
    cancelChatJob(row.room.id);
    const pendingReplies = { ...(state.pendingReplies || {}) };
    delete pendingReplies[row.room.id];
    if (row.kind === 'group') {
      await onChange({
        ...state,
        pendingReplies,
        groupRooms: (state.groupRooms || []).map(room => room.id === row.room.id ? { ...room, disabled, disabledAt: disabled ? Date.now() : undefined } : room)
      });
      return;
    }
    await onChange({
      ...updateRoom(state, row.room.id, { disabled, disabledAt: disabled ? Date.now() : undefined }),
      pendingReplies
    });
  }

  function confirmDeleteRoom(row: Row | GroupRow) {
    setMenu(null);
    const title = row.kind === 'group' ? '단톡방 삭제' : '채팅방 삭제';
    const name = row.kind === 'group' ? row.room.name : row.character.name;
    Alert.alert(title, `${name} 채팅방을 삭제할까요? 메시지와 안읽음 기록도 함께 삭제되며 되돌릴 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          cancelChatJob(row.room.id);
          if (row.kind === 'group') {
            const messages = { ...state.messages };
            const unreadCounts = { ...state.unreadCounts };
            const pendingReplies = { ...(state.pendingReplies || {}) };
            delete messages[row.room.id];
            delete unreadCounts[row.room.id];
            delete pendingReplies[row.room.id];
            await onChange({
              ...state,
              groupRooms: (state.groupRooms || []).filter(room => room.id !== row.room.id),
              messages,
              unreadCounts,
              pendingReplies,
              roomSummaries: (state.roomSummaries || []).filter(summary => summary.roomId !== row.room.id),
              groupRoomSummaries: (state.groupRoomSummaries || []).filter(summary => summary.roomId !== row.room.id),
              characterMemories: (state.characterMemories || []).filter(memory => memory.sourceRoomId !== row.room.id),
              selectedRoomId: state.selectedRoomId === row.room.id ? undefined : state.selectedRoomId
            });
            return;
          }
          const next = deleteRoom(state, row.room.id);
          const pendingReplies = { ...(next.pendingReplies || {}) };
          delete pendingReplies[row.room.id];
          await onChange({ ...next, pendingReplies });
        }
      }
    ]);
  }

  function renderContextMenu() {
    if (!menu) return null;
    const row = menu.row;
    const disabled = row.room.disabled === true;
    const actions = row.kind === 'group'
      ? [
        { label: '채팅하기', onPress: () => openRoom(row) },
        { label: '정보 변경', onPress: () => { setMenu(null); onOpenGroupSettings(row.room.id); } },
        { label: disabled ? '채팅 활성화' : '채팅 비활성화', onPress: () => void toggleRoomDisabled(row) },
        { label: '채팅 삭제', danger: true, onPress: () => confirmDeleteRoom(row) }
      ]
      : [
        { label: '채팅하기', onPress: () => openRoom(row) },
        { label: '전화하기', onPress: () => { setMenu(null); onOpenCall(row.character.id, row.room.id); } },
        { label: '프로필 보기', onPress: () => { setMenu(null); onOpenProfile(row.character.id); } },
        { label: '정보 변경', onPress: () => { setMenu(null); onOpenCharacterSettings(row.character.id); } },
        { label: disabled ? '채팅 활성화' : '채팅 비활성화', onPress: () => void toggleRoomDisabled(row) },
        { label: '채팅 삭제', danger: true, onPress: () => confirmDeleteRoom(row) }
      ];
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(null)}>
          <View style={[styles.contextMenu, { top: menu.top }]}>
            {actions.map((action, index) => (
              <Pressable key={action.label} onPress={action.onPress} style={[styles.contextMenuItem, index === actions.length - 1 && styles.contextMenuLastItem]}>
                <Text style={[styles.contextMenuText, action.danger && styles.contextMenuDangerText]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={[styles.screen, !kakaoTheme && styles.screenDefault]}>
      <View style={[styles.header, !kakaoTheme && styles.headerDefault]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>채팅</Text>
          <View style={styles.headerActions}>
            {headerActions.map(action => (
              <Pressable key={action.label} accessibilityLabel={action.label} onPress={action.onPress} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
                <Text style={[styles.roundIconText, action.icon.length > 1 && styles.roundIconTextSmall]}>{action.icon}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={item => item.kind === 'disabledToggle' ? 'disabled-chat-rooms-toggle' : item.room.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => item.kind === 'disabledToggle' ? (
          <Pressable style={[styles.disabledSectionRow, !kakaoTheme && styles.rowDefault]} onPress={() => setInactiveExpanded(value => !value)}>
            <Text style={styles.disabledSectionTitle}>{item.expanded ? '⌄' : '›'} 비활성화 채팅방 목록</Text>
            <Text style={styles.disabledSectionCount}>{item.count}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.row, item.room.disabled === true && styles.rowDisabled, !kakaoTheme && styles.rowDefault]}
            onPress={() => item.kind === 'group' ? onOpenGroupRoom(item.room.id) : onOpenRoom(item.room.id)}
            onLongPress={event => openRowMenu(item, event.nativeEvent.pageY)}
            delayLongPress={360}
          >
            {item.kind === 'group' ? (
              <GroupAvatar participants={item.participants} />
            ) : (
              <Pressable onPress={() => onOpenProfile(item.character.id)}><Avatar character={item.character} size={54} /></Pressable>
            )}
            <View style={[styles.rowBody, !kakaoTheme && styles.rowBodyDefault]}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.kind === 'group' ? `${item.room.name} ${item.participants.length}` : item.character.name}</Text>
                {item.unread > 0 ? <Text style={styles.badge}>{item.unread}</Text> : null}
              </View>
              <Text style={styles.preview} numberOfLines={1}>{item.room.disabled === true ? `비활성화됨 · ${item.lastText}` : item.lastText}</Text>
            </View>
          </Pressable>
        )}
      />
      {renderContextMenu()}
    </View>
  );
}

function GroupAvatar({ participants }: { participants: SNSGodCharacter[] }) {
  const visible = participants.slice(0, 4);
  return (
    <View style={styles.groupAvatar}>
      {visible.map((character, index) => (
        <View key={character.id} style={[styles.groupAvatarItem, index === 1 && styles.groupAvatarItemRight, index === 2 && styles.groupAvatarItemBottom, index === 3 && styles.groupAvatarItemBottomRight]}>
          <Avatar character={character} size={26} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  screenDefault: { backgroundColor: colors.bg },
  header: { minHeight: 72, paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  headerDefault: { backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 27, fontWeight: '900', color: '#050505' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  roundIconDefault: { backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border },
  roundIconText: { color: '#333', fontWeight: '900', fontSize: 20, lineHeight: 24 },
  roundIconTextSmall: { fontSize: 12, lineHeight: 16 },
  alertBadge: { position: 'absolute', top: -3, right: -4, minWidth: 19, height: 19, borderRadius: 10, overflow: 'hidden', lineHeight: 19, textAlign: 'center', backgroundColor: colors.danger, color: '#fff', fontWeight: '900', fontSize: 11 },
  list: { paddingBottom: 24 },
  row: { minHeight: 86, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowDisabled: { opacity: 0.72 },
  rowDefault: { marginHorizontal: 10, marginVertical: 4, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  rowBody: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8', paddingVertical: 16 },
  rowBodyDefault: { borderBottomWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 17, color: '#111', fontWeight: '900' },
  preview: { marginTop: 5, fontSize: 15, color: '#6a6f77' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, color: '#fff', textAlign: 'center', overflow: 'hidden', fontWeight: '900', lineHeight: 22 }
  ,
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  contextMenu: { position: 'absolute', left: 78, width: 168, borderRadius: 6, borderWidth: 1, borderColor: '#cfc7b9', backgroundColor: '#fffefa', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7 },
  contextMenuItem: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8dfd0' },
  contextMenuLastItem: { borderBottomWidth: 0, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e8dfd0' },
  contextMenuText: { color: colors.text, fontSize: 15, fontWeight: '900' },
  contextMenuDangerText: { color: colors.danger },
  disabledSectionRow: { minHeight: 52, marginTop: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e0e0e0' },
  disabledSectionTitle: { color: '#4d5560', fontSize: 15, fontWeight: '900' },
  disabledSectionCount: { minWidth: 24, height: 24, borderRadius: 12, overflow: 'hidden', lineHeight: 24, textAlign: 'center', backgroundColor: '#eee8dc', color: colors.text, fontWeight: '900' },
  groupAvatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#edf1f5', position: 'relative', overflow: 'hidden' },
  groupAvatarItem: { position: 'absolute', left: 3, top: 3, width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  groupAvatarItemRight: { left: 25 },
  groupAvatarItemBottom: { top: 25 },
  groupAvatarItemBottomRight: { left: 25, top: 25 }
});
