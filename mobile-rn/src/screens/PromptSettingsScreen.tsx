import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_PROMPTS } from '../logic/prompts';
import { colors } from '../theme';
import { PromptSet, SNSGodState } from '../types';

const FIELDS: Array<{ key: keyof PromptSet; label: string }> = [
  { key: 'systemRules', label: '시스템 규칙' },
  { key: 'roleObjective', label: '역할/목표' },
  { key: 'characterActing', label: '캐릭터 연기' },
  { key: 'jsonFormat', label: '메시지 JSON 형식' },
  { key: 'memoryRules', label: '메모리 생성' },
  { key: 'stickerRules', label: '스티커 사용' },
  { key: 'language', label: '언어' },
  { key: 'snsPosting', label: 'SNS 게시' },
  { key: 'profileCreation', label: '캐릭터 생성' }
];

export function PromptSettingsScreen({ state, onBack, onChange }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<PromptSet>({ ...DEFAULT_PROMPTS, ...(state.config.prompts || {}) });

  async function save() {
    await onChange({ ...state, config: { ...state.config, prompts: draft } });
    onBack();
  }

  function reset() {
    setDraft(DEFAULT_PROMPTS);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>프롬프트</Text>
        <Pressable onPress={reset} style={styles.secondary}><Text style={styles.secondaryText}>기본값</Text></Pressable>
        <Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {FIELDS.map(field => (
          <View key={field.key} style={styles.card}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={String(draft[field.key] || '')}
              onChangeText={value => setDraft(prev => ({ ...prev, [field.key]: value }))}
              style={styles.textarea}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.help}>비워두면 답변 품질이 크게 흔들릴 수 있습니다.</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
  secondary: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  save: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#241a00', fontWeight: '900' },
  content: { padding: 14, gap: 12 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 8 },
  label: { color: colors.text, fontWeight: '900' },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: '#fffefa' },
  help: { color: colors.sub, fontSize: 12 }
});
