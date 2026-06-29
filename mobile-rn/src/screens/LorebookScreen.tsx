import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { LoreEntry, SNSGodState } from '../types';
import { makeId } from '../logic/ids';

export function LorebookScreen({ state, onBack, onChange }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const [entries, setEntries] = useState<LoreEntry[]>(state.loreEntries || []);

  function addEntry() {
    setEntries(prev => [...prev, { id: makeId('lore'), title: '새 로어', keys: [], secondKeys: [], content: '', enabled: true, insertOrder: 100 }]);
  }

  function patch(id: string, next: Partial<LoreEntry>) {
    setEntries(prev => prev.map(entry => entry.id === id ? { ...entry, ...next } : entry));
  }

  function remove(id: string) {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  }

  async function save() {
    await onChange({
      ...state,
      loreEntries: entries.map(entry => ({
        ...entry,
        keys: (entry.keys || []).map(key => key.trim()).filter(Boolean),
        secondKeys: (entry.secondKeys || []).map(key => key.trim()).filter(Boolean),
        insertOrder: Number.isFinite(Number(entry.insertOrder)) ? Number(entry.insertOrder) : 100
      }))
    });
    onBack();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>로어북</Text>
        <Pressable onPress={save} style={styles.saveTop}><Text style={styles.saveTopText}>저장</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.help}>로어북은 트리거/상시 활성/범위 설정에 따라 채팅 프롬프트에 주입됩니다.</Text>
        <Pressable onPress={addEntry} style={styles.secondary}><Text style={styles.secondaryText}>새 로어 추가</Text></Pressable>
        {entries.map(entry => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{entry.title || '새 로어'}</Text>
              <Switch value={entry.enabled !== false} onValueChange={value => patch(entry.id, { enabled: value })} />
            </View>
            <Field label="제목" value={entry.title} onChangeText={value => patch(entry.id, { title: value })} />
            <Field label="트리거 단어" value={(entry.keys || []).join(', ')} onChangeText={value => patch(entry.id, { keys: value.split(',').map(item => item.trim()) })} help="쉼표로 구분합니다. 예: 학교, 첫사랑, 약속" />
            <Field label="보조 트리거" value={(entry.secondKeys || []).join(', ')} onChangeText={value => patch(entry.id, { secondKeys: value.split(',').map(item => item.trim()) })} help="선택 트리거가 켜져 있으면 기본 트리거와 함께 확인합니다." />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>상시 활성</Text>
              <Switch value={entry.alwaysActive === true} onValueChange={value => patch(entry.id, { alwaysActive: value })} />
              <Text style={styles.switchLabel}>정규식</Text>
              <Switch value={entry.regex === true} onValueChange={value => patch(entry.id, { regex: value })} />
              <Text style={styles.switchLabel}>선택 트리거</Text>
              <Switch value={entry.selective === true} onValueChange={value => patch(entry.id, { selective: value })} />
            </View>
            <Field label="삽입 순서" value={String(entry.insertOrder ?? 100)} onChangeText={value => patch(entry.id, { insertOrder: Number(value.replace(/[^0-9.-]/g, '')) })} help="큰 숫자일수록 먼저 프롬프트에 들어갑니다." />
            <Field label="내용" value={entry.content} onChangeText={value => patch(entry.id, { content: value })} multiline />
            <Pressable onPress={() => remove(entry.id)} style={styles.danger}><Text style={styles.dangerText}>삭제</Text></Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChangeText, help, multiline }: { label: string; value: string; onChangeText: (value: string) => void; help?: string; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} />
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: colors.text },
  saveTop: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveTopText: { color: '#241a00', fontWeight: '900' },
  content: { padding: 14, gap: 12 },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  secondary: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontWeight: '900', fontSize: 17 },
  field: { gap: 6 },
  label: { fontSize: 12, color: colors.sub, fontWeight: '900' },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  switchLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  textarea: { minHeight: 132 },
  danger: { alignSelf: 'flex-end', minHeight: 38, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: '#f2a9a9', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' }
});

