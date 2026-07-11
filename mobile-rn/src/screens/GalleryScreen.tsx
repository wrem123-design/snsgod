import React, { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SNSGodState } from '../types';
import { type MediaGarbageCollectionResult } from '../logic/media';
import {
  collectMediaAlbumAssets,
  filterMediaAlbumAssets,
  mediaAlbumFilterActive,
  type MediaAlbumAsset,
  type MediaAlbumFilter,
  type MediaAlbumSource,
  toggleMediaAlbumFavorite,
} from '../logic/mediaAlbum';
import {
  assignAlbumRepresentative,
  reconcileAlbumSelection,
  runAlbumDeviceSave,
  runAlbumShare,
  selectFilteredAlbumAssets,
  toggleAlbumSelection,
  type AlbumBatchResult,
  type AlbumRepresentativeTarget,
} from '../logic/mediaAlbumActions';
import { albumDeviceSaveAdapter, albumShareAdapter } from '../logic/mediaAlbumRuntime';

type DateRange = 'all' | 'today' | '7days' | '30days';

const ALBUM_TOKENS = {
  headerHeight: 72,
  badgeHeight: 26,
  emptyMinHeight: 220,
  detailInfoMaxHeight: 170,
  backGlyphSize: 34,
  backGlyphLineHeight: 36,
  selectionBarMinHeight: 52,
  selectionMarkerSize: 28,
  selectionBarGap: 12,
} as const;

const SOURCE_OPTIONS: Array<{ value: MediaAlbumSource; label: string }> = [
  { value: 'profile', label: '프로필' },
  { value: 'cover', label: '커버' },
  { value: 'profile_history', label: '프로필 기록' },
  { value: 'character_reference', label: '캐릭터 레퍼런스' },
  { value: 'chat', label: '채팅' },
  { value: 'sns', label: 'SNS' },
  { value: 'reference', label: '레퍼런스' },
  { value: 'meeting', label: '만남' },
  { value: 'blind_date', label: '발견' },
  { value: 'dating_app', label: '데이트 앱' },
];

function localDayStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function batchResultMessage(result: AlbumBatchResult): string {
  const summary = `성공 ${result.success}개 · 실패 ${result.failed}개 · 건너뜀 ${result.skipped}개`;
  if (result.permissionDenied) return `${summary}\n사진 저장 권한이 허용되지 않았습니다.`;
  if (result.unavailable) return `${summary}\n이 기기에서는 시스템 공유를 사용할 수 없습니다.`;
  const bundle = result.usedBundleFallback ? '\n여러 이미지는 ZIP 파일 하나로 묶어 공유했습니다.' : '';
  const error = result.errors[0] ? `\n첫 오류: ${result.errors[0]}` : '';
  return `${summary}${bundle}${error}`;
}

