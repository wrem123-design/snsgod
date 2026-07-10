import React, { useEffect, useState } from 'react';
import * as Application from 'expo-application';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, NativeModules, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportFullBackupZip, importFullBackupZip } from '../logic/backup';
import { clearDebugLogs, DebugLogEntry, readDebugLogs } from '../logic/debugLog';
import { inspectMediaFiles } from '../logic/media';
import { getStorageDiagnostics, saveState } from '../storage/persist';
import { colors } from '../theme';
import { SNSGodMessage, SNSGodState } from '../types';

const TermuxBridge = NativeModules.TermuxBridge as undefined | {
  copyText: (text: string) => Promise<string>;
};

export function DebugScreen({ state, onBack, onRestoreState, onReloadState, onReloadBundle, onSaveNow }: {
  state: SNSGodState | null;
  onBack: () => void;
  onRestoreState: (base: SNSGodState, state: SNSGodState) => Promise<void> | void;
  onReloadState: (options?: { discardRuntime?: boolean }) => Promise<void> | void;
  onReloadBundle: () => Promise<void> | void;
  onSaveNow: () => Promise<void> | void;
}) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [status, setStatus] = useState('');
  const [hideRoutineLogs, setHideRoutineLogs] = useState(true);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof getStorageDiagnostics>> | null>(null);
  const visibleLogs = hideRoutineLogs ? logs.filter(isImportantLog) : logs;
  const hiddenCount = logs.length - visibleLogs.length;

  async function refresh() {
    setLogs(await readDebugLogs());
    setDiagnostics(await getStorageDiagnostics(state));
  }

  async function refreshLogsOnly() {
    setLogs(await readDebugLogs());
    setStatus('Storage diagnostics are idle. Tap refresh only when you want a full SQLite/backup/media check.');
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

  async function saveNowTest() {
    try {
      if (!state) throw new Error('현재 state가 아직 준비되지 않았습니다.');
      await onSaveNow();
      await saveState(state, { backup: 'force', verify: 'full', reason: 'debug save integrity test' });
      setStatus('즉시 저장 테스트 완료: SQLite와 백업 검증까지 통과했습니다.');
      await refresh();
    } catch (error) {
      setStatus(`즉시 저장 테스트 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function compareStores() {
    try {
      const next = await getStorageDiagnostics(state);
      setDiagnostics(next);
      const sqlite = next.stores.find(item => item.source === 'sqlite')?.summary;
      const latest = next.stores.find(item => item.source === 'backupLatest')?.summary;
      const pointer = next.stores.find(item => item.source === 'asyncStorage')?.pointer;
      const authoritativeOk = Boolean(sqlite?.hash && latest?.hash && sqlite.hash === latest.hash && sqlite.revision === latest.revision);
      const pointerOk = Boolean(pointer?.hash && latest?.hash && pointer.hash === latest.hash && pointer.revision === latest.revision);
      setStatus(authoritativeOk && pointerOk
        ? 'SQLite/백업/pointer revision과 hash가 일치합니다.'
        : `저장소 불일치: authoritative=${authoritativeOk}, pointer=${pointerOk}`);
    } catch (error) {
      setStatus(`저장소 비교 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function runIntegrityTest() {
    try {
      if (!state) throw new Error('현재 state가 아직 준비되지 않았습니다.');
      const now = Date.now();
      const roomId = '__persistence_test__';
      const marker = `persistence-${now}`;
      const testMessage: SNSGodMessage = {
        id: `persistence-test-${now}`,
        role: 'system',
        content: `저장 무결성 테스트 ${marker}`,
        createdAt: now
      };
      const testState: SNSGodState = {
        ...state,
        config: {
          ...state.config,
          userDescription: `${state.config.userDescription || ''}\n[저장 테스트 ${marker}]`.trim()
        },
        messages: {
          ...state.messages,
          [roomId]: [...(state.messages[roomId] || []), testMessage].slice(-20)
        },
        __persistenceMarker: marker,
        __revision: Number(state.__revision || 0) + 1
      };
      await saveState(testState, { backup: 'force', verify: 'full', reason: 'debug persistence marker test' });
      const next = await getStorageDiagnostics(testState);
      setDiagnostics(next);
      const sqlite = next.stores.find(item => item.source === 'sqlite')?.summary;
      const latest = next.stores.find(item => item.source === 'backupLatest')?.summary;
      const pointer = next.stores.find(item => item.source === 'asyncStorage')?.pointer;
      const hashOk = Boolean(sqlite?.hash && latest?.hash && pointer?.hash && sqlite.hash === latest.hash && latest.hash === pointer.hash);
      const revisionOk = Boolean(sqlite && latest && pointer && sqlite.revision === latest.revision && latest.revision === pointer.revision);
      const countOk = Boolean(sqlite && latest && pointer && sqlite.messageCount === latest.messageCount && latest.messageCount === pointer.messageCount);
      setStatus(hashOk && revisionOk && countOk
        ? `저장 무결성 테스트 통과: ${marker}`
        : `저장 무결성 테스트 불일치: hash=${hashOk}, revision=${revisionOk}, count=${countOk}`);
    } catch (error) {
      setStatus(`저장 무결성 테스트 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function checkMedia() {
    try {
      const media = await inspectMediaFiles();
      setStatus(`미디어 검사: ${media.existing}/${media.checked}개 존재${media.missing.length ? `, 누락 ${media.missing.length}개` : ''}`);
      await refresh();
    } catch (error) {
      setStatus(`미디어 검사 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function exportFullBackup() {
    try {
      if (!state) throw new Error('현재 state가 아직 준비되지 않았습니다.');
      const uri = await exportFullBackupZip(state);
      setStatus(`전체 백업 zip 생성: ${uri.split('/').pop() || uri}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'SNSGod 전체 백업 공유' });
      }
    } catch (error) {
      setStatus(`전체 백업 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function importFullBackup() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', '*/*'], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const imported = await importFullBackupZip(picked.assets[0].uri);
      if (!state) throw new Error('현재 state가 아직 준비되지 않았습니다.');
      await onRestoreState(state, imported);
      setStatus('전체 백업에서 복구하고 화면 데이터도 갱신했습니다.');
      await refresh();
    } catch (error) {
      setStatus(`전체 백업 복구 실패: ${error instanceof Error ? error.message : String(error)}`);
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
    void refreshLogsOnly();
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
          <Pressable onPress={runIntegrityTest} style={styles.button}><Text style={styles.buttonText}>저장 무결성 테스트</Text></Pressable>
          <Pressable onPress={checkMedia} style={styles.button}><Text style={styles.buttonText}>미디어 파일 존재 검사</Text></Pressable>
          <Pressable onPress={exportFullBackup} style={styles.button}><Text style={styles.buttonText}>전체 백업 ZIP 내보내기</Text></Pressable>
          <Pressable onPress={importFullBackup} style={styles.button}><Text style={styles.buttonText}>전체 백업 ZIP에서 복구</Text></Pressable>
          <Pressable onPress={reloadState} style={styles.button}><Text style={styles.buttonText}>저장 데이터 다시 읽기</Text></Pressable>
          <Pressable onPress={() => setShowAdvancedTools(value => !value)} style={styles.button}><Text style={styles.buttonText}>{showAdvancedTools ? '고급 도구 닫기' : '고급 도구'}</Text></Pressable>
          {showAdvancedTools ? (
            <>
              <Pressable onPress={saveNowTest} style={styles.button}><Text style={styles.buttonText}>즉시 저장 검증</Text></Pressable>
              <Pressable onPress={compareStores} style={styles.button}><Text style={styles.buttonText}>저장소 비교</Text></Pressable>
              <Pressable onPress={exportLogs} style={styles.button}><Text style={styles.buttonText}>로그 내보내기</Text></Pressable>
              <Pressable onPress={reloadBundle} style={styles.button}><Text style={styles.buttonText}>JS 번들 재로드</Text></Pressable>
              <Pressable onPress={clear} style={styles.danger}><Text style={styles.dangerText}>로그 삭제</Text></Pressable>
            </>
          ) : null}
        </View>
        <StorageDiagnostics diagnostics={diagnostics} advanced={showAdvancedTools} />
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

function StorageDiagnostics({ diagnostics, advanced }: { diagnostics: Awaited<ReturnType<typeof getStorageDiagnostics>> | null; advanced: boolean }) {
  if (!diagnostics) {
    return <Text style={styles.empty}>저장소 진단은 멈춰 있습니다. 새로고침을 누르면 SQLite, 백업, 미디어 상태를 읽습니다.</Text>;
  }
  const appRows = [
    ['applicationId', Application.applicationId || 'unknown'],
    ['nativeVersion', Application.nativeApplicationVersion || 'unknown'],
    ['nativeBuild', Application.nativeBuildVersion || 'unknown'],
    ['documentDirectory', FileSystem.documentDirectory || 'unknown'],
    ['SQLite', diagnostics.paths.sqliteDatabaseName],
    ['AsyncStorage key', diagnostics.paths.asyncStorageKey],
    ['media directory', diagnostics.paths.mediaDirectory],
    ['backup directory', diagnostics.paths.backupDirectory]
  ];
  const sqlite = diagnostics.stores.find(store => store.source === 'sqlite')?.summary;
  const latest = diagnostics.stores.find(store => store.source === 'backupLatest')?.summary;
  const previous = diagnostics.stores.find(store => store.source === 'backupPrevious')?.summary;
  const pointer = diagnostics.stores.find(store => store.source === 'asyncStorage')?.pointer;
  const sqlitePointerOk = Boolean(sqlite?.hash && pointer?.hash && sqlite.hash === pointer.hash && sqlite.revision === pointer.revision);
  const backupNotAhead = Boolean(!sqlite || !latest || latest.revision <= sqlite.revision);
  const backupFresh = Boolean(sqlite && latest && sqlite.revision === latest.revision && sqlite.hash === latest.hash);
  return (
    <View style={styles.diagnostics}>
      <Text style={styles.diagTitle}>저장 상태</Text>
      <Text style={styles.diagSub}>복구 기준: {diagnostics.selected.source}</Text>
      <Text style={styles.diagSub}>마지막 저장: {diagnostics.save.lastSuccessfulSaveTime ? new Date(diagnostics.save.lastSuccessfulSaveTime).toLocaleString() : '없음'}</Text>
      <Text style={styles.diagSub}>마지막 SQLite 저장: {diagnostics.save.lastSQLiteSaveTime ? new Date(diagnostics.save.lastSQLiteSaveTime).toLocaleString() : '없음'}</Text>
      <Text style={styles.diagSub}>마지막 backup snapshot: {diagnostics.save.lastBackupSnapshotTime ? `${new Date(diagnostics.save.lastBackupSnapshotTime).toLocaleString()} · rev ${diagnostics.save.lastBackupSnapshotRevision}` : '없음'}</Text>
      <Text style={styles.diagSub}>backup reason: {diagnostics.save.lastBackupSnapshotReason || 'none'}</Text>
      <View style={styles.healthRow}>
        <HealthPill label="sqlite-pointer" ok={sqlitePointerOk} />
        <HealthPill label="backup not ahead" ok={backupNotAhead} />
        <HealthPill label="backup fresh" ok={backupFresh} />
      </View>
      <View style={styles.diagBlock}>
        <Text style={styles.diagBlockTitle}>Recent save performance</Text>
        {diagnostics.perf.length ? diagnostics.perf.map(entry => <PerfRow key={entry.id} entry={entry} />) : <Text style={styles.diagSub}>No save performance entries yet.</Text>}
      </View>
      {diagnostics.legacyAsyncStorageFullStateExists ? <Text style={styles.diagError}>legacy AsyncStorage full state remains</Text> : null}
      {diagnostics.save.lastSaveError ? <Text style={styles.diagError}>last save error: {diagnostics.save.lastSaveError}</Text> : null}
      <View style={styles.storeGrid}>
        {diagnostics.current ? <CompactStore title="현재" summary={diagnostics.current} /> : null}
        {sqlite ? <CompactStore title="SQLite" summary={sqlite} /> : <CompactEmptyStore title="SQLite" />}
        {latest ? <CompactStore title="백업" summary={latest} /> : <CompactEmptyStore title="백업" />}
        {pointer ? <CompactPointer title="Pointer" pointer={pointer} /> : <CompactEmptyStore title="Pointer" />}
      </View>
      <View style={styles.diagBlock}>
        <Text style={styles.diagBlockTitle}>Media</Text>
        <DiagRow label="manifest" value={diagnostics.media.manifestFile} />
        <DiagRow label="manifest count" value={String(diagnostics.media.manifest.length)} />
        <DiagRow label="files" value={`${diagnostics.media.existing}/${diagnostics.media.checked} exists`} />
        <DiagRow label="missing count" value={String(diagnostics.media.missing.length)} />
        {diagnostics.media.missing.length ? <Text style={styles.diagError}>missing: {diagnostics.media.missing.slice(0, 4).join('\n')}</Text> : null}
      </View>
      {advanced ? (
        <>
          <Text style={styles.diagSub}>복구 이유: {diagnostics.selected.reason}</Text>
          <Text style={styles.diagSub}>hydration 전 저장 skip: {diagnostics.save.skippedSaveBeforeHydrationCount}</Text>
          <Text style={styles.diagSub}>old revision skip: {diagnostics.save.lastSkippedOldRevisionSave || 'none'}</Text>
          <Text style={styles.diagSub}>async warning: {diagnostics.save.lastAsyncStorageWarning || 'none'}</Text>
          <Text style={styles.diagSub}>atomic backup: {diagnostics.save.lastAtomicBackupWriteResult || 'none'}</Text>
          <View style={styles.diagBlock}>
            <Text style={styles.diagBlockTitle}>앱/경로</Text>
            {appRows.map(([label, value]) => <DiagRow key={label} label={label} value={String(value)} />)}
          </View>
          {previous ? (
            <View style={styles.diagBlock}>
              <Text style={styles.diagBlockTitle}>이전 백업</Text>
              <DiagSummary summary={previous} />
            </View>
          ) : null}
          {diagnostics.stores.map(store => (
            <View key={store.source} style={styles.diagBlock}>
              <Text style={styles.diagBlockTitle}>{store.source} {store.exists ? '' : '(empty)'}</Text>
              {store.isLegacyFullState ? <Text style={styles.diagError}>legacy full state remains in AsyncStorage</Text> : null}
              {store.pointer ? <DiagPointer pointer={store.pointer} /> : null}
              {store.parseError ? <Text style={styles.diagError}>{store.parseError}</Text> : null}
              {store.summary ? <DiagSummary summary={store.summary} /> : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function PerfRow({ entry }: { entry: Awaited<ReturnType<typeof getStorageDiagnostics>>['perf'][number] }) {
  const topStages = Object.entries(entry.stages)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([name, ms]) => `${name} ${ms}ms`)
    .join(' / ');
  return (
    <View style={[styles.perfRow, entry.slow && styles.perfSlow]}>
      <View style={styles.perfHead}>
        <Text style={[styles.perfTotal, entry.slow && styles.perfSlowText]}>{entry.totalMs}ms</Text>
        <Text style={styles.perfMeta}>rev {entry.revision} · {entry.reason}</Text>
      </View>
      <Text style={styles.perfDetail}>backup {entry.backupWritten ? 'yes' : 'no'} · verify {entry.verify} · payload {Math.round(entry.payloadBytes / 1024)}KB</Text>
      <Text style={styles.perfStages}>{topStages || 'no stage data'}</Text>
    </View>
  );
}

function HealthPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.healthPill, ok ? styles.healthOk : styles.healthBad]}>
      <Text style={[styles.healthText, ok ? styles.healthOkText : styles.healthBadText]}>{label} {ok ? 'OK' : '확인 필요'}</Text>
    </View>
  );
}

function CompactStore({ title, summary }: { title: string; summary: NonNullable<Awaited<ReturnType<typeof getStorageDiagnostics>>['current']> }) {
  return (
    <View style={styles.compactStore}>
      <Text style={styles.compactTitle}>{title}</Text>
      <Text style={styles.compactMain}>rev {summary.revision}</Text>
      <Text style={styles.compactSub}>msg {summary.messageCount} · ref {summary.referenceImageCount}</Text>
      <Text numberOfLines={1} style={styles.compactHash}>{summary.hash}</Text>
    </View>
  );
}

function CompactPointer({ title, pointer }: { title: string; pointer: NonNullable<Awaited<ReturnType<typeof getStorageDiagnostics>>['stores'][number]['pointer']> }) {
  return (
    <View style={styles.compactStore}>
      <Text style={styles.compactTitle}>{title}</Text>
      <Text style={styles.compactMain}>rev {pointer.revision}</Text>
      <Text style={styles.compactSub}>msg {pointer.messageCount} · ref {pointer.referenceImageCount}</Text>
      <Text numberOfLines={1} style={styles.compactHash}>{pointer.hash}</Text>
    </View>
  );
}

function CompactEmptyStore({ title }: { title: string }) {
  return (
    <View style={[styles.compactStore, styles.compactEmpty]}>
      <Text style={styles.compactTitle}>{title}</Text>
      <Text style={styles.compactSub}>비어 있음</Text>
    </View>
  );
}

function DiagSummary({ summary }: { summary: NonNullable<Awaited<ReturnType<typeof getStorageDiagnostics>>['current']> }) {
  return (
    <>
      <DiagRow label="revision" value={String(summary.revision)} />
      <DiagRow label="writeSeq" value={String(summary.writeSeq)} />
      <DiagRow label="savedAt" value={summary.savedAt ? new Date(summary.savedAt).toLocaleString() : '0'} />
      <DiagRow label="hash" value={summary.hash} />
      <DiagRow label="counts" value={`messages ${summary.messageCount}, chars ${summary.characterCount}, refs ${summary.referenceImageCount}, media ${summary.mediaCount}`} />
      <DiagRow label="lastMessageAt" value={summary.lastMessageAt ? new Date(summary.lastMessageAt).toLocaleString() : '0'} />
    </>
  );
}

function DiagPointer({ pointer }: { pointer: NonNullable<Awaited<ReturnType<typeof getStorageDiagnostics>>['stores'][number]['pointer']> }) {
  return (
    <>
      <DiagRow label="pointer rev" value={String(pointer.revision)} />
      <DiagRow label="pointer seq" value={String(pointer.writeSeq)} />
      <DiagRow label="pointer hash" value={pointer.hash} />
      <DiagRow label="pointer counts" value={`messages ${pointer.messageCount}, chars ${pointer.characterCount}, refs ${pointer.referenceImageCount}, media ${pointer.mediaCount}`} />
      <DiagRow label="payload length" value={String(pointer.payloadLength)} />
    </>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={styles.diagValue}>{value}</Text>
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
  ,
  diagnostics: { gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d6b84c', backgroundColor: '#fffaf0' },
  diagTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  diagSub: { color: colors.sub, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  diagError: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '900' },
  diagBlock: { gap: 4, padding: 8, borderRadius: 8, backgroundColor: '#fffefa', borderWidth: 1, borderColor: colors.border },
  diagBlockTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  diagRow: { flexDirection: 'row', gap: 8 },
  diagLabel: { width: 104, color: colors.sub, fontSize: 10, fontWeight: '900' },
  diagValue: { flex: 1, color: colors.text, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  perfRow: { gap: 3, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  perfSlow: { backgroundColor: '#fff1f1' },
  perfHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfTotal: { width: 58, color: '#245a35', fontSize: 12, fontWeight: '900' },
  perfSlowText: { color: colors.danger },
  perfMeta: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '900' },
  perfDetail: { color: colors.sub, fontSize: 10, fontWeight: '800' },
  perfStages: { color: colors.text, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  healthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  healthPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  healthOk: { backgroundColor: '#e9f8ed', borderColor: '#9bd2aa' },
  healthBad: { backgroundColor: '#fff1f1', borderColor: '#f0b7b7' },
  healthText: { fontSize: 11, fontWeight: '900' },
  healthOkText: { color: '#245a35' },
  healthBadText: { color: colors.danger },
  storeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactStore: { width: '48%', minHeight: 86, padding: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', gap: 3 },
  compactEmpty: { opacity: 0.72 },
  compactTitle: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  compactMain: { color: colors.text, fontSize: 16, fontWeight: '900' },
  compactSub: { color: colors.text, fontSize: 11, fontWeight: '800' },
  compactHash: { color: colors.sub, fontSize: 9, fontWeight: '700' }
});
