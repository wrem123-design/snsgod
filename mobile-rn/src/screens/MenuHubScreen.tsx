import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type MenuItem = {
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
};

export function MenuHubScreen({ mode, onOpenBlindDate, onOpenIdealWorldcup, onOpenReferences, onOpenSumGod, onOpenGallery, onOpenNotifications, onOpenSettings, onOpenDebug }: {
  mode: 'etc';
  onOpenBlindDate: () => void;
  onOpenIdealWorldcup: () => void;
  onOpenReferences: () => void;
  onOpenSumGod: () => void;
  onOpenGallery: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
}) {
  const items: MenuItem[] = [
    { title: '블라인드 데이트', subtitle: 'AI 후보를 비교하고 캐릭터로 가져와요', icon: 'BD', onPress: onOpenBlindDate },
    { title: '이상형 월드컵', subtitle: '8강, 16강, 24강 토너먼트로 최종 선택', icon: '🏆', onPress: onOpenIdealWorldcup },
    { title: 'SumGod', subtitle: '커플 질문 다이어리', icon: 'S', onPress: onOpenSumGod },
    { title: '갤러리', subtitle: '저장된 이미지 보기', icon: '□', onPress: onOpenGallery }
  ];
  const optionItems: MenuItem[] = [
    { title: '레퍼런스', subtitle: '얼굴 슬롯 관리', icon: 'R', onPress: onOpenReferences },
    { title: '디버그', subtitle: '로그 확인과 앱 상태 재로드', icon: 'D', onPress: onOpenDebug }
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>ETC</Text>
        <View style={styles.headerActions}>
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
      <View style={styles.optionArea}>
        <Text style={styles.optionLabel}>옵션</Text>
        <View style={styles.optionGrid}>
          {optionItems.map(item => (
            <Pressable key={item.title} onPress={item.onPress} style={styles.optionCard}>
              <View style={styles.optionIconBox}><Text style={styles.optionIcon}>{item.icon}</Text></View>
              <View style={styles.optionTextBlock}>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <Text style={styles.optionSub} numberOfLines={1}>{item.subtitle}</Text>
              </View>
            </Pressable>
          ))}
        </View>
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
  cardSub: { color: '#6f747c', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  optionArea: { marginTop: 'auto', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22, backgroundColor: '#f2eee6', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ded6c9' },
  optionLabel: { marginBottom: 9, color: '#7b746a', fontSize: 12, fontWeight: '900' },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: { flex: 1, minHeight: 68, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e2d8c8' },
  optionIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ece5d9' },
  optionIcon: { color: colors.text, fontSize: 16, fontWeight: '900' },
  optionTextBlock: { flex: 1, minWidth: 0 },
  optionTitle: { color: '#17120d', fontSize: 14, fontWeight: '900' },
  optionSub: { marginTop: 2, color: '#81786c', fontSize: 11, fontWeight: '800' }
});
