import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { GroupRoom, SNSGodCharacter, SNSGodRoom, SNSGodState } from '../types';

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

function rowsFromState(state: SNSGodState): Array<Row | GroupRow> {
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
  return [...directRows, ...groupRows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
    return b.lastActivity - a.lastActivity;
  });
}

export function ChatListScreen({ state, onOpenSettings, onOpenRoom, onNewRoom, onNewGroupRoom, onNewCharacter, onOpenProfile, onOpenNotifications, onOpenGroupRoom }: {
  state: SNSGodState;
  onOpenSettings: () => void;
  onOpenRoom: (roomId: string) => void;
  onNewRoom: () => void;
  onNewGroupRoom: () => void;
  onNewCharacter: () => void;
  onOpenProfile: (characterId: string) => void;
  onOpenNotifications: () => void;
  onOpenGroupRoom: (roomId: string) => void;
}) {
  const rows = useMemo(
    () => rowsFromState(state),
    [state.characters, state.chatRooms, state.groupRooms, state.messages, state.randomChats, state.unreadCounts]
  );
  const kakaoTheme = state.config.snsTheme === 'kakao';
  const headerActions = [
    { label: '새 개인채팅', icon: '1:1', onPress: onNewRoom },
    { label: '새 그룹채팅', icon: 'G', onPress: onNewGroupRoom },
    { label: '새 캐릭터', icon: '+', onPress: onNewCharacter },
    { label: '설정', icon: '⚙', onPress: onOpenSettings }
  ];
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
        keyExtractor={item => item.room.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, !kakaoTheme && styles.rowDefault]} onPress={() => item.kind === 'group' ? onOpenGroupRoom(item.room.id) : onOpenRoom(item.room.id)}>
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
              <Text style={styles.preview} numberOfLines={1}>{item.lastText}</Text>
            </View>
          </Pressable>
        )}
      />
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
  rowDefault: { marginHorizontal: 10, marginVertical: 4, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  rowBody: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8', paddingVertical: 16 },
  rowBodyDefault: { borderBottomWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 17, color: '#111', fontWeight: '900' },
  preview: { marginTop: 5, fontSize: 15, color: '#6a6f77' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, color: '#fff', textAlign: 'center', overflow: 'hidden', fontWeight: '900', lineHeight: 22 }
  ,
  groupAvatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#edf1f5', position: 'relative', overflow: 'hidden' },
  groupAvatarItem: { position: 'absolute', left: 3, top: 3, width: 26, height: 26, borderRadius: 13, overflow: 'hidden' },
  groupAvatarItemRight: { left: 25 },
  groupAvatarItemBottom: { top: 25 },
  groupAvatarItemBottomRight: { left: 25, top: 25 }
});
