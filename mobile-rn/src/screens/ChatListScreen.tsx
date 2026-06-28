import React from 'react';
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
  const directRows = state.characters.flatMap(character => {
    const rooms = state.chatRooms[character.id] || [];
    return rooms.map(room => {
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
  const rows = rowsFromState(state);
  const unreadNotifications = (state.notifications || []).filter(item => !item.read).length;
  const kakaoTheme = state.config.snsTheme === 'kakao';
  return (
    <View style={[styles.screen, !kakaoTheme && styles.screenDefault]}>
      <View style={[styles.header, !kakaoTheme && styles.headerDefault]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>채팅</Text>
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="알림" onPress={onOpenNotifications} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
              <Text style={styles.roundIconText}>!</Text>
              {unreadNotifications > 0 ? <Text style={styles.alertBadge}>{unreadNotifications}</Text> : null}
            </Pressable>
            <Pressable accessibilityLabel="새 개인채팅" onPress={onNewRoom} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
              <Text style={styles.roundIconText}>＋</Text>
            </Pressable>
            <Pressable accessibilityLabel="새 그룹채팅" onPress={onNewGroupRoom} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
              <Text style={styles.roundIconText}>▦</Text>
            </Pressable>
            <Pressable accessibilityLabel="새 캐릭터" onPress={onNewCharacter} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
              <Text style={styles.roundIconText}>◇</Text>
            </Pressable>
            <Pressable accessibilityLabel="설정" onPress={onOpenSettings} style={[styles.roundIcon, !kakaoTheme && styles.roundIconDefault]}>
              <Text style={styles.roundIconText}>⚙</Text>
            </Pressable>
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
                <Text style={styles.name}>{item.kind === 'group' ? `${item.room.name} ${item.participants.length}` : item.room.name === '기본 채팅' ? item.character.name : item.room.name}</Text>
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
  header: { minHeight: 72, paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  headerDefault: { backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', color: '#050505' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  roundIconDefault: { backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border },
  roundIconText: { color: '#333', fontWeight: '900', fontSize: 20, lineHeight: 24 },
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
