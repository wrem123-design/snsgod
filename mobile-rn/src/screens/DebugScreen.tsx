import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clearDebugLogs, DebugLogEntry, readDebugLogs } from '../logic/debugLog';
import { colors } from '../theme';

export function DebugScreen({ onBack, onReloadState, onReloadBundle }: {
  onBack: () => void;
  onReloadState: () => Promise<void> | void;
  onReloadBundle: () => Promise<void> | void;
}) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [status, setStatus] = useState('');

  async function refresh() {
    setLogs(await readDebugLogs());
  }

  async function clear() {
    await clearDebugLogs();
    setLogs([]);
    setStatus('디버그 로그를 비웠습니다.');
  }

  async function reloadState() {
    try {
      await onReloadState();
      setStatus('저장된 데이터를 다시 읽었습니다.');
      await refresh();
    } catch (error) {
      setStatus(`다시 읽기 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function reloadBundle() {
    try {
      setStatus('JS 런타임 재로드를 요청했습니다...');
      await onReloadBundle();
      setStatus('JS 런타임/저장 데이터를 다시 불러왔습니다.');
      await refresh();
    } catch (error) {
      setStatus(`JS 재로드 실패: ${error instanceof Error ? error.message : String(error)}`);
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
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={refresh} style={styles.button}><Text style={styles.buttonText}>새로고침</Text></Pressable>
          <Pressable onPress={reloadState} style={styles.button}><Text style={styles.buttonText}>저장 데이터 다시 읽기</Text></Pressable>
          <Pressable onPress={reloadBundle} style={styles.button}><Text style={styles.buttonText}>JS 번들 재로드</Text></Pressable>
          <Pressable onPress={clear} style={styles.danger}><Text style={styles.dangerText}>로그 삭제</Text></Pressable>
        </View>
        <Text style={styles.help}>개발 중 화면이 바뀌지 않으면 APK 재설치 또는 JS 번들 재로드가 필요할 수 있습니다. 릴리즈 앱에서는 새 APK를 설치해야 코드 변경이 반영됩니다.</Text>
        <View style={styles.logList}>
          {logs.length ? logs.map(item => <LogRow key={item.id} entry={item} />) : <Text style={styles.empty}>아직 로그가 없습니다.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function LogRow({ entry }: { entry: DebugLogEntry }) {
  return (
    <View style={styles.logRow}>
      <View style={styles.logHead}>
        <Text style={[styles.level, entry.level === 'error' && styles.errorLevel, entry.level === 'warn' && styles.warnLevel]}>{entry.level.toUpperCase()}</Text>
        <Text style={styles.scope}>{entry.scope}</Text>
        <Text style={styles.time}>{new Date(entry.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{entry.message}</Text>
    </View>
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
  content: { padding: 14, paddingBottom: 28, gap: 12 },
  status: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d6b84c', backgroundColor: '#fff3c4', color: '#3a2a00', fontWeight: '900' },
  actions: { gap: 8 },
  button: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.text, fontWeight: '900' },
  danger: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '700' },
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
