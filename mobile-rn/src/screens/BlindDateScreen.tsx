import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { BlindDateCandidate, BlindDateCandidateArchive, BlindDateRound, BlindDateSession, SNSGodState } from '../types';
import {
  activeBlindDateSession,
  appendBlindDateCandidates,
  archiveBlindDateCandidate,
  blindDatePreferenceReport,
  blindDateSuggestedQuestions,
  createMixedBlindDateSession,
  createBlindDateQuestionRound,
  createBlindDateRotationTurn,
  createBlindDateSession,
  deleteBlindDateArchive,
  getBlindDateProgress,
  importBlindDateCandidate,
  importBlindDateArchive,
  revealBlindDateRanking,
  selectBlindDateAnswer,
  selectBlindDateCandidate
} from '../logic/blindDate';
import { createBlindDateFirstDatePrompt } from '../logic/meetingEvent';

export function BlindDateScreen({ state, onBack, onChange, onOpenRoom }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoom: (roomId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [rotationText, setRotationText] = useState('');
  const [rotationCandidateId, setRotationCandidateId] = useState('');
  const [mixArchiveIds, setMixArchiveIds] = useState<string[]>([]);
  const [profileIndex, setProfileIndex] = useState(0);
  const [profileRefilling, setProfileRefilling] = useState(false);
  const progress = getBlindDateProgress(state);
  const activeSession = activeBlindDateSession(state);
  const session = activeSession?.mode === 'worldcup' ? undefined : activeSession;
  const selectedCandidate = session?.candidates.find(item => item.id === session.selectedCandidateId);
  const importCandidate = selectedCandidate || (session?.mode !== 'rotation' ? session?.candidates.find(item => item.id === session?.finalRanking?.[0]?.candidateId) : undefined);
  const rotationComplete = session?.mode === 'rotation' && session.candidates.length > 0
    ? session.candidates.every(candidate => (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length >= 3)
    : false;
  const questions = useMemo(() => blindDateSuggestedQuestions(), []);
  const report = useMemo(() => blindDatePreferenceReport(state), [state]);

  useEffect(() => {
    setProfileIndex(0);
  }, [session?.id]);

  async function runBusy(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      Alert.alert('블라인드 데이트 오류', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function startProfile() {
    void runBusy(async () => {
      await onChange(await createBlindDateSession(state, 'profile', 3));
    });
  }

  function startQuestion() {
    void runBusy(async () => {
      await onChange(await createBlindDateSession(state, 'question', 5));
    });
  }

  function startRotation() {
    void runBusy(async () => {
      await onChange(await createBlindDateSession(state, 'rotation', 5));
    });
  }

  function chooseCandidate(candidateId: string) {
    if (!session) return;
    void onChange(selectBlindDateCandidate(state, session.id, candidateId));
  }

  function passProfileCandidate() {
    if (!session || session.mode !== 'profile') return;
    const nextIndex = profileIndex + 1;
    setProfileIndex(nextIndex);
    if (session.candidates.length - nextIndex <= 2 && !profileRefilling) {
      setProfileRefilling(true);
      void appendBlindDateCandidates(state, session.id, 2)
        .then(next => onChange(next))
        .finally(() => setProfileRefilling(false));
    }
  }

  function archiveCandidate(candidateId: string) {
    if (!session) return;
    void onChange(archiveBlindDateCandidate(state, session.id, candidateId));
  }

  function revealRanking() {
    if (!session) return;
    void onChange(revealBlindDateRanking(state, session.id));
  }

  function askQuestion(question: string) {
    if (!session || busy) return;
    const clean = question.trim();
    if (!clean) return;
    setCustomQuestion('');
    void runBusy(async () => {
      await onChange(await createBlindDateQuestionRound(state, session.id, clean));
    });
  }

  function selectAnswer(round: BlindDateRound, answerId: string) {
    if (!session || round.selectedAnswerId) return;
    void onChange(selectBlindDateAnswer(state, session.id, round.id, answerId));
  }

  function sendRotationTurn(candidateId: string, presetText?: string) {
    const text = String(presetText || rotationText).trim();
    if (!session || busy || !text) return;
    setRotationText('');
    setRotationCandidateId(candidateId);
    void runBusy(async () => {
      await onChange(await createBlindDateRotationTurn(state, session.id, candidateId, text));
    });
  }

  function importSelected() {
    if (!session) return;
    const candidateId = session.selectedCandidateId || session.finalRanking?.[0]?.candidateId;
    if (!candidateId) {
      Alert.alert('선택 필요', '연락처를 받을 사람을 먼저 선택해주세요.');
      return;
    }
    const { next, roomId } = importBlindDateCandidate(state, session.id, candidateId);
    void Promise.resolve(roomId ? createBlindDateFirstDatePrompt(next, roomId) : next).then(withMeetingPrompt => onChange(withMeetingPrompt)).then(() => {
      if (roomId) onOpenRoom(roomId);
    });
  }

  function importArchive(archiveId: string) {
    const { next, roomId } = importBlindDateArchive(state, archiveId);
    void Promise.resolve(roomId ? createBlindDateFirstDatePrompt(next, roomId) : next).then(withMeetingPrompt => onChange(withMeetingPrompt)).then(() => {
      if (roomId) onOpenRoom(roomId);
    });
  }

  function deleteArchive(archiveId: string) {
    setMixArchiveIds(ids => ids.filter(id => id !== archiveId));
    void onChange(deleteBlindDateArchive(state, archiveId));
  }

  function toggleMixArchive(archiveId: string) {
    setMixArchiveIds(ids => {
      if (ids.includes(archiveId)) return ids.filter(id => id !== archiveId);
      return [...ids, archiveId].slice(-2);
    });
  }

  function createMixFromArchives() {
    if (mixArchiveIds.length !== 2) {
      Alert.alert('후보 2명 필요', '보관함에서 섞을 후보 2명을 선택해주세요.');
      return;
    }
    void runBusy(async () => {
      await onChange(await createMixedBlindDateSession(state, mixArchiveIds[0], mixArchiveIds[1]));
      setMixArchiveIds([]);
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>블라인드 데이트</Text>
          <Text style={styles.subtitle}>AI 후보를 비교하고 마음에 드는 사람을 가져와요.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!session ? (
          <View style={styles.section}>
            <ModeCard title="AI 캐릭터 가챠" subtitle="한 명씩 프로필을 보고 마음에 들면 연락처를 얻어요." action="가챠 시작" onPress={startProfile} disabled={busy} />
            <ModeCard title="블라인드 질문 소개팅" subtitle="외모를 숨기고 답변만 보고 고르기" action="5명 시작" onPress={startQuestion} disabled={busy} />
            <ModeCard title="로테이션 데이트" subtitle="여러 후보와 짧게 대화해보고 선택" action="5명 시작" onPress={startRotation} disabled={busy} />
            <PreferenceReport text={report} />
            <ArchiveBlock
              archives={progress.archives || []}
              mixArchiveIds={mixArchiveIds}
              onToggleMix={toggleMixArchive}
              onCreateMix={createMixFromArchives}
              onImport={importArchive}
              onDelete={deleteArchive}
              busy={busy}
            />
          </View>
        ) : (
          <>
            <View style={styles.sessionBar}>
              <View>
                <Text style={styles.sessionTitle}>{modeTitle(session.mode)}</Text>
                <Text style={styles.sessionSub}>{session.candidates.length}명 후보 · {session.status === 'completed' ? '가져오기 완료' : session.status === 'revealing' ? '정체 공개' : '진행 중'}</Text>
              </View>
              <Pressable onPress={() => void onChange({ ...state, blindDate: { ...progress, activeSessionId: undefined } })} style={styles.smallButton}><Text style={styles.smallButtonText}>나가기</Text></Pressable>
            </View>

            {busy ? <LoadingBlock /> : null}

            {session.mode === 'profile' ? (
              <ProfileGachaMode
                session={session}
                activeIndex={profileIndex}
                refilling={profileRefilling}
                onPass={passProfileCandidate}
                onSelect={chooseCandidate}
                onArchive={archiveCandidate}
              />
            ) : session.mode === 'question' ? (
              <QuestionMode
                sessionId={session.id}
                candidates={session.candidates}
                rounds={session.rounds}
                questions={questions}
                customQuestion={customQuestion}
                setCustomQuestion={setCustomQuestion}
                onAsk={askQuestion}
                onSelectAnswer={selectAnswer}
                busy={busy}
              />
            ) : session.mode === 'rotation' ? (
              <RotationMode session={session} rotationText={rotationText} setRotationText={setRotationText} activeCandidateId={rotationCandidateId} setActiveCandidateId={setRotationCandidateId} onSend={sendRotationTurn} onSelect={chooseCandidate} busy={busy} />
            ) : null}

            {session.mode === 'question' && session.rounds.length >= 3 && session.status !== 'revealing' && session.status !== 'completed' ? (
              <Pressable onPress={revealRanking} style={styles.primaryWide}><Text style={styles.primaryWideText}>순위 공개</Text></Pressable>
            ) : null}

            {session.mode !== 'profile' && (session.status === 'revealing' || session.finalRanking?.length) ? (
              <RankingBlock mode={session.mode} candidates={session.candidates} ranking={session.finalRanking || []} selectedCandidateId={session.selectedCandidateId} onSelect={chooseCandidate} onArchive={archiveCandidate} />
            ) : null}

            {importCandidate ? (
              <View style={styles.importPanel}>
                <Text style={styles.importTitle}>{importCandidate.name || '선택한 후보'}에게 연락처를 받을까요?</Text>
                <Text style={styles.importSub}>연락처를 받으면 메신저, SNS, 통화, 만남 이벤트에서 오늘의 선택을 기억합니다.</Text>
                <Pressable onPress={importSelected} style={styles.importButton}><Text style={styles.importButtonText}>그녀에게 연락처 얻기</Text></Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function modeTitle(mode: string) {
  if (mode === 'question') return '블라인드 질문 소개팅';
  if (mode === 'rotation') return '로테이션 데이트';
  return '프로필 소개팅';
}

function ModeCard({ title, subtitle, action, secondary, onPress, onSecondary, disabled, muted }: {
  title: string;
  subtitle: string;
  action: string;
  secondary?: string;
  onPress: () => void;
  onSecondary?: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={[styles.modeCard, muted && styles.modeCardMuted]}>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeSub}>{subtitle}</Text>
      <View style={styles.modeActions}>
        <Pressable onPress={onPress} disabled={disabled} style={[styles.modeButton, disabled && styles.disabled]}><Text style={styles.modeButtonText}>{action}</Text></Pressable>
        {secondary ? <Pressable onPress={onSecondary} disabled={disabled} style={[styles.modeButtonSecondary, disabled && styles.disabled]}><Text style={styles.modeButtonSecondaryText}>{secondary}</Text></Pressable> : null}
      </View>
    </View>
  );
}

function LoadingBlock() {
  const messages = useMemo(() => [
    ['소개팅 장소에 후보들이 하나둘 모이고 있어요.', '누군가는 거울을 보고, 누군가는 답장을 미리 생각 중이에요.'],
    ['첫인상 카드를 정리하는 중이에요.', '너무 비슷한 얼굴은 슬쩍 돌려보내고 있습니다.'],
    ['A번 후보가 아직 카페 입구에서 머뭇거리고 있어요.', '잠깐만 기다리면 자연스럽게 등장할 거예요.'],
    ['각자 다른 말투와 취향을 챙기는 중이에요.', '다정한 사람, 무심한 사람, 은근히 웃긴 사람까지요.'],
    ['프로필 사진을 고르는 중이에요.', '오늘따라 조명이 꽤 중요하다고 하네요.'],
    ['첫 DM 문장을 다듬고 있어요.', '너무 부담스럽지 않고, 너무 심심하지 않게요.'],
    ['후보들이 서로 겹치지 않게 자리를 바꾸는 중이에요.', '같은 분위기만 줄 서면 재미없으니까요.'],
    ['소개팅 질문에 답할 성격을 먼저 고정하고 있어요.', 'A는 계속 A답게, B는 계속 B답게 말해야 하니까요.']
  ], []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex(value => (value + 1) % messages.length), 2400);
    return () => clearInterval(timer);
  }, [messages.length]);

  const current = messages[index] || messages[0];
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.loadingText}>{current[0]}</Text>
      <Text style={styles.loadingSub}>{current[1]}</Text>
      <View style={styles.loadingDots}>
        {messages.slice(0, 5).map((_, dotIndex) => (
          <View key={dotIndex} style={[styles.loadingDot, dotIndex === index % 5 && styles.loadingDotActive]} />
        ))}
      </View>
    </View>
  );
}

function PreferenceReport({ text }: { text: string }) {
  return (
    <View style={styles.reportCard}>
      <Text style={styles.panelTitle}>취향 분석 리포트</Text>
      <Text style={styles.reportText}>{text}</Text>
    </View>
  );
}

function ArchiveBlock({ archives, mixArchiveIds, onToggleMix, onCreateMix, onImport, onDelete, busy }: {
  archives: BlindDateCandidateArchive[];
  mixArchiveIds: string[];
  onToggleMix: (archiveId: string) => void;
  onCreateMix: () => void;
  onImport: (archiveId: string) => void;
  onDelete: (archiveId: string) => void;
  busy?: boolean;
}) {
  if (!archives?.length) return null;
  return (
    <View style={styles.archivePanel}>
      <View style={styles.archiveHeader}>
        <View>
          <Text style={styles.panelTitle}>후보 보관함</Text>
          <Text style={styles.archiveHelp}>2명을 선택하면 외모/성격 믹스 후보를 만들 수 있어요.</Text>
        </View>
        <Pressable onPress={onCreateMix} disabled={busy || mixArchiveIds.length !== 2} style={[styles.mixButton, (busy || mixArchiveIds.length !== 2) && styles.disabled]}>
          <Text style={styles.mixButtonText}>믹스</Text>
        </Pressable>
      </View>
      {archives.slice(0, 8).map(archive => (
        <View key={archive.id} style={[styles.archiveRow, mixArchiveIds.includes(archive.id) && styles.archiveRowSelected]}>
          <Pressable onPress={() => onToggleMix(archive.id)} style={[styles.mixCheck, mixArchiveIds.includes(archive.id) && styles.mixCheckActive]}>
            <Text style={[styles.mixCheckText, mixArchiveIds.includes(archive.id) && styles.mixCheckTextActive]}>{mixArchiveIds.includes(archive.id) ? '✓' : '+'}</Text>
          </Pressable>
          {archive.candidate.profileImageUri ? <Image source={{ uri: archive.candidate.profileImageUri }} style={styles.archiveImage} /> : <View style={styles.archiveFallback}><Text style={styles.rankFallbackText}>{archive.candidate.name.slice(0, 1)}</Text></View>}
          <View style={styles.archiveTextWrap}>
            <Text style={styles.archiveName}>{archive.candidate.name} · {archive.candidate.age}</Text>
            <Text style={styles.archiveSub}>{archive.candidate.job} · {archive.candidate.personalitySummary}</Text>
          </View>
          <View style={styles.archiveActions}>
            <Pressable onPress={() => onImport(archive.id)} style={styles.archiveButton}><Text style={styles.archiveButtonText}>연락하기</Text></Pressable>
            <Pressable onPress={() => onDelete(archive.id)} style={styles.archiveDeleteButton}><Text style={styles.archiveDeleteText}>삭제</Text></Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function ProfileGachaMode({ session, activeIndex, refilling, onPass, onSelect, onArchive }: {
  session: BlindDateSession;
  activeIndex: number;
  refilling?: boolean;
  onPass: () => void;
  onSelect: (candidateId: string) => void;
  onArchive: (candidateId: string) => void;
}) {
  const safeIndex = Math.min(activeIndex, Math.max(0, session.candidates.length - 1));
  const candidate = session.candidates[safeIndex];
  if (!candidate) {
    return (
      <View style={styles.gachaEmpty}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.gachaEmptyText}>새 후보를 준비하고 있어요.</Text>
      </View>
    );
  }
  const selected = session.selectedCandidateId === candidate.id;
  return (
    <View style={styles.gachaWrap}>
      <View style={[styles.gachaCard, selected && styles.candidateSelected]}>
        <View style={styles.gachaTopRow}>
          <View>
            <Text style={styles.gachaKicker}>오늘의 후보 {safeIndex + 1}</Text>
            <Text style={styles.gachaName}>{candidate.name} · {candidate.age}</Text>
            <Text style={styles.gachaJob}>{candidate.job} · {candidate.locationBase}</Text>
          </View>
          <Pressable onPress={() => onArchive(candidate.id)} style={styles.archiveMiniButton}><Text style={styles.archiveMiniText}>보관</Text></Pressable>
        </View>
        {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.gachaImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{candidate.name.slice(0, 1)}</Text></View>}

        <View style={styles.gachaSection}>
          <Text style={styles.gachaLabel}>프로필</Text>
          <Text style={styles.gachaText}>{candidate.personalitySummary}</Text>
          <Text style={styles.gachaText}>{candidate.relationshipStyle}</Text>
        </View>

        <View style={styles.gachaSection}>
          <Text style={styles.gachaLabel}>말투 예시</Text>
          <Text style={styles.gachaQuote}>“{candidate.firstDm}”</Text>
          <Text style={styles.gachaText}>{candidate.speechStyle}</Text>
        </View>

        <View style={styles.gachaPreviewGrid}>
          <View style={styles.gachaPreviewBox}>
            <Text style={styles.gachaDarkLabel}>SNS</Text>
            <Text style={styles.gachaSmallText}>{candidate.snsPreview || candidate.snsStyle}</Text>
          </View>
          <View style={styles.gachaPreviewBox}>
            <Text style={styles.gachaDarkLabel}>통화</Text>
            <Text style={styles.gachaSmallText}>{candidate.callPreview || candidate.relationshipStyle}</Text>
          </View>
        </View>

        <View style={styles.tags}>
          {[...candidate.likes.slice(0, 2), ...candidate.hobbies.slice(0, 2), candidate.contactPresetId].filter(Boolean).map(tag => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
        </View>

        <View style={styles.gachaActions}>
          <Pressable onPress={onPass} disabled={refilling && safeIndex >= session.candidates.length - 1} style={[styles.passButton, refilling && safeIndex >= session.candidates.length - 1 && styles.disabled]}>
            <Text style={styles.passButtonText}>패스</Text>
          </Pressable>
          <Pressable onPress={() => onSelect(candidate.id)} style={[styles.contactButton, selected && styles.selectButtonActive]}>
            <Text style={[styles.contactButtonText, selected && styles.selectButtonTextActive]}>{selected ? '선택됨' : '연락처 얻기'}</Text>
          </Pressable>
        </View>
      </View>
      {refilling ? (
        <View style={styles.refillHint}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.refillHintText}>뒤에서 새 후보를 섭외하는 중이에요.</Text>
        </View>
      ) : null}
    </View>
  );
}

function CandidateCard({ candidate, selected, revealed, onSelect, onArchive, selectLabel, selectDisabled }: { candidate: BlindDateCandidate; selected?: boolean; revealed?: boolean; onSelect: () => void; onArchive?: () => void; selectLabel?: string; selectDisabled?: boolean }) {
  const tags = [candidate.contactPresetId, candidate.hobbies[0], candidate.locationBase].filter(Boolean).slice(0, 3);
  return (
    <View style={[styles.candidateCard, selected && styles.candidateSelected]}>
      {revealed && candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.profileImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{candidate.anonymousLabel || '?'}</Text></View>}
      <Text style={styles.candidateName}>{revealed ? `${candidate.name} · ${candidate.age}` : `${candidate.anonymousLabel}번 후보`}</Text>
      <Text style={styles.candidateJob}>{revealed ? candidate.job : '정체 비공개'}</Text>
      <Text style={styles.candidateBody}>{revealed ? candidate.personalitySummary : '답변만 보고 선택해보세요.'}</Text>
      {revealed ? <Text style={styles.firstDm}>“{candidate.firstDm}”</Text> : null}
      {revealed ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>SNS 미리보기</Text>
          <Text style={styles.previewLine}>{candidate.snsPreview || candidate.snsStyle}</Text>
          <Text style={styles.previewLabel}>첫 통화 미리보기</Text>
          <Text style={styles.previewLine}>{candidate.callPreview || candidate.relationshipStyle}</Text>
        </View>
      ) : null}
      <View style={styles.tags}>{tags.map(tag => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View>
      <View style={styles.candidateActions}>
        <Pressable disabled={selectDisabled} onPress={onSelect} style={[styles.selectButton, selected && styles.selectButtonActive, selectDisabled && styles.disabled]}>
          <Text style={[styles.selectButtonText, selected && styles.selectButtonTextActive]}>{selected ? '선택됨' : selectLabel || '이 사람 선택'}</Text>
        </Pressable>
        {onArchive ? <Pressable onPress={onArchive} style={styles.archiveMiniButton}><Text style={styles.archiveMiniText}>보관</Text></Pressable> : null}
      </View>
    </View>
  );
}

function QuestionMode({ sessionId, candidates, rounds, questions, customQuestion, setCustomQuestion, onAsk, onSelectAnswer, busy }: {
  sessionId: string;
  candidates: BlindDateCandidate[];
  rounds: BlindDateRound[];
  questions: string[];
  customQuestion: string;
  setCustomQuestion: (value: string) => void;
  onAsk: (question: string) => void;
  onSelectAnswer: (round: BlindDateRound, answerId: string) => void;
  busy?: boolean;
}) {
  const [visibleQuestions, setVisibleQuestions] = useState(() => pickQuestionSet(questions));
  const latestRound = rounds[rounds.length - 1];
  const canAsk = !latestRound || Boolean(latestRound.selectedAnswerId);

  useEffect(() => {
    setVisibleQuestions(pickQuestionSet(questions));
  }, [sessionId, questions]);

  function askAndRefresh(question: string) {
    onAsk(question);
    setVisibleQuestions(pickQuestionSet(questions, [question, ...visibleQuestions]));
  }

  return (
    <View style={styles.section}>
      <View style={styles.blindLine}>
        {candidates.map(candidate => <View key={candidate.id} style={styles.blindToken}><Text style={styles.blindTokenText}>{candidate.anonymousLabel}</Text></View>)}
      </View>
      {canAsk ? (
        <View style={styles.questionBox}>
          <Text style={styles.panelTitle}>질문하기</Text>
          <View style={styles.questionChips}>
            {visibleQuestions.map(question => (
              <Pressable key={question} disabled={busy} onPress={() => askAndRefresh(question)} style={styles.questionChip}><Text style={styles.questionChipText}>{question}</Text></Pressable>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput value={customQuestion} onChangeText={setCustomQuestion} style={styles.questionInput} placeholder="직접 질문 입력" placeholderTextColor="#9b9b9b" />
            <Pressable disabled={busy || !customQuestion.trim()} onPress={() => askAndRefresh(customQuestion)} style={[styles.askButton, (busy || !customQuestion.trim()) && styles.disabled]}><Text style={styles.askButtonText}>질문</Text></Pressable>
          </View>
        </View>
      ) : null}

      {rounds.slice().reverse().map(round => (
        <View key={round.id} style={styles.roundCard}>
          <Text style={styles.roundQuestion}>Q{round.roundIndex}. {round.question}</Text>
          {round.answers.map(answer => (
            <Pressable key={answer.id} onPress={() => onSelectAnswer(round, answer.id)} disabled={Boolean(round.selectedAnswerId)} style={[styles.answerCard, round.selectedAnswerId === answer.id && styles.answerSelected]}>
              <Text style={styles.answerLabel}>{answer.anonymousLabel}번</Text>
              <Text style={styles.answerText}>{answer.text}</Text>
              <Text style={styles.answerPick}>{round.selectedAnswerId === answer.id ? '선택됨' : round.selectedAnswerId ? '' : '이 답변 선택'}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

function pickQuestionSet(questions: string[], avoid: string[] = []): string[] {
  const avoidSet = new Set(avoid.map(item => item.trim()).filter(Boolean));
  const pool = questions.filter(question => !avoidSet.has(question));
  const source = pool.length >= 3 ? pool : questions;
  return [...source].sort(() => Math.random() - 0.5).slice(0, 3);
}

const ROTATION_QUESTION_CHOICES = [
  '첫 데이트에서 어떤 분위기를 좋아해?',
  '연락은 자주 하는 편이 좋아, 편한 때 몰아서 하는 편이 좋아?',
  '가까워지면 어떤 모습이 제일 달라져?'
];

function RotationMode({ session, rotationText, setRotationText, activeCandidateId, setActiveCandidateId, onSend, onSelect, busy }: {
  session: BlindDateSession;
  rotationText: string;
  setRotationText: (value: string) => void;
  activeCandidateId: string;
  setActiveCandidateId: (value: string) => void;
  onSend: (candidateId: string, presetText?: string) => void;
  onSelect: (candidateId: string) => void;
  busy?: boolean;
}) {
  const [introIndex, setIntroIndex] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const totalTurns = session.candidates.reduce((sum, candidate) => sum + Math.min(3, (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length), 0);
  const maxTurns = session.candidates.length * 3;
  const allDone = totalTurns >= maxTurns;
  const nextCandidate = session.candidates.find(candidate => (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length < 3);
  const currentId = allDone ? (activeCandidateId || session.candidates[0]?.id || '') : nextCandidate?.id || activeCandidateId || session.candidates[0]?.id || '';
  const current = session.candidates.find(candidate => candidate.id === currentId) || session.candidates[0];
  const turns = (session.rotationTurns || []).filter(turn => turn.candidateId === current?.id);
  const currentDone = turns.length >= 3;

  useEffect(() => {
    setIntroIndex(0);
    setIntroDone(false);
  }, [session.id]);

  useEffect(() => {
    if (introDone || !session.candidates.length) return undefined;
    const timer = setInterval(() => {
      setIntroIndex(index => {
        if (index >= session.candidates.length - 1) {
          setIntroDone(true);
          return index;
        }
        return index + 1;
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [introDone, session.candidates.length]);

  useEffect(() => {
    if (!allDone && nextCandidate && activeCandidateId !== nextCandidate.id) {
      setActiveCandidateId(nextCandidate.id);
    }
  }, [allDone, nextCandidate?.id, activeCandidateId, setActiveCandidateId]);

  if (!introDone) {
    const introCandidate = session.candidates[introIndex] || session.candidates[0];
    return (
      <View style={styles.section}>
        <View style={styles.rotationIntro}>
          <Text style={styles.rotationIntroKicker}>오늘의 후보 {introIndex + 1}/{session.candidates.length}</Text>
          {introCandidate?.profileImageUri ? <Image source={{ uri: introCandidate.profileImageUri }} style={styles.rotationIntroImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{introCandidate?.name.slice(0, 1) || '?'}</Text></View>}
          <Text style={styles.rotationIntroName}>{introCandidate?.name} · {introCandidate?.age}</Text>
          <Text style={styles.rotationIntroSub}>{introCandidate?.job} · {introCandidate?.personalitySummary}</Text>
          <View style={styles.rotationIntroDots}>
            {session.candidates.map((candidate, index) => <View key={candidate.id} style={[styles.rotationIntroDot, index === introIndex && styles.rotationIntroDotActive]} />)}
          </View>
          <Pressable onPress={() => setIntroDone(true)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>바로 시작</Text></Pressable>
        </View>
      </View>
    );
  }

  if (allDone) {
    return (
      <View style={styles.section}>
        <View style={styles.rotationStatus}>
          <Text style={styles.rotationStatusTitle}>대화 완료</Text>
          <Text style={styles.rotationStatusText}>각 후보와 3번씩 대화했습니다. 질답을 보고 마지막으로 선택하세요.</Text>
        </View>
        {session.candidates.map(candidate => {
          const candidateTurns = (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id);
          return (
            <Pressable key={candidate.id} onPress={() => onSelect(candidate.id)} style={[styles.rotationSummaryCard, session.selectedCandidateId === candidate.id && styles.candidateSelected]}>
              {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.rotationSummaryImage} /> : <View style={styles.rotationAvatarFallback}><Text style={styles.rankFallbackText}>{candidate.name.slice(0, 1)}</Text></View>}
              <View style={styles.rotationSummaryText}>
                <Text style={styles.rankName}>{candidate.name} · {candidate.job}</Text>
                <Text style={styles.rankSub}>{candidate.personalitySummary}</Text>
                {candidateTurns.map((turn, index) => (
                  <Text key={turn.id} style={styles.rotationSummaryLine}>Q{index + 1}. {turn.userText} / {turn.answerText}</Text>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.rotationStatus}>
        <Text style={styles.rotationStatusTitle}>로테이션 진행도</Text>
        <Text style={styles.rotationStatusText}>{totalTurns}/{maxTurns} 턴 · {current?.name || '후보'}에게 질문 {Math.min(3, turns.length + 1)}/3</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rotationRail}>
        {session.candidates.map(candidate => {
          const count = (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length;
          return (
            <Pressable key={candidate.id} disabled={!allDone} onPress={() => setActiveCandidateId(candidate.id)} style={[styles.rotationChip, current?.id === candidate.id && styles.rotationChipActive]}>
              {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.rotationAvatar} /> : <View style={styles.rotationAvatarFallback}><Text style={styles.rankFallbackText}>{candidate.name.slice(0, 1)}</Text></View>}
              <Text style={styles.rotationChipText}>{candidate.name}</Text>
              <Text style={[styles.rotationCount, count >= 3 && styles.rotationCountDone]}>{Math.min(3, count)}/3</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {current ? (
        <View style={styles.rotationPanel}>
          <CandidateCard candidate={current} selected={session.selectedCandidateId === current.id} revealed onSelect={() => onSelect(current.id)} selectDisabled selectLabel="대화 진행 중" />
          <View style={styles.rotationTalk}>
            {turns.length ? turns.map(turn => (
              <View key={turn.id} style={styles.rotationTurn}>
                <Text style={styles.rotationUser}>나: {turn.userText}</Text>
                <Text style={styles.rotationAnswer}>{current.name}: {turn.answerText}</Text>
              </View>
            )) : <Text style={styles.emptyRotation}>첫 질문을 던져보고 말투와 분위기를 비교해보세요.</Text>}
          </View>
          <View style={styles.rotationChoices}>
            {ROTATION_QUESTION_CHOICES.map(question => (
              <Pressable key={question} disabled={busy || currentDone} onPress={() => onSend(current.id, question)} style={[styles.questionChip, (busy || currentDone) && styles.disabled]}>
                <Text style={styles.questionChipText}>{question}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput value={rotationText} onChangeText={setRotationText} editable={!currentDone} style={styles.questionInput} placeholder={currentDone ? '이 후보의 3턴 완료' : `질문 ${turns.length + 1}/3 입력`} placeholderTextColor="#9b9b9b" />
            <Pressable disabled={busy || !rotationText.trim() || currentDone} onPress={() => onSend(current.id)} style={[styles.askButton, (busy || !rotationText.trim() || currentDone) && styles.disabled]}><Text style={styles.askButtonText}>질문</Text></Pressable>
          </View>
          {currentDone ? <Text style={styles.rotationDoneHelp}>이 후보와의 3턴 대화가 끝났습니다. 다른 후보를 확인해보세요.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function RankingBlock({ mode, candidates, ranking, selectedCandidateId, onSelect, onArchive }: { mode?: string; candidates: BlindDateCandidate[]; ranking: { candidateId: string; rank: number; score: number; selectedCount: number; reason: string }[]; selectedCandidateId?: string; onSelect: (candidateId: string) => void; onArchive?: (candidateId: string) => void }) {
  const rows = ranking.length ? ranking : candidates.map((candidate, index) => ({ candidateId: candidate.id, rank: index + 1, score: candidate.score, selectedCount: candidate.selectedCount, reason: '' }));
  return (
    <View style={styles.rankingPanel}>
      <Text style={styles.panelTitle}>{mode === 'rotation' ? '데이트 결과 정리' : '정체 공개'}</Text>
      {rows.map(row => {
        const candidate = candidates.find(item => item.id === row.candidateId);
        if (!candidate) return null;
        return (
          <Pressable key={row.candidateId} onPress={() => onSelect(row.candidateId)} style={[styles.rankingRow, selectedCandidateId === row.candidateId && styles.rankingSelected]}>
            <Text style={styles.rankNo}>{row.rank}</Text>
            {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.rankImage} /> : <View style={styles.rankFallback}><Text style={styles.rankFallbackText}>{candidate.name.slice(0, 1)}</Text></View>}
            <View style={styles.rankTextWrap}>
              <Text style={styles.rankName}>{candidate.anonymousLabel}번 후보, {candidate.name}입니다.</Text>
              <Text style={styles.rankSub}>{candidate.job} · {mode === 'rotation' ? '3턴 대화 완료' : `선택 ${row.selectedCount}회`} · {candidate.personalitySummary}</Text>
            </View>
            {onArchive ? <Pressable onPress={() => onArchive(candidate.id)} style={styles.rankArchiveButton}><Text style={styles.rankArchiveText}>보관</Text></Pressable> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  header: { minHeight: 92, paddingHorizontal: 18, paddingTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f2eee6', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 34, lineHeight: 38, fontWeight: '900', color: colors.text },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { marginTop: 4, color: colors.sub, fontSize: 13, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 110 },
  section: { gap: 12 },
  modeCard: { borderRadius: 8, padding: 16, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  modeCardMuted: { opacity: 0.72 },
  modeTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  modeSub: { marginTop: 6, color: colors.sub, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  modeActions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  modeButtonText: { color: '#241a00', fontWeight: '900' },
  modeButtonSecondary: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  modeButtonSecondaryText: { color: colors.text, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  reportCard: { borderRadius: 8, padding: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#111' },
  reportText: { marginTop: 8, color: '#f7f2e9', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  archivePanel: { borderRadius: 8, padding: 12, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  archiveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  archiveHelp: { marginTop: 4, color: colors.sub, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  mixButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  mixButtonText: { color: '#241a00', fontWeight: '900' },
  archiveRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  archiveRowSelected: { borderColor: colors.accent, backgroundColor: '#fff6cf' },
  mixCheck: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2eee6', borderWidth: 1, borderColor: colors.border },
  mixCheckActive: { backgroundColor: '#111', borderColor: '#111' },
  mixCheckText: { color: colors.text, fontWeight: '900' },
  mixCheckTextActive: { color: '#fff' },
  archiveImage: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee8dc' },
  archiveFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  archiveTextWrap: { flex: 1 },
  archiveName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  archiveSub: { marginTop: 3, color: colors.sub, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  archiveActions: { gap: 6 },
  archiveButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  archiveButtonText: { color: '#241a00', fontSize: 12, fontWeight: '900' },
  archiveDeleteButton: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  archiveDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  sessionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  sessionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sessionSub: { marginTop: 3, color: colors.sub, fontSize: 12, fontWeight: '800' },
  smallButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2eee6' },
  smallButtonText: { color: colors.text, fontWeight: '900' },
  loadingBlock: { alignItems: 'center', justifyContent: 'center', padding: 18, marginBottom: 12, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#2c2c2c', minHeight: 132 },
  loadingText: { marginTop: 10, color: '#fffefa', fontSize: 15, lineHeight: 21, fontWeight: '900', textAlign: 'center' },
  loadingSub: { marginTop: 5, color: '#d8cda8', fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  loadingDots: { marginTop: 12, flexDirection: 'row', gap: 5 },
  loadingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4a4a4a' },
  loadingDotActive: { width: 16, backgroundColor: colors.accent },
  grid: { gap: 12 },
  gachaWrap: { gap: 10 },
  gachaCard: { borderRadius: 8, padding: 12, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  gachaTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  gachaKicker: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  gachaName: { marginTop: 4, color: colors.text, fontSize: 24, fontWeight: '900' },
  gachaJob: { marginTop: 3, color: colors.sub, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  gachaImage: { width: '100%', aspectRatio: 0.86, marginTop: 12, borderRadius: 8, backgroundColor: '#eee8dc' },
  gachaSection: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  gachaLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  gachaDarkLabel: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  gachaText: { marginTop: 6, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  gachaQuote: { marginTop: 7, color: '#4d463a', fontSize: 14, lineHeight: 20, fontWeight: '900' },
  gachaPreviewGrid: { marginTop: 12, gap: 10 },
  gachaPreviewBox: { padding: 12, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#111' },
  gachaSmallText: { marginTop: 6, color: '#f7f2e9', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  gachaActions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  passButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2eee6', borderWidth: 1, borderColor: colors.border },
  passButtonText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  contactButton: { flex: 1.4, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  contactButtonText: { color: '#241a00', fontSize: 16, fontWeight: '900' },
  refillHint: { minHeight: 48, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111' },
  refillHintText: { color: '#fffefa', fontSize: 13, fontWeight: '900' },
  gachaEmpty: { minHeight: 180, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', gap: 10 },
  gachaEmptyText: { color: '#fffefa', fontSize: 14, fontWeight: '900' },
  candidateCard: { borderRadius: 8, padding: 12, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  candidateSelected: { borderColor: colors.accent, backgroundColor: '#fff6cf' },
  profileImage: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#eee8dc' },
  hiddenImage: { width: '100%', aspectRatio: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  hiddenText: { color: colors.text, fontSize: 42, fontWeight: '900' },
  candidateName: { marginTop: 10, color: colors.text, fontSize: 18, fontWeight: '900' },
  candidateJob: { marginTop: 2, color: colors.sub, fontSize: 13, fontWeight: '800' },
  candidateBody: { marginTop: 8, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  firstDm: { marginTop: 8, color: '#4d463a', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  previewBox: { marginTop: 10, gap: 4, padding: 10, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  previewLabel: { marginTop: 2, color: colors.text, fontSize: 11, fontWeight: '900' },
  previewLine: { color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  tags: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: '#70aee8', fontSize: 12, fontWeight: '900' },
  candidateActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  selectButton: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  selectButtonActive: { backgroundColor: '#111' },
  selectButtonText: { color: '#241a00', fontWeight: '900' },
  selectButtonTextActive: { color: '#fff' },
  archiveMiniButton: { minWidth: 72, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  archiveMiniText: { color: colors.text, fontWeight: '900' },
  blindLine: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  blindToken: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  blindTokenText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  questionBox: { padding: 12, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  questionChips: { marginTop: 10, gap: 8 },
  questionChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  questionChipText: { color: colors.text, fontWeight: '800' },
  customRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  questionInput: { flex: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#fff', color: colors.text },
  askButton: { minWidth: 64, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  askButtonText: { color: '#241a00', fontWeight: '900' },
  roundCard: { padding: 12, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  roundQuestion: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  answerCard: { marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  answerSelected: { borderColor: colors.accent, backgroundColor: '#fff6cf' },
  answerLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  answerText: { marginTop: 5, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  answerPick: { marginTop: 8, color: colors.sub, fontSize: 12, fontWeight: '900' },
  primaryWide: { marginTop: 14, minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  primaryWideText: { color: '#241a00', fontSize: 16, fontWeight: '900' },
  versusBadge: { alignSelf: 'center', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  versusText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  rotationIntro: { padding: 14, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#222' },
  rotationIntroKicker: { color: colors.accent, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  rotationIntroImage: { width: '100%', aspectRatio: 0.9, marginTop: 12, borderRadius: 8, backgroundColor: '#333' },
  rotationIntroName: { marginTop: 12, color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  rotationIntroSub: { marginTop: 6, color: '#d8d8d8', fontSize: 13, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
  rotationIntroDots: { marginTop: 12, flexDirection: 'row', alignSelf: 'center', gap: 6 },
  rotationIntroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#555' },
  rotationIntroDotActive: { width: 18, backgroundColor: colors.accent },
  secondaryButton: { marginTop: 14, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  secondaryButtonText: { color: colors.text, fontWeight: '900' },
  rotationStatus: { padding: 12, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#111' },
  rotationStatusTitle: { color: '#fffefa', fontSize: 16, fontWeight: '900' },
  rotationStatusText: { marginTop: 4, color: '#d8cda8', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  rotationRail: { gap: 8, paddingBottom: 2 },
  rotationChip: { width: 86, padding: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  rotationChipActive: { borderColor: colors.accent, backgroundColor: '#fff6cf' },
  rotationAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee8dc' },
  rotationAvatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  rotationChipText: { marginTop: 5, color: colors.text, fontSize: 12, fontWeight: '900' },
  rotationCount: { marginTop: 2, color: colors.sub, fontSize: 11, fontWeight: '800' },
  rotationCountDone: { color: colors.accent, fontWeight: '900' },
  rotationPanel: { gap: 12 },
  rotationTalk: { padding: 12, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  rotationTurn: { marginBottom: 10, gap: 5 },
  rotationUser: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.accent, color: '#241a00', fontWeight: '800' },
  rotationAnswer: { alignSelf: 'flex-start', maxWidth: '88%', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fffefa', color: colors.text, fontWeight: '800' },
  rotationChoices: { gap: 8 },
  emptyRotation: { color: colors.sub, fontSize: 13, fontWeight: '800' },
  rotationDoneHelp: { color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  rotationSummaryCard: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  rotationSummaryImage: { width: 74, height: 96, borderRadius: 8, backgroundColor: '#eee8dc' },
  rotationSummaryText: { flex: 1, gap: 4 },
  rotationSummaryLine: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  rankingPanel: { marginTop: 14, padding: 12, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  rankingRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  rankingSelected: { borderColor: colors.accent, backgroundColor: '#fff6cf' },
  rankNo: { width: 22, color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  rankImage: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#eee8dc' },
  rankFallback: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  rankFallbackText: { color: colors.text, fontWeight: '900' },
  rankTextWrap: { flex: 1 },
  rankName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rankSub: { marginTop: 3, color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  rankArchiveButton: { minHeight: 34, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2eee6' },
  rankArchiveText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  importPanel: { marginTop: 14, padding: 14, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#111' },
  importTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  importSub: { marginTop: 6, color: '#d8d8d8', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  importButton: { marginTop: 14, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  importButtonText: { color: '#241a00', fontWeight: '900', fontSize: 16 }
});
