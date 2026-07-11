import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

export type SettingsMode = 'basic' | 'advanced';
export type SettingsSection = 'user' | 'characters' | 'stickers' | 'notifications' | 'screen' | 'backup' | 'api' | 'image' | 'prompts' | 'lorebook';

export const BASIC_SETTINGS_SECTIONS: ReadonlyArray<{ key: SettingsSection; label: string }> = [
  { key: 'user', label: '기본' },
  { key: 'characters', label: '캐릭터' },
  { key: 'stickers', label: '스티커' },
  { key: 'notifications', label: '알림' },
  { key: 'screen', label: '화면' },
  { key: 'backup', label: '백업' },
];

export const ADVANCED_SETTINGS_SECTIONS: ReadonlyArray<{ key: SettingsSection; label: string }> = [
  { key: 'api', label: 'AI·서버' },
  { key: 'image', label: '이미지 생성' },
  { key: 'prompts', label: '원문 프롬프트' },
  { key: 'lorebook', label: '로어북' },
];

export function defaultSectionForSettingsMode(mode: SettingsMode): SettingsSection {
  return mode === 'basic' ? 'user' : 'api';
}

export function SettingsNavigation({ mode, activeSection, onModeChange, onSectionChange }: {
  mode: SettingsMode;
  activeSection: SettingsSection;
  onModeChange: (mode: SettingsMode) => void;
  onSectionChange: (section: SettingsSection) => void;
}) {
  const sections = mode === 'basic' ? BASIC_SETTINGS_SECTIONS : ADVANCED_SETTINGS_SECTIONS;
  return (
    <>
      <View style={styles.modeBar} accessibilityLabel="설정 범위 선택">
        {(['basic', 'advanced'] as const).map(item => (
          <Pressable
            key={item}
            onPress={() => onModeChange(item)}
            style={[styles.modeButton, mode === item && styles.modeButtonActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === item }}
          >
            <Text style={[styles.modeButtonText, mode === item && styles.modeButtonTextActive]}>{item === 'basic' ? '기본 설정' : '고급 설정'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionBarContent}>
          {sections.map(section => (
            <Pressable key={section.key} onPress={() => onSectionChange(section.key)} style={[styles.sectionTab, activeSection === section.key && styles.sectionTabActive]}>
              <Text style={[styles.sectionTabText, activeSection === section.key && styles.sectionTabTextActive]}>{section.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

export function AdvancedSettingsNotice() {
  return (
    <View style={styles.advancedNotice} accessibilityLabel="고급 설정 안내">
      <Text style={styles.advancedNoticeTitle}>직접 연결과 원문 편집</Text>
      <Text style={styles.advancedNoticeText}>Provider 주소·키, Oracle 서버, 이미지 규칙과 원문 프롬프트는 동작을 이해할 때만 수정하세요. 기존 값은 그대로 유지됩니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modeBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.panel },
  modeButton: { flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: colors.text, borderColor: colors.text },
  modeButtonText: { color: colors.sub, fontSize: 13, fontWeight: '900' },
  modeButtonTextActive: { color: '#ffffff' },
  sectionBar: { backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  sectionTab: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  sectionTabActive: { backgroundColor: colors.accent, borderColor: '#b89117' },
  sectionTabText: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  sectionTabTextActive: { color: '#241a00' },
  advancedNotice: { borderWidth: 1, borderColor: '#d6c48f', borderRadius: 8, backgroundColor: '#fff8dd', padding: 14 },
  advancedNoticeTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  advancedNoticeText: { marginTop: 5, color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
