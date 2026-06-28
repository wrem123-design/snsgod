import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SNSGodCharacter } from '../types';

export function Avatar({ character, size = 48 }: { character?: SNSGodCharacter; size?: number }) {
  const uri = typeof character?.avatar === 'string' && character.avatar.startsWith('data:') ? character.avatar : '';
  const label = character?.avatarText || character?.name?.slice(0, 2) || '?';
  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: character?.color || '#d8e7ff' }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  label: {
    color: '#1f252b',
    fontSize: 15,
    fontWeight: '800'
  }
});
