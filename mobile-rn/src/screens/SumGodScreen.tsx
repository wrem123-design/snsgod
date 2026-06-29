import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { makeId } from '../logic/ids';

const QUESTIONS = [
  '두 사람이 처음 서로에게 마음이 기울었다고 느낀 순간은 언제일까?',
  '요즘 서로에게 가장 듣고 싶은 말은 무엇일까?',
  '둘만 아는 사소한 습관이 있다면?',
  '내일 단둘이 시간이 생긴다면 어디로 가고 싶을까?'
];

type SumGodLine = { from: 'user' | 'sumgod'; body: string; createdAt: number };
type SumGodEntry = {
  id: string;
  dateKey: string;
  question: string;
  answer: string;
  characterAnswer?: string;
  archived?: boolean;
  createdAt: number;
  updatedAt?: number;
  conversation?: SumGodLine[];
};

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isAfterTen(date = new Date()) {
  return date.getHours() >= 22;
}

function normalizeEntries(raw: unknown): SumGodEntry[] {
  const source = raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown[] }).entries)
    ? (raw as { entries: unknown[] }).entries
    : [];
  return source.map((item, index) => {
    const entry = item && typeof item === 'object' ? item as Partial<SumGodEntry> : {};
    return {
      id: String(entry.id || makeId('sum')),
      dateKey: String(entry.dateKey || dateKey(new Date(entry.createdAt || Date.now()))),
      question: String(entry.question || QUESTIONS[index % QUESTIONS.length]),
      answer: String(entry.answer || ''),
      characterAnswer: entry.characterAnswer ? String(entry.characterAnswer) : undefined,
      archived: entry.archived === true,
      createdAt: Number(entry.createdAt || Date.now()),
      updatedAt: Number(entry.updatedAt || entry.createdAt || Date.now()),
      conversation: Array.isArray(entry.conversation) ? entry.conversation : []
    };
  });
}

function generateCharacterAnswer(answer: string) {
  const trimmed = answer.trim();
  if (!trimmed) return '';
  return `오늘 답변을 읽어보니, 마음이 향하는 방향이 꽤 선명해 보여. "${trimmed.slice(0, 42)}${trimmed.length > 42 ? '...' : ''}" 이 부분은 나중에 다시 꺼내 봐도 좋겠다.`;
}

