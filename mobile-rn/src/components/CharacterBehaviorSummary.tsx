import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SNSGodCharacter, SNSGodState } from '../types';
import { resolveCharacterRuntimeState } from '../logic/characterWorld';
import { colors } from '../theme';

export function CharacterBehaviorSummary({ state, character, saved }: {
  state: SNSGodState;
  character: SNSGodCharacter;
  saved: boolean;
}) {
  const runtime = resolveCharacterRuntimeState(state, character);
  const initiative = Math.max(0, Math.min(100, Number(character.initiative ?? 40)));
  const dailyBudget = initiative >= 90 ? 4 : initiative >= 60 ? 3 : initiative >= 25 ? 2 : 1;
  const followUps = Math.min(2, Math.max(0, Number(character.proactivePatience ?? 1)));
  const warnings = settingsWarnings(state, character);
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>현재 적용 결과</Text>
        <Text style={[styles.badge, saved ? styles.saved : styles.unsaved]}>{saved ? '저장됨' : '저장되지 않은 변경'}</Text>
      </View>
      <Text style={styles.line}>지금 상태 · {runtime.currentActivity}</Text>
      <Text style={styles.line}>기분/에너지 · {runtime.mood} · {runtime.energy}/100</Text>
      <Text style={styles.line}>휴대폰 · {availabilityLabel(runtime.phoneAvailability)}</Text>
      <Text style={styles.line}>답장 · 약 {Number(character.responseDelayMin ?? 1)}초~{Number(character.responseDelayMax ?? 8)}초 안에 확인</Text>
      <Text style={styles.line}>먼저 연락 · 하루 최대 {dailyBudget}회, 답이 없으면 추가 {followUps}회까지만 단계적으로 이어감</Text>
      <Text style={styles.help}>채팅, 선톡, 상태 메시지, SNS와 이미지가 이 현재 상태와 약속·기억을 함께 사용합니다.</Text>
      {warnings.length ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>확인할 설정</Text>
          {warnings.map(item => <Text key={item} style={styles.warning}>• {item}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

function availabilityLabel(value: string) {
  if (value === 'available') return '비교적 편하게 확인 가능';
  if (value === 'brief') return '짧게 확인 가능';
  if (value === 'busy') return '일정 중이라 늦거나 짧게 답함';
  if (value === 'sleeping') return '자는 시간이라 먼저 연락하지 않음';
  return '휴대폰을 거의 보지 않음';
}

function settingsWarnings(state: SNSGodState, character: SNSGodCharacter): string[] {
  const warnings: string[] = [];
  if (!String(character.prompt || '').trim()) warnings.push('캐릭터 프롬프트가 비어 있어 개성이 약해질 수 있습니다.');
  if (character.proactiveEnabled !== false && state.config.privateFirst !== true) warnings.push('캐릭터의 먼저 말하기는 켜졌지만 전체 설정의 1:1 선톡이 꺼져 있습니다.');
  if ((character.profilePhotoAutoChange || character.coverPhotoAutoChange) && state.config.imageGeneration?.enabled !== true) warnings.push('사진 자동 변경은 켜졌지만 전체 이미지 생성 기능이 꺼져 있습니다.');
  if (Number(character.responseDelayMin || 0) > Number(character.responseDelayMax || 0)) warnings.push('가장 빠른 확인 시간이 가장 늦은 확인 시간보다 큽니다. 저장할 때 자동으로 정리됩니다.');
  if (character.lifeRhythm?.lateNightMood && character.lifeRhythm?.nightQuiet) warnings.push('밤 감성과 늦은 밤 조용함이 함께 켜져 있어, 늦은 밤에는 조용함이 먼저 적용됩니다.');
  return warnings;
}

const styles = StyleSheet.create({
  card: { gap: 7, borderWidth: 1, borderColor: '#b99845', borderRadius: 10, backgroundColor: '#fff8df', padding: 13, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 15 },
  badge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '900' },
  saved: { color: '#185f31', backgroundColor: '#dff3e4' },
  unsaved: { color: '#8a3c14', backgroundColor: '#ffe4c8' },
  line: { color: colors.text, fontSize: 13, lineHeight: 19 },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18, marginTop: 2 },
  warningBox: { gap: 4, borderTopWidth: 1, borderTopColor: '#e0c98d', paddingTop: 8, marginTop: 3 },
  warningTitle: { color: '#8a3c14', fontWeight: '900', fontSize: 12 },
  warning: { color: '#7a4a27', fontSize: 12, lineHeight: 17 }
});
