import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlindDateCandidate, BlindDateSession, SNSGodState } from '../types';
import { activeBlindDateSession, createBlindDateSession, getBlindDateProgress, importBlindDateCandidate, selectBlindDateWorldcupCandidate } from '../logic/blindDate';
import { createBlindDateFirstDatePrompt } from '../logic/meetingEvent';
import { colors } from '../theme';

const ROUND_OPTIONS = [8, 16, 24];

export function IdealWorldcupScreen({ state, onBack, onChange, onOpenRoom }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onOpenRoom: (roomId: string) => void;
}) {
  const [roundCount, setRoundCount] = useState(16);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [winningCandidate, setWinningCandidate] = useState<BlindDateCandidate | undefined>();
  const overlay = useRef(new Animated.Value(0)).current;
  const progress = getBlindDateProgress(state);
  const session = activeBlindDateSession(state);
  const worldcupSession = session?.mode === 'worldcup' ? session : undefined;
  const currentPair = currentWorldcupPair(worldcupSession);
  const left = worldcupSession?.candidates.find(candidate => candidate.id === currentPair?.leftCandidateId);
  const right = worldcupSession?.candidates.find(candidate => candidate.id === currentPair?.rightCandidateId);
  const champion = worldcupSession?.candidates.find(candidate => candidate.id === worldcupSession.selectedCandidateId);
  const loadingLines = useMemo(() => [
    '후보들이 입장 순서를 정하고 있어요.',
    '사진이 준비된 후보부터 먼저 대진표에 올리는 중이에요.',
    '기존 캐릭터와 새 후보의 분위기를 맞춰 섞고 있어요.',
    '큰 라운드라 후보를 나눠서 준비하고 있어요.'
  ], []);
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setLoadingIndex(index => (index + 1) % loadingLines.length), 2200);
    return () => clearInterval(timer);
  }, [busy, loadingLines.length]);

  useEffect(() => {
    if (!worldcupSession || !currentPair) return;
    if (currentPair.leftCandidateId && !currentPair.rightCandidateId) {
      const candidate = worldcupSession.candidates.find(item => item.id === currentPair.leftCandidateId);
      setWinningCandidate(candidate);
      Animated.sequence([
        Animated.timing(overlay, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.delay(520),
        Animated.timing(overlay, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start(() => {
        setWinningCandidate(undefined);
        void onChange(selectBlindDateWorldcupCandidate(state, worldcupSession.id, currentPair.id, currentPair.leftCandidateId));
      });
    }
  }, [currentPair?.id, worldcupSession?.id]);

  async function startWorldcup() {
    if (busy) return;
    setBusy(true);
    try {
      await onChange(await createBlindDateSession(state, 'worldcup', roundCount, { includeExistingCharacters: includeExisting }));
    } finally {
      setBusy(false);
    }
  }

  function choose(candidate: BlindDateCandidate) {
    if (!worldcupSession || !currentPair || busy) return;
    setWinningCandidate(candidate);
    Animated.sequence([
      Animated.timing(overlay, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.delay(620),
      Animated.timing(overlay, { toValue: 0, duration: 190, useNativeDriver: true })
    ]).start(() => {
      setWinningCandidate(undefined);
      void onChange(selectBlindDateWorldcupCandidate(state, worldcupSession.id, currentPair.id, candidate.id));
    });
  }

  function importChampion() {
    if (!worldcupSession || !champion) return;
    const { next, roomId } = importBlindDateCandidate(state, worldcupSession.id, champion.id);
    void Promise.resolve(roomId ? createBlindDateFirstDatePrompt(next, roomId) : next).then(withMeetingPrompt => onChange(withMeetingPrompt)).then(() => {
      if (roomId) onOpenRoom(roomId);
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>이상형 월드컵</Text>
          <Text style={styles.subtitle}>둘 중 더 끌리는 사람을 골라 최종 연락처를 얻어요.</Text>
        </View>
      </View>

      {!worldcupSession ? (
        <ScrollView contentContainerStyle={styles.setup}>
          <View style={styles.trophyBox}><Text style={styles.trophy}>🏆</Text></View>
          <Text style={styles.heroTitle}>대진표를 선택하세요</Text>
          <Text style={styles.heroSub}>라운드가 클수록 준비 시간이 길어져요. 후보는 4명씩 나눠 준비합니다.</Text>
          <View style={styles.roundGrid}>
            {ROUND_OPTIONS.map(option => (
              <Pressable key={option} onPress={() => setRoundCount(option)} style={[styles.roundButton, roundCount === option && styles.roundButtonActive]}>
                <Text style={[styles.roundButtonText, roundCount === option && styles.roundButtonTextActive]}>{option}강</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setIncludeExisting(value => !value)} style={[styles.checkRow, includeExisting && styles.checkRowActive]}>
            <View style={[styles.checkbox, includeExisting && styles.checkboxOn]}><Text style={styles.checkboxText}>{includeExisting ? '✓' : ''}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkTitle}>기존 캐릭터도 참가</Text>
              <Text style={styles.checkSub}>저장된 캐릭터를 대진표에 섞습니다.</Text>
            </View>
          </Pressable>
          {busy ? (
            <View style={styles.loadingPanel}>
              <Text style={styles.loadingTitle}>{roundCount}강 준비 중</Text>
              <Text style={styles.loadingText}>{loadingLines[loadingIndex]}</Text>
            </View>
          ) : null}
          <Pressable disabled={busy} onPress={startWorldcup} style={[styles.startButton, busy && styles.disabled]}>
            <Text style={styles.startButtonText}>{busy ? '준비 중' : '월드컵 시작'}</Text>
          </Pressable>
        </ScrollView>
      ) : champion && worldcupSession.status === 'revealing' ? (
        <View style={styles.championPanel}>
          {champion.profileImageUri ? <Image source={{ uri: champion.profileImageUri }} style={styles.championImage} /> : <View style={styles.emptyImage}><Text style={styles.emptyText}>{champion.name.slice(0, 1)}</Text></View>}
          <Text style={styles.championTitle}>{champion.name} 우승</Text>
          <Text style={styles.championSub}>{champion.job} · {champion.personalitySummary}</Text>
          <Pressable onPress={importChampion} style={styles.startButton}><Text style={styles.startButtonText}>그녀에게 연락처 얻기</Text></Pressable>
          <Pressable onPress={() => void onChange({ ...state, blindDate: { ...progress, activeSessionId: undefined } })} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>새 월드컵</Text></Pressable>
        </View>
      ) : left && right ? (
        <View style={styles.match}>
          <Text style={styles.matchTitle}>{worldcupMatchTitle(worldcupSession, currentPair)}</Text>
          <CandidateNameBar candidate={left} variant="top" />
          <View style={styles.versusRow}>
            <WorldcupCard candidate={left} onPress={() => choose(left)} hideNameBar />
            <View pointerEvents="none" style={styles.vsBadge}>
              <View style={styles.vsGlass} />
              <Text style={styles.vsShadow}>VS</Text>
              <Text style={styles.vsText}>VS</Text>
              <Text style={styles.vsSparkLeft}>✦</Text>
              <Text style={styles.vsSparkRight}>✧</Text>
            </View>
            <WorldcupCard candidate={right} onPress={() => choose(right)} />
          </View>
        </View>
      ) : (
        <View style={styles.loadingPanel}><Text style={styles.loadingTitle}>대진표 정리 중</Text></View>
      )}

      {winningCandidate ? (
        <Animated.View pointerEvents="none" style={[styles.winnerOverlay, { opacity: overlay, transform: [{ scale: overlay.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          {winningCandidate.profileImageUri ? <Image source={{ uri: winningCandidate.profileImageUri }} style={styles.winnerImage} /> : null}
          <View style={styles.winnerShade} />
          <Text style={styles.winnerLabel}>{currentPair?.rightCandidateId ? 'WINNER' : '부전승'}</Text>
          <Text style={styles.winnerName}>{winningCandidate.name}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function currentWorldcupPair(session?: BlindDateSession) {
  if (!session) return undefined;
  return (session.worldcupPairs || [])[Number(session.worldcupIndex || 0)];
}

function worldcupMatchTitle(session: BlindDateSession, pair?: NonNullable<BlindDateSession['worldcupPairs']>[number]): string {
  const label = pair?.roundLabel || `${session.candidateCount}강`;
  if (label === '결승' || label === '결승전') return '결승전';
  const sameRoundPairs = (session.worldcupPairs || []).filter(item => item.roundLabel === label);
  const pairIndex = Math.max(0, sameRoundPairs.findIndex(item => item.id === pair?.id));
  return `${label} · ${pairIndex + 1}/${Math.max(1, sameRoundPairs.length)}`;
}

function CandidateNameBar({ candidate, variant }: { candidate: BlindDateCandidate; variant?: 'top' }) {
  return (
    <View style={[styles.nameStrip, variant === 'top' && styles.topNameStrip]}>
      <Text numberOfLines={1} style={styles.cardName}>{candidate.name}</Text>
      <Text numberOfLines={1} style={styles.cardSub}>{candidate.job}</Text>
    </View>
  );
}

function WorldcupCard({ candidate, onPress, hideNameBar }: { candidate: BlindDateCandidate; onPress: () => void; hideNameBar?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      {candidate.profileImageUri ? <Image source={{ uri: candidate.profileImageUri }} style={styles.cardImage} /> : <View style={styles.emptyImage}><Text style={styles.emptyText}>{candidate.name.slice(0, 1)}</Text></View>}
      {hideNameBar ? null : <CandidateNameBar candidate={candidate} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111' },
  header: { minHeight: 86, paddingHorizontal: 18, paddingTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff' },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f2eee6', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 34, lineHeight: 38, fontWeight: '900', color: colors.text },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900' },
  subtitle: { marginTop: 3, color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  setup: { padding: 18, paddingBottom: 120 },
  trophyBox: { alignSelf: 'center', width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5d76e' },
  trophy: { fontSize: 44 },
  heroTitle: { marginTop: 18, color: '#fff', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  heroSub: { marginTop: 8, color: '#cfcfcf', fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  roundGrid: { marginTop: 20, gap: 10 },
  roundButton: { minHeight: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242424', borderWidth: 1, borderColor: '#333' },
  roundButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  roundButtonText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  roundButtonTextActive: { color: '#241a00' },
  checkRow: { marginTop: 16, minHeight: 76, padding: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#333' },
  checkRowActive: { borderColor: colors.accent, backgroundColor: '#2d260c' },
  checkbox: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#777', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxText: { color: '#241a00', fontWeight: '900' },
  checkTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  checkSub: { marginTop: 3, color: '#b9b9b9', fontSize: 12, fontWeight: '800' },
  loadingPanel: { marginTop: 16, padding: 16, borderRadius: 8, backgroundColor: '#202020', borderWidth: 1, borderColor: '#333' },
  loadingTitle: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  loadingText: { marginTop: 6, color: '#d8cda8', fontSize: 13, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
  startButton: { marginTop: 18, minHeight: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  startButtonText: { color: '#241a00', fontSize: 17, fontWeight: '900' },
  secondaryButton: { marginTop: 10, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { color: colors.text, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  match: { flex: 1, paddingTop: 16 },
  matchTitle: { color: '#fff', fontSize: 25, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  versusRow: { flex: 1, flexDirection: 'column', alignItems: 'stretch', paddingTop: 18 },
  card: { flex: 1, width: '100%', backgroundColor: '#1d1d1d', overflow: 'hidden', justifyContent: 'center' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  emptyImage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' },
  emptyText: { color: '#fff', fontSize: 48, fontWeight: '900' },
  nameStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 34, paddingHorizontal: 14, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.58)' },
  topNameStrip: { position: 'relative', marginTop: 7, minHeight: 32, backgroundColor: 'rgba(255,255,255,0.08)' },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'left' },
  cardSub: { flex: 1, color: '#e8e8e8', fontSize: 12, fontWeight: '800', textAlign: 'left' },
  vsBadge: { position: 'absolute', left: '50%', top: '50%', marginLeft: -68, marginTop: -44, width: 136, height: 88, alignItems: 'center', justifyContent: 'center', zIndex: 8, elevation: 8 },
  vsGlass: { position: 'absolute', width: 118, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.48)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, transform: [{ rotate: '-7deg' }] },
  vsShadow: { position: 'absolute', color: 'rgba(0,0,0,0.45)', fontSize: 50, lineHeight: 58, fontWeight: '900', letterSpacing: 1, transform: [{ translateX: 3 }, { translateY: 4 }, { rotate: '-7deg' }] },
  vsText: { color: '#7ee8ff', fontSize: 50, lineHeight: 58, fontWeight: '900', letterSpacing: 1, textShadowColor: '#f8d56a', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0, transform: [{ rotate: '-7deg' }] },
  vsSparkLeft: { position: 'absolute', left: 8, top: 34, color: '#ffd95c', fontSize: 18, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  vsSparkRight: { position: 'absolute', right: 8, top: 28, color: '#cbb7ff', fontSize: 18, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  championPanel: { flex: 1, padding: 18, justifyContent: 'center' },
  championImage: { width: '100%', aspectRatio: 0.76, borderRadius: 8, backgroundColor: '#333' },
  championTitle: { marginTop: 18, color: '#fff', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  championSub: { marginTop: 6, color: '#d8d8d8', fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  winnerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  winnerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  winnerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  winnerLabel: { color: colors.accent, fontSize: 26, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  winnerName: { marginTop: 8, color: '#fff', fontSize: 34, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 }
});
