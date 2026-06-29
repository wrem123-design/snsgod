import React, { useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { callLLMText } from '../logic/api';
import {
  activeSumGodEntry,
  canCreateNextSumGodEntry,
  getSumGodProgress,
  isTodaySumGodDone,
  loadSumGodBackup,
  openSumGodQuestion,
  patchSumGod,
  pushSumGodNotification,
  restoreSumGodBackupIfBetter,
  saveSumGodBackup,
  selectSumGodCharacter,
  sumGodBadgeCount,
  todaySumGodEntry,
  updateSumGodEntry
} from '../logic/sumgod';
import {
  buildSumGodContinuationPrompt,
  buildSumGodPrivateAnswerPrompt,
  buildSumGodRevealCommentPrompt,
  buildSumGodTalkPrompt,
  cleanSumGodText,
  looksIncompleteSumGodText
} from '../logic/sumgodPrompts';
import { colors } from '../theme';
import { SNSGodCharacter, SNSGodState, SumGodEntry } from '../types';

type CommitCurrent = (patch: (current: SNSGodState) => SNSGodState) => Promise<SNSGodState | undefined> | SNSGodState | undefined;

export function SumGodScreen({ state, onBack, onChange, onCommitCurrent }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onCommitCurrent?: CommitCurrent;
}) {
  const sum = getSumGodProgress(state);
  const character = state.characters.find(item => item.id === sum.characterId) || state.characters[0];
  const active = activeSumGodEntry(sum);
  const todayEntry = todaySumGodEntry(sum);
  const visibleEntry = sum.questionOpen ? active || todayEntry : undefined;
  const completed = sum.entries.filter(entry => entry.userAnswer && entry.characterAnswer);
  const canOpen = canCreateNextSumGodEntry(sum);
  const locked = !canOpen && !visibleEntry && sum.entries.length > 0;
  const [draftAnswer, setDraftAnswer] = useState(visibleEntry?.userAnswer || '');
  const [talk, setTalk] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editUser, setEditUser] = useState('');
  const [editCharacter, setEditCharacter] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraftAnswer(visibleEntry?.userAnswer || '');
  }, [visibleEntry?.id]);

  useEffect(() => {
    void (async () => {
      const backup = await loadSumGodBackup();
      const restored = restoreSumGodBackupIfBetter(state, backup);
      if (restored !== state) {
        await onChange(restored);
        setStatus('SumGod 진행 백업을 복원했습니다.');
      }
    })();
  }, []);

  async function commitPatch(patch: (current: SNSGodState) => SNSGodState): Promise<SNSGodState | undefined> {
    if (onCommitCurrent) {
      const result = await onCommitCurrent(current => {
        const next = patch(current);
        void saveSumGodBackup(getSumGodProgress(next));
        return next;
      });
      return result;
    }
    const next = patch(state);
    await onChange(next);
    void saveSumGodBackup(getSumGodProgress(next));
    return next;
  }

  async function openEgg(cheat = false) {
    if (!character) {
      Alert.alert('캐릭터 필요', 'SumGod를 진행할 캐릭터를 먼저 만들어주세요.');
      return;
    }
    await commitPatch(current => openSumGodQuestion(current, new Date(), { cheat }));
  }

  async function changeCharacter(nextCharacter: SNSGodCharacter) {
    setPickerOpen(false);
    await commitPatch(current => selectSumGodCharacter(current, nextCharacter));
    setStatus(`${nextCharacter.name}와 새 SumGod를 시작합니다.`);
  }

  async function finishIfNeeded(snapshot: SNSGodState, text: string): Promise<string> {
    let cleaned = cleanSumGodText(text);
    if (!looksIncompleteSumGodText(text)) return cleaned;
    try {
      const continuation = await callLLMText(snapshot, buildSumGodContinuationPrompt(snapshot, cleaned));
      cleaned = cleanSumGodText(`${cleaned}\n${continuation.text}`);
    } catch {
      // Keep the usable partial answer if continuation fails.
    }
    return cleanSumGodText(cleaned);
  }

  async function submitAnswer(entry: SumGodEntry) {
    if (!character) return;
    const userAnswer = draftAnswer.trim();
    if (!userAnswer) return;
    let snapshot = await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({
      ...item,
      userAnswer,
      generatingAnswer: true,
      completedOn: undefined,
      completedAt: undefined
    })));
    snapshot = snapshot || state;
    const latestSum = getSumGodProgress(snapshot);
    const latestEntry = latestSum.entries.find(item => item.id === entry.id) || entry;
    const latestCharacter = snapshot.characters.find(item => item.id === latestSum.characterId) || character;
    try {
      const answerRaw = await callLLMText(snapshot, buildSumGodPrivateAnswerPrompt(snapshot, latestEntry, latestCharacter));
      const characterAnswer = await finishIfNeeded(snapshot, answerRaw.text);
      let withAnswer = await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({
        ...item,
        characterAnswer,
        generatingAnswer: false,
        completedOn: new Date().toISOString().slice(0, 10),
        completedAt: Date.now()
      })));
      withAnswer = withAnswer || snapshot;
      const answerState = withAnswer;
      const answerSum = getSumGodProgress(answerState);
      const answerEntry = answerSum.entries.find(item => item.id === entry.id);
      const answerCharacter = answerState.characters.find(item => item.id === answerSum.characterId) || latestCharacter;
      if (answerEntry) await generateRevealComment(answerState, answerEntry, answerCharacter);
    } catch (error) {
      await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({ ...item, generatingAnswer: false })));
      Alert.alert('답변 생성 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function generateRevealComment(snapshot: SNSGodState, entry: SumGodEntry, target: SNSGodCharacter, force = false) {
    const hasReveal = entry.conversation.some(line => line.kind === 'reveal-comment');
    if (hasReveal && !force) return;
    try {
      const raw = await callLLMText(snapshot, buildSumGodRevealCommentPrompt(snapshot, entry, target));
      const text = await finishIfNeeded(snapshot, raw.text);
      await commitPatch(current => {
        const next = updateSumGodEntry(current, entry.id, item => ({
          ...item,
          conversation: [
            ...item.conversation.filter(line => force ? line.kind !== 'reveal-comment' : true),
            { role: 'character' as const, text, createdAt: Date.now(), kind: 'reveal-comment' as const }
          ]
        }));
        return pushSumGodNotification(next, entry, target, text);
      });
    } catch {
      // Reveal comments are nice-to-have; the main answers should remain saved.
    }
  }

  async function sendTalk(entry: SumGodEntry) {
    if (!character || !talk.trim()) return;
    const userText = talk.trim();
    setTalk('');
    let snapshot = await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({
      ...item,
      generatingTalk: true,
      conversation: [...item.conversation, { role: 'user', text: userText, createdAt: Date.now(), kind: 'talk' }]
    })));
    snapshot = snapshot || state;
    const latestSum = getSumGodProgress(snapshot);
    const latestEntry = latestSum.entries.find(item => item.id === entry.id) || entry;
    const latestCharacter = snapshot.characters.find(item => item.id === latestSum.characterId) || character;
    try {
      const raw = await callLLMText(snapshot, buildSumGodTalkPrompt(snapshot, latestEntry, latestCharacter, userText));
      const reply = await finishIfNeeded(snapshot, raw.text);
      await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({
        ...item,
        generatingTalk: false,
        conversation: [...item.conversation, { role: 'character', text: reply, createdAt: Date.now(), kind: 'talk' }]
      })));
    } catch (error) {
      await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({ ...item, generatingTalk: false })));
      Alert.alert('대화 생성 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function saveArchiveEdit(entry: SumGodEntry) {
    await commitPatch(current => updateSumGodEntry(current, entry.id, item => ({
      ...item,
      userAnswer: editUser.trim(),
      characterAnswer: editCharacter.trim(),
      archiveEditing: false,
      textEditedAt: Date.now()
    })));
    setEditingId('');
  }

  async function exportEntry(entry: SumGodEntry) {
    try {
      const fileName = `sumgod-q${entry.number}-${Date.now()}.txt`;
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}${fileName}`;
      const payload = [
        `SumGod Q.${entry.number}`,
        entry.question,
        '',
        `${state.config.userName || '나'}:`,
        entry.userAnswer,
        '',
        `${character?.name || '캐릭터'}:`,
        entry.characterAnswer,
        '',
        'Conversation:',
        ...entry.conversation.map(line => `${line.role === 'user' ? state.config.userName || '나' : character?.name || '캐릭터'}: ${line.text}`)
      ].join('\n');
      await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'SumGod 문답 공유' });
    } catch (error) {
      Alert.alert('내보내기 실패', error instanceof Error ? error.message : String(error));
    }
  }

  const eggText = useMemo(() => {
    if (visibleEntry) return visibleEntry.userAnswer ? '오늘 문답 다시 보기' : '오늘 질문이 열렸어요';
    if (canOpen) return sum.entries.length ? '오늘의 달걀 열기' : '첫 질문 열기';
    if (isTodaySumGodDone(sum)) return '오늘 문답은 완료됐어요';
    return '다음 질문은 밤 10시에 열려요';
  }, [visibleEntry?.id, canOpen, sum.entries.length]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>SumGod</Text>
          <Text style={styles.subtitle}>밤 10시에 하나씩 열리는 커플 질문 다이어리</Text>
        </View>
        {sumGodBadgeCount(state) ? <View style={styles.badgeDot}><Text style={styles.badgeDotText}>1</Text></View> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={styles.tabs}>
          <Pressable onPress={() => void commitPatch(current => patchSumGod(current, item => ({ ...item, view: 'today' })))} style={[styles.tab, sum.view === 'today' && styles.tabActive]}><Text style={styles.tabText}>Today</Text></Pressable>
          <Pressable onPress={() => void commitPatch(current => patchSumGod(current, item => ({ ...item, view: 'archive' })))} style={[styles.tab, sum.view === 'archive' && styles.tabActive]}><Text style={styles.tabText}>Archive</Text></Pressable>
        </View>

        {sum.view === 'today' ? (
          <>
            <View style={styles.hero}>
              <Pressable onPress={() => setPickerOpen(!pickerOpen)} style={styles.characterPick}>
                <Text style={styles.heroName}>{character?.name || '캐릭터 없음'}</Text>
                <Text style={styles.heroHeart}>♥</Text>
                <Text style={styles.heroName}>{state.config.userName || '나'}</Text>
              </Pressable>
              <Text style={styles.heroCopy}>같은 질문에 먼저 따로 답하고, 공개된 뒤 서로의 마음을 읽어요.</Text>
              {pickerOpen ? (
                <View style={styles.picker}>
                  {state.characters.map(item => (
                    <Pressable key={item.id} onPress={() => void changeCharacter(item)} style={styles.pickerRow}>
                      <Text style={styles.pickerName}>{item.name}</Text>
                      {item.id === character?.id ? <Text style={styles.pickerSelected}>선택됨</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Pressable onPress={() => void openEgg(false)} disabled={!canOpen && !visibleEntry} style={[styles.egg, (!canOpen && !visibleEntry) && styles.eggDisabled]}>
              <Text style={styles.eggIcon}>🥚</Text>
              <Text style={styles.eggText}>{eggText}</Text>
            </Pressable>

            {locked ? <Text style={styles.lockText}>첫 질문 이후에는 22:00~다음날 21:59 기준으로 하루에 하나만 열립니다.</Text> : null}

            {visibleEntry ? (
              <View style={styles.questionCard}>
                <Text style={styles.qPill}>Q.{visibleEntry.number}</Text>
                <Text style={styles.question}>{visibleEntry.question}</Text>
                {!visibleEntry.userAnswer ? (
                  <>
                    <TextInput value={draftAnswer} onChangeText={setDraftAnswer} style={styles.textarea} multiline textAlignVertical="top" placeholder="내 답을 먼저 적어주세요" />
                    <Pressable onPress={() => void submitAnswer(visibleEntry)} style={styles.primary}><Text style={styles.primaryText}>내 답 저장하고 캐릭터 답변 열기</Text></Pressable>
                  </>
                ) : (
                  <>
                    <AnswerBlock label={state.config.userName || '나'} text={visibleEntry.userAnswer} />
                    <AnswerBlock label={character?.name || '캐릭터'} text={visibleEntry.generatingAnswer ? '답변 작성 중...' : visibleEntry.characterAnswer} muted={visibleEntry.generatingAnswer} />
                    {visibleEntry.conversation.map((line, index) => <TalkLine key={`${line.createdAt}_${index}`} line={line} character={character} userName={state.config.userName || '나'} />)}
                    {visibleEntry.characterAnswer ? (
                      <>
                        <View style={styles.talkInputRow}>
                          <TextInput value={talk} onChangeText={setTalk} style={styles.input} placeholder="이 문답에 이어서 말하기" />
                          <Pressable onPress={() => void sendTalk(visibleEntry)} style={styles.send}><Text style={styles.sendText}>전송</Text></Pressable>
                        </View>
                        {visibleEntry.generatingTalk ? <Text style={styles.generating}>대답을 쓰는 중...</Text> : null}
                      </>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.archiveHead}>
              <Text style={styles.archiveTitle}>완료된 문답 {completed.length}개</Text>
              <Pressable onPress={() => void openEgg(true)} style={styles.cheat}><Text style={styles.cheatText}>테스트: 다음 질문 열기</Text></Pressable>
            </View>
            {completed.length ? completed.map(entry => (
              <View key={entry.id} style={styles.archiveCard}>
                <View style={styles.archiveRow}>
                  <Text style={styles.qPill}>Q.{entry.number}</Text>
                  <Pressable onPress={() => void exportEntry(entry)}><Text style={styles.linkText}>문답 내보내기</Text></Pressable>
                </View>
                <Text style={styles.questionSmall}>{entry.question}</Text>
                {editingId === entry.id ? (
                  <>
                    <TextInput value={editUser} onChangeText={setEditUser} style={styles.textareaSmall} multiline textAlignVertical="top" />
                    <TextInput value={editCharacter} onChangeText={setEditCharacter} style={styles.textareaSmall} multiline textAlignVertical="top" />
                    <Pressable onPress={() => void saveArchiveEdit(entry)} style={styles.primary}><Text style={styles.primaryText}>수정 저장</Text></Pressable>
                  </>
                ) : (
                  <>
                    <AnswerBlock label={state.config.userName || '나'} text={entry.userAnswer} />
                    <AnswerBlock label={character?.name || '캐릭터'} text={entry.characterAnswer} />
                    {entry.conversation.map((line, index) => <TalkLine key={`${line.createdAt}_${index}`} line={line} character={character} userName={state.config.userName || '나'} />)}
                    <Pressable onPress={() => { setEditingId(entry.id); setEditUser(entry.userAnswer); setEditCharacter(entry.characterAnswer); }} style={styles.secondary}><Text style={styles.secondaryText}>텍스트 수정</Text></Pressable>
                  </>
                )}
              </View>
            )) : <Text style={styles.empty}>아직 완료된 문답이 없습니다.</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AnswerBlock({ label, text, muted }: { label: string; text: string; muted?: boolean }) {
  return (
    <View style={[styles.answerBlock, muted && styles.answerMuted]}>
      <Text style={styles.answerLabel}>{label}</Text>
      <Text style={styles.answerText}>{text || '아직 답변이 없습니다.'}</Text>
    </View>
  );
}

function TalkLine({ line, character, userName }: { line: { role: 'user' | 'character'; text: string; kind?: string }; character?: SNSGodCharacter; userName: string }) {
  return (
    <View style={[styles.talkLine, line.role === 'user' ? styles.talkUser : styles.talkCharacter]}>
      <Text style={styles.talkName}>{line.role === 'user' ? userName : character?.name || '캐릭터'}{line.kind === 'reveal-comment' ? ' · 공개 후 코멘트' : ''}</Text>
      <Text style={styles.talkText}>{line.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff8ee' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffaf0', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ead1c8' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#fff1e6' },
  backText: { fontSize: 34, lineHeight: 36, color: '#4a3435' },
  titleBlock: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', color: '#4a3435' },
  subtitle: { color: '#9b7b76', fontWeight: '800', fontSize: 11 },
  badgeDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
  badgeDotText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  content: { padding: 16, paddingBottom: 34, gap: 14 },
  status: { padding: 10, borderRadius: 8, backgroundColor: '#fff3c4', color: '#5b4100', fontWeight: '800' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', backgroundColor: '#fffaf0' },
  tab: { flex: 1, minHeight: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#ffe8ef' },
  tabText: { color: '#4a3435', fontWeight: '900' },
  hero: { gap: 10, paddingVertical: 8 },
  characterPick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 54 },
  heroName: { color: '#4a3435', fontSize: 27, fontWeight: '900', textDecorationLine: 'underline' },
  heroHeart: { color: '#d66f8a', fontSize: 22, fontWeight: '900' },
  heroCopy: { textAlign: 'center', color: '#9b7b76', fontWeight: '800', lineHeight: 20 },
  picker: { borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', backgroundColor: '#fffaf0', overflow: 'hidden' },
  pickerRow: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ead1c8' },
  pickerName: { flex: 1, color: '#4a3435', fontWeight: '900' },
  pickerSelected: { color: '#9b4c62', fontWeight: '900', fontSize: 12 },
  egg: { alignSelf: 'center', alignItems: 'center', gap: 8, paddingVertical: 8 },
  eggDisabled: { opacity: 0.55 },
  eggIcon: { fontSize: 96 },
  eggText: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#edc9d0', backgroundColor: '#fffdf7', color: '#7b4b55', fontWeight: '900' },
  lockText: { textAlign: 'center', color: '#9b4c62', fontWeight: '800' },
  questionCard: { padding: 18, borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', backgroundColor: '#fffaf0', gap: 12 },
  qPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#ffe8ef', color: '#9b4c62', fontWeight: '900' },
  question: { color: '#4a3435', fontSize: 20, lineHeight: 29, fontWeight: '900' },
  questionSmall: { color: '#4a3435', fontSize: 15, lineHeight: 22, fontWeight: '900' },
  textarea: { minHeight: 118, borderWidth: 1, borderColor: '#ead1c8', borderRadius: 8, padding: 12, color: '#4a3435', backgroundColor: '#fff' },
  textareaSmall: { minHeight: 92, borderWidth: 1, borderColor: '#ead1c8', borderRadius: 8, padding: 10, color: '#4a3435', backgroundColor: '#fff' },
  input: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#ead1c8', borderRadius: 8, paddingHorizontal: 12, color: '#4a3435', backgroundColor: '#fff' },
  primary: { minHeight: 44, borderRadius: 8, backgroundColor: '#f6a6b8', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#4a3435', fontWeight: '900' },
  secondary: { minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#7b4b55', fontWeight: '900' },
  answerBlock: { padding: 12, borderRadius: 8, backgroundColor: '#fff4e7', borderWidth: 1, borderColor: '#ead1c8', gap: 5 },
  answerMuted: { opacity: 0.7 },
  answerLabel: { color: '#9b4c62', fontWeight: '900', fontSize: 12 },
  answerText: { color: '#4a3435', lineHeight: 21, fontWeight: '700' },
  talkLine: { padding: 11, borderRadius: 8, gap: 4, maxWidth: '92%' },
  talkUser: { alignSelf: 'flex-end', backgroundColor: '#ffe8ef' },
  talkCharacter: { alignSelf: 'flex-start', backgroundColor: '#fffdf7', borderWidth: 1, borderColor: '#ead1c8' },
  talkName: { color: '#9b7b76', fontWeight: '900', fontSize: 11 },
  talkText: { color: '#4a3435', lineHeight: 20, fontWeight: '700' },
  talkInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  send: { minWidth: 56, minHeight: 42, borderRadius: 8, backgroundColor: '#9b4c62', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '900' },
  generating: { color: '#9b7b76', fontWeight: '800' },
  archiveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  archiveTitle: { color: '#4a3435', fontSize: 18, fontWeight: '900' },
  cheat: { paddingHorizontal: 10, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', alignItems: 'center', justifyContent: 'center' },
  cheatText: { color: '#9b4c62', fontWeight: '900', fontSize: 12 },
  archiveCard: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ead1c8', backgroundColor: '#fffaf0', gap: 10 },
  archiveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { color: '#9b4c62', fontWeight: '900' },
  empty: { textAlign: 'center', color: '#9b7b76', fontWeight: '900', marginTop: 30 }
});
