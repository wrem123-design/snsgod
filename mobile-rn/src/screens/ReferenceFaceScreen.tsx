import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { makeId } from '../logic/ids';
import { isRenderableMediaUri, pickPersistentReferenceImageUris } from '../logic/media';
import { ReferenceFaceSlot, SNSGodState } from '../types';

const MAX_REFERENCE_SLOTS = 50;

export function ReferenceFaceScreen({ state, onBack, onChange }: {
  state: SNSGodState;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const slots = (state.referenceFaceSlots || []).slice(0, MAX_REFERENCE_SLOTS);
  const savedReferenceChance = referenceChancePercent(state);
  const [viewerSlotId, setViewerSlotId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chanceText, setChanceText] = useState(String(savedReferenceChance));
  const viewerSlot = viewerSlotId ? slots.find(slot => slot.id === viewerSlotId) : undefined;
  const draftReferenceChance = clampPercent(Number(chanceText));

  async function saveChance() {
    if (saving) return;
    setSaving(true);
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          imageGeneration: {
            ...(state.config.imageGeneration || {}),
            referenceFaceChancePercent: draftReferenceChance
          }
        }
      });
      setChanceText(String(draftReferenceChance));
    } finally {
      setSaving(false);
    }
  }

  async function addSlot() {
    if (saving) return;
    if (slots.length >= MAX_REFERENCE_SLOTS) {
      Alert.alert('슬롯 가득 참', '레퍼런스 얼굴은 최대 50장까지 등록할 수 있습니다.');
      return;
    }
    const emptyCount = MAX_REFERENCE_SLOTS - slots.length;
    const images = await pickPersistentReferenceImageUris(emptyCount);
    if (!images?.length) return;
    if (images.length > emptyCount) {
      Alert.alert('슬롯 부족', `빈 슬롯은 ${emptyCount}개입니다. ${emptyCount}장 이하로 선택해주세요.`);
      return;
    }
    const createdAt = Date.now();
    const nextSlots: ReferenceFaceSlot[] = images.map((image, index) => ({
      id: makeId('refface'),
      image,
      name: `레퍼런스 ${slots.length + index + 1}`,
      createdAt
    }));
    setSaving(true);
    try {
      await onChange({ ...state, referenceFaceSlots: [...slots, ...nextSlots].slice(0, MAX_REFERENCE_SLOTS) });
    } finally {
      setSaving(false);
    }
  }

  async function replaceSlot(slotId: string) {
    if (saving) return;
    const images = await pickPersistentReferenceImageUris(1);
    const image = images?.[0];
    if (!image) return;
    setSaving(true);
    try {
      await onChange({
        ...state,
        referenceFaceSlots: slots.map(slot => slot.id === slotId ? { ...slot, image, createdAt: Date.now() } : slot)
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(slotId: string) {
    if (saving) return;
    if (viewerSlotId === slotId) setViewerSlotId(null);
    setSaving(true);
    try {
      await onChange({ ...state, referenceFaceSlots: slots.filter(slot => slot.id !== slotId) });
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(slotId: string) {
    Alert.alert('레퍼런스 삭제', '이 얼굴 레퍼런스를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void removeSlot(slotId) }
    ]);
  }

  const emptyCount = Math.max(0, MAX_REFERENCE_SLOTS - slots.length);
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>레퍼런스</Text>
          <Text style={styles.subtitle}>AI 가상 여성 생성 때 일부 후보가 얼굴만 무작위로 참조합니다.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{slots.length}/{MAX_REFERENCE_SLOTS} 슬롯 사용 중</Text>
          <Text style={styles.infoText}>블라인드 데이트와 이상형 후보 생성 시 약 {draftReferenceChance}% 확률로 등록된 사진 중 1장을 골라 얼굴만 참조합니다. 나머지 {100 - draftReferenceChance}%는 텍스트 프롬프트만으로 새 얼굴을 만듭니다.</Text>
          <View style={styles.chanceRow}>
            <View style={styles.chanceInputWrap}>
              <Text style={styles.chanceLabel}>레퍼런스 사용 확률</Text>
              <TextInput
                value={chanceText}
                onChangeText={setChanceText}
                keyboardType="number-pad"
                maxLength={3}
                style={styles.chanceInput}
                placeholder="70"
                placeholderTextColor="rgba(255,255,255,0.38)"
              />
            </View>
            <Text style={styles.percentText}>%</Text>
            <Pressable onPress={saveChance} disabled={saving} style={[styles.chanceSaveButton, saving && styles.disabled]}>
              <Text style={styles.chanceSaveText}>저장</Text>
            </Pressable>
          </View>
          <Pressable onPress={addSlot} style={[styles.addButton, (slots.length >= MAX_REFERENCE_SLOTS || saving) && styles.disabled]} disabled={slots.length >= MAX_REFERENCE_SLOTS || saving}>
            <Text style={styles.addButtonText}>{saving ? '저장 중...' : '사진 추가'}</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {slots.map((slot, index) => (
            <View key={slot.id} style={styles.slot}>
              <Text style={styles.slotNo}>{index + 1}</Text>
              {isRenderableMediaUri(slot.image) ? (
                <Pressable onPress={() => setViewerSlotId(slot.id)} style={styles.imageButton}>
                  <Image source={{ uri: slot.image }} style={styles.image} />
                </Pressable>
              ) : (
                <View style={styles.emptyImage}><Text style={styles.emptyText}>사진 없음</Text></View>
              )}
              <View style={styles.actions}>
                <Pressable onPress={() => replaceSlot(slot.id)} disabled={saving} style={[styles.slotButton, saving && styles.disabled]}><Text style={styles.slotButtonText}>교체</Text></Pressable>
                <Pressable onPress={() => confirmRemove(slot.id)} disabled={saving} style={[styles.slotButton, styles.deleteButton, saving && styles.disabled]}><Text style={styles.deleteText}>삭제</Text></Pressable>
              </View>
            </View>
          ))}
          {Array.from({ length: emptyCount }).map((_, index) => (
            <Pressable key={`empty-${index}`} onPress={addSlot} disabled={saving} style={[styles.slot, styles.emptySlot, saving && styles.disabled]}>
              <Text style={styles.slotNo}>{slots.length + index + 1}</Text>
              <Text style={styles.emptyPlus}>+</Text>
              <Text style={styles.emptySlotText}>{saving ? '저장 중' : '비어 있음'}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {viewerSlot ? (
        <ReferenceViewer
          slot={viewerSlot}
          index={slots.findIndex(slot => slot.id === viewerSlot.id)}
          onClose={() => setViewerSlotId(null)}
          onReplace={() => void replaceSlot(viewerSlot.id)}
          onDelete={() => confirmRemove(viewerSlot.id)}
        />
      ) : null}
    </View>
  );
}

function referenceChancePercent(state: SNSGodState): number {
  return clampPercent(Number(state.config.imageGeneration?.referenceFaceChancePercent));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 70));
}

function ReferenceViewer({ slot, index, onClose, onReplace, onDelete }: {
  slot: ReferenceFaceSlot;
  index: number;
  onClose: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.viewer}>
      <View style={styles.viewerHeader}>
        <View style={styles.viewerTitleBlock}>
          <Text style={styles.viewerTitle}>레퍼런스 {index + 1}</Text>
          <Text style={styles.viewerSubtitle}>{new Date(slot.createdAt).toLocaleString()}</Text>
        </View>
        <Pressable onPress={onReplace} style={styles.viewerEdit}><Text style={styles.viewerEditText}>교체</Text></Pressable>
        <Pressable onPress={onDelete} style={styles.viewerDelete}><Text style={styles.viewerDeleteText}>삭제</Text></Pressable>
        <Pressable onPress={onClose} style={styles.viewerClose}><Text style={styles.viewerCloseText}>닫기</Text></Pressable>
      </View>
      <Image source={{ uri: slot.image }} style={styles.viewerImage} resizeMode="contain" />
      <View style={styles.viewerInfo}>
        <Text style={styles.viewerInfoText}>이 사진은 AI 가상 캐릭터 생성 시 얼굴 참조로만 쓰입니다.</Text>
      </View>
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
  subtitle: { marginTop: 4, color: colors.sub, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 110, gap: 14 },
  infoCard: { padding: 14, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#111', gap: 10 },
  infoTitle: { color: '#fffefa', fontSize: 18, fontWeight: '900' },
  infoText: { color: '#d8d8d8', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  chanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chanceInputWrap: { flex: 1, minWidth: 0 },
  chanceLabel: { marginBottom: 6, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '900' },
  chanceInput: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, color: '#fffefa', fontSize: 18, fontWeight: '900' },
  percentText: { minHeight: 44, color: '#fffefa', fontSize: 18, fontWeight: '900', textAlignVertical: 'center' },
  chanceSaveButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  chanceSaveText: { color: '#111', fontSize: 14, fontWeight: '900' },
  addButton: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  addButtonText: { color: '#241a00', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31%', minHeight: 132, padding: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', gap: 5 },
  slotNo: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  imageButton: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#eee8dc' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#eee8dc' },
  emptyImage: { width: '100%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.sub, fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 5 },
  slotButton: { flex: 1, minHeight: 28, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f7f2e9', alignItems: 'center', justifyContent: 'center' },
  slotButtonText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  deleteButton: { borderColor: '#f0b7b7', backgroundColor: '#fff1f1' },
  deleteText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  emptySlot: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f2e9', borderStyle: 'dashed' },
  emptyPlus: { color: colors.text, fontSize: 34, lineHeight: 36, fontWeight: '900' },
  emptySlotText: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  viewer: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: '#101214', padding: 12 },
  viewerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerTitleBlock: { flex: 1, minWidth: 0 },
  viewerTitle: { color: '#fffefa', fontSize: 17, fontWeight: '900' },
  viewerSubtitle: { marginTop: 2, color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800' },
  viewerEdit: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#f3dd72', justifyContent: 'center' },
  viewerEditText: { color: '#241a00', fontWeight: '900' },
  viewerDelete: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#f0b7b7', justifyContent: 'center' },
  viewerDeleteText: { color: colors.danger, fontWeight: '900' },
  viewerClose: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center' },
  viewerCloseText: { color: '#111', fontWeight: '900' },
  viewerImage: { width: '100%', flex: 1, borderRadius: 8, backgroundColor: '#050607' },
  viewerInfo: { marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  viewerInfoText: { color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' }
});
