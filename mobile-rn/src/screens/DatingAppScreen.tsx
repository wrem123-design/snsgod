import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../theme';
import { DatingAppHistoryEntry, DatingAppPhoto, DatingAppProfile, DatingAppProgress, SNSGodState } from '../types';
import {
  activeDatingAppProfile,
  datingAppEffectiveAcceptanceChance,
  datingAppProgress,
  datingAppProfiles,
  datingAppRefreshHours,
  datingAppRemainingMs,
  datingAppRoundCompleted,
  ensureDatingAppProfile,
  finalizeAcceptedDatingAppChat,
  MAX_DATING_APP_LIKES_PER_ROUND,
  recordDatingAppDecision,
  regenerateActiveDatingAppFailedPhotos,
  replaceActiveDatingAppProfile,
  requestDatingAppChat,
  resolveDatingAppRequest,
  selectDatingAppFinalProfile,
  toggleDatingAppReferencePhoto
} from '../logic/datingApp';
import { isRenderableMediaUri } from '../logic/media';

type Props = {
  state: SNSGodState;
  onChange: (next: SNSGodState, options?: { persist?: boolean }) => Promise<void> | void;
  onBack: () => void;
  onOpenRoom: (roomId: string) => void;
};

export function DatingAppScreen({ state, onChange, onBack, onOpenRoom }: Props) {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  const profile = activeDatingAppProfile(progress);
  const roundCompleted = datingAppRoundCompleted(progress);
  const decisions = progress.decisions || [];
  const likedIds = decisions.filter(item => item.decision === 'liked').map(item => item.profileId);
  const likesLeft = Math.max(0, MAX_DATING_APP_LIKES_PER_ROUND - likedIds.length);
  const selectedFinalId = progress.finalProfileId || (likedIds.length === 1 ? likedIds[0] : undefined);
  const selectedFinalProfile = profiles.find(item => item.id === selectedFinalId);
  const [loading, setLoading] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<DatingAppPhoto | undefined>();
  const [historyDetail, setHistoryDetail] = useState<DatingAppHistoryEntry | undefined>();
  const [nowTick, setNowTick] = useState(Date.now());
  const refreshHours = datingAppRefreshHours(state);
  const acceptanceChance = datingAppEffectiveAcceptanceChance(state, selectedFinalProfile);
  const remainingMs = datingAppRemainingMs(state, nowTick);
  const pendingSeconds = progress.requestStatus === 'pending'
    ? Math.max(0, Math.ceil((Number(progress.resolveAt || 0) - nowTick) / 1000))
    : 0;
  const expiryLabel = remainingMs <= 0 ? '갱신 가능' : `${formatRemaining(remainingMs)} 후 갱신`;
  const currentNumber = Math.min(Number(progress.activeProfileIndex || 0) + 1, 3);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profiles.length && remainingMs > 0) return;
    if (progress.requestStatus === 'pending' || progress.requestStatus === 'accepted') return;
    void generateRound(false);
  }, []);

  useEffect(() => {
    if (loading || remainingMs > 0) return;
    if (progress.requestStatus === 'pending' || progress.requestStatus === 'accepted') return;
    void generateRound(false);
  }, [loading, remainingMs, progress.requestStatus, progress.resolveAt, profiles.length]);

  useEffect(() => {
    if (progress.requestStatus !== 'pending') return;
    const timer = setInterval(async () => {
      const result = resolveDatingAppRequest(state);
      if (result.next !== state) await onChange(result.next);
    }, 3000);
    return () => clearInterval(timer);
  }, [state, progress.requestStatus, progress.resolveAt]);

  async function generateRound(force: boolean) {
    if (loading) return;
    setLoading(true);
    setMessage('');
    setBusyText(force ? '새 소개팅 후보를 불러오는 중...' : '오늘의 첫 소개팅 후보를 준비 중...');
    try {
      const next = await ensureDatingAppProfile(state, force);
      if (next !== state) await onChange(next);
    } finally {
      setBusyText('');
      setLoading(false);
    }
  }

  async function refreshIfReady() {
    if (loading || progress.requestStatus === 'pending') return;
    const left = datingAppRemainingMs(state);
    if (profiles.length && left > 0) {
      setMessage(`${formatRemaining(left)} 남았어요`);
      return;
    }
    await generateRound(true);
  }

  async function decide(decision: 'liked' | 'passed') {
    if (!profile || loading || progress.requestStatus === 'pending') return;
    if (decision === 'liked' && likesLeft <= 0) {
      setMessage(`하트는 3명 중 ${MAX_DATING_APP_LIKES_PER_ROUND}명까지만 보낼 수 있어요.`);
      return;
    }
    setLoading(true);
    setBusyText(currentNumber >= 3 ? '결과를 정리하는 중...' : '다음 소개팅 후보를 불러오는 중...');
    try {
      const next = await recordDatingAppDecision(state, profile.id, decision);
      await onChange(next);
    } finally {
      setBusyText('');
      setLoading(false);
    }
  }

  async function retryFailedPhotos() {
    if (!profile || loading || progress.requestStatus === 'pending') return;
    setLoading(true);
    setBusyText('실패한 사진을 다시 생성하는 중...');
    try {
      const next = await regenerateActiveDatingAppFailedPhotos(state);
      if (next !== state) await onChange(next);
    } finally {
      setBusyText('');
      setLoading(false);
    }
  }

  async function replaceCurrentProfile() {
    if (!profile || loading || progress.requestStatus === 'pending') return;
    setLoading(true);
    setMessage('');
    setBusyText('이 후보를 새로 뽑는 중...');
    try {
      const next = await replaceActiveDatingAppProfile(state);
      if (next !== state) await onChange(next);
    } finally {
      setBusyText('');
      setLoading(false);
    }
  }

  async function pickFinal(profileId: string) {
    if (progress.requestStatus === 'pending' || progress.requestStatus === 'accepted') return;
    await onChange(selectDatingAppFinalProfile(state, profileId));
  }

  async function requestChat() {
    if (progress.requestStatus === 'accepted' && progress.acceptedRoomId) {
      onOpenRoom(progress.acceptedRoomId);
      return;
    }
    if (progress.requestStatus === 'accepted') {
      if (!(progress.selectedReferencePhotoIds || []).length) {
        Alert.alert('사진 선택 필요', '캐릭터 저장 전에 마음에 드는 사진을 최소 1장 선택해주세요.');
        return;
      }
      const result = finalizeAcceptedDatingAppChat(state);
      await onChange(result.next);
      if (result.roomId) onOpenRoom(result.roomId);
      return;
    }
    if (!selectedFinalProfile || loading || progress.requestStatus === 'pending') return;
    await onChange(requestDatingAppChat(state));
  }

  async function toggleReference(photoId: string) {
    await onChange(toggleDatingAppReferencePhoto(state, photoId));
  }

  const photos = profile?.photos || [];
  const hero = photos.find(photo => isRenderableMediaUri(photo.uri)) || photos[0];
  const failedPhotos = photos.filter(photo => !isRenderableMediaUri(photo.uri));
  const resultPhotos = useMemo(() => {
    const map = new Map<string, DatingAppPhoto | undefined>();
    profiles.forEach(item => map.set(item.id, item.photos.find(photo => isRenderableMediaUri(photo.uri)) || item.photos[0]));
    return map;
  }, [profiles]);

  const previewModal = (
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(undefined)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setPreview(undefined)}>
        <View style={styles.modalImageFrame}>
          {preview?.uri && isRenderableMediaUri(preview.uri) ? (
            <Image source={{ uri: preview.uri }} style={styles.modalImage} resizeMode="contain" />
          ) : (
            <View style={styles.modalPlaceholder}><Text style={styles.modalPlaceholderText}>{preview?.error || '이미지가 아직 없습니다.'}</Text></View>
          )}
        </View>
        <Text style={styles.modalLabel}>{preview?.label || ''}</Text>
      </Pressable>
    </Modal>
  );

  if (historyDetail) {
    return (
      <View style={styles.screen}>
        <View style={styles.historyModalHeader}>
          <View>
            <Text style={styles.historyModalTitle}>선택 히스토리</Text>
            <Text style={styles.historyModalSub}>{historyStatusLabel(historyDetail.requestStatus)} · {formatHistoryDate(historyDetail.savedAt)}</Text>
          </View>
          <Pressable onPress={() => setHistoryDetail(undefined)} style={styles.historyModalClose}>
            <Text style={styles.historyModalCloseText}>닫기</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.historyDetailScroll}
          contentContainerStyle={styles.historyDetailContent}
          keyboardShouldPersistTaps="handled"
          overScrollMode="always"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
        >
          <ProfileHistoryContent item={historyDetail} onPreview={setPreview} />
        </ScrollView>
        {previewModal}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityLabel="뒤로가기">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.title}>GLAM</Text>
          <Text style={styles.subtitle}>후보 3명 중 하트는 2명까지만 보낼 수 있어요</Text>
        </View>
        <Pressable onPress={refreshIfReady} disabled={loading || progress.requestStatus === 'pending'} style={[styles.refreshButton, (loading || progress.requestStatus === 'pending') && styles.disabled]}>
          <Text style={styles.refreshText}>갱신</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {message ? (
          <View style={styles.toastPanel}>
            <Text style={styles.toastText}>{message}</Text>
          </View>
        ) : null}

        {!profiles.length && loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={colors.datingHeart} />
            <Text style={styles.loadingText}>{busyText || '프로필 생성 중...'}</Text>
          </View>
        ) : null}

        {roundCompleted ? (
          <ResultView
            profiles={profiles}
            decisions={decisions}
            likedIds={likedIds}
            selectedFinalId={selectedFinalId}
            selectedFinalProfile={selectedFinalProfile}
            resultPhotos={resultPhotos}
            progress={progress}
            selectedReferencePhotoIds={progress.selectedReferencePhotoIds || []}
            pendingSeconds={pendingSeconds}
            remainingMs={remainingMs}
            acceptanceChance={acceptanceChance}
            onPreview={setPreview}
            onPick={pickFinal}
            onToggleReference={toggleReference}
            onRequest={requestChat}
          />
        ) : profile ? (
          <>
            <View style={styles.statusStrip}>
              <View>
                <Text style={styles.statusLabel}>오늘의 후보 {currentNumber}/3</Text>
                <Text style={styles.statusText}>{expiryLabel} · 남은 하트 {likesLeft}/{MAX_DATING_APP_LIKES_PER_ROUND}</Text>
              </View>
            </View>

            {failedPhotos.length ? (
              <View style={styles.photoWarningPanel}>
                <Text style={styles.photoWarningTitle}>사진 준비가 끝나지 않았어요</Text>
                <Text style={styles.photoWarningText}>일부 사진 생성에 실패해서 후보를 다시 불러와야 진행할 수 있어요.</Text>
                <View style={styles.photoWarningActions}>
                  <Pressable onPress={retryFailedPhotos} disabled={loading} style={[styles.photoRetryButton, loading && styles.disabled]}>
                    <Text style={styles.photoRetryText}>실패 사진 다시 생성</Text>
                  </Pressable>
                  <Pressable onPress={replaceCurrentProfile} disabled={loading} style={[styles.photoReplaceButton, loading && styles.disabled]}>
                    <Text style={styles.photoReplaceText}>이 후보 새로 뽑기</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={[styles.heroCard, styles.historyModalBlock]}>
              <Pressable onPress={() => hero && setPreview(hero)} style={styles.heroImageWrap}>
                {hero?.uri && isRenderableMediaUri(hero.uri) ? (
                  <Image source={{ uri: hero.uri }} style={styles.heroImage} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    {loading ? <ActivityIndicator color={colors.datingHeart} /> : null}
                    <Text style={styles.photoPlaceholderTitle}>{profile.name}</Text>
                    <Text style={styles.photoPlaceholderSub}>이미지 생성 설정을 켜면 프로필 사진 1장과 GLAM 앨범 3장이 표시됩니다.</Text>
                  </View>
                )}
                <View style={styles.heroGradient}>
                  <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{profile.verified ? '인증됨' : '프로필'}</Text></View>
                  <Text style={styles.heroName}>{profile.name}, {profile.age}</Text>
                  <Text style={styles.heroMeta}>{profile.job}</Text>
                  <Text style={styles.heroMeta}>{profile.location} · {profile.distanceKm.toFixed(1)}km</Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable onPress={() => decide('passed')} disabled={loading} style={[styles.circleAction, styles.passAction, loading && styles.disabled]} accessibilityLabel="패스">
                <Text style={styles.passActionText}>×</Text>
              </Pressable>
              <Pressable onPress={() => decide('liked')} disabled={loading || likesLeft <= 0} style={[styles.circleAction, styles.likeAction, (loading || likesLeft <= 0) && styles.disabled]} accessibilityLabel="선택">
                <Text style={styles.likeActionText}>♥</Text>
              </Pressable>
            </View>

            <Section title="자기소개">
              <Text style={styles.bio}>{profile.bio}</Text>
            </Section>
            <Section title="특징">
              <TagCloud tags={profile.traits} hot />
            </Section>
            <Section title="관심사">
              <TagCloud tags={profile.interests} />
            </Section>
            <Section title="기본 정보">
              <View style={styles.infoGrid}>
                <InfoCell label="학력" value={profile.education || '미공개'} />
                <InfoCell label="키" value={`${profile.heightCm}cm`} />
                <InfoCell label="체형" value={profile.bodyLabel} />
                <InfoCell label="술" value={profile.alcohol} />
                <InfoCell label="흡연" value={profile.smoking} />
                <InfoCell label="종교" value={profile.religion} />
                <InfoCell label="MBTI" value={profile.mbti || '미공개'} />
                <InfoCell label="거리" value={`${profile.distanceKm.toFixed(1)}km`} />
              </View>
            </Section>
            <Section title="연애 성향">
              <TagCloud tags={profile.datingStyle} hot />
            </Section>
            <Section title="라이프스타일">
              <TagCloud tags={profile.lifestyle} />
            </Section>
            <Section title="사진">
              <Gallery photos={photos} onPreview={setPreview} />
            </Section>
          </>
        ) : null}

        {(progress.history || []).length ? (
          <Section title="선택 히스토리">
            {(progress.history || []).slice(0, 30).map(item => (
              <HistoryCard key={item.id} item={item} onPress={() => setHistoryDetail(item)} />
            ))}
          </Section>
        ) : null}
      </ScrollView>

      {loading && profiles.length ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={colors.datingHeart} />
          <Text style={styles.busyText}>{busyText}</Text>
        </View>
      ) : null}

      {previewModal}
    </View>
  );
}

