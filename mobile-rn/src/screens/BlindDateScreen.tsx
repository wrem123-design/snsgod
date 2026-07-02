import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { BlindDateCandidate, BlindDateCandidateArchive, BlindDateRound, BlindDateSession, SNSGodState } from '../types';
import {
  activeBlindDateSession,
  appendBlindDateCandidates,
  archiveBlindDateCandidate,
  blindDatePreferenceReport,
  blindDateSuggestedQuestions,
  approachStreetEncounter,
  createMixedBlindDateSession,
  createBlindDateQuestionRound,
  createBlindDateRotationTurn,
  createBlindDateSession,
  createStreetEncounterSession,
  deleteBlindDateArchive,
  getBlindDateProgress,
  importBlindDateCandidate,
  importBlindDateArchive,
  chooseStreetEncounterOption,
  chooseStreetEncounterCustomText,
  revealBlindDateRanking,
  requestStreetEncounterContact,
  selectBlindDateAnswer,
  selectBlindDateCandidate,
  startStreetEncounterAtLocation
} from '../logic/blindDate';
import { createBlindDateFirstDatePrompt } from '../logic/meetingEvent';

const locationThumbnails: Record<string, ReturnType<typeof require>> = {
  '성수 카페거리': require('../../assets/encounter-locations/seongsu-cafe-street.png'),
  '한강 산책로': require('../../assets/encounter-locations/han-river-walk.png'),
  '전시회/갤러리': require('../../assets/encounter-locations/art-gallery.png'),
  '독립서점': require('../../assets/encounter-locations/indie-bookstore.png'),
  '편집샵 거리': require('../../assets/encounter-locations/boutique-street.png'),
  '베이커리 앞': require('../../assets/encounter-locations/bakery-front.png'),
  '지하철역 근처': require('../../assets/encounter-locations/subway-entrance.png'),
  '회사 밀집 거리': require('../../assets/encounter-locations/office-district.png'),
  '대학가 카페': require('../../assets/encounter-locations/college-cafe.png'),
  '야간 편의점 앞': require('../../assets/encounter-locations/night-convenience-store.png'),
  '주말 플리마켓': require('../../assets/encounter-locations/weekend-flea-market.png'),
  '반려동물 산책로': require('../../assets/encounter-locations/pet-walking-path.png')
};
const fallbackEncounterLocations = ['성수 카페거리', '한강 산책로', '베이커리 앞', '지하철역 근처'];

