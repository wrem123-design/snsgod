import React from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type MenuItem = {
  title: string;
  subtitle: string;
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
  debug: require('../../assets/etc-menu/debug.png'),
};

export function MenuHubScreen({
  mode,
  onOpenRandom,
  onOpenEncounter,
  onOpenBlindDate,
  onOpenDatingApp,
  onOpenIdealWorldcup,
  onOpenReferences,
  onOpenSumGod,
  onOpenGallery,
  onOpenSettings,
  onOpenDebug,
}: {
  mode: 'discover' | 'archive';
  onOpenRandom: () => void;
  onOpenEncounter: () => void;
  onOpenBlindDate: () => void;
  onOpenDatingApp: () => void;
  onOpenIdealWorldcup: () => void;
  onOpenReferences: () => void;
  onOpenSumGod: () => void;
  onOpenGallery: () => void;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
}) {
  const discoverItems: MenuItem[] = [
    { title: '랜덤 대화', subtitle: '새로운 캐릭터와 바로 대화', image: menuImages.encounter, onPress: onOpenRandom },
    { title: '우연한 만남', subtitle: '상황에서 시작하는 인연', image: menuImages.encounter, onPress: onOpenEncounter },
    { title: '블라인드 데이트', subtitle: '후보를 만나고 선택', image: menuImages.blindDate, onPress: onOpenBlindDate },
    { title: '데이트 앱', subtitle: '프로필을 보고 연결', image: menuImages.datingApp, onPress: onOpenDatingApp },
    { title: '이상형 월드컵', subtitle: '선택으로 취향 확인', image: menuImages.worldcup, onPress: onOpenIdealWorldcup },
  ];
  const archiveItems: MenuItem[] = [
    { title: '앨범', subtitle: '이미지, 사용처, 휴지통', image: menuImages.gallery, onPress: onOpenGallery },
    { title: '레퍼런스', subtitle: '얼굴 기준 이미지 관리', image: menuImages.references, onPress: onOpenReferences },
    { title: 'SumGod', subtitle: '관계 문답과 기록', image: menuImages.sumgod, onPress: onOpenSumGod },
    { title: '백업·설정', subtitle: '로컬 백업, 복원, 앱 설정', image: menuImages.debug, onPress: onOpenSettings },
    { title: '진단 로그', subtitle: '저장 상태와 오류 확인', image: menuImages.debug, onPress: onOpenDebug },
  ];
  const items = mode === 'discover' ? discoverItems : archiveItems;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === 'discover' ? '발견' : '보관함'}</Text>
        <Text style={styles.subtitle}>{mode === 'discover' ? '새 인연과 활동을 한곳에서 시작합니다.' : '사진, 기준 이미지, 백업과 기록을 관리합니다.'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {items.map(item => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subtitle}`} key={item.title} onPress={item.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Image source={item.image} style={styles.image} />
            <View style={styles.textBlock}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 86, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 12, backgroundColor: colors.panel },
  title: { color: colors.text, fontSize: 19, fontWeight: '900' },
  subtitle: { marginTop: 4, color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  list: { padding: 12, gap: 8 },
  row: { minHeight: 72, padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.78 },
  image: { width: 54, height: 54, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  textBlock: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rowSubtitle: { marginTop: 3, color: colors.sub, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  chevron: { color: colors.sub, fontSize: 22, lineHeight: 24, fontWeight: '900' },
});
