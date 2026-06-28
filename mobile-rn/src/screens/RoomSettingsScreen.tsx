import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodRoom, SNSGodState } from '../types';
import { findCharacter, findRoom, updateRoom } from '../logic/stateHelpers';

export function RoomSettingsScreen({ state, roomId, onBack, onChange }: {
  state: SNSGodState;
  roomId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const [draft, setDraft] = useState<SNSGodRoom | null>(room ? { ...room } : null);

  if (!room || !draft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>방을 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>돌아가기</Text></Pressable>
      </View>
    );
  }

  async function save() {
    if (!draft) return;
    await onChange(updateRoom(state, roomId, {
      name: draft.name.trim() || '기본 채팅',
      userAlias: String(draft.userAlias || '').trim(),
      relationshipNote: String(draft.relationshipNote || '').trim(),
      roomPrompt: String(draft.roomPrompt || '').trim()
    }));
    onBack();
  }

  function set<K extends keyof SNSGodRoom>(key: K, value: SNSGodRoom[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>방 설정</Text>
        <Pressable onPress={save} style={styles.saveTop}><Text style={styles.saveTopText}>저장</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{character?.name || '캐릭터'} · {room.name}</Text>
          <Text style={styles.help}>이 설정은 이 채팅방 안에서만 적용됩니다. 캐릭터 설정의 이름/프로필보다 방 설정의 관계/호칭 메모가 대화 프롬프트에서 더 구체적인 지시로 들어갑니다.</Text>
          <Field label="방 이름" value={draft.name} onChangeText={value => set('name', value)} />
          <Field label="이 방에서 나를 부를 이름" value={String(draft.userAlias || '')} onChangeText={value => set('userAlias', value)} help="예: 오빠, 선배, 찐따. 빈칸이면 캐릭터 설정의 내 이름, 그것도 빈칸이면 기본 내 프로필 이름을 씁니다." />
          <Field label="이 채팅방에서만 적용할 관계/호칭 메모" value={String(draft.relationshipNote || '')} onChangeText={value => set('relationshipNote', value)} multiline help="단어만 써도 되지만, 보통 “나를 찐따라고 부름”, “서로 오래 알고 지낸 전 연인처럼 말함”처럼 문장으로 쓰는 게 확실합니다." />
          <Field label="추가 방 프롬프트" value={String(draft.roomPrompt || '')} onChangeText={value => set('roomPrompt', value)} multiline />
        </View>
        <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>방 설정 저장</Text></Pressable>
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
  content: { padding: 14, gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  field: { gap: 6 },
  label: { fontSize: 12, color: colors.sub, fontWeight: '900' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  textarea: { minHeight: 130 },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900', fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { color: colors.text, fontWeight: '900', marginBottom: 14 }
});
