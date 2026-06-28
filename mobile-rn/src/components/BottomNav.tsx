import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type BottomTab = 'friends' | 'instagram' | 'twitter' | 'random' | 'etc';

const TABS: { key: BottomTab; label: string; icon: string }[] = [
  { key: 'friends', label: '친구', icon: '' },
  { key: 'instagram', label: '인스타그램', icon: '◎' },
  { key: 'twitter', label: '트위터', icon: 'X' },
  { key: 'random', label: '랜덤', icon: '?' },
  { key: 'etc', label: '기타', icon: '•••' }
];

export function BottomNav({ active, onSelect }: {
  active: BottomTab;
  onSelect: (tab: BottomTab) => void;
}) {
  return (
    <View style={styles.wrap}>
      {TABS.map(tab => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.key)}
            style={[styles.item, selected && styles.itemActive]}
          >
            {tab.key === 'friends' ? <FriendIcon selected={selected} /> : <Text style={[styles.icon, selected && styles.iconActive]}>{tab.icon}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export const BOTTOM_NAV_HEIGHT = 64;

function FriendIcon({ selected }: { selected: boolean }) {
  return (
    <View style={styles.friendIcon}>
      <View style={[styles.friendHead, selected && styles.friendActive]} />
      <View style={[styles.friendBody, selected && styles.friendActive]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: BOTTOM_NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#eeeeee',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d5d5d5'
  },
  item: {
    width: 54,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemActive: {
    backgroundColor: '#ffffff'
  },
  icon: {
    color: '#2e3135',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 28
  },
  iconActive: {
    color: colors.danger
  },
  friendIcon: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  friendHead: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#111',
    marginBottom: 3
  },
  friendBody: {
    width: 24,
    height: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#111'
  },
  friendActive: {
    backgroundColor: colors.danger
  }
});
