import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type MenuItem = {
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
};

export function MenuHubScreen({ mode, onOpenSumGod, onOpenGallery, onOpenNotifications, onOpenSettings }: {
  mode: 'etc';
  onOpenSumGod: () => void;
  onOpenGallery: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
}) {
  const items: MenuItem[] = [
    { title: 'SumGod', subtitle: '커플 질문 다이어리', icon: 'S', onPress: onOpenSumGod },
    { title: '갤러리', subtitle: '저장된 이미지 보기', icon: '□', onPress: onOpenGallery },
    { title: '알림 목록', subtitle: '최근 알림 10개 확인', icon: '!', onPress: onOpenNotifications }
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>ETC</Text>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="알림" onPress={onOpenNotifications} style={styles.roundIcon}><Text style={styles.roundIconText}>!</Text></Pressable>
          <Pressable accessibilityLabel="설정" onPress={onOpenSettings} style={styles.roundIcon}><Text style={styles.roundIconText}>⚙</Text></Pressable>
        </View>
      </View>
      <View style={styles.grid}>
        {items.map(item => (
          <Pressable key={item.title} onPress={item.onPress} style={styles.card}>
            <View style={styles.iconBox}><Text style={styles.icon}>{item.icon}</Text></View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub} numberOfLines={2}>{item.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  header: { minHeight: 86, paddingHorizontal: 20, paddingTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#050505', fontSize: 28, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  roundIconText: { color: '#333', fontWeight: '900', fontSize: 20, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 14 },
  card: { width: '47%', minHeight: 138, borderRadius: 18, backgroundColor: '#f3f3f3', padding: 16, justifyContent: 'space-between' },
  iconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.text, fontSize: 24, fontWeight: '900' },
  cardTitle: { color: '#111', fontSize: 16, fontWeight: '900' },
  cardSub: { color: '#6f747c', fontSize: 12, lineHeight: 17, fontWeight: '700' }
});
