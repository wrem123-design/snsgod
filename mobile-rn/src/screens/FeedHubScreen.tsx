import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function FeedHubScreen({ onOpenInstagram, onOpenX }: {
  onOpenInstagram: () => void;
  onOpenX: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>피드</Text>
        <Text style={styles.subtitle}>캐릭터의 게시물과 DM을 플랫폼별로 확인합니다.</Text>
      </View>
      <View style={styles.list}>
        <FeedRow glyph="◎" title="Instagram" subtitle="사진 게시물, 댓글과 DM" onPress={onOpenInstagram} />
        <FeedRow glyph="X" title="X" subtitle="짧은 글, 답글과 DM" onPress={onOpenX} />
      </View>
    </View>
  );
}

function FeedRow({ glyph, title, subtitle, onPress }: { glyph: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.glyphBox}><Text style={styles.glyph}>{glyph}</Text></View>
      <View style={styles.textBlock}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
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
  glyphBox: { width: 54, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  glyph: { color: colors.text, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  textBlock: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rowSubtitle: { marginTop: 3, color: colors.sub, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  chevron: { color: colors.sub, fontSize: 22, lineHeight: 24, fontWeight: '900' },
});
