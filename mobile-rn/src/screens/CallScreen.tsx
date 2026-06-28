import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { callLLMText } from '../logic/api';
import { findCharacter } from '../logic/stateHelpers';
import { SNSGodState } from '../types';

export function CallScreen({ state, characterId, onBack }: {
  state: SNSGodState;
  characterId: string;
  onBack: () => void;
}) {
  const character = findCharacter(state, characterId);
  const [line, setLine] = useState('');
  const [loading, setLoading] = useState(false);

  async function speak() {
    if (!character || loading) return;
    setLoading(true);
    try {
      const result = await callLLMText(state, [
        { role: 'system', content: 'You are simulating a short fictional phone call. Reply in natural Korean as the character, one or two spoken sentences only.' },
        { role: 'user', content: `Character: ${character.name}\nProfile: ${character.prompt || ''}\nStatus: ${character.statusMessage || ''}\nSay the first thing after picking up the call.` }
      ]);
      setLine(result.text.trim() || '여보세요?');
    } catch (error) {
      Alert.alert('전화 응답 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  if (!character) {
    return (
      <View style={styles.screen}>
        <Text style={styles.name}>캐릭터를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>나가기</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.callState}>SNSGod 통화</Text>
        <Avatar character={character} size={112} />
        <Text style={styles.name}>{character.name}</Text>
        <Text style={styles.status}>{line || '연결됨'}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable onPress={speak} style={styles.controlButton}>
          {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.controlText}>말 걸기</Text>}
        </Pressable>
        <Pressable onPress={onBack} style={styles.endButton}><Text style={styles.endText}>끊기</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 28, backgroundColor: '#27313b' },
  top: { alignItems: 'center', marginTop: 50 },
  callState: { marginBottom: 26, color: '#d8e1e9', fontWeight: '900' },
  name: { marginTop: 18, fontSize: 26, color: '#fff', fontWeight: '900' },
  status: { marginTop: 16, color: '#d8e1e9', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  controls: { width: '100%', gap: 12, marginBottom: 22 },
  controlButton: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf2f6' },
  controlText: { color: colors.text, fontWeight: '900' },
  endButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  endText: { color: '#fff', fontWeight: '900', fontSize: 16 }
});