export function SumGodScreen({ state, onBack, onChange }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const sumGod = (state.sumGod && typeof state.sumGod === 'object' ? state.sumGod : {}) as { entries?: SumGodEntry[] };
  const entries = useMemo(() => normalizeEntries(sumGod), [state.sumGod]);
  const today = dateKey();
  const todayEntry = entries.find(entry => entry.dateKey === today && !entry.archived);
  const question = todayEntry?.question || QUESTIONS[new Date().getDate() % QUESTIONS.length];
  const [answer, setAnswer] = useState(todayEntry?.answer || '');
  const [talk, setTalk] = useState('');
  const locked = entries.some(entry => entry.dateKey === today && entry.answer.trim()) && !todayEntry;
  const timeLocked = entries.some(entry => entry.answer.trim()) && !isAfterTen() && !todayEntry;

  async function commitEntries(nextEntries: SumGodEntry[]) {
    await onChange({ ...state, sumGod: { ...sumGod, entries: nextEntries } });
  }

  async function save() {
    if (!answer.trim()) return;
    if (locked) {
      Alert.alert('오늘은 완료됨', 'SumGod는 하루에 한 번만 완료할 수 있습니다.');
      return;
    }
    if (timeLocked) {
      Alert.alert('22시 이후 가능', '첫 질문 이후부터는 밤 10시 이후에 열 수 있습니다.');
      return;
    }
    const entry: SumGodEntry = {
      ...(todayEntry || { id: makeId('sum'), dateKey: today, question, createdAt: Date.now(), conversation: [] }),
      answer: answer.trim(),
      characterAnswer: generateCharacterAnswer(answer),
      updatedAt: Date.now()
    };
    await commitEntries([entry, ...entries.filter(item => item.id !== entry.id)]);
  }

  async function sendTalk() {
    if (!todayEntry || !talk.trim()) return;
    const userLine: SumGodLine = { from: 'user', body: talk.trim(), createdAt: Date.now() };
    const replyLine: SumGodLine = { from: 'sumgod', body: '그 답변은 오늘 기록 옆에 같이 남겨둘게.', createdAt: Date.now() };
    const updated = {
      ...todayEntry,
      conversation: [...(todayEntry.conversation || []), userLine, replyLine],
      updatedAt: Date.now()
    };
    setTalk('');
    await commitEntries([updated, ...entries.filter(item => item.id !== updated.id)]);
  }

  async function archive(entry: SumGodEntry) {
    await commitEntries(entries.map(item => item.id === entry.id ? { ...item, archived: true, updatedAt: Date.now() } : item));
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View>
          <Text style={styles.title}>SumGod</Text>
          <Text style={styles.subtitle}>daily couple archive</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.questionCard}>
          <Text style={styles.badge}>Q.</Text>
          <Text style={styles.question}>{question}</Text>
          {timeLocked ? <Text style={styles.lockText}>첫 질문 이후의 새 질문은 22시 이후에 열립니다.</Text> : null}
          <TextInput value={answer} onChangeText={setAnswer} style={styles.textarea} multiline textAlignVertical="top" placeholder="답변을 적어주세요." />
          <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>{todayEntry ? '오늘 답변 수정' : '답변 저장'}</Text></Pressable>
          {todayEntry?.characterAnswer ? <Text style={styles.characterAnswer}>{todayEntry.characterAnswer}</Text> : null}
          {todayEntry ? (
            <View style={styles.talkBox}>
              {(todayEntry.conversation || []).map((line, index) => <Text key={`${line.createdAt}_${index}`} style={styles.talkLine}>{line.from === 'user' ? '나' : 'SumGod'}: {line.body}</Text>)}
              <TextInput value={talk} onChangeText={setTalk} style={styles.input} placeholder="추가로 남길 말" />
              <Pressable onPress={sendTalk} style={styles.secondary}><Text style={styles.secondaryText}>추가 대화 저장</Text></Pressable>
            </View>
          ) : null}
        </View>
        {entries.map(entry => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryDate}>{entry.dateKey}</Text>
              {!entry.archived ? <Pressable onPress={() => archive(entry)}><Text style={styles.archiveText}>보관</Text></Pressable> : <Text style={styles.archived}>보관됨</Text>}
            </View>
            <Text style={styles.entryQuestion}>{entry.question}</Text>
            <Text style={styles.entryAnswer}>{entry.answer}</Text>
            {entry.characterAnswer ? <Text style={styles.entryReply}>{entry.characterAnswer}</Text> : null}
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
  questionCard: { borderRadius: 8, borderWidth: 1, borderColor: '#f3d2d8', backgroundColor: '#fffaf7', padding: 16, gap: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#ffd8e4', color: '#9f4c67', fontWeight: '900' },
  question: { color: '#50363d', fontSize: 18, lineHeight: 27, fontWeight: '900' },
  lockText: { color: '#9f4c67', fontWeight: '800' },
  textarea: { minHeight: 110, borderWidth: 1, borderColor: '#f3d2d8', borderRadius: 8, padding: 12, color: '#50363d', backgroundColor: '#fff' },
  input: { minHeight: 42, borderWidth: 1, borderColor: '#f3d2d8', borderRadius: 8, paddingHorizontal: 12, color: '#50363d', backgroundColor: '#fff' },
  primary: { minHeight: 44, borderRadius: 8, backgroundColor: '#f48aaa', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#3f1825', fontWeight: '900' },
  secondary: { minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: '#f3d2d8', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#5c3f45', fontWeight: '900' },
  characterAnswer: { color: '#6d5057', lineHeight: 21, fontWeight: '700' },
  talkBox: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f3d2d8', paddingTop: 10 },
  talkLine: { color: '#6d5057', lineHeight: 20 },
  entry: { borderRadius: 8, backgroundColor: '#fffaf7', borderWidth: 1, borderColor: '#f3d2d8', padding: 14, gap: 7 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryDate: { color: '#99747b', fontSize: 12, fontWeight: '800' },
  archiveText: { color: '#9f4c67', fontWeight: '900' },
  archived: { color: '#99747b', fontWeight: '900' },
  entryQuestion: { color: '#50363d', fontWeight: '900' },
  entryAnswer: { color: '#6d5057', lineHeight: 21 },
  entryReply: { color: '#50363d', lineHeight: 20, fontWeight: '700' }
});
