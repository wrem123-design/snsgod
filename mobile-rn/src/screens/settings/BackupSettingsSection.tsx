import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BACKUP_PASSWORD_MIN_LENGTH } from '../../logic/backupEncryptionPolicy';
import { colors } from '../../theme';

export type BackupSettingsSectionProps = {
  visible: boolean;
  saving: boolean;
  encryptFullBackup: boolean;
  backupPassword: string;
  backupPasswordConfirm: string;
  restorePassword: string;
  importJson: string;
  onEncryptFullBackupChange: (value: boolean) => void;
  onBackupPasswordChange: (value: string) => void;
  onBackupPasswordConfirmChange: (value: string) => void;
  onRestorePasswordChange: (value: string) => void;
  onImportJsonChange: (value: string) => void;
  onExportFullBackup: () => void;
  onImportFullBackup: () => void;
  onImportBackupFile: () => void;
  onImportPastedBackup: () => void;
  onExportStateBackup: () => void;
};

/** Renders portable full-backup and state-only backup controls without owning persistence. */
export function BackupSettingsSection(props: BackupSettingsSectionProps) {
  if (!props.visible) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>백업</Text>
      <Text style={styles.label}>사진 포함 전체 백업</Text>
      <Text style={styles.help}>캐릭터·대화·설정과 앱이 관리하는 사진을 함께 저장합니다. 일반 ZIP은 호환성이 높고, 암호화 .sgbackup은 파일을 다른 곳에 보관할 때 내용을 보호합니다.</Text>
      <ToggleLine label="전체 백업 암호화" value={props.encryptFullBackup} onChange={props.onEncryptFullBackupChange} />
      {props.encryptFullBackup ? (
        <>
          <Text style={styles.label}>새 백업 암호</Text>
          <TextInput value={props.backupPassword} onChangeText={props.onBackupPasswordChange} style={styles.input} secureTextEntry autoCapitalize="none" accessibilityLabel="새 백업 암호" />
          <Text style={styles.label}>새 백업 암호 확인</Text>
          <TextInput value={props.backupPasswordConfirm} onChangeText={props.onBackupPasswordConfirmChange} style={styles.input} secureTextEntry autoCapitalize="none" accessibilityLabel="새 백업 암호 확인" />
          <Text style={styles.help}>{BACKUP_PASSWORD_MIN_LENGTH}자 이상으로 입력하세요. 암호는 기기·설정·로그에 저장하지 않으며 잊으면 백업을 복원할 수 없습니다.</Text>
        </>
      ) : null}
      <ActionButton label={props.encryptFullBackup ? '암호화 전체 백업 내보내기' : '사진 포함 전체 ZIP 내보내기'} onPress={props.onExportFullBackup} disabled={props.saving} />
      <Text style={styles.label}>암호화 백업 복원 암호</Text>
      <TextInput value={props.restorePassword} onChangeText={props.onRestorePasswordChange} style={styles.input} secureTextEntry autoCapitalize="none" accessibilityLabel="암호화 백업 복원 암호" placeholder="일반 ZIP은 비워 두세요" placeholderTextColor="#9a9387" />
      <ActionButton label="사진 포함 전체 백업 복원" onPress={props.onImportFullBackup} disabled={props.saving} />
      <Text style={styles.label}>상태만 JSON</Text>
      <Text style={styles.help}>사진 파일은 제외하고 캐릭터·대화·설정만 저장합니다. 기존 WebView의 msgod_state_v2.json 가져오기도 이 영역에서 지원합니다.</Text>
      <Text style={styles.label}>백업 JSON 붙여넣기</Text>
      <TextInput value={props.importJson} onChangeText={props.onImportJsonChange} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" autoCapitalize="none" />
      <ActionButton label="JSON 파일 선택 임포트" onPress={props.onImportBackupFile} disabled={props.saving} />
      <ActionButton label="붙여넣은 JSON 임포트" onPress={props.onImportPastedBackup} disabled={props.saving} />
      <Pressable onPress={props.onExportStateBackup} style={styles.secondary}><Text style={styles.secondaryText}>상태만 JSON 내보내기/공유</Text></Pressable>
    </View>
  );
}

function ToggleLine({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.switchLine}>
      <Text style={styles.switchLineText}>{label}</Text>
      <Text style={[styles.switchPill, value && styles.switchPillActive]}>{value ? '켬' : '끔'}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.secondary, disabled && styles.disabled]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 10, marginBottom: 6 },
  help: { color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, color: colors.text, backgroundColor: '#fffefa' },
  textarea: { minHeight: 128, paddingVertical: 10 },
  secondary: { marginTop: 12, height: 42, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  switchLine: { marginTop: 10, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#fffefa', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLineText: { color: colors.text, fontWeight: '900', flex: 1 },
  switchPill: { minWidth: 44, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, overflow: 'hidden', textAlign: 'center', color: colors.sub, backgroundColor: '#eee8dc', fontWeight: '900' },
  switchPillActive: { color: '#241a00', backgroundColor: colors.accent },
});
