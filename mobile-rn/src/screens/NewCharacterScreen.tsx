import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodCharacter, SNSGodState } from '../types';
import { callLLMText, parseJsonObject } from '../logic/api';
import { makeId } from '../logic/ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION, DEFAULT_PROMPTS } from '../logic/prompts';
import { createRoom } from '../logic/stateHelpers';

type GeneratedCharacterProfile = {
  name?: string;
  prompt?: string;
  persona?: string;
  profile?: string;
  description?: string;
  firstMessage?: string;
  first_message?: string;
  greeting?: string;
};

export function NewCharacterScreen({ state, onBack, onCreate }: {
  state: SNSGodState;
  onBack: () => void;
  onCreate: (next: SNSGodState, roomId: string) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function aiGenerate() {
    setLoading(true);
    try {
      const { text } = await callLLMText(state, [{
        role: 'system',
        content: [
          state.config.prompts?.profileCreation || DEFAULT_PROMPTS.profileCreation,
          `User name: ${state.config.userName}`,
          `User profile: ${state.config.userDescription || '(empty)'}`,
          '반드시 JSON 객체 하나만 출력하세요. 마크다운 코드블록, 설명문, 주석은 쓰지 마세요.',
          '필수 스키마: {"name":"character name","prompt":"full character persona/profile prompt","firstMessage":"short opening message"}',
          'persona, profile, description 같은 정보가 있다면 prompt 필드 안에 합쳐서 넣으세요.'
        ].join('\n')
      }]);
      const parsed = normalizeGeneratedCharacter(text, name, prompt, firstMessage);
      setName(parsed.name);
      setPrompt(parsed.prompt);
      setFirstMessage(parsed.firstMessage);
    } catch (error) {
      Alert.alert('AI 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    const id = makeId('char');
    const finalName = name.trim() || '새 캐릭터';
    const character: SNSGodCharacter = {
      id,
      name: finalName,
      handle: finalName.toLowerCase().replace(/\s+/g, ''),
      avatarText: finalName.slice(0, 2),
      color: '#95e1d3',
      prompt: prompt.trim(),
      profileCoverPrompt: DEFAULT_COVER_BACKGROUND_DIRECTION,
      firstMessage: firstMessage.trim(),
      enabled: true,
      proactiveEnabled: true,
      responseDelayMin: 1,
      responseDelayMax: 8,
      messageGapMin: 1,
      messageGapMax: 3,
      responseTime: 6,
      thinkingTime: 6,
      reactivity: 8,
      tone: 8,
      initiative: 40,
      memories: [],
      stickers: []
    };
    const room = createRoom(id, '기본 채팅');
    const next: SNSGodState = {
      ...state,
      characters: [...state.characters, character],
      chatRooms: { ...state.chatRooms, [id]: [room] },
      messages: { ...state.messages, [room.id]: character.firstMessage ? [{ id: makeId('msg'), role: 'character', characterId: id, content: character.firstMessage, createdAt: Date.now() }] : [] },
      selectedRoomId: room.id
    };
    await onCreate(next, room.id);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>새 캐릭터</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={aiGenerate} style={styles.secondary} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>AI 생성</Text>}
        </Pressable>
        <Field label="이름" value={name} onChangeText={setName} />
        <Field label="캐릭터 프롬프트" value={prompt} onChangeText={setPrompt} multiline />
        <Field label="첫 메시지" value={firstMessage} onChangeText={setFirstMessage} multiline />
        <Pressable onPress={create} style={styles.primary}><Text style={styles.primaryText}>캐릭터 추가</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function normalizeGeneratedCharacter(text: string, fallbackName: string, fallbackPrompt: string, fallbackFirstMessage: string) {
  const parsed = parseJsonObject<GeneratedCharacterProfile>(text);
  if (parsed) {
    const nextName = safeText(parsed.name) || fallbackName;
    const nextPrompt = safeText(parsed.prompt || parsed.persona || parsed.profile || parsed.description) || fallbackPrompt;
    const nextFirstMessage = safeText(parsed.firstMessage || parsed.first_message || parsed.greeting) || fallbackFirstMessage;
    if (nextName || nextPrompt || nextFirstMessage) {
      return { name: nextName, prompt: nextPrompt, firstMessage: nextFirstMessage };
    }
  }
  const nextName = regexField(text, 'name') || fallbackName;
  const nextPrompt = regexField(text, 'prompt') || regexField(text, 'persona') || regexField(text, 'profile') || regexField(text, 'description') || fallbackPrompt;
  const nextFirstMessage = regexField(text, 'firstMessage') || regexField(text, 'first_message') || regexField(text, 'greeting') || fallbackFirstMessage;
  if (!nextName && !nextPrompt && !nextFirstMessage) throw new Error('AI 응답에서 캐릭터 JSON을 찾지 못했습니다.');
  return { name: nextName, prompt: nextPrompt, firstMessage: nextFirstMessage };
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function regexField(text: string, key: string): string {
  const pattern = new RegExp(`["']?${key}["']?\\s*[:=]\\s*(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`)`, 'i');
  const match = pattern.exec(text);
  return (match?.[1] || match?.[2] || match?.[3] || '').trim();
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  content: { padding: 14, gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.sub, fontWeight: '900' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  textarea: { minHeight: 140 },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontSize: 16, fontWeight: '900' },
  secondary: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  secondaryText: { color: colors.text, fontWeight: '900' }
});