export function BlindDateScreen({ state, onBack, onChange, onOpenRoom, entryMode = 'blindDate' }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoom: (roomId: string) => void;
  entryMode?: 'blindDate' | 'encounter';
}) {
  const [busy, setBusy] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [encounterText, setEncounterText] = useState('');
  const [rotationText, setRotationText] = useState('');
  const [rotationCandidateId, setRotationCandidateId] = useState('');
  const [questionCandidateCount, setQuestionCandidateCount] = useState(5);
  const [questionTarget, setQuestionTarget] = useState(7);
  const [rotationStartCount, setRotationStartCount] = useState(5);
  const [mixArchiveIds, setMixArchiveIds] = useState<string[]>([]);
  const [profileIndex, setProfileIndex] = useState(0);
  const [profileRefilling, setProfileRefilling] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState<BlindDateCandidate | null>(null);
  const progress = getBlindDateProgress(state);
  const activeSession = activeBlindDateSession(state);
  const session = entryMode === 'encounter'
    ? activeSession?.mode === 'encounter' ? activeSession : undefined
    : activeSession && activeSession.mode !== 'worldcup' && activeSession.mode !== 'encounter' ? activeSession : undefined;
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

  function startEncounter() {
    void onChange(createStreetEncounterSession(state));
  }

  function startQuestion() {
    void runBusy(async () => {
      await onChange(await createBlindDateSession(state, 'question', questionCandidateCount, { questionTarget }));
    });
  }

  function startRotation() {
    void runBusy(async () => {
      await onChange(await createBlindDateSession(state, 'rotation', rotationStartCount));
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

  function chooseEncounterLocation(location: string) {
    if (!session || busy) return;
    void runBusy(async () => {
      await onChange(await startStreetEncounterAtLocation(state, session.id, location));
    });
  }

  function approachEncounter(text: string) {
    if (!session || busy) return;
    void runBusy(async () => {
      await onChange(await approachStreetEncounter(state, session.id, text));
    });
  }

  function chooseEncounterChoice(choiceId: string) {
    if (!session || busy) return;
    void runBusy(async () => {
      await onChange(await chooseStreetEncounterOption(state, session.id, choiceId));
    });
  }

  function sendEncounterText() {
    const clean = encounterText.trim();
    if (!session || busy || !clean) return;
    setEncounterText('');
    void runBusy(async () => {
      await onChange(await chooseStreetEncounterCustomText(state, session.id, clean));
    });
  }

  function askEncounterContact() {
    if (!session) return;
    const result = requestStreetEncounterContact(state, session.id);
    void Promise.resolve(onChange(result.next)).then(() => {
      if (result.success && result.roomId) onOpenRoom(result.roomId);
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
          <Text style={styles.title}>{entryMode === 'encounter' ? '우연한 만남' : '블라인드 데이트'}</Text>
          {entryMode === 'encounter' ? null : <Text style={styles.subtitle}>AI 후보를 비교하고 마음에 드는 사람을 가져와요.</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!session ? (
          <View style={styles.section}>
            {entryMode === 'encounter' ? (
              <>
                <ModeCard title="우연한 만남" subtitle="매번 다른 장소 4곳 중 하나를 골라, 낯선 사람과 짧은 첫 대화를 시작합니다." action="나가보기" onPress={startEncounter} disabled={busy} />
                <PreferenceReport text={report} />
              </>
            ) : (
              <>
                <SetupModeCard
                  title="블라인드 질문 소개팅"
                  subtitle="외모를 숨기고 답변만 보고 고르기"
                  action={`${questionCandidateCount}명 · ${questionTarget}문항 시작`}
                  onPress={startQuestion}
                  disabled={busy}
                  rows={[
                    { label: '후보 수', value: questionCandidateCount, values: [3, 4, 5], suffix: '명', onChange: setQuestionCandidateCount },
                    { label: '질문 수', value: questionTarget, values: [5, 6, 7, 8, 9, 10], suffix: '개', onChange: setQuestionTarget }
                  ]}
                />
                <SetupModeCard
                  title="로테이션 데이트"
                  subtitle="여러 후보와 짧게 대화해보고 선택"
                  action={`${rotationStartCount}명 시작`}
                  onPress={startRotation}
                  disabled={busy}
                  rows={[
                    { label: '후보 수', value: rotationStartCount, values: [3, 4, 5], suffix: '명', onChange: setRotationStartCount }
                  ]}
                />
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
              </>
            )}
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

            {session.mode === 'encounter' ? (
              <StreetEncounterMode
                session={session}
                busy={busy}
                onChooseLocation={chooseEncounterLocation}
                onApproach={approachEncounter}
                onChoice={chooseEncounterChoice}
                onAskContact={askEncounterContact}
                customText={encounterText}
                setCustomText={setEncounterText}
                onSendCustom={sendEncounterText}
              />
            ) : session.mode === 'profile' ? (
              <ProfileGachaMode
                session={session}
                activeIndex={profileIndex}
                refilling={profileRefilling}
                onPass={passProfileCandidate}
                onSelect={chooseCandidate}
                onArchive={archiveCandidate}
                onOpenDetails={setDetailCandidate}
              />
            ) : session.mode === 'question' ? (
              <QuestionMode
                sessionId={session.id}
                candidates={session.candidates}
                rounds={session.rounds}
                questionTarget={Number(session.questionTarget || 5)}
                questions={questions}
                customQuestion={customQuestion}
                setCustomQuestion={setCustomQuestion}
                onAsk={askQuestion}
                onSelectAnswer={selectAnswer}
                busy={busy}
              />
            ) : session.mode === 'rotation' ? (
              <RotationMode session={session} rotationText={rotationText} setRotationText={setRotationText} activeCandidateId={rotationCandidateId} setActiveCandidateId={setRotationCandidateId} onSend={sendRotationTurn} onSelect={chooseCandidate} onOpenDetails={setDetailCandidate} busy={busy} />
            ) : null}

            {session.mode === 'question' && session.rounds.length >= Number(session.questionTarget || 5) && session.rounds.every(round => round.selectedAnswerId) && session.status !== 'revealing' && session.status !== 'completed' ? (
              <Pressable onPress={revealRanking} style={styles.primaryWide}><Text style={styles.primaryWideText}>순위 공개</Text></Pressable>
            ) : null}

            {(session.mode === 'question' || session.mode === 'rotation') && (session.status === 'revealing' || session.finalRanking?.length) ? (
              <RankingBlock
                mode={session.mode}
                candidates={session.candidates}
                ranking={session.finalRanking || []}
                selectedCandidateId={session.selectedCandidateId}
                onSelect={chooseCandidate}
                onArchive={session.mode === 'rotation' ? archiveCandidate : undefined}
                onOpenDetails={setDetailCandidate}
              />
            ) : null}

            {session.mode !== 'encounter' && importCandidate ? (
              <View style={styles.importPanel}>
                <Text style={styles.importTitle}>{importCandidate.name || '선택한 후보'}에게 연락처를 받을까요?</Text>
                <Text style={styles.importSub}>연락처를 받으면 메신저, SNS, 통화, 만남 이벤트에서 오늘의 선택을 기억합니다.</Text>
                <Pressable onPress={importSelected} style={styles.importButton}><Text style={styles.importButtonText}>그녀에게 연락처 얻기</Text></Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <CandidateDetailModal candidate={detailCandidate} onClose={() => setDetailCandidate(null)} />
    </View>
  );
}

function modeTitle(mode: string) {
  if (mode === 'encounter') return '우연한 만남';
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

function SetupModeCard({ title, subtitle, action, rows, onPress, disabled }: {
  title: string;
  subtitle: string;
  action: string;
  rows: { label: string; value: number; values: number[]; suffix: string; onChange: (value: number) => void }[];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.modeCard}>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeSub}>{subtitle}</Text>
      <View style={styles.setupRows}>
        {rows.map(row => (
          <View key={row.label} style={styles.setupRow}>
            <Text style={styles.setupLabel}>{row.label}</Text>
            <View style={styles.segmentGroup}>
              {row.values.map(value => (
                <Pressable key={value} onPress={() => row.onChange(value)} disabled={disabled} style={[styles.segmentButton, row.value === value && styles.segmentButtonActive, disabled && styles.disabled]}>
                  <Text style={[styles.segmentText, row.value === value && styles.segmentTextActive]}>{value}{row.suffix}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
      <Pressable onPress={onPress} disabled={disabled} style={[styles.modeButton, styles.setupStartButton, disabled && styles.disabled]}><Text style={styles.modeButtonText}>{action}</Text></Pressable>
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

function StreetEncounterMode({ session, busy, onChooseLocation, onApproach, onChoice, onAskContact, customText, setCustomText, onSendCustom }: {
  session: BlindDateSession;
  busy?: boolean;
  onChooseLocation: (location: string) => void;
  onApproach: (text: string) => void;
  onChoice: (choiceId: string) => void;
  onAskContact: () => void;
  customText: string;
  setCustomText: (text: string) => void;
  onSendCustom: () => void;
}) {
  const candidate = session.candidates[0];
  const stats = session.encounterStats;
  const phase = session.encounterPhase || 'locations';
  const maxTurns = Number(session.encounterMaxTurns || 4);
  const turn = Math.min(maxTurns, Number(session.encounterTurn || 0));
  const canAskContact = Boolean(stats && stats.affinity >= 50 && phase === 'talk');
  const talkedOut = turn >= maxTurns && phase === 'talk';
  const canSendCustom = Boolean(customText.trim()) && (phase === 'intro' || (phase === 'talk' && !talkedOut));
  const encounterLocations = (session.encounterLocations || []).filter(location => locationThumbnails[location]).slice(0, 4);
  const visibleLocations = encounterLocations.length ? encounterLocations : fallbackEncounterLocations;
  if (phase === 'locations') {
    return (
      <View style={styles.encounterPanel}>
        <Text style={[styles.panelTitle, styles.encounterPanelTitle]}>오늘 어디로 나가볼까요?</Text>
        {busy ? (
          <View style={styles.encounterLoading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>이동 중...</Text>
            <Text style={styles.loadingSub}>장소 분위기와 우연히 마주칠 사람을 준비하고 있어요.</Text>
          </View>
        ) : null}
        <View style={styles.locationGrid}>
          {visibleLocations.map(location => (
            <Pressable key={location} disabled={busy} onPress={() => onChooseLocation(location)} style={[styles.locationCard, busy && styles.disabled]}>
              <Image source={locationThumbnails[location]} resizeMode="contain" style={styles.locationImage} />
              <View style={styles.locationShade} />
              <Text style={styles.locationTitle}>{location}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.encounterWrap}>
      {candidate?.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} resizeMode="contain" style={styles.encounterImage} /> : <View style={styles.encounterImageFallback}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingSub}>장면을 준비하고 있어요.</Text></View>}
      <View style={styles.encounterPanel}>
        <Text style={styles.encounterKicker}>{session.encounterLocation || candidate?.locationBase || '어느 거리'}</Text>
        <Text style={styles.encounterNarration}>{session.encounterNarration}</Text>
        {session.encounterNpcLine ? <Text style={styles.encounterLine}>{session.encounterNpcLine}</Text> : null}
      </View>
      {stats ? (
        <View style={styles.encounterStats}>
          <StatPill label="호감도" value={`${stats.affinity}%`} strong={stats.affinity >= 50} />
          <StatPill label="경계심" value={stats.caution >= 70 ? '높음' : stats.caution >= 45 ? '보통' : '낮음'} danger={stats.caution >= 70} />
          <StatPill label="대화 턴" value={`${turn}/${maxTurns}`} />
          <StatPill label="연락처" value={session.encounterContactChanceLabel || contactChanceLabelForUi(stats)} strong={stats.affinity >= 75 && stats.caution < 55} danger={stats.affinity >= 50 && stats.caution >= 70} />
        </View>
      ) : null}
      {phase === 'intro' ? (
        <View style={styles.choiceList}>
          {(session.encounterChoices || []).map(choice => (
            <Pressable key={choice.id} onPress={() => onApproach(choice.text)} style={styles.choiceButton}>
              <Text style={styles.choiceText}>{choice.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : phase === 'talk' ? (
        <View style={styles.choiceList}>
          {(session.encounterChoices || []).map(choice => (
            <Pressable key={choice.id} onPress={() => onChoice(choice.id)} style={styles.choiceButton}>
              <Text style={styles.choiceText}>{choice.text}</Text>
            </Pressable>
          ))}
          <Pressable disabled={!canAskContact} onPress={onAskContact} style={[styles.contactWide, !canAskContact && styles.disabled]}>
            <Text style={styles.contactWideText}>{canAskContact ? '연락처 물어보기' : '호감도 50%부터 연락처 요청 가능'}</Text>
          </Pressable>
          <Text style={styles.encounterHelp}>{canAskContact ? '성공은 확정이 아니며, 경계심이 높으면 거절될 수 있어요.' : '호감도와 경계심을 같이 관리해야 연락처를 자연스럽게 물어볼 수 있어요.'}</Text>
          {talkedOut ? <Text style={styles.encounterHelp}>짧은 첫 대화는 여기까지입니다. 연락처를 물어보거나, 오늘은 정중히 마무리하세요.</Text> : null}
        </View>
      ) : (
        <View style={styles.choiceList}>
          <Text style={styles.encounterResult}>{phase === 'success' ? '연락처를 교환했습니다.' : phase === 'failed' ? '상대가 정중히 거절했습니다.' : '오늘의 우연은 여기서 끝났습니다.'}</Text>
          {session.encounterContactFailureReason ? <Text style={styles.encounterReason}>{session.encounterContactFailureReason}</Text> : null}
        </View>
      )}
      {phase === 'intro' || phase === 'talk' ? (
        <View style={styles.encounterCustomBar}>
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            editable={!busy && !talkedOut}
            style={styles.encounterInput}
            placeholder={talkedOut ? '대화 턴이 끝났습니다' : '직접 말하기'}
            placeholderTextColor="#9b9b9b"
            multiline
          />
          <Pressable disabled={!canSendCustom || busy} onPress={onSendCustom} style={[styles.encounterSendButton, (!canSendCustom || busy) && styles.disabled]}>
            <Text style={styles.encounterSendText}>전송</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function contactChanceLabelForUi(stats: NonNullable<BlindDateSession['encounterStats']>): string {
  if (stats.affinity < 50) return '아직 요청 불가';
  if (stats.affinity >= 75 && stats.caution < 55) return '성공 가능성 높음';
  if (stats.affinity >= 60 && stats.caution < 70) return '성공 가능성 보통';
  return '성공 가능성 낮음';
}

function StatPill({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <View style={[styles.statPill, strong && styles.statPillStrong, danger && styles.statPillDanger]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ProfileGachaMode({ session, activeIndex, refilling, onPass, onSelect, onArchive, onOpenDetails }: {
  session: BlindDateSession;
  activeIndex: number;
  refilling?: boolean;
  onPass: () => void;
  onSelect: (candidateId: string) => void;
  onArchive: (candidateId: string) => void;
  onOpenDetails: (candidate: BlindDateCandidate) => void;
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
          <Pressable onPress={() => onArchive(candidate.id)} style={styles.archiveMiniButton}><Text style={styles.archiveMiniText}>보관함</Text></Pressable>
        </View>
        <Pressable onPress={() => onOpenDetails(candidate)}>
          {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.gachaImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{candidate.name.slice(0, 1)}</Text></View>}
        </Pressable>

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

function CandidateCard({ candidate, selected, revealed, onSelect, onArchive, onOpenDetails, selectLabel, selectDisabled }: { candidate: BlindDateCandidate; selected?: boolean; revealed?: boolean; onSelect: () => void; onArchive?: () => void; onOpenDetails?: () => void; selectLabel?: string; selectDisabled?: boolean }) {
  const tags = [candidate.contactPresetId, candidate.hobbies[0], candidate.locationBase].filter(Boolean).slice(0, 3);
  return (
    <View style={[styles.candidateCard, selected && styles.candidateSelected]}>
      {revealed && onOpenDetails ? (
        <Pressable onPress={onOpenDetails}>
          {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.profileImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{candidate.name.slice(0, 1)}</Text></View>}
        </Pressable>
      ) : revealed && candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.profileImage} /> : <View style={styles.hiddenImage}><Text style={styles.hiddenText}>{candidate.anonymousLabel || '?'}</Text></View>}
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
        {onOpenDetails ? <Pressable onPress={onOpenDetails} style={styles.archiveMiniButton}><Text style={styles.archiveMiniText}>자세히</Text></Pressable> : null}
        {onArchive ? <Pressable onPress={onArchive} style={styles.archiveMiniButton}><Text style={styles.archiveMiniText}>보관함</Text></Pressable> : null}
      </View>
    </View>
  );
}

function QuestionMode({ sessionId, candidates, rounds, questionTarget, questions, customQuestion, setCustomQuestion, onAsk, onSelectAnswer, busy }: {
  sessionId: string;
  candidates: BlindDateCandidate[];
  rounds: BlindDateRound[];
  questionTarget: number;
  questions: string[];
  customQuestion: string;
  setCustomQuestion: (value: string) => void;
  onAsk: (question: string) => void;
  onSelectAnswer: (round: BlindDateRound, answerId: string) => void;
  busy?: boolean;
}) {
  const [visibleQuestions, setVisibleQuestions] = useState(() => pickQuestionSet(questions));
  const latestRound = rounds[rounds.length - 1];
  const reachedTarget = rounds.length >= questionTarget;
  const canAsk = !reachedTarget && (!latestRound || Boolean(latestRound.selectedAnswerId));
  const displayNoFor = (candidateId: string) => {
    const index = candidates.findIndex(candidate => candidate.id === candidateId);
    return index >= 0 ? index + 1 : 0;
  };

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
        {candidates.map((candidate, index) => <View key={candidate.id} style={styles.blindToken}><Text style={styles.blindTokenText}>{index + 1}</Text></View>)}
      </View>
      {canAsk ? (
        <View style={styles.questionBox}>
          <Text style={styles.panelTitle}>질문하기 {rounds.length}/{questionTarget}</Text>
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
      ) : reachedTarget ? (
        <View style={styles.questionBox}>
          <Text style={styles.panelTitle}>질문 완료 {rounds.length}/{questionTarget}</Text>
          <Text style={styles.questionDoneText}>답변을 모두 비교했다면 순위를 공개해보세요.</Text>
        </View>
      ) : null}

      {rounds.slice().reverse().map(round => (
        <View key={round.id} style={styles.roundCard}>
          <Text style={styles.roundQuestion}>Q{round.roundIndex}. {round.question}</Text>
          {round.answers.map(answer => (
            <Pressable key={answer.id} onPress={() => onSelectAnswer(round, answer.id)} disabled={Boolean(round.selectedAnswerId)} style={[styles.answerCard, round.selectedAnswerId === answer.id && styles.answerSelected]}>
              <Text style={styles.answerLabel}>{displayNoFor(answer.candidateId) || answer.anonymousLabel}번</Text>
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

function pickRotationQuestionSet(avoid: string[] = []): string[] {
  const avoidSet = new Set(avoid.map(item => item.trim()).filter(Boolean));
  const pool = ROTATION_QUESTION_POOL.filter(question => !avoidSet.has(question));
  const source = pool.length >= 3 ? pool : ROTATION_QUESTION_POOL;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  const groups = [
    shuffled.find(question => /(첫 데이트|좋아|연락|가까워|설렘|분위기|통화)/.test(question)),
    shuffled.find(question => /(솔직|싫|불안|늦|전 연인|질투|양보|시험|단점|빠르)/.test(question)),
    shuffled.find(question => /(오늘|갑자기|목소리|옷|선택받|밀당|버튼)/.test(question))
  ].filter((question): question is string => Boolean(question));
  return [...new Set([...groups, ...shuffled])].slice(0, 3);
}

const ROTATION_QUESTION_POOL = [
  '첫 데이트에서 어떤 분위기를 좋아해?',
  '연락은 자주 하는 편이 좋아, 편한 때 몰아서 하는 편이 좋아?',
  '가까워지면 어떤 모습이 제일 달라져?',
  '좋아하는 사람이 생기면 티가 많이 나는 편이야?',
  '상대가 힘들다고 하면 현실적으로 뭘 해줄 수 있어?',
  '너한테 좋은 사람과 끌리는 사람은 같은 사람이야?',
  '처음 만난 사람한테 어디까지 솔직해질 수 있어?',
  '연애할 때 제일 먼저 확인하고 싶은 기준은 뭐야?',
  '상대가 연락이 느리면 기다리는 편이야, 바로 식는 편이야?',
  '내가 약속에 늦으면 첫 반응은?',
  '호감이 없어도 예의상 다정하게 말하는 편이야?',
  '사귀기 전에 제일 보기 싫은 행동은 뭐야?',
  '좋아하면 먼저 다가가는 편이야, 상대가 오길 기다려?',
  '첫 만남에서 이 사람이 괜찮다 싶어지는 순간은?',
  '연애할 때 너를 제일 불안하게 만드는 건 뭐야?',
  '가까워지면 제일 먼저 들키는 네 단점은 뭐야?',
  '상대가 너무 착하기만 하면 매력이 떨어져?',
  '질투 나면 솔직히 말해, 아니면 혼자 삭혀?',
  '상대가 전 연인 얘기를 자주 하면 어떻게 받아들여?',
  '연애에서 절대 양보 못 하는 선은 뭐야?',
  '내가 갑자기 오늘 보고 싶다고 하면 나올 수 있어?',
  '네가 일부러 밀당한다면 왜 하게 될 것 같아?',
  '첫 통화에서 목소리가 취향이면 마음이 빨리 움직여?',
  '나랑 가까워지면 제일 조심해야 할 네 버튼은 뭐야?',
  '오늘 여기 있는 사람 중에 네가 선택받으려면 뭘 보여줄 거야?',
  '상대가 네 취향이 아닌 옷을 입고 오면 솔직히 말해?',
  '첫 데이트가 어색하게 끝나도 사람이 괜찮으면 다시 만나?',
  '너한테 설렘이 식는 가장 빠른 순간은?',
  '연애 초반에 너무 빠르다고 느끼는 기준은 어디부터야?',
  '나를 시험해본다면 어떤 걸 보고 판단할 것 같아?',
  '내가 갑자기 “지금 나 보러 올래?” 하면 현실적으로 어떻게 답해?',
  '너는 좋아하는 사람 앞에서 멋있는 척해, 편한 척해?',
  '상대가 사소한 거짓말을 했는데 이유가 귀여우면 넘어갈 수 있어?',
  '첫 만남에서 상대가 제일 없어 보이는 순간은?',
  '연애 중에도 썸 타는 기분이 필요하다고 생각해?',
  '네가 질투를 숨기면 어떤 식으로 티가 나?',
  '나한테 관심 없는 척하다가 들키면 뭐라고 변명할래?',
  '상대가 너무 안정적이면 심심할 수도 있어?',
  '좋아하는 사람이 네 하루를 너무 많이 차지하면 좋아, 무서워?',
  '데이트 장소가 별로여도 상대가 좋으면 기억에 남아?',
  '나랑 말싸움하면 이기려고 해, 풀려고 해?',
  '상대가 너를 너무 잘 파악하면 설레, 부담스러워?',
  '오늘 세 명 중 너만의 무기를 하나 꺼내야 한다면 뭐야?',
  '네가 생각하는 “선 넘는 농담”은 어디부터야?',
  '연애할 때 네가 제일 자주 착각하는 신호는 뭐야?',
  '상대가 네 취향을 맞추려고 애쓰면 고마워, 부담스러워?',
  '나한테 바로 들키면 민망한 네 습관 하나만 말해봐.',
  '첫 데이트에서 침묵이 10초 생기면 무슨 말로 깨?',
  '나를 좋아하게 되면 제일 먼저 누구한테 말할 것 같아?',
  '상대가 너무 솔직해서 상처 주면 그게 매력이 될 수도 있어?',
  '썸인데 내가 다른 약속을 우선하면 서운한 티 낼 거야?',
  '너는 감정이 커지면 연락이 많아져, 오히려 조심스러워져?',
  '내가 네 단점을 정확히 짚으면 인정해, 방어해?',
  '사귀기 전 둘이 여행 가자는 말은 어느 정도로 받아들여?',
  '상대가 네 SNS에 댓글을 자주 달면 좋아, 민망해?',
  '네가 은근히 약한 플러팅은 어떤 스타일이야?',
  '나랑 가치관 토론하다가 안 맞으면 더 궁금해져, 식어?',
  '상대가 너무 인기 많다는 걸 알면 더 끌려, 피곤해?',
  '좋아하면 약속을 무리해서라도 잡는 편이야?',
  '첫 만남에 “우리 잘 맞는 것 같아”라는 말 들으면 어때?',
  '네가 상대한테 마음을 닫기 직전에 하는 행동은 뭐야?',
  '연애에서 네가 가장 못 참는 애매함은 뭐야?',
  '나를 하루 만에 기억하게 만들려면 뭘 보여줄래?',
  '상대가 전화를 싫어하면 맞춰줄 수 있어?',
  '너는 칭찬에 약해, 장난 섞인 도발에 약해?',
  '오늘 대화가 끝나고 내가 기억했으면 하는 네 모습은 뭐야?',
  '상대가 피곤하다고 데이트를 미루면 몇 번까지 이해해?',
  '좋아하는 사람에게 괜히 심술 부리는 타입이야?',
  '연애할 때 네가 제일 숨기기 어려운 감정은 뭐야?',
  '나랑 가까워지면 제일 먼저 바뀔 말투는 뭐야?',
  '상대가 너를 너무 쉽게 믿으면 좋게 보여, 걱정돼?',
  '네가 먼저 보고 싶다고 말하는 기준은 어디야?',
  '좋아하는 사람과 친구 사이의 결정적 차이는 뭐라고 생각해?',
  '상대가 네 계획을 망쳤는데 얼굴 보면 풀릴 수 있어?',
  '나랑 처음 싸운다면 아마 어떤 주제일 것 같아?',
  '너는 사랑받는 느낌을 말에서 느껴, 시간에서 느껴?',
  '상대가 너무 예측 가능하면 안정적이야, 지루해?',
  '내가 장난으로 떠보는 말을 하면 바로 알아차릴 것 같아?',
  '호감 있는 사람에게 일부러 늦게 답장해본 적 있어?',
  '네가 연애에서 가장 쉽게 흔들리는 순간은 언제야?'
];

function RotationMode({ session, rotationText, setRotationText, activeCandidateId, setActiveCandidateId, onSend, onSelect, onOpenDetails, busy }: {
  session: BlindDateSession;
  rotationText: string;
  setRotationText: (value: string) => void;
  activeCandidateId: string;
  setActiveCandidateId: (value: string) => void;
  onSend: (candidateId: string, presetText?: string) => void;
  onSelect: (candidateId: string) => void;
  onOpenDetails: (candidate: BlindDateCandidate) => void;
  busy?: boolean;
}) {
  const [introIndex, setIntroIndex] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [visibleQuestions, setVisibleQuestions] = useState(() => pickRotationQuestionSet([]));
  const [reviewCandidateId, setReviewCandidateId] = useState('');
  const totalTurns = session.candidates.reduce((sum, candidate) => sum + Math.min(3, (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length), 0);
  const maxTurns = session.candidates.length * 3;
  const allDone = totalTurns >= maxTurns;
  const nextCandidate = session.candidates.find(candidate => (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length < 3);
  const currentId = reviewCandidateId || (allDone ? (activeCandidateId || session.candidates[0]?.id || '') : nextCandidate?.id || activeCandidateId || session.candidates[0]?.id || '');
  const current = session.candidates.find(candidate => candidate.id === currentId) || session.candidates[0];
  const turns = (session.rotationTurns || []).filter(turn => turn.candidateId === current?.id);
  const currentDone = turns.length >= 3;
  const usedQuestions = turns.map(turn => turn.userText);

  useEffect(() => {
    setIntroIndex(0);
    setIntroDone(false);
    setReviewCandidateId('');
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
    if (reviewCandidateId) return;
    if (!allDone && nextCandidate && activeCandidateId !== nextCandidate.id) {
      setActiveCandidateId(nextCandidate.id);
    }
  }, [allDone, nextCandidate?.id, activeCandidateId, reviewCandidateId, setActiveCandidateId]);

  useEffect(() => {
    setVisibleQuestions(pickRotationQuestionSet(usedQuestions));
  }, [current?.id, turns.length]);

  function sendRotationQuestion(question: string) {
    const clean = question.trim();
    if (!current || !clean || currentDone || busy) return;
    if (turns.length >= 2) {
      setReviewCandidateId(current.id);
    }
    setVisibleQuestions(pickRotationQuestionSet([clean, ...usedQuestions, ...visibleQuestions]));
    onSend(current.id, clean);
  }

  function continueRotation() {
    const next = session.candidates.find(candidate => candidate.id !== current?.id && (session.rotationTurns || []).filter(turn => turn.candidateId === candidate.id).length < 3);
    setReviewCandidateId('');
    if (next) setActiveCandidateId(next.id);
  }

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

  if (allDone && !reviewCandidateId) {
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
          <CandidateCard candidate={current} selected={session.selectedCandidateId === current.id} revealed onSelect={() => onSelect(current.id)} onOpenDetails={() => onOpenDetails(current)} selectDisabled selectLabel="대화 진행 중" />
          <View style={styles.rotationTalk}>
            {turns.length ? turns.map(turn => (
              <View key={turn.id} style={styles.rotationTurn}>
                <Text style={styles.rotationUser}>나: {turn.userText}</Text>
                <Text style={styles.rotationAnswer}>{current.name}: {turn.answerText}</Text>
              </View>
            )) : <Text style={styles.emptyRotation}>첫 질문을 던져보고 말투와 분위기를 비교해보세요.</Text>}
          </View>
          <View style={styles.rotationChoices}>
            {visibleQuestions.map(question => (
              <Pressable key={question} disabled={busy || currentDone} onPress={() => sendRotationQuestion(question)} style={[styles.questionChip, (busy || currentDone) && styles.disabled]}>
                <Text style={styles.questionChipText}>{question}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rotationCustomRow}>
            <TextInput value={rotationText} onChangeText={setRotationText} editable={!currentDone} style={styles.questionInput} placeholder={currentDone ? '이 후보의 3턴 완료' : `질문 ${turns.length + 1}/3 입력`} placeholderTextColor="#9b9b9b" />
            <Pressable disabled={busy || !rotationText.trim() || currentDone} onPress={() => sendRotationQuestion(rotationText)} style={[styles.askButton, (busy || !rotationText.trim() || currentDone) && styles.disabled]}><Text style={styles.askButtonText}>질문</Text></Pressable>
          </View>
          {currentDone ? (
            <View style={styles.rotationContinueBox}>
              <Text style={styles.rotationDoneHelp}>이 후보와의 3턴 대화가 끝났습니다. 답변을 확인한 뒤 진행하세요.</Text>
              <Pressable onPress={continueRotation} style={styles.rotationContinueButton}>
                <Text style={styles.rotationContinueText}>{allDone ? '결과 보기' : '다음 사람 보기'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RankingBlock({ mode, candidates, ranking, selectedCandidateId, onSelect, onArchive, onOpenDetails }: { mode?: string; candidates: BlindDateCandidate[]; ranking: { candidateId: string; rank: number; score: number; selectedCount: number; reason: string }[]; selectedCandidateId?: string; onSelect: (candidateId: string) => void; onArchive?: (candidateId: string) => void; onOpenDetails?: (candidate: BlindDateCandidate) => void }) {
  const rows = ranking.length ? ranking : candidates.map((candidate, index) => ({ candidateId: candidate.id, rank: index + 1, score: candidate.score, selectedCount: candidate.selectedCount, reason: '' }));
  return (
    <View style={styles.rankingPanel}>
      <Text style={styles.panelTitle}>{mode === 'rotation' ? '데이트 결과 정리' : '정체 공개'}</Text>
      {rows.map((row, index) => {
        const candidate = candidates.find(item => item.id === row.candidateId);
        if (!candidate) return null;
        const displayNo = index + 1;
        return (
          <Pressable key={row.candidateId} onPress={() => onSelect(row.candidateId)} style={[styles.rankingRow, selectedCandidateId === row.candidateId && styles.rankingSelected]}>
            <Text style={styles.rankNo}>{displayNo}</Text>
            {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.rankImage} /> : <View style={styles.rankFallback}><Text style={styles.rankFallbackText}>{candidate.name.slice(0, 1)}</Text></View>}
            <View style={styles.rankTextWrap}>
              <Text style={styles.rankName}>{displayNo}번 후보, {candidate.name}입니다.</Text>
              <Text style={styles.rankSub}>{candidate.job} · {mode === 'rotation' ? '3턴 대화 완료' : `선택 ${row.selectedCount}회`} · {candidate.personalitySummary}</Text>
            </View>
            <View style={styles.rankActions}>
              {onOpenDetails ? <Pressable onPress={() => onOpenDetails(candidate)} style={styles.rankDetailButton}><Text style={styles.rankDetailText}>자세히</Text></Pressable> : null}
              {onArchive ? <Pressable onPress={() => onArchive(candidate.id)} style={styles.rankArchiveButton}><Text style={styles.rankArchiveText}>보관함</Text></Pressable> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function CandidateDetailModal({ candidate, onClose }: { candidate: BlindDateCandidate | null; onClose: () => void }) {
  if (!candidate) return null;
  const tags = [...candidate.likes, ...candidate.hobbies, candidate.contactPresetId].filter(Boolean).slice(0, 8);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={styles.detailPanel}>
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator>
            <View style={styles.detailTop}>
              <View style={styles.detailTitleWrap}>
                <Text style={styles.detailTitle}>{candidate.name} · {candidate.age}</Text>
                <Text style={styles.detailSub}>{candidate.job} · {candidate.locationBase}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.detailCloseButton}><Text style={styles.detailCloseText}>닫기</Text></Pressable>
            </View>
            {candidate.profileImageUri ? (
              <Image source={{ uri: candidate.profileImageUri }} style={styles.detailImage} />
            ) : (
              <View style={styles.detailImageFallback}><Text style={styles.hiddenText}>{candidate.name.slice(0, 1)}</Text></View>
            )}
            <Text style={styles.detailQuote}>“{candidate.firstDm}”</Text>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>성격</Text>
              <Text style={styles.detailText}>{candidate.personalitySummary}</Text>
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>연애 스타일</Text>
              <Text style={styles.detailText}>{candidate.relationshipStyle}</Text>
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>말투</Text>
              <Text style={styles.detailText}>{candidate.speechStyle}</Text>
            </View>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>SNS / 통화 느낌</Text>
              <Text style={styles.detailText}>{candidate.snsPreview || candidate.snsStyle}</Text>
              <Text style={styles.detailText}>{candidate.callPreview || candidate.relationshipStyle}</Text>
            </View>
            <View style={styles.tags}>{tags.map(tag => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View>
            <View style={styles.detailBottomSpacer} />
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  content: { padding: 16, paddingBottom: 140 },
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
  setupRows: { marginTop: 14, gap: 10 },
  setupRow: { gap: 8 },
  setupLabel: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  segmentGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segmentButton: { minHeight: 36, minWidth: 54, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  segmentButtonActive: { backgroundColor: '#111', borderColor: '#111' },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  segmentTextActive: { color: '#fffefa' },
  setupStartButton: { marginTop: 14 },
  reportCard: { borderRadius: 8, padding: 14, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  reportText: { marginTop: 8, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
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
  encounterWrap: { gap: 12 },
  encounterImage: { width: '100%', aspectRatio: 1.33, borderRadius: 8, backgroundColor: '#111' },
  encounterImageFallback: { width: '100%', aspectRatio: 1.33, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', gap: 8 },
  encounterPanel: { borderRadius: 8, padding: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#222' },
  encounterLoading: { marginTop: 12, minHeight: 118, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191919', borderWidth: 1, borderColor: '#2a2a2a' },
  panelSub: { marginTop: 6, color: '#d8cda8', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  encounterKicker: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  encounterNarration: { marginTop: 8, color: '#fffefa', fontSize: 15, lineHeight: 23, fontWeight: '800' },
  encounterLine: { marginTop: 12, padding: 12, borderRadius: 8, color: colors.text, backgroundColor: '#fffefa', fontSize: 15, lineHeight: 22, fontWeight: '900' },
  locationGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  locationCard: { flexBasis: '48%', minHeight: 148, borderRadius: 12, overflow: 'hidden', backgroundColor: '#151515', borderWidth: 1, borderColor: '#2f2f2f', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  locationImage: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 30, width: undefined, height: undefined },
  locationShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.08)' },
  locationTitle: { position: 'absolute', left: 10, right: 10, bottom: 10, color: '#fffefa', fontSize: 18, lineHeight: 22, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  encounterStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statPill: { flexGrow: 1, flexBasis: '47%', minHeight: 48, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#f2eee6', borderWidth: 1, borderColor: colors.border },
  statPillStrong: { backgroundColor: '#fff6cf', borderColor: colors.accent },
  statPillDanger: { backgroundColor: '#fff1f1', borderColor: '#f2b2b2' },
  statLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  statValue: { marginTop: 2, color: colors.text, fontSize: 14, fontWeight: '900' },
  choiceList: { gap: 8 },
  choiceButton: { minHeight: 56, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'stretch', justifyContent: 'center', backgroundColor: '#eef3f7', borderWidth: 1, borderColor: '#dde5eb' },
  choiceText: { width: '100%', color: '#21303b', fontSize: 14, lineHeight: 21, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  encounterCustomBar: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  encounterInput: { flex: 1, minHeight: 48, maxHeight: 104, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  encounterSendButton: { minHeight: 48, minWidth: 72, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 1, borderColor: '#d9bd42' },
  encounterSendText: { color: '#20170b', fontSize: 14, fontWeight: '900' },
  contactWide: { minHeight: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  contactWideText: { color: '#241a00', fontSize: 15, fontWeight: '900' },
  encounterHelp: { color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  encounterResult: { padding: 14, borderRadius: 8, color: colors.text, backgroundColor: '#f7f2e9', fontSize: 16, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  encounterReason: { padding: 12, borderRadius: 8, color: '#544b3e', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border, fontSize: 13, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
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
  encounterPanelTitle: { color: '#fffefa' },
  questionDoneText: { marginTop: 8, color: colors.sub, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  questionChips: { marginTop: 10, gap: 8 },
  questionChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  questionChipText: { color: colors.text, fontWeight: '800' },
  customRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  rotationCustomRow: { marginTop: 14, flexDirection: 'row', alignItems: 'stretch', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  questionInput: { flex: 1, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 14, fontWeight: '800' },
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
  rotationContinueBox: { gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#fff8da', borderWidth: 1, borderColor: '#ead894' },
  rotationContinueButton: { minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  rotationContinueText: { color: '#241a00', fontWeight: '900' },
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
  rankActions: { gap: 6 },
  rankDetailButton: { minHeight: 32, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  rankDetailText: { color: '#fffefa', fontSize: 12, fontWeight: '900' },
  rankArchiveButton: { minHeight: 34, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2eee6' },
  rankArchiveText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  importPanel: { marginTop: 14, padding: 14, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#111' },
  importTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  importSub: { marginTop: 6, color: '#d8d8d8', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  importButton: { marginTop: 14, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  importButtonText: { color: '#241a00', fontWeight: '900', fontSize: 16 },
  detailOverlay: { flex: 1, paddingHorizontal: 16, paddingTop: 36, paddingBottom: 48, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center' },
  detailPanel: { maxHeight: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  detailScroll: { maxHeight: '100%' },
  detailContent: { padding: 14, paddingBottom: 56 },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitleWrap: { flex: 1 },
  detailTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  detailSub: { marginTop: 3, color: colors.sub, fontSize: 13, fontWeight: '800' },
  detailCloseButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  detailCloseText: { color: '#fffefa', fontWeight: '900' },
  detailImage: { width: '100%', aspectRatio: 0.82, marginTop: 12, borderRadius: 8, backgroundColor: '#eee8dc' },
  detailImageFallback: { width: '100%', aspectRatio: 0.82, marginTop: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee8dc' },
  detailQuote: { marginTop: 12, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '900' },
  detailSection: { marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#f7f2e9', borderWidth: 1, borderColor: colors.border },
  detailLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  detailText: { marginTop: 5, color: colors.sub, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  detailBottomSpacer: { height: 34 }
});
