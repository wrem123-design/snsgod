import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { makeId } from '../logic/ids';

const QUESTIONS = [
  '두 사람이 처음 서로에게 마음이 기울었다고 느낀 순간은 언제일까?',
  '요즘 서로에게 가장 듣고 싶은 말은 무엇일까?',
  '둘만 아는 사소한 습관이 있다면?',
  '내일 단둘이 시간이 생긴다면 어디로 가고 싶을까?'
];

export function SumGodScreen({ state, onBack, onChange }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const sumGod = (state.sumGod && typeof state.sumGod === 'object' ? state.sumGod : {}) as { entries?: { id: string; question: string; answer: string; createdAt: number }[] };
  const entries = sumGod.entries || [];
  const todayQuestion = useMemo(() => QUESTIONS[new Date().getDate() % QUESTIONS.length], []);
  const [answer, setAnswer] = useState('');

  async function save() {
    if (!answer.trim()) return;
    const entry = { id: makeId('sum'), question: todayQuestion, answer: answer.trim(), createdAt: Date.now() };
    await onChange({ ...state, sumGod: { ...sumGod, entries: [entry, ...entries] } });
    setAnswer('');
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View>
          <Text style={styles.title}>SumGod</Text>
          <Text style={styles.subtitle}>couple question diary</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.questionCard}>
          <Text style={styles.badge}>Q.</Text>
          <Text style={styles.question}>{todayQuestion}</Text>
          <TextInput value={answer} onChangeText={setAnswer} style={styles.textarea} multiline textAlignVertical="top" placeholder="답변을 적어주세요." />
          <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>답변 저장</Text></Pressable>
        </View>
        {entries.map(entry => (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.entryDate}>{new Date(entry.createdAt).toLocaleDateString()}</Text>
            <Text style={styles.entryQuestion}>{entry.question}</Text>
            <Text style={styles.entryAnswer}>{entry.answer}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff0f2' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff7f2', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1d8da' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#f4e5e0' },
  backText: { fontSize: 34, lineHeight: 36, color: '#5c3f45' },
  title: { fontSize: 20, fontWeight: '900', color: '#5c3f45' },
  subtitle: { color: '#99747b', fontWeight: '700', fontSize: 12 },
  content: { padding: 18, gap: 14 },
  questionCard: { borderRadius: 12, borderWidth: 1, borderColor: '#f3d2d8', backgroundColor: '#fffaf7', padding: 16, gap: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#ffd8e4', color: '#9f4c67', fontWeight: '900' },
  question: { color: '#50363d', fontSize: 18, lineHeight: 27, fontWeight: '900' },
  textarea: { minHeight: 110, borderWidth: 1, borderColor: '#f3d2d8', borderRadius: 9, padding: 12, color: '#50363d', backgroundColor: '#fff' },
  primary: { minHeight: 44, borderRadius: 8, backgroundColor: '#f48aaa', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#3f1825', fontWeight: '900' },
  entry: { borderRadius: 10, backgroundColor: '#fffaf7', borderWidth: 1, borderColor: '#f3d2d8', padding: 14, gap: 7 },
  entryDate: { color: '#99747b', fontSize: 12, fontWeight: '800' },
  entryQuestion: { color: '#50363d', fontWeight: '900' },
  entryAnswer: { color: '#6d5057', lineHeight: 21 }
});