function ResultView({
  profiles,
  decisions,
  likedIds,
  selectedFinalId,
  selectedFinalProfile,
  resultPhotos,
  progress,
  selectedReferencePhotoIds,
  pendingSeconds,
  remainingMs,
  acceptanceChance,
  onPreview,
  onPick,
  onToggleReference,
  onRequest
}: {
  profiles: DatingAppProfile[];
  decisions: NonNullable<DatingAppProgress['decisions']>;
  likedIds: string[];
  selectedFinalId?: string;
  selectedFinalProfile?: DatingAppProfile;
  resultPhotos: Map<string, DatingAppPhoto | undefined>;
  progress: DatingAppProgress;
  selectedReferencePhotoIds: string[];
  pendingSeconds: number;
  remainingMs: number;
  acceptanceChance: number;
  onPreview: (photo: DatingAppPhoto) => void;
  onPick: (profileId: string) => void;
  onToggleReference: (photoId: string) => void;
  onRequest: () => void;
}) {
  const decisionById = new Map(decisions.map(item => [item.profileId, item.decision]));
  const selectablePhotos = (selectedFinalProfile?.photos || []).filter(photo => photo.uri && isRenderableMediaUri(photo.uri));
  const canPickReferences = Boolean(selectedFinalProfile) && progress.requestStatus === 'accepted' && !progress.acceptedRoomId;
  const canSubmitRequest = Boolean(selectedFinalProfile) && (!progress.requestStatus || progress.requestStatus === 'none');
  const canOpenAcceptedRoom = progress.requestStatus === 'accepted';
  const canPressRequest = canSubmitRequest || canOpenAcceptedRoom;
  return (
    <>
      <View style={styles.resultHero}>
        <Text style={styles.resultTitle}>
          {progress.requestStatus === 'accepted' ? '대화신청 수락됨' : progress.requestStatus === 'rejected' ? '이번 신청은 거절됐어요' : '오늘의 결과'}
        </Text>
        <Text style={styles.resultSub}>
          {likedIds.length >= 2
            ? '한명만 선택가능하니 신중히 선택하세요'
            : likedIds.length === 1
              ? '마음에 든 후보 1명을 확인했어요'
              : '다음 소개팅을 기대해주세요'}
        </Text>
        <Text style={styles.resultTimer}>{remainingMs > 0 ? `${formatRemaining(remainingMs)} 남음` : '새 후보 갱신 가능'}</Text>
      </View>

      {progress.requestStatus === 'pending' ? (
        <Notice title="대화신청을 보냈어요" text={pendingSeconds > 0 ? `약 ${pendingSeconds}초 후 답장이 도착합니다.` : '곧 결과가 표시됩니다.'} />
      ) : null}
      {progress.requestStatus === 'accepted' ? (
        <Notice title="수락됨" text={`${selectedFinalProfile?.name || '상대'}이 대화신청을 수락했어요. 대화방을 열 수 있습니다.`} />
      ) : null}
      {progress.requestStatus === 'rejected' ? (
        <Notice title="거절됨" text={`${progress.rejectedReason || '타이밍이 맞지 않았어요.'} 다음 소개팅을 기다려주세요.`} />
      ) : null}

      <Section title="선택 결과">
        {profiles.map(profile => {
          const decision = decisionById.get(profile.id) || 'passed';
          const photo = resultPhotos.get(profile.id);
          const liked = decision === 'liked';
          const selected = selectedFinalId === profile.id;
          return (
            <Pressable
              key={profile.id}
              onPress={() => liked && onPick(profile.id)}
              disabled={!liked || progress.requestStatus === 'pending' || progress.requestStatus === 'accepted'}
              style={[styles.resultCard, selected && styles.resultCardSelected, !liked && styles.resultCardMuted]}
            >
              {photo?.uri && isRenderableMediaUri(photo.uri) ? (
                <Pressable onPress={() => onPreview(photo)} style={styles.resultPhotoWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.resultPhoto} />
                </Pressable>
              ) : (
                <View style={styles.resultPhotoPlaceholder}><Text style={styles.resultPhotoText}>{profile.name.slice(0, 1)}</Text></View>
              )}
              <View style={styles.resultInfo}>
                <View style={styles.resultLine}>
                  <Text style={styles.resultName}>{profile.name}, {profile.age}</Text>
                  <View style={[styles.resultBadge, liked ? styles.resultBadgeLike : styles.resultBadgePass]}>
                    <Text style={[styles.resultBadgeText, liked && styles.resultBadgeLikeText]}>{liked ? '선택' : '패스'}</Text>
                  </View>
                </View>
                <Text style={styles.resultMeta}>{profile.job} · {profile.location}</Text>
                <Text style={styles.resultSummary} numberOfLines={2}>{profile.personalitySummary}</Text>
              </View>
            </Pressable>
          );
        })}
      </Section>

      {selectedFinalProfile ? (
        <Section title="레퍼런스 사진 선택">
          <Text style={styles.referenceHelp}>
            {canPickReferences
              ? '상대가 수락했어요. 캐릭터 저장 전에 제일 마음에 드는 사진을 1~3장 골라주세요. 선택한 사진은 레퍼런스 이미지로 자동 저장됩니다.'
              : progress.requestStatus === 'accepted' && progress.acceptedRoomId
                ? '캐릭터 저장이 완료되어 선택한 레퍼런스 사진이 적용되었습니다.'
                : '상대가 수락하면 여기서 마음에 드는 사진을 1~3장 선택할 수 있습니다.'}
          </Text>
          <View style={styles.referenceGrid}>
            {selectablePhotos.map(photo => {
              const selected = selectedReferencePhotoIds.includes(photo.id);
              return (
                <Pressable
                  key={photo.id}
                  onPress={() => canPickReferences && onToggleReference(photo.id)}
                  disabled={!canPickReferences}
                  style={[styles.referenceItem, selected && styles.referenceItemSelected, !canPickReferences && styles.referenceItemLocked]}
                >
                  <Image source={{ uri: String(photo.uri) }} style={styles.referenceImage} />
                  <View style={[styles.referenceCheck, selected && styles.referenceCheckSelected]}>
                    <Text style={[styles.referenceCheckText, selected && styles.referenceCheckTextSelected]}>{selected ? selectedReferencePhotoIds.indexOf(photo.id) + 1 : '+'}</Text>
                  </View>
                  <Text style={styles.referenceLabel}>{photo.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.referenceCount, selectedReferencePhotoIds.length ? styles.referenceCountReady : undefined]}>
            {selectedReferencePhotoIds.length}/3장 선택됨{canPickReferences && !selectedReferencePhotoIds.length ? ' · 최소 1장 필요' : ''}
          </Text>
        </Section>
      ) : null}

      {likedIds.length ? (
        <Pressable onPress={onRequest} disabled={!canPressRequest} style={[styles.finalRequestButton, !canPressRequest && styles.disabled]}>
          <Text style={styles.finalRequestText}>{requestLabel(progress.requestStatus, pendingSeconds, Boolean(progress.acceptedRoomId), selectedReferencePhotoIds.length)}</Text>
          {canSubmitRequest ? <Text style={styles.finalRequestSub}>수락 확률 {acceptanceChance}%</Text> : null}
        </Pressable>
      ) : (
        <View style={styles.waitPanel}>
          <Text style={styles.waitTitle}>다음 소개팅을 기대해주세요</Text>
          <Text style={styles.waitText}>{remainingMs > 0 ? `${formatRemaining(remainingMs)} 뒤에 새 후보를 받을 수 있어요.` : '이제 갱신 버튼으로 새 후보를 받을 수 있어요.'}</Text>
        </View>
      )}
    </>
  );
}

function HistoryCard({ item, onPress }: { item: DatingAppHistoryEntry; onPress: () => void }) {
  const photo = item.finalProfile.photos.find(candidate => candidate.uri && isRenderableMediaUri(candidate.uri));
  const summary = profileHistorySummary(item.finalProfile);
  return (
    <Pressable onPress={onPress} style={styles.historyCard}>
      {photo?.uri ? (
        <Image source={{ uri: photo.uri }} style={styles.historyPhoto} />
      ) : (
        <View style={styles.historyPhotoPlaceholder}><Text style={styles.historyPhotoText}>{item.finalProfile.name.slice(0, 1)}</Text></View>
      )}
      <View style={styles.historyBody}>
        <View style={styles.historyTopLine}>
          <Text style={styles.historyName}>{item.finalProfile.name}, {item.finalProfile.age}</Text>
          <Text style={styles.historyStatus}>{historyStatusLabel(item.requestStatus)}</Text>
        </View>
        <Text style={styles.historyMeta}>{item.finalProfile.job} · {item.finalProfile.location}</Text>
        <Text style={styles.historySummary} numberOfLines={2}>{summary}</Text>
      </View>
    </Pressable>
  );
}

function ProfileHistoryContent({
  item,
  onPreview
}: {
  item: DatingAppHistoryEntry;
  onPreview: (photo: DatingAppPhoto) => void;
}) {
  const profile = item.finalProfile;
  const hero = profile.photos.find(photo => photo.uri && isRenderableMediaUri(photo.uri)) || profile.photos[0];
  return (
    <>
      <View style={[styles.heroCard, styles.historyModalBlock]}>
        <View style={[styles.heroImageWrap, styles.historyHeroImageWrap]}>
          {hero?.uri && isRenderableMediaUri(hero.uri) ? (
            <Image source={{ uri: hero.uri }} style={styles.heroImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderTitle}>{profile.name}</Text>
              <Text style={styles.photoPlaceholderSub}>저장된 대표 사진이 없습니다.</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.historyResultPanel, styles.historyModalBlock]}>
        <Text style={styles.historyResultKicker}>매칭 결과</Text>
        <Text style={styles.historyResultTitle}>{historyMatchResultTitle(item.requestStatus)}</Text>
        <Text style={styles.historyResultText}>{historyMatchResultText(item)}</Text>
      </View>

      <Section title="자기소개" style={styles.historyModalBlock}>
        <Text style={styles.bio}>{profile.bio}</Text>
      </Section>
      <Section title="특징" style={styles.historyModalBlock}>
        <TagCloud tags={profile.traits} hot />
      </Section>
      <Section title="관심사" style={styles.historyModalBlock}>
        <TagCloud tags={profile.interests} />
      </Section>
      <Section title="기본 정보" style={styles.historyModalBlock}>
        <View style={styles.infoGrid}>
          <InfoCell label="학력" value={profile.education || '미공개'} />
          <InfoCell label="키" value={`${profile.heightCm}cm`} />
          <InfoCell label="체형" value={profile.bodyLabel} />
          <InfoCell label="술" value={profile.alcohol} />
          <InfoCell label="흡연" value={profile.smoking} />
          <InfoCell label="종교" value={profile.religion} />
          <InfoCell label="MBTI" value={profile.mbti || '미공개'} />
          <InfoCell label="거리" value={`${profile.distanceKm.toFixed(1)}km`} />
        </View>
      </Section>
      <Section title="연애 성향" style={styles.historyModalBlock}>
        <TagCloud tags={profile.datingStyle} hot />
      </Section>
      <Section title="라이프스타일" style={styles.historyModalBlock}>
        <TagCloud tags={profile.lifestyle} />
      </Section>
      <Section title="사진">
        <Gallery photos={profile.photos} onPreview={onPreview} />
      </Section>
    </>
  );
}

function profileHistorySummary(profile: DatingAppProfile) {
  const parts = [
    profile.personalitySummary,
    profile.bio,
    profile.relationshipStyle,
    profile.traits?.slice(0, 3).join(', '),
    profile.interests?.slice(0, 3).join(', ')
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return parts[0] || `${profile.job} · ${profile.location} · ${profile.distanceKm.toFixed(1)}km`;
}

function historyStatusLabel(status: DatingAppProgress['requestStatus']) {
  if (status === 'accepted') return '수락';
  if (status === 'rejected') return '거절';
  if (status === 'pending') return '대기';
  return '선택';
}

function historyMatchResultTitle(status: DatingAppProgress['requestStatus']) {
  if (status === 'accepted') return '매칭 성공';
  if (status === 'rejected') return '매칭 실패';
  if (status === 'pending') return '답장 대기';
  return '최종 선택';
}

function historyMatchResultText(item: DatingAppHistoryEntry) {
  const name = item.finalProfile.name;
  if (item.requestStatus === 'accepted') return `${name}님이 대화 신청을 수락했어요.`;
  if (item.requestStatus === 'rejected') return item.rejectedReason || `${name}님과는 이번 매칭이 이어지지 않았어요.`;
  if (item.requestStatus === 'pending') return `${name}님에게 보낸 대화 신청 답장을 기다리는 중이에요.`;
  return `${name}님을 이 턴의 최종 후보로 선택했어요.`;
}

function requestLabel(status: DatingAppProgress['requestStatus'], pendingSeconds: number, hasAcceptedRoom = false, selectedReferenceCount = 0) {
  if (status === 'accepted') return hasAcceptedRoom ? '대화방 열기' : selectedReferenceCount ? '캐릭터 저장하고 대화방 열기' : '사진 1장 이상 선택 후 저장';
  if (status === 'pending') return pendingSeconds > 0 ? '답장 기다리는 중' : '답장 확인 중';
  if (status === 'rejected') return '다음 소개팅 대기';
  return '대화신청';
}

function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${remainSeconds}초`;
  return `${remainSeconds}초`;
}

function formatHistoryDate(timestamp?: number) {
  if (!timestamp) return '저장됨';
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.noticePanel}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TagCloud({ tags, hot = false }: { tags: string[]; hot?: boolean }) {
  return (
    <View style={styles.tags}>
      {tags.map(tag => (
        <View key={tag} style={[styles.tag, hot && styles.hotTag]}>
          <Text style={[styles.tagText, hot && styles.hotTagText]}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Gallery({ photos, onPreview }: { photos: DatingAppPhoto[]; onPreview: (photo: DatingAppPhoto) => void }) {
  return (
    <View style={styles.galleryGrid}>
      {photos.map(photo => (
        <Pressable key={photo.id} onPress={() => onPreview(photo)} style={styles.galleryItem}>
          {photo.uri && isRenderableMediaUri(photo.uri) ? (
            <Image source={{ uri: photo.uri }} style={styles.galleryImage} />
          ) : (
            <View style={styles.galleryPlaceholder}>
              <Text style={styles.galleryPlaceholderText}>{photo.label}</Text>
            </View>
          )}
          <Text style={styles.galleryLabel}>{photo.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 82, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 34, lineHeight: 36, fontWeight: '900' },
  headerBody: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  subtitle: { marginTop: 3, color: colors.sub, fontSize: 12, fontWeight: '800' },
  refreshButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.datingHeartSoft, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.datingHeart, fontWeight: '900' },
  content: { padding: 12, paddingBottom: 28, gap: 12 },
  toastPanel: { minHeight: 42, borderRadius: 10, backgroundColor: colors.datingHeartSoft, paddingHorizontal: 12, justifyContent: 'center' },
  toastText: { color: colors.datingHeart, fontWeight: '900' },
  loadingPanel: { minHeight: 300, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18 },
  loadingText: { color: colors.sub, fontWeight: '900' },
  statusStrip: { minHeight: 58, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusLabel: { color: colors.text, fontSize: 15, fontWeight: '900' },
  statusText: { marginTop: 3, color: colors.sub, fontSize: 12, fontWeight: '800' },
  onlinePill: { minHeight: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  onlinePillText: { color: colors.datingOnline, fontSize: 12, fontWeight: '900' },
  photoWarningPanel: { borderRadius: 12, borderWidth: 1, borderColor: colors.datingHeart, backgroundColor: colors.datingHeartSoft, padding: 16, gap: 10 },
  photoWarningTitle: { color: colors.datingHeart, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  photoWarningText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  photoWarningActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoRetryButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: colors.datingHeart, alignItems: 'center', justifyContent: 'center' },
  photoRetryText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  photoReplaceButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  photoReplaceText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  heroCard: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, shadowColor: colors.datingShadow, shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  heroImageWrap: { height: 560, backgroundColor: colors.surfaceAlt },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingTop: 42, backgroundColor: 'rgba(0,0,0,0.46)' },
  heroBadge: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: 10, borderRadius: 7, backgroundColor: colors.datingOnline, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroBadgeText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  heroName: { color: colors.white, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  heroMeta: { marginTop: 5, color: colors.white, fontSize: 15, fontWeight: '800' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, backgroundColor: colors.surfaceAlt },
  photoPlaceholderTitle: { color: colors.text, fontSize: 34, fontWeight: '900' },
  photoPlaceholderSub: { color: colors.sub, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: -2 },
  circleAction: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', shadowColor: colors.datingShadow, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  passAction: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  passActionText: { color: colors.text, fontSize: 40, lineHeight: 42, fontWeight: '900' },
  likeAction: { backgroundColor: colors.datingHeart },
  likeActionText: { color: colors.white, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  noticePanel: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 12 },
  noticeTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  noticeText: { marginTop: 6, color: colors.sub, lineHeight: 20, fontWeight: '800' },
  section: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 },
  bio: { color: colors.text, fontSize: 15, lineHeight: 24, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  hotTag: { backgroundColor: colors.datingHeartSoft },
  tagText: { color: colors.text, fontWeight: '900' },
  hotTagText: { color: colors.datingHeart },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoCell: { width: '48%', minHeight: 62, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelSoft, padding: 10, justifyContent: 'center' },
  infoLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  infoValue: { marginTop: 5, color: colors.text, fontSize: 15, fontWeight: '900' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryItem: { width: '48%', minWidth: 0 },
  galleryImage: { width: '100%', aspectRatio: 0.76, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  galleryPlaceholder: { width: '100%', aspectRatio: 0.76, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', padding: 8 },
  galleryPlaceholderText: { color: colors.sub, fontWeight: '900', textAlign: 'center' },
  galleryLabel: { marginTop: 5, color: colors.sub, fontSize: 12, fontWeight: '900' },
  resultHero: { borderRadius: 12, backgroundColor: colors.text, padding: 16 },
  resultTitle: { color: colors.white, fontSize: 24, fontWeight: '900' },
  resultSub: { marginTop: 8, color: colors.panel, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  resultTimer: { marginTop: 10, color: colors.datingHeartSoft, fontWeight: '900' },
  resultCard: { minHeight: 116, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 10, flexDirection: 'row', gap: 10, marginBottom: 10 },
  resultCardSelected: { borderColor: colors.datingHeart, backgroundColor: colors.datingHeartSoft },
  resultCardMuted: { opacity: 0.7 },
  resultPhotoWrap: { width: 88, height: 96, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  resultPhoto: { width: '100%', height: '100%' },
  resultPhotoPlaceholder: { width: 88, height: 96, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  resultPhotoText: { color: colors.sub, fontSize: 28, fontWeight: '900' },
  resultInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
  resultLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, fontWeight: '900' },
  resultMeta: { marginTop: 5, color: colors.sub, fontWeight: '800' },
  resultSummary: { marginTop: 8, color: colors.text, lineHeight: 19, fontWeight: '700' },
  historyCard: { minHeight: 96, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelSoft, padding: 10, flexDirection: 'row', gap: 10, marginBottom: 10 },
  historyPhoto: { width: 72, height: 82, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  historyPhotoPlaceholder: { width: 72, height: 82, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  historyPhotoText: { color: colors.sub, fontSize: 28, fontWeight: '900' },
  historyBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  historyTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyName: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, fontWeight: '900' },
  historyStatus: { color: colors.datingHeart, fontSize: 12, fontWeight: '900' },
  historyMeta: { marginTop: 5, color: colors.sub, fontSize: 12, fontWeight: '800' },
  historySummary: { marginTop: 7, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  historyModalScreen: { flex: 1, backgroundColor: colors.bg },
  historyModalHeader: { minHeight: 86, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  historyModalTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  historyModalSub: { marginTop: 4, color: colors.sub, fontSize: 12, fontWeight: '800' },
  historyModalClose: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  historyModalCloseText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  historyModalBody: { flex: 1, minHeight: 0 },
  historyModalScroll: { flex: 1, minHeight: 0 },
  historyModalContent: { padding: 18, paddingBottom: 160 },
  historyDetailScroll: { flex: 1 },
  historyDetailContent: { padding: 18, paddingBottom: 160 },
  historyModalBlock: { marginBottom: 14 },
  historyHeroImageWrap: { height: 440 },
  historyResultPanel: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14 },
  historyResultKicker: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  historyResultTitle: { marginTop: 6, color: colors.datingHeart, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  historyResultText: { marginTop: 7, color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '800' },
  resultBadge: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  resultBadgeLike: { backgroundColor: colors.datingHeart },
  resultBadgePass: { backgroundColor: colors.surfaceAlt },
  resultBadgeText: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  resultBadgeLikeText: { color: colors.white },
  referenceHelp: { color: colors.sub, fontSize: 13, lineHeight: 19, fontWeight: '800', marginBottom: 10 },
  referenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  referenceItem: { width: '31%', minWidth: 92, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelSoft, padding: 6 },
  referenceItemSelected: { borderColor: colors.datingHeart, backgroundColor: colors.datingHeartSoft },
  referenceItemLocked: { opacity: 0.58 },
  referenceImage: { width: '100%', aspectRatio: 0.76, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  referenceCheck: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  referenceCheckSelected: { backgroundColor: colors.datingHeart, borderColor: colors.datingHeart },
  referenceCheckText: { color: colors.sub, fontSize: 14, lineHeight: 16, fontWeight: '900' },
  referenceCheckTextSelected: { color: colors.white },
  referenceLabel: { marginTop: 6, color: colors.text, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  referenceCount: { marginTop: 10, color: colors.sub, fontSize: 12, fontWeight: '900' },
  referenceCountReady: { color: colors.datingHeart },
  finalRequestButton: { minHeight: 66, borderRadius: 18, backgroundColor: colors.datingHeart, alignItems: 'center', justifyContent: 'center', padding: 12, shadowColor: colors.datingShadow, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  finalRequestText: { color: colors.white, fontSize: 18, fontWeight: '900' },
  finalRequestSub: { marginTop: 4, color: colors.datingHeartSoft, fontSize: 12, fontWeight: '900' },
  waitPanel: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 18, alignItems: 'center' },
  waitTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  waitText: { marginTop: 8, color: colors.sub, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  busyOverlay: { position: 'absolute', left: 18, right: 18, bottom: 22, minHeight: 56, borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  busyText: { color: colors.text, fontWeight: '900' },
  disabled: { opacity: 0.48 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  modalImageFrame: { width: '100%', height: '82%', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '100%' },
  modalPlaceholder: { minHeight: 220, width: '100%', borderRadius: 12, backgroundColor: colors.modalSurface, alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalPlaceholderText: { color: colors.white, textAlign: 'center', lineHeight: 20, fontWeight: '800' },
  modalLabel: { marginTop: 12, color: colors.white, fontWeight: '900', fontSize: 16 }
});
