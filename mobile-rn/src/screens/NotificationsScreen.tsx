import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { NotificationItem, SNSGodState } from '../types';
import { markNotificationItemsRead } from '../logic/notifications';

function timeText(value: number) {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function NotificationsScreen({ state, onChange, onBack, onOpenNotification }: {
  state: SNSGodState;
  onChange: (next: SNSGodState) => void;
  onBack: () => void;
  onOpenNotification: (item: NotificationItem) => void;
}) {
  const notifications = [...(state.notifications || [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  function markAllRead() {
    const visibleIds = new Set(notifications.map(item => item.id));
    onChange(markNotificationItemsRead(state, [...visibleIds]));
  }

  function clearAll() {
    onChange({ ...state, notifications: [] });
  }

  function openItem(item: NotificationItem) {
    onOpenNotification(item);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>알림</Text>
        <Pressable onPress={markAllRead} style={styles.headerButton}><Text style={styles.headerButtonText}>읽음</Text></Pressable>
        <Pressable onPress={clearAll} style={styles.headerButton}><Text style={styles.headerButtonText}>정리</Text></Pressable>
      </View>
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>알림이 없습니다.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => openItem(item)} style={[styles.row, !item.read && styles.unreadRow]}>
            <View style={[styles.dot, item.read && styles.dotRead]} />
            <View style={styles.body}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text> : null}
            </View>
            <Text style={styles.time}>{timeText(item.createdAt)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: { height: 72, paddingTop: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#eee8dc' },
  backText: { fontSize: 32, color: colors.text, lineHeight: 34 },
  title: { flex: 1, color: colors.text, fontSize: 21, fontWeight: '900' },
  headerButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: colors.text, fontWeight: '900' },
  list: { paddingVertical: 8 },
  row: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ececec' },
  unreadRow: { backgroundColor: '#fff9df' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  dotRead: { backgroundColor: '#d5d5d5' },
  body: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  rowBody: { marginTop: 4, color: colors.sub, lineHeight: 19 },
  time: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  empty: { marginTop: 80, textAlign: 'center', color: colors.sub, fontWeight: '800' }
});
