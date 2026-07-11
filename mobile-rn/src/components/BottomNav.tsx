import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type BottomTab = 'contacts' | 'feed' | 'discover' | 'archive';

const TABS: Array<{ key: BottomTab; label: string; glyph: string }> = [
  { key: 'contacts', label: '연락', glyph: '◉' },
  { key: 'feed', label: '피드', glyph: '▤' },
  { key: 'discover', label: '발견', glyph: '◇' },
  { key: 'archive', label: '보관함', glyph: '▣' },
];

export const BOTTOM_NAV_HEIGHT = 68;

export function BottomNav({ active, onSelect }: {
  active: BottomTab;
  onSelect: (tab: BottomTab) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.wrap}>
      {TABS.map(tab => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.label} 탭`}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.key)}
            style={({ pressed }) => [styles.item, selected && styles.itemActive, pressed && styles.pressed]}
          >
            <Text style={[styles.glyph, selected && styles.glyphActive]}>{tab.glyph}</Text>
            <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: BOTTOM_NAV_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.panelSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: { backgroundColor: colors.accent },
  pressed: { opacity: 0.78 },
  glyph: { color: colors.sub, fontSize: 24, lineHeight: 25, fontWeight: '900' },
  glyphActive: { color: colors.accentText },
  label: { marginTop: 1, color: colors.sub, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  labelActive: { color: colors.accentText },
});
