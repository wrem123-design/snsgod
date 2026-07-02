import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

type MenuItem = {
  title: string;
  subtitle?: string;
  image: ImageSourcePropType;
  onPress: () => void;
};

const menuImages = {
  encounter: require('../../assets/etc-menu/encounter.png'),
  blindDate: require('../../assets/etc-menu/blind-date.png'),
  datingApp: require('../../assets/etc-menu/dating-app.png'),
  worldcup: require('../../assets/etc-menu/worldcup.png'),
  sumgod: require('../../assets/etc-menu/sumgod.png'),
  gallery: require('../../assets/etc-menu/gallery.png'),
  references: require('../../assets/etc-menu/references.png'),
  debug: require('../../assets/etc-menu/debug.png')
};

export function MenuHubScreen({ mode, onOpenEncounter, onOpenBlindDate, onOpenDatingApp, onOpenIdealWorldcup, onOpenReferences, onOpenSumGod, onOpenGallery, onOpenNotifications, onOpenSettings, onOpenDebug }: {
  mode: 'etc';
  onOpenEncounter: () => void;
  onOpenBlindDate: () => void;
  onOpenDatingApp: () => void;
  onOpenIdealWorldcup: () => void;
  onOpenReferences: () => void;
  onOpenSumGod: () => void;
  onOpenGallery: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
}) {
  const items: MenuItem[] = [
    { title: '우연한 만남', image: menuImages.encounter, onPress: onOpenEncounter },
    { title: '블라인드 데이트', image: menuImages.blindDate, onPress: onOpenBlindDate },
    { title: '데이트 어플', subtitle: '3명 중 최종 선택', image: menuImages.datingApp, onPress: onOpenDatingApp },
    { title: '이상형 월드컵', image: menuImages.worldcup, onPress: onOpenIdealWorldcup },
    { title: 'SumGod', subtitle: '커플 질문 다이어리', image: menuImages.sumgod, onPress: onOpenSumGod },
    { title: '갤러리', subtitle: '저장된 이미지 보기', image: menuImages.gallery, onPress: onOpenGallery }
  ];
  const optionItems: MenuItem[] = [
    { title: '레퍼런스', subtitle: '얼굴 슬롯 관리', image: menuImages.references, onPress: onOpenReferences },
    { title: '디버그', subtitle: '로그 확인', image: menuImages.debug, onPress: onOpenDebug }
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
            <Image source={item.image} style={styles.cardImage} />
            <View style={styles.cardTextBlock}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.cardSub} numberOfLines={2}>{item.subtitle}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.optionArea}>
        <View style={styles.optionGrid}>
          {optionItems.map(item => (
            <Pressable key={item.title} onPress={item.onPress} style={styles.optionCard}>
              <Image source={item.image} style={styles.optionImage} />
              <View style={styles.optionTextBlock}>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <Text style={styles.optionSub} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              <Text style={styles.optionChevron}>›</Text>
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
  card: { width: '47%', minHeight: 178, borderRadius: 14, backgroundColor: '#fffefa', padding: 10, alignItems: 'stretch', borderWidth: 1, borderColor: '#eee2d2', shadowColor: '#9a7b51', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  cardImage: { width: '100%', height: 104, borderRadius: 14, backgroundColor: '#f7f2e9' },
  cardTextBlock: { flex: 1, minWidth: 0, paddingTop: 9, justifyContent: 'space-between' },
  cardTitle: { color: '#111', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  cardSub: { marginTop: 5, color: '#5f5a50', fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  optionArea: { marginTop: 'auto', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, backgroundColor: '#f2eee6', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ded6c9' },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: { flex: 1, minHeight: 62, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e2d8c8' },
  optionImage: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ece5d9' },
  optionTextBlock: { flex: 1, minWidth: 0 },
  optionTitle: { color: '#17120d', fontSize: 14, fontWeight: '900' },
  optionSub: { marginTop: 2, color: '#81786c', fontSize: 11, fontWeight: '800' },
  optionChevron: { color: '#7a6c5a', fontSize: 22, lineHeight: 24, fontWeight: '900' }
});
