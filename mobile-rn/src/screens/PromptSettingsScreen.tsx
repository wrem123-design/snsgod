import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_PROMPTS } from '../logic/prompts';
import { colors } from '../theme';
import { PromptSet, SNSGodState } from '../types';
import { PROMPT_SETTING_DEFINITIONS } from '../logic/promptSettingsPolicy';

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
        {PROMPT_SETTING_DEFINITIONS.map(field => (
          <View key={field.key} style={styles.card}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={String(draft[field.key] || '')}
              onChangeText={value => setDraft(prev => ({ ...prev, [field.key]: value }))}
              style={styles.textarea}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.help}>{field.help}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceAlt },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
  secondary: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  save: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.accentText, fontWeight: '900' },
  content: { padding: 14, gap: 12 },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 8 },
  label: { color: colors.text, fontWeight: '900' },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: colors.panelSoft },
  help: { color: colors.sub, fontSize: 12 }
});