export function GalleryScreen({
  state,
  onBack,
  onChange,
  onCommitCurrent,
  onPreviewMediaCleanup,
  onTrashMediaCleanup,
}: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onCommitCurrent?: (patch: (current: SNSGodState) => SNSGodState) => unknown;
  onPreviewMediaCleanup: () => Promise<MediaGarbageCollectionResult>;
  onTrashMediaCleanup: () => Promise<MediaGarbageCollectionResult>;
}) {
  const assets = useMemo(() => collectMediaAlbumAssets(state), [
    state.characters,
    state.randomCharacters,
    state.randomChats,
    state.messages,
    state.snsPosts,
    state.referenceFaceSlots,
    state.meetingEventSessions,
    state.blindDate,
    state.datingApp,
    state.mediaAlbumFavoriteUris,
    state.chatRooms,
    state.groupRooms,
  ]);
  const [filter, setFilter] = useState<MediaAlbumFilter>({});
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [missingIds, setMissingIds] = useState<Set<string>>(() => new Set());
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState<'save' | 'share' | 'representative' | null>(null);
  const [representativeAsset, setRepresentativeAsset] = useState<MediaAlbumAsset | null>(null);
  const [representativeCharacterId, setRepresentativeCharacterId] = useState(state.characters[0]?.id || '');
  const [representativeTarget, setRepresentativeTarget] = useState<AlbumRepresentativeTarget>('profile');
  const longPressHandledRef = useRef(false);
  const selected = selectedId ? assets.find(asset => asset.id === selectedId) || null : null;
  const filteredItems = useMemo(() => filterMediaAlbumAssets(assets, filter), [assets, filter]);
  const availableSelectedIds = useMemo(
    () => reconcileAlbumSelection(selectedIds, assets.map(asset => asset.id)),
    [assets, selectedIds],
  );
  const selectedAssets = useMemo(() => {
    const ids = new Set(availableSelectedIds);
    return assets.filter(asset => ids.has(asset.id));
  }, [assets, availableSelectedIds]);
  const allFilteredSelected = Boolean(
    filteredItems.length && filteredItems.every(asset => availableSelectedIds.includes(asset.id)),
  );
  const characterOptions = useMemo(() => {
    const available = new Set(assets.flatMap(asset => asset.characterIds));
    return [
      ...state.characters,
      ...(state.randomCharacters || []),
      ...(state.randomChats || []).map(room => room.character),
    ].filter((character, index, list) => (
      available.has(character.id)
      && list.findIndex(item => item.id === character.id) === index
    ));
  }, [assets, state.characters, state.randomCharacters, state.randomChats]);
  const roomOptions = useMemo(() => {
    const available = new Set(assets.flatMap(asset => asset.roomIds));
    return [
      ...Object.values(state.chatRooms || {}).flat().map(room => ({ id: room.id, name: room.name })),
      ...(state.groupRooms || []).map(room => ({ id: room.id, name: room.name })),
      ...(state.randomChats || []).map(room => ({ id: room.id, name: room.name })),
    ].filter((room, index, list) => available.has(room.id) && list.findIndex(item => item.id === room.id) === index);
  }, [assets, state.chatRooms, state.groupRooms, state.randomChats]);

  function resetFilters() {
    setFilter({});
    setDateRange('all');
  }

  function chooseDateRange(next: DateRange) {
    setDateRange(next);
    if (next === 'all') {
      setFilter(current => ({ ...current, dateFrom: undefined, dateTo: undefined }));
      return;
    }
    const now = Date.now();
    const start = next === 'today'
      ? localDayStart(now)
      : now - (next === '7days' ? 7 : 30) * 24 * 60 * 60 * 1000;
    setFilter(current => ({ ...current, dateFrom: start, dateTo: now }));
  }

  async function toggleFavorite(asset: MediaAlbumAsset) {
    const patch = (current: SNSGodState) => toggleMediaAlbumFavorite(current, asset.uri, !asset.favorite);
    if (onCommitCurrent) await onCommitCurrent(patch);
    else await onChange(patch(state));
  }

  function markMissing(assetId: string) {
    setMissingIds(current => {
      if (current.has(assetId)) return current;
      const next = new Set(current);
      next.add(assetId);
      return next;
    });
  }

  function enterSelection(asset?: MediaAlbumAsset) {
    setSelectedId(null);
    setSelectionMode(true);
    if (asset) setSelectedIds(current => toggleAlbumSelection(current, asset.id));
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds([]);
    setRepresentativeAsset(null);
  }

  function toggleSelectedAsset(asset: MediaAlbumAsset) {
    setSelectedIds(current => toggleAlbumSelection(current, asset.id));
  }

  function pressAlbumAsset(asset: MediaAlbumAsset) {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    if (selectionMode) toggleSelectedAsset(asset);
    else setSelectedId(asset.id);
  }

  function toggleFilteredSelection() {
    setSelectedIds(current => selectFilteredAlbumAssets(
      current,
      filteredItems.map(asset => asset.id),
      !allFilteredSelected,
    ));
  }

  async function saveSelectedAssets() {
    if (!selectedAssets.length || actionBusy) return;
    setActionBusy('save');
    try {
      const result = await runAlbumDeviceSave(selectedAssets.map(asset => asset.uri), albumDeviceSaveAdapter);
      Alert.alert('기기 저장 결과', batchResultMessage(result));
    } catch (error) {
      Alert.alert('기기 저장 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  async function shareSelectedAssets() {
    if (!selectedAssets.length || actionBusy) return;
    setActionBusy('share');
    try {
      const result = await runAlbumShare(selectedAssets.map(asset => asset.uri), albumShareAdapter);
      Alert.alert('공유 결과', batchResultMessage(result));
    } catch (error) {
      Alert.alert('공유 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  function openRepresentativeAssignment() {
    if (selectedAssets.length !== 1) {
      Alert.alert('대표 이미지', '대표 이미지로 지정할 사진 한 장만 선택해 주세요.');
      return;
    }
    if (!state.characters.length) {
      Alert.alert('대표 이미지', '이미지를 지정할 캐릭터가 없습니다.');
      return;
    }
    setRepresentativeCharacterId(current => state.characters.some(character => character.id === current)
      ? current
      : state.characters[0].id);
    setRepresentativeTarget('profile');
    setRepresentativeAsset(selectedAssets[0]);
  }

  async function confirmRepresentativeAssignment() {
    if (!representativeAsset || !representativeCharacterId || actionBusy) return;
    setActionBusy('representative');
    try {
      const patch = (current: SNSGodState) => assignAlbumRepresentative(current, {
        characterId: representativeCharacterId,
        uri: representativeAsset.uri,
        target: representativeTarget,
        prompt: representativeAsset.prompt,
      }).state;
      if (onCommitCurrent) await onCommitCurrent(patch);
      else await onChange(patch(state));
      setRepresentativeAsset(null);
      Alert.alert('대표 이미지 지정 완료', '선택한 사진을 캐릭터에 적용했습니다. 기존 프로필·커버 기록과 레퍼런스는 정책에 따라 보존됩니다.');
    } catch (error) {
      Alert.alert('대표 이미지 지정 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  async function moveUnusedMediaToTrash() {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    try {
      const preview = await onPreviewMediaCleanup();
      const count = preview.candidateEntries.length;
      if (!count) {
        Alert.alert('미디어 정리', '정리할 미사용 파일이 없습니다.');
        return;
      }
      const sizeText = preview.totalCandidateBytes > 0
        ? ` · 약 ${(preview.totalCandidateBytes / 1024 / 1024).toFixed(1)}MB`
        : '';
      Alert.alert(
        '미사용 파일 정리',
        `${count}개${sizeText}를 앱 휴지통으로 옮길까요?\n\n공유 중인 파일은 유지되며, 다른 폴더의 파일은 건드리지 않습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '휴지통으로 이동',
            style: 'destructive',
            onPress: () => {
              setCleanupBusy(true);
              void onTrashMediaCleanup()
                .then(result => {
                  Alert.alert(
                    '정리 완료',
                    `${result.trashedEntries.length}개 파일을 휴지통으로 옮겼습니다.${result.missingCandidateEntries.length ? `\n이미 없던 기록 ${result.missingCandidateEntries.length}개도 정리했습니다.` : ''}`,
                  );
                })
                .catch(error => {
                  Alert.alert('미디어 정리 실패', error instanceof Error ? error.message : String(error));
                })
                .finally(() => setCleanupBusy(false));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('미디어 검사 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  }

  const emptyText = assets.length
    ? '이 조건에 맞는 이미지가 없습니다.'
    : '아직 앨범에 저장된 이미지가 없습니다.';
  const representativeCharacter = state.characters.find(character => character.id === representativeCharacterId);
  const representativeImpact = representativeTarget === 'profile'
    ? `현재 프로필을 교체하고 이전 값은 프로필 기록에 보관합니다.${representativeCharacter?.avatar || representativeCharacter?.profileImage ? ' 기존 프로필이 있습니다.' : ''}`
    : representativeTarget === 'cover'
      ? `현재 커버를 교체하고 이전 값은 커버 기록에 보관합니다.${representativeCharacter?.coverImage ? ' 기존 커버가 있습니다.' : ''}`
      : `이 사진을 첫 번째 레퍼런스로 지정합니다. 기존 레퍼런스는 중복을 빼고 최대 2장 더 유지합니다.${representativeCharacter?.profileReferenceImage ? ' 현재 대표 레퍼런스가 있습니다.' : ''}`;

  return (
    <View style={styles.screen}>
      {selected ? (
        <View style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleBlock}>
              <Text style={styles.viewerTitle}>{selected.title}</Text>
              <Text style={styles.viewerSubtitle}>{selected.sourceLabel} · 사용처 {selected.references.length}개</Text>
            </View>
            <Pressable
              accessibilityLabel={selected.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              onPress={() => { void toggleFavorite(selected); }}
              style={[styles.viewerFavorite, selected.favorite && styles.viewerFavoriteActive]}
            >
              <Text style={[styles.viewerFavoriteText, selected.favorite && styles.viewerFavoriteTextActive]}>{selected.favorite ? '즐겨찾기 해제' : '즐겨찾기'}</Text>
            </Pressable>
            <Pressable accessibilityLabel="이미지 상세 닫기" onPress={() => setSelectedId(null)} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
          </View>
          <View style={styles.viewerImageWrap}>
            <Image source={{ uri: selected.uri }} onError={() => markMissing(selected.id)} style={styles.viewerImage} resizeMode="contain" />
            {missingIds.has(selected.id) ? <View style={styles.missingOverlay}><Text style={styles.missingText}>원본 파일을 찾을 수 없습니다.</Text></View> : null}
          </View>
          <ScrollView style={styles.promptPanel} contentContainerStyle={styles.promptPanelContent}>
            <Text style={styles.promptLabel}>정보</Text>
            <Text style={styles.viewerPrompt}>{selected.prompt || '프롬프트 정보가 없는 직접 추가 이미지입니다.'}</Text>
            {selected.caption ? <Text style={styles.viewerCaption}>{selected.caption}</Text> : null}
            <Text style={styles.referenceSummary}>{selected.references.map(reference => reference.sourceLabel).join(' · ')}</Text>
          </ScrollView>
        </View>
      ) : null}

      {representativeAsset ? (
        <View accessibilityViewIsModal style={styles.representativeModal}>
          <ScrollView style={styles.representativeCard} contentContainerStyle={styles.representativeCardContent}>
            <Text style={styles.representativeTitle}>대표 이미지 지정</Text>
            <Text style={styles.representativeSubtitle}>사진 한 장을 적용할 캐릭터와 위치를 확인해 주세요.</Text>
            <Image source={{ uri: representativeAsset.uri }} style={styles.representativePreview} resizeMode="cover" />
            <Text style={styles.representativeLabel}>캐릭터</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.representativeOptions}>
              {state.characters.map(character => (
                <FilterChip
                  key={character.id}
                  label={character.name}
                  active={representativeCharacterId === character.id}
                  onPress={() => setRepresentativeCharacterId(character.id)}
                />
              ))}
            </ScrollView>
            <Text style={styles.representativeLabel}>적용 위치</Text>
            <View style={styles.representativeOptions}>
              <FilterChip label="프로필" active={representativeTarget === 'profile'} onPress={() => setRepresentativeTarget('profile')} />
              <FilterChip label="커버" active={representativeTarget === 'cover'} onPress={() => setRepresentativeTarget('cover')} />
              <FilterChip label="레퍼런스" active={representativeTarget === 'reference'} onPress={() => setRepresentativeTarget('reference')} />
            </View>
            <Text style={styles.representativeImpact}>{representativeImpact}</Text>
            <View style={styles.representativeActions}>
              <Pressable disabled={Boolean(actionBusy)} onPress={() => setRepresentativeAsset(null)} style={[styles.modalAction, styles.modalCancel, actionBusy && styles.disabled]}>
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable disabled={Boolean(actionBusy)} onPress={() => { void confirmRepresentativeAssignment(); }} style={[styles.modalAction, styles.modalConfirm, actionBusy && styles.disabled]}>
                <Text style={styles.modalConfirmText}>{actionBusy === 'representative' ? '적용 중' : '확인 후 적용'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.header}>
        <Pressable accessibilityLabel={selectionMode ? '선택 모드 종료' : '뒤로'} onPress={selectionMode ? exitSelection : onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{selectionMode ? `${selectedAssets.length}개 선택` : '앨범'}</Text>
          <Text style={styles.subtitle}>{selectionMode ? `현재 조건 ${filteredItems.length}개` : `${filteredItems.length}개 / 전체 ${assets.length}개`}</Text>
        </View>
        {selectionMode ? (
          <Pressable disabled={!filteredItems.length} onPress={toggleFilteredSelection} style={[styles.headerAction, !filteredItems.length && styles.disabled]}>
            <Text style={styles.headerActionText}>{allFilteredSelected ? '선택 해제' : '전체 선택'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={!assets.length} onPress={() => enterSelection()} style={[styles.headerAction, !assets.length && styles.disabled]}>
            <Text style={styles.headerActionText}>선택</Text>
          </Pressable>
        )}
        <Pressable
          disabled={selectionMode ? false : cleanupBusy}
          onPress={selectionMode ? exitSelection : () => { void moveUnusedMediaToTrash(); }}
          style={({ pressed }) => [styles.cleanupButton, pressed && styles.pressed, !selectionMode && cleanupBusy && styles.disabled]}
        >
          <Text style={styles.cleanupButtonText}>{selectionMode ? '완료' : cleanupBusy ? '검사 중' : '미사용 정리'}</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <FilterChip label="전체" active={!mediaAlbumFilterActive(filter)} onPress={resetFilters} />
          <FilterChip label="즐겨찾기" active={filter.favoriteOnly === true} onPress={() => setFilter(current => ({ ...current, favoriteOnly: current.favoriteOnly ? undefined : true }))} />
          <FilterChip label="생성" active={filter.origin === 'generated'} onPress={() => setFilter(current => ({ ...current, origin: current.origin === 'generated' ? undefined : 'generated' }))} />
          <FilterChip label="직접 추가" active={filter.origin === 'manual'} onPress={() => setFilter(current => ({ ...current, origin: current.origin === 'manual' ? undefined : 'manual' }))} />
          <FilterChip label="오늘" active={dateRange === 'today'} onPress={() => chooseDateRange(dateRange === 'today' ? 'all' : 'today')} />
          <FilterChip label="7일" active={dateRange === '7days'} onPress={() => chooseDateRange(dateRange === '7days' ? 'all' : '7days')} />
          <FilterChip label="30일" active={dateRange === '30days'} onPress={() => chooseDateRange(dateRange === '30days' ? 'all' : '30days')} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {SOURCE_OPTIONS.map(option => <FilterChip key={option.value} label={option.label} active={filter.source === option.value} onPress={() => setFilter(current => ({ ...current, source: current.source === option.value ? undefined : option.value }))} />)}
        </ScrollView>
        {characterOptions.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {characterOptions.map(character => <FilterChip key={character.id} label={character.name} active={filter.characterId === character.id} onPress={() => setFilter(current => ({ ...current, characterId: current.characterId === character.id ? undefined : character.id }))} />)}
          </ScrollView>
        ) : null}
        {roomOptions.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {roomOptions.map(room => <FilterChip key={room.id} label={room.name} active={filter.roomId === room.id} onPress={() => setFilter(current => ({ ...current, roomId: current.roomId === room.id ? undefined : room.id }))} />)}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        numColumns={3}
        style={styles.list}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={filteredItems.length ? styles.row : undefined}
        ListEmptyComponent={(
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>{emptyText}</Text>
            {assets.length ? <Pressable onPress={resetFilters} style={styles.emptyReset}><Text style={styles.emptyResetText}>필터 초기화</Text></Pressable> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`${item.title}, ${item.sourceLabel}${item.favorite ? ', 즐겨찾기' : ''}${availableSelectedIds.includes(item.id) ? ', 선택됨' : ''}`}
            accessibilityState={{ selected: availableSelectedIds.includes(item.id) }}
            onPressIn={() => { longPressHandledRef.current = false; }}
            onPress={() => pressAlbumAsset(item)}
            onLongPress={() => { longPressHandledRef.current = true; enterSelection(item); }}
            style={[styles.albumTile, availableSelectedIds.includes(item.id) && styles.albumTileSelected]}
          >
            <Image source={{ uri: item.uri }} onError={() => markMissing(item.id)} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {missingIds.has(item.id) ? <View style={styles.tileMissing}><Text style={styles.tileMissingText}>파일 없음</Text></View> : null}
            {item.favorite ? <View style={styles.favoriteBadge}><Text style={styles.favoriteBadgeText}>즐겨찾기</Text></View> : null}
            {selectionMode ? (
              <View style={[styles.selectionMarker, availableSelectedIds.includes(item.id) && styles.selectionMarkerActive]}>
                <Text style={[styles.selectionMarkerText, availableSelectedIds.includes(item.id) && styles.selectionMarkerTextActive]}>{availableSelectedIds.includes(item.id) ? '✓' : ''}</Text>
              </View>
            ) : null}
            <View style={styles.tileShade}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.itemSubtitle} numberOfLines={1}>{item.sourceLabel}{item.references.length > 1 ? ` · 사용처 ${item.references.length}` : ''}</Text>
            </View>
          </Pressable>
        )}
      />
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedAssets.length}개</Text>
          <Pressable disabled={!selectedAssets.length || Boolean(actionBusy)} onPress={() => { void saveSelectedAssets(); }} style={[styles.selectionAction, (!selectedAssets.length || actionBusy) && styles.disabled]}>
            <Text style={styles.selectionActionText}>{actionBusy === 'save' ? '저장 중' : '기기에 저장'}</Text>
          </Pressable>
          <Pressable disabled={!selectedAssets.length || Boolean(actionBusy)} onPress={() => { void shareSelectedAssets(); }} style={[styles.selectionAction, (!selectedAssets.length || actionBusy) && styles.disabled]}>
            <Text style={styles.selectionActionText}>{actionBusy === 'share' ? '공유 중' : '공유'}</Text>
          </Pressable>
          <Pressable disabled={selectedAssets.length !== 1 || Boolean(actionBusy)} onPress={openRepresentativeAssignment} style={[styles.selectionAction, (selectedAssets.length !== 1 || actionBusy) && styles.disabled]}>
            <Text style={styles.selectionActionText}>대표 이미지</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: ALBUM_TOKENS.headerHeight, paddingTop: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceAlt },
  backText: { fontSize: ALBUM_TOKENS.backGlyphSize, lineHeight: ALBUM_TOKENS.backGlyphLineHeight, color: colors.text },
  titleBlock: { flex: 1 },
  title: { fontSize: 19, color: colors.text, fontWeight: '900' },
  subtitle: { marginTop: 2, color: colors.sub, fontSize: 12, fontWeight: '700' },
  headerAction: { minHeight: 42, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  headerActionText: { color: colors.accentText, fontSize: 11, fontWeight: '900' },
  cleanupButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cleanupButtonText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
  filters: { paddingVertical: 8, gap: 8, backgroundColor: colors.panelSoft, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterRow: { paddingHorizontal: 12, gap: 8 },
  filterChip: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  filterChipTextActive: { color: colors.accentText },
  list: { flex: 1 },
  grid: { flexGrow: 1, padding: 12, paddingBottom: 26, gap: 8 },
  row: { gap: 8 },
  albumTile: { flex: 1, aspectRatio: 1, marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  albumTileSelected: { borderWidth: 3, borderColor: colors.accent },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: colors.modalSurface },
  itemTitle: { color: colors.white, fontSize: 11, fontWeight: '900' },
  itemSubtitle: { marginTop: 1, color: colors.white, fontSize: 9, fontWeight: '800' },
  favoriteBadge: { position: 'absolute', top: 8, left: 8, minHeight: ALBUM_TOKENS.badgeHeight, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  favoriteBadgeText: { color: colors.accentText, fontSize: 9, fontWeight: '900' },
  selectionMarker: { position: 'absolute', top: 8, right: 8, width: ALBUM_TOKENS.selectionMarkerSize, height: ALBUM_TOKENS.selectionMarkerSize, borderRadius: 14, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.modalSurface, alignItems: 'center', justifyContent: 'center' },
  selectionMarkerActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectionMarkerText: { color: colors.white, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  selectionMarkerTextActive: { color: colors.accentText },
  tileMissing: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  tileMissingText: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  emptyWrap: { flex: 1, minHeight: ALBUM_TOKENS.emptyMinHeight, alignItems: 'center', justifyContent: 'center', gap: 8 },
  empty: { textAlign: 'center', color: colors.sub, fontWeight: '800' },
  emptyReset: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  emptyResetText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  selectionBar: { minHeight: ALBUM_TOKENS.selectionBarMinHeight, paddingHorizontal: 12, paddingVertical: 8, gap: ALBUM_TOKENS.selectionBarGap, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  selectionCount: { minWidth: 28, color: colors.text, fontSize: 12, fontWeight: '900' },
  selectionAction: { flex: 1, minHeight: 42, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  selectionActionText: { color: colors.text, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  viewer: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: colors.modalSurface, padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerTitleBlock: { flex: 1 },
  viewerTitle: { color: colors.white, fontSize: 17, fontWeight: '900' },
  viewerSubtitle: { marginTop: 2, color: colors.white, fontSize: 11, fontWeight: '800' },
  viewerFavorite: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  viewerFavoriteActive: { backgroundColor: colors.accent },
  viewerFavoriteText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  viewerFavoriteTextActive: { color: colors.accentText },
  viewerClose: { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  viewerImageWrap: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.text },
  viewerImage: { width: '100%', height: '100%' },
  missingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  missingText: { color: colors.sub, fontWeight: '900' },
  promptPanel: { marginTop: 8, maxHeight: ALBUM_TOKENS.detailInfoMaxHeight, borderRadius: 8, backgroundColor: colors.panel },
  promptPanelContent: { padding: 12 },
  promptLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  viewerPrompt: { marginTop: 8, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  viewerCaption: { marginTop: 8, color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  referenceSummary: { marginTop: 8, color: colors.sub, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  representativeModal: { ...StyleSheet.absoluteFillObject, zIndex: 20, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.modalSurface },
  representativeCard: { width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  representativeCardContent: { padding: 16 },
  representativeTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  representativeSubtitle: { marginTop: 4, color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  representativePreview: { width: 112, height: 112, marginTop: 12, borderRadius: 12, alignSelf: 'center', backgroundColor: colors.surfaceAlt },
  representativeLabel: { marginTop: 12, marginBottom: 6, color: colors.sub, fontSize: 11, fontWeight: '900' },
  representativeOptions: { flexDirection: 'row', gap: 8 },
  representativeImpact: { marginTop: 12, padding: 12, borderRadius: 8, color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700', backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.border },
  representativeActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  modalAction: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalCancel: { backgroundColor: colors.surfaceAlt },
  modalConfirm: { backgroundColor: colors.accent },
  modalCancelText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  modalConfirmText: { color: colors.accentText, fontSize: 12, fontWeight: '900' },
});
