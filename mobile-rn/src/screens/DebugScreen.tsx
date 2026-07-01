import React, { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, NativeModules, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clearDebugLogs, DebugLogEntry, readDebugLogs } from '../logic/debugLog';
import { colors } from '../theme';

const TermuxBridge = NativeModules.TermuxBridge as undefined | {
  copyText: (text: string) => Promise<string>;
};

export function DebugScreen({ onBack, onReloadState, onReloadBundle }: {
  onBack: () => void;
  onReloadState: () => Promise<void> | void;
  onReloadBundle: () => Promise<void> | void;
}) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [status, setStatus] = useState('');
  const [hideRoutineLogs, setHideRoutineLogs] = useState(true);
  const visibleLogs = hideRoutineLogs ? logs.filter(isImportantLog) : logs;
  const hiddenCount = logs.length - visibleLogs.length;

  async function refresh() {
    setLogs(await readDebugLogs());
  }

  async function clear() {
    await clearDebugLogs();
    setLogs([]);
    setStatus('디버그 로그를 비웠습니다.');
  }

  async function exportLogs() {
    try {
      const currentLogs = await readDebugLogs();
      setLogs(currentLogs);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `snsgod-debug-${timestamp}.json`;
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}${fileName}`;
      const payload = JSON.stringify({
        exportedAt: Date.now(),
        count: currentLogs.length,
        logs: currentLogs
      }, null, 2);
      await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
      setStatus(`최근 디버그 로그 파일을 만들었습니다: ${fileName}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'SNSGod 디버그 로그 공유' });
      }
    } catch (error) {
      setStatus(`디버그 로그 내보내기 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function reloadState() {
    try {
      await onReloadState();
      setStatus('저장 데이터를 다시 읽었습니다.');
      await refresh();
    } catch (error) {
      setStatus(`저장 데이터 다시 읽기 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function reloadBundle() {
    try {
      setStatus('JS 번들 재로드를 요청했습니다...');
      await onReloadBundle();
      setStatus('JS 번들과 저장 데이터를 다시 불러왔습니다.');
      await refresh();
    } catch (error) {
      setStatus(`JS 번들 재로드 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function copyLog(entry: DebugLogEntry) {
    try {
      if (!TermuxBridge) throw new Error('clipboard bridge is not ready');
      await TermuxBridge.copyText(formatLogForCopy(entry));
      setStatus('로그를 복사했습니다.');
    } catch (error) {
      Alert.alert('로그 복사 실패', error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>디버그</Text>
          <Text style={styles.subtitle}>로그 / 앱 상태 재로드</Text>
        </View>
        <Pressable onPress={() => setHideRoutineLogs(value => !value)} style={[styles.filterToggle, hideRoutineLogs && styles.filterToggleOn]}>
          <Text style={[styles.filterCheck, hideRoutineLogs && styles.filterCheckOn]}>{hideRoutineLogs ? '✓' : ''}</Text>
          <Text style={[styles.filterText, hideRoutineLogs && styles.filterTextOn]}>일상 숨김</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={refresh} style={styles.button}><Text style={styles.buttonText}>새로고침</Text></Pressable>
          <Pressable onPress={exportLogs} style={styles.button}><Text style={styles.buttonText}>최근 로그 내보내기/공유</Text></Pressable>
          <Pressable onPress={reloadState} style={styles.button}><Text style={styles.buttonText}>저장 데이터 다시 읽기</Text></Pressable>
          <Pressable onPress={reloadBundle} style={styles.button}><Text style={styles.buttonText}>JS 번들 재로드</Text></Pressable>
          <Pressable onPress={clear} style={styles.danger}><Text style={styles.dangerText}>로그 삭제</Text></Pressable>
        </View>
        <Text style={styles.help}>개발 중 화면이 바뀌지 않으면 APK 재설치 또는 JS 번들 재로드가 필요할 수 있습니다. 릴리즈 앱에서는 코드 변경 반영을 위해 새 APK 설치가 필요합니다.</Text>
        {hideRoutineLogs && hiddenCount > 0 ? <Text style={styles.filterNotice}>일상 로그 {hiddenCount}개를 숨겼습니다.</Text> : null}
        <View style={styles.logList}>
          {visibleLogs.length ? visibleLogs.map(item => <LogRow key={item.id} entry={item} onLongPress={() => copyLog(item)} />) : <Text style={styles.empty}>{logs.length ? '표시할 중요 로그가 없습니다.' : '아직 로그가 없습니다.'}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const ROUTINE_INFO_SCOPES = new Set([
  'navigation',
  'app',
  'storage',
  'reply.queue',
  'reply.recover',
  'llm.request',
  'llm.response',
  'llm-text.request',
  'llm-text.response',
  'sns.auto'
]);

function isImportantLog(entry: DebugLogEntry): boolean {
  if (entry.level === 'warn' || entry.level === 'error') return true;
  if (ROUTINE_INFO_SCOPES.has(entry.scope)) return false;
  if (entry.scope.includes('request') || entry.scope.includes('response')) return false;
  return /fail|failed|error|blocked|retry|softened|empty|인증|실패|오류/i.test(`${entry.scope}\n${entry.message}`);
}

function formatLogForCopy(entry: DebugLogEntry): string {
  return [
    `[${entry.level.toUpperCase()}] ${entry.scope}`,
    new Date(entry.createdAt).toLocaleString(),
    entry.message
  ].join('\n');
}

function LogRow({ entry, onLongPress }: { entry: DebugLogEntry; onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.logRow}>
      <View style={styles.logHead}>
        <Text style={[styles.level, entry.level === 'error' && styles.errorLevel, entry.level === 'warn' && styles.warnLevel]}>{entry.level.toUpperCase()}</Text>
        <Text style={styles.scope}>{entry.scope}</Text>
        <Text style={styles.time}>{new Date(entry.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{entry.message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  titleBlock: { flex: 1 },
  title: { fontSize: 22, color: colors.text, fontWeight: '900' },
  subtitle: { marginTop: 2, color: colors.sub, fontWeight: '800' },
  filterToggle: { minHeight: 38, paddingHorizontal: 10, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa' },
  filterToggleOn: { borderColor: '#d6b84c', backgroundColor: '#fff3c4' },
  filterCheck: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: '900' },
  filterCheckOn: { borderColor: '#6d5410', backgroundColor: '#f3dd72' },
  filterText: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  filterTextOn: { color: '#3a2a00' },
  content: { padding: 14, paddingBottom: 28, gap: 12 },
  status: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d6b84c', backgroundColor: '#fff3c4', color: '#3a2a00', fontWeight: '900' },
  actions: { gap: 8 },
  button: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.text, fontWeight: '900' },
  danger: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  filterNotice: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee8dc', color: colors.sub, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  logList: { gap: 8 },
  empty: { marginTop: 30, textAlign: 'center', color: colors.sub, fontWeight: '900' },
  logRow: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', gap: 5 },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  level: { color: '#245a35', fontSize: 11, fontWeight: '900' },
  warnLevel: { color: '#8a5a00' },
  errorLevel: { color: colors.danger },
  scope: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '900' },
  time: { color: colors.sub, fontSize: 10, fontWeight: '700' },
  message: { color: colors.text, fontSize: 12, lineHeight: 17 }
});
