import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';
import { ApiProvider, CalendarEvent, SNSGodState, Sticker } from '../types';
import { normalizeLegacyState } from '../storage/importLegacy';
import { callLLMText } from '../logic/api';
import { makeId } from '../logic/ids';
import { pickStickerDataUri } from '../logic/media';

const PROVIDERS: ApiProvider[] = ['gemini', 'openai', 'anthropic', 'custom'];
const PROVIDER_PRESETS: Partial<Record<ApiProvider, { endpoint: string; model: string }[]>> = {
  gemini: [
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash-lite' },
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3-flash-preview' }
  ],
  openai: [
    { endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-4.1-mini' },
    { endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-4.1' }
  ],
  anthropic: [
    { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5' }
  ]
};

type SettingsSection = 'user' | 'characters' | 'stickers' | 'prompts' | 'lorebook' | 'screen' | 'api' | 'image';

const SECTION_TABS: { key: SettingsSection; label: string }[] = [
  { key: 'user', label: '유저 설정' },
  { key: 'characters', label: '캐릭터별 설정' },
  { key: 'stickers', label: '스티커' },
  { key: 'prompts', label: '프롬프트' },
  { key: 'lorebook', label: '공통 로어북' },
  { key: 'screen', label: '화면' },
  { key: 'api', label: 'API' },
  { key: 'image', label: '이미지' }
];

function getSettingsSection(value: unknown): SettingsSection {
  return SECTION_TABS.some(tab => tab.key === value) ? value as SettingsSection : 'user';
}

const EVENT_PRESETS = [
  { title: "나's birthday", date: '1985-02-08', type: '유저 생일', prompt: "Event type: the user's birthday. The celebrant is 나. Write as the character directly to 나 in a private DM." },
  { title: '연인 기념일', date: 'MM-DD', type: '연인', prompt: 'Event type: relationship anniversary. The character remembers it naturally and may contact the user first.' },
  { title: '결혼기념일', date: 'MM-DD', type: '결혼기념일', prompt: 'Event type: wedding anniversary. Keep the tone intimate and in character.' },
  { title: '약속', date: 'YYYY-MM-DD', type: '약속', prompt: 'Event type: appointment. The character may mention or prepare for the plan.' }
];

export function SettingsScreen({ state, onChange, onBack, onOpenLorebook, onOpenPrompts, onOpenCharacterSettings }: {
  state: SNSGodState;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onBack: () => void;
  onOpenLorebook?: () => void;
  onOpenPrompts?: () => void;
  onOpenCharacterSettings?: (characterId: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => getSettingsSection(state.config.lastSettingsSection));
  const [provider, setProvider] = useState<ApiProvider>(state.config.apiType);
  const profile = useMemo(() => state.config.apiProfiles[provider] || {}, [state.config.apiProfiles, provider]);
  const keySlots = useMemo(() => {
    const keys = [profile.apiKey, ...(profile.apiKeys || [])].map(value => String(value || ''));
    return [keys[0] || '', keys[1] || '', keys[2] || ''];
  }, [profile.apiKey, profile.apiKeys]);
  const [model, setModel] = useState(String(profile.apiModel || ''));
  const [endpoint, setEndpoint] = useState(String(profile.apiEndpoint || ''));
  const [maxTokens, setMaxTokens] = useState(String(profile.maxTokens || 700));
  const [temperature, setTemperature] = useState(String(profile.temperature || 0.85));
  const [apiKey1, setApiKey1] = useState(keySlots[0]);
  const [apiKey2, setApiKey2] = useState(keySlots[1]);
  const [apiKey3, setApiKey3] = useState(keySlots[2]);
  const [userName, setUserName] = useState(state.config.userName || '나');
  const [roomName, setRoomName] = useState(state.config.roomName || '채팅');
  const [language, setLanguage] = useState(state.config.language || 'Korean');
  const [userDescription, setUserDescription] = useState(state.config.userDescription || '');
  const [fontScale, setFontScale] = useState(String(state.config.fontScale || 1));
  const [snsAutoChance, setSnsAutoChance] = useState(String(state.config.snsAutoChance ?? 40));
  const [snsStartCount, setSnsStartCount] = useState(String(state.config.snsStartCount ?? 6));
  const [autoEnabled, setAutoEnabled] = useState(state.config.autoEnabled !== false);
  const [privateFirst, setPrivateFirst] = useState(state.config.privateFirst === true);
  const [groupFirst, setGroupFirst] = useState(state.config.groupFirst === true);
  const [randomDmEnabled, setRandomDmEnabled] = useState(state.config.randomDmEnabled !== false);
  const [snsAutoPostEnabled, setSnsAutoPostEnabled] = useState(state.config.snsAutoPostEnabled !== false);
  const [characterPhoneCallEnabled, setCharacterPhoneCallEnabled] = useState(state.config.characterPhoneCallEnabled !== false);
  const imageConfig = state.config.imageGeneration || {};
  const snsConfig = state.config.sns || {};
  const [imageEnabled, setImageEnabled] = useState(imageConfig.enabled === true);
  const [imageApiKey, setImageApiKey] = useState(String(imageConfig.apiKey || ''));
  const [imageEndpoint, setImageEndpoint] = useState(String(imageConfig.apiEndpoint || 'https://api.openai.com/v1/responses'));
  const [imageModel, setImageModel] = useState(String(imageConfig.apiModel || 'gpt-5'));
  const [imageSize, setImageSize] = useState(String(imageConfig.size || '1024x1024'));
  const [imageQuality, setImageQuality] = useState(String(imageConfig.quality || 'auto'));
  const [imagePrefix, setImagePrefix] = useState(String(imageConfig.promptPrefix || ''));
  const [imageNegative, setImageNegative] = useState(String(imageConfig.negativePrompt || ''));
  const [imageNsfw, setImageNsfw] = useState(imageConfig.nsfw === true);
  const [imageIllustration, setImageIllustration] = useState(imageConfig.illustrationMode === true);
  const [snsDefaultPlatform, setSnsDefaultPlatform] = useState(String(snsConfig.platform || 'hybrid'));
  const [snsCommentQty, setSnsCommentQty] = useState(String(snsConfig.commentQty || '2-4'));
  const [snsSubject, setSnsSubject] = useState(String(snsConfig.subject || ''));
  const [snsMood, setSnsMood] = useState(String(snsConfig.mood || ''));
  const [snsAnonymous, setSnsAnonymous] = useState(snsConfig.anonymous === true);
  const [snsNsfw, setSnsNsfw] = useState(snsConfig.nsfw === true);
  const [snsHybridNsfwSplit, setSnsHybridNsfwSplit] = useState(snsConfig.hybridNsfwSplit !== false);
  const [snsTextOnly, setSnsTextOnly] = useState(snsConfig.textOnly === true);
  const [snsNoDM, setSnsNoDM] = useState(snsConfig.noDM === true);
  const [snsThirdPartyDM, setSnsThirdPartyDM] = useState(snsConfig.thirdPartyDM === true);
  const [snsAutoComments, setSnsAutoComments] = useState(snsConfig.autoComments !== false);
  const [snsAutoImage, setSnsAutoImage] = useState(snsConfig.autoImage !== false);
  const [importJson, setImportJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [status, setStatus] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [userStickerDrafts, setUserStickerDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const userEvents = Array.isArray(state.config.userCalendarEvents) ? state.config.userCalendarEvents as CalendarEvent[] : [];
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventPrompt, setEventPrompt] = useState('');

  async function openSection(section: SettingsSection) {
    setActiveSection(section);
    if (state.config.lastSettingsSection === section) return;
    try {
      await onChange({ ...state, config: { ...state.config, lastSettingsSection: section } });
    } catch (error) {
      setStatus(`설정 위치 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function applyEventPreset(preset: typeof EVENT_PRESETS[number]) {
    setEventTitle(preset.title);
    setEventDate(preset.date);
    setEventType(preset.type);
    setEventPrompt(preset.prompt);
  }

  function selectProvider(nextProvider: ApiProvider) {
    const nextProfile = state.config.apiProfiles[nextProvider] || {};
    const keys = [nextProfile.apiKey, ...(nextProfile.apiKeys || [])].map(value => String(value || ''));
    setProvider(nextProvider);
    setModel(String(nextProfile.apiModel || ''));
    setEndpoint(String(nextProfile.apiEndpoint || ''));
    setMaxTokens(String(nextProfile.maxTokens || 700));
    setTemperature(String(nextProfile.temperature || 0.85));
    setApiKey1(keys[0] || '');
    setApiKey2(keys[1] || '');
    setApiKey3(keys[2] || '');
  }

  function buildApiState(): { next: SNSGodState; keyCount: number } {
    const profile = { ...(state.config.apiProfiles[provider] || {}) };
    const keys = [apiKey1, apiKey2, apiKey3].map(value => String(value || '').trim()).filter(Boolean);
    const next: SNSGodState = {
      ...state,
      config: {
        ...state.config,
        apiType: provider,
        apiProfiles: {
          ...state.config.apiProfiles,
          [provider]: {
            ...profile,
            apiKey: keys[0] || '',
            apiKeys: keys,
            apiEndpoint: endpoint.trim(),
            apiModel: model.trim(),
            maxTokens: Math.max(32, Math.round(Number(maxTokens) || 700)),
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.85
          }
        }
      }
    };
    return { next, keyCount: keys.length };
  }

  async function saveApi() {
    if (saving) return;
    const { next, keyCount } = buildApiState();
    setSaving(true);
    try {
      await onChange(next);
      setStatus(`API 저장 완료: ${provider} · ${model.trim() || '(모델 없음)'} · 키 ${keyCount}개`);
    } catch (error) {
      setStatus(`API 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function testApi() {
    if (testingApi) return;
    const { next, keyCount } = buildApiState();
    if (!keyCount) {
      setStatus('API 테스트 실패: API 키를 먼저 입력하세요.');
      return;
    }
    setTestingApi(true);
    try {
      await onChange(next);
      const result = await callLLMText(next, [
        { role: 'system', content: 'Reply with one short Korean sentence confirming the API works.' },
        { role: 'user', content: 'SNSGod API 연결 테스트' }
      ]);
      const activeProfile = next.config.apiProfiles[next.config.apiType] || {};
      await onChange({
        ...next,
        config: {
          ...next.config,
          apiProfiles: {
            ...next.config.apiProfiles,
            [next.config.apiType]: { ...activeProfile, apiKeyIndex: result.keyIndex }
          }
        }
      });
      setStatus(`API 테스트 성공: ${result.text.trim().slice(0, 180) || 'API 응답을 받았습니다.'}`);
    } catch (error) {
      setStatus(`API 테스트 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTestingApi(false);
    }
  }

  async function setSnsTheme(theme: 'default' | 'kakao') {
    try {
      await onChange({ ...state, config: { ...state.config, snsTheme: theme } });
      setStatus(`SNS 테마 저장 완료: ${theme === 'kakao' ? '카카오톡' : '기본'}`);
    } catch (error) {
      setStatus(`SNS 테마 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveProfile() {
    if (saving) return;
    setSaving(true);
    try {
      await onChange({
      ...state,
      config: {
        ...state.config,
        userName: userName.trim() || '나',
        roomName: roomName.trim() || '채팅',
        language: language.trim() || 'Korean',
        fontScale: Math.max(0.7, Math.min(1.6, Number(fontScale) || 1)),
        userDescription
      }
      });
      setStatus('내 프로필 저장 완료');
    } catch (error) {
      setStatus(`내 프로필 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function addUserEvent() {
    const title = eventTitle.trim();
    const date = eventDate.trim();
    if (!title || !date) {
      setStatus('기념일 추가 실패: 제목과 날짜를 입력하세요.');
      return;
    }
    const event: CalendarEvent = {
      id: `user_event_${Date.now().toString(36)}`,
      title,
      date,
      type: eventType.trim() || '기념일',
      prompt: eventPrompt.trim()
    };
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          userCalendarEvents: [event, ...userEvents]
        }
      });
      setEventTitle('');
      setEventDate('');
      setEventType('');
      setEventPrompt('');
      setStatus('사용자 공통 기념일 추가 완료');
    } catch (error) {
      setStatus(`사용자 공통 기념일 추가 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function deleteUserEvent(id: string) {
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          userCalendarEvents: userEvents.filter(event => event.id !== id)
        }
      });
      setStatus('사용자 공통 기념일 삭제 완료');
    } catch (error) {
      setStatus(`사용자 공통 기념일 삭제 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveAutomation() {
    if (saving) return;
    setSaving(true);
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          autoEnabled,
          privateFirst,
          groupFirst,
          randomDmEnabled,
          snsAutoPostEnabled,
          characterPhoneCallEnabled,
          snsAutoChance: Math.max(0, Math.min(100, Math.round(Number(snsAutoChance) || 0))),
          snsStartCount: Math.max(1, Math.round(Number(snsStartCount) || 6))
        }
      });
      setStatus('자동화 저장 완료');
    } catch (error) {
      setStatus(`자동화 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveImageGeneration() {
    if (saving) return;
    setSaving(true);
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          imageGeneration: {
            ...(state.config.imageGeneration || {}),
            enabled: imageEnabled,
            provider: 'openai',
            apiKey: imageApiKey.trim(),
            apiEndpoint: imageEndpoint.trim() || 'https://api.openai.com/v1/responses',
            apiModel: imageModel.trim() || 'gpt-5',
            size: imageSize.trim() || '1024x1024',
            quality: imageQuality.trim() || 'auto',
            promptPrefix: imagePrefix,
            negativePrompt: imageNegative,
            nsfw: imageNsfw,
            illustrationMode: imageIllustration
          }
        }
      });
      setStatus('이미지 생성 설정 저장 완료');
    } catch (error) {
      setStatus(`이미지 생성 설정 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveSnsOptions() {
    if (saving) return;
    setSaving(true);
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          sns: {
            ...(state.config.sns || {}),
            platform: snsDefaultPlatform === 'twitter' || snsDefaultPlatform === 'instagram' ? snsDefaultPlatform : 'hybrid',
            commentQty: snsCommentQty.trim() || '2-4',
            subject: snsSubject,
            mood: snsMood,
            anonymous: snsAnonymous,
            nsfw: snsNsfw,
            hybridNsfwSplit: snsHybridNsfwSplit,
            textOnly: snsTextOnly,
            noDM: snsNoDM,
            thirdPartyDM: snsThirdPartyDM,
            autoComments: snsAutoComments,
            autoImage: snsAutoImage
          }
        }
      });
      setStatus('SNS 옵션 저장 완료');
    } catch (error) {
      setStatus(`SNS 옵션 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function stickerDraft(sticker: Sticker) {
    return userStickerDrafts[sticker.id] || { name: sticker.name || sticker.id, description: sticker.description || '' };
  }

  function setStickerDraft(sticker: Sticker, patch: Partial<{ name: string; description: string }>) {
    const current = stickerDraft(sticker);
    setUserStickerDrafts(prev => ({ ...prev, [sticker.id]: { ...current, ...patch } }));
  }

  async function addUserSticker() {
    try {
      const picked = await pickStickerDataUri();
      if (!picked) return;
      const sticker: Sticker = {
        id: makeId('usticker'),
        name: picked.name,
        description: '',
        data: picked.data,
        mediaData: picked.data,
        type: picked.type
      };
      await onChange({ ...state, userStickers: [sticker, ...(state.userStickers || [])] });
      setStatus('스티커 추가 완료');
    } catch (error) {
      setStatus(`스티커 추가 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveUserSticker(sticker: Sticker) {
    const draft = stickerDraft(sticker);
    await onChange({
      ...state,
      userStickers: (state.userStickers || []).map(item => item.id === sticker.id ? { ...item, name: draft.name.trim() || item.name, description: draft.description.trim() } : item)
    });
    setStatus('스티커 저장 완료');
  }

  async function deleteUserSticker(id: string) {
    await onChange({ ...state, userStickers: (state.userStickers || []).filter(sticker => sticker.id !== id) });
    setStatus('스티커 삭제 완료');
  }

  async function exportBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `snsgod-backup-${timestamp}.json`;
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}${fileName}`;
      const payload = JSON.stringify({ ...state, __exportedAt: Date.now() }, null, 2);
      await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
      setStatus(`백업 파일 생성 완료: ${fileName}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'SNSGod 백업 저장/공유' });
      }
    } catch (error) {
      setStatus(`백업 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function importBackupRaw(rawText: string) {
    if (saving) return;
    try {
      const raw = rawText.trim();
      if (!raw) {
        setStatus('임포트 실패: JSON이 비어 있습니다.');
        return;
      }
      const next = normalizeLegacyState(raw);
      setSaving(true);
      await onChange({ ...next, __importedAt: Date.now() });
      setImportJson('');
      setStatus(`임포트 완료: 캐릭터 ${next.characters.length}명, 방 ${Object.values(next.chatRooms).flat().length + (next.groupRooms?.length || 0)}개`);
    } catch (error) {
      setStatus(`임포트 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function importPastedBackup() {
    await importBackupRaw(importJson);
  }

  async function importBackupFile() {
    if (saving) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      await importBackupRaw(raw);
    } catch (error) {
      setStatus(`파일 임포트 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>설정</Text>
      </View>
      <View style={styles.sectionBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionBarContent}>
          {SECTION_TABS.map(tab => (
            <Pressable key={tab.key} onPress={() => { void openSection(tab.key); }} style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}>
              <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {status ? <View style={styles.statusBox}><Text style={styles.statusText}>{status}</Text></View> : null}
        <View style={[styles.card, activeSection !== 'characters' && styles.hidden]}>
          <Text style={styles.cardTitle}>캐릭터별 설정</Text>
          <Text style={styles.help}>캐릭터, 능동 채팅, 삼화 태그, 로어북은 캐릭터 편집 화면에서 관리합니다.</Text>
          {state.characters.map(character => (
            <Pressable key={character.id} onPress={() => onOpenCharacterSettings?.(character.id)} style={styles.listRow}>
              <View style={[styles.avatarDot, { backgroundColor: character.color || colors.accent }]}><Text style={styles.avatarDotText}>{character.avatarText || character.name.slice(0, 1)}</Text></View>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{character.name}</Text>
                <Text style={styles.listSub}>@{character.handle || character.id} · 로어북 {(character.memories || []).length}개 · 스티커 {(character.stickers || []).length}개</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.card, activeSection !== 'stickers' && styles.hidden]}>
          <View style={styles.cardHeadRow}>
            <View>
              <Text style={styles.cardTitle}>내 스티커</Text>
              <Text style={styles.help}>유저 스티커는 내가 직접 보내는 스티커입니다. 설명은 AI가 어떤 상황에 스티커를 쓸지 판단할 때 참고합니다.</Text>
            </View>
            <Pressable onPress={addUserSticker} style={styles.primarySmall}><Text style={styles.primarySmallText}>파일 추가</Text></Pressable>
          </View>
          {(state.userStickers || []).length ? (state.userStickers || []).map(sticker => {
            const draft = stickerDraft(sticker);
            return (
              <View key={sticker.id} style={styles.stickerCard}>
                {String(sticker.data || sticker.mediaData || '').startsWith('data:image/') ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerPreview} resizeMode="cover" /> : <View style={styles.stickerIcon}><Text style={styles.stickerIconText}>S</Text></View>}
                <View style={styles.stickerEditBody}>
                  <Text style={styles.label}>이름</Text>
                  <TextInput value={draft.name} onChangeText={value => setStickerDraft(sticker, { name: value })} style={styles.input} />
                  <Text style={styles.label}>설명</Text>
                  <TextInput value={draft.description} onChangeText={value => setStickerDraft(sticker, { description: value })} style={styles.input} placeholder="예: 기분나쁨, 놀람, 장난스럽게 삐짐" />
                  <View style={styles.inlineActions}>
                    <Pressable onPress={() => saveUserSticker(sticker)} style={styles.secondary}><Text style={styles.secondaryText}>저장</Text></Pressable>
                    <Pressable onPress={() => deleteUserSticker(sticker.id)} style={styles.dangerButton}><Text style={styles.dangerText}>삭제</Text></Pressable>
                  </View>
                </View>
              </View>
            );
          }) : <Text style={styles.emptyText}>스티커를 추가하세요.</Text>}
          <Text style={styles.cardTitle}>캐릭터 스티커</Text>
          <Text style={styles.help}>캐릭터 스티커는 캐릭터 답장에 사용할 수 있는 스티커입니다. 캐릭터별 설정에서 관리합니다.</Text>
          {state.characters.map(character => (
            <Pressable key={character.id} onPress={() => onOpenCharacterSettings?.(character.id)} style={styles.listRow}>
              <View style={[styles.avatarDot, { backgroundColor: character.color || colors.accent }]}><Text style={styles.avatarDotText}>{character.avatarText || character.name.slice(0, 1)}</Text></View>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{character.name} 스티커</Text>
                <Text style={styles.listSub}>{(character.stickers || []).length}개</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.card, activeSection !== 'user' && styles.hidden]}>
          <Text style={styles.cardTitle}>내 기본 프로필</Text>
          <Text style={styles.label}>서비스 이름</Text>
          <TextInput value={roomName} onChangeText={setRoomName} style={styles.input} />
          <Text style={styles.label}>내 이름</Text>
          <TextInput value={userName} onChangeText={setUserName} style={styles.input} />
          <Text style={styles.label}>출력 언어</Text>
          <TextInput value={language} onChangeText={setLanguage} style={styles.input} autoCapitalize="none" />
          <Text style={styles.label}>폰트 배율</Text>
          <TextInput value={fontScale} onChangeText={setFontScale} style={styles.input} keyboardType="decimal-pad" />
          <Text style={styles.label}>내 소개</Text>
          <TextInput
            value={userDescription}
            onChangeText={setUserDescription}
            style={[styles.input, styles.profileTextarea]}
            multiline
            scrollEnabled
            textAlignVertical="top"
          />
          <Pressable onPress={saveProfile} style={styles.primary}><Text style={styles.primaryText}>프로필 저장</Text></Pressable>
        </View>

        <View style={[styles.card, activeSection !== 'user' && styles.hidden]}>
          <Text style={styles.cardTitle}>사용자 공통 기념일</Text>
          <Text style={styles.help}>여기에 저장한 생일과 공통 기념일은 모든 캐릭터에게 적용됩니다. MM-DD는 매년 반복, YYYY-MM-DD는 한 번만 적용됩니다.</Text>
          <View style={styles.presetRow}>
            {EVENT_PRESETS.map(preset => (
              <Pressable key={preset.type} onPress={() => applyEventPreset(preset)} style={styles.presetButton}>
                <Text style={styles.presetText}>{preset.type}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>제목</Text>
          <TextInput value={eventTitle} onChangeText={setEventTitle} style={styles.input} />
          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>날짜</Text>
              <TextInput value={eventDate} onChangeText={setEventDate} style={styles.input} placeholder="MM-DD 또는 YYYY-MM-DD" placeholderTextColor="#9a9387" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>유형</Text>
              <TextInput value={eventType} onChangeText={setEventType} style={styles.input} />
            </View>
          </View>
          <Text style={styles.label}>이벤트 지시</Text>
          <TextInput value={eventPrompt} onChangeText={setEventPrompt} style={[styles.input, styles.textareaSmall]} multiline textAlignVertical="top" />
          <Pressable onPress={addUserEvent} style={styles.primary}><Text style={styles.primaryText}>기념일 추가</Text></Pressable>
          {userEvents.length ? userEvents.map(event => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{event.title}</Text>
                <Text style={styles.listSub}>{event.date} · {event.type || '기념일'}</Text>
                {event.prompt ? <Text style={styles.eventPrompt} numberOfLines={2}>{event.prompt}</Text> : null}
              </View>
              <Pressable onPress={() => deleteUserEvent(event.id)} style={styles.deleteButton}><Text style={styles.deleteText}>삭제</Text></Pressable>
            </View>
          )) : <Text style={styles.emptyText}>아직 사용자 공통 기념일이 없습니다.</Text>}
        </View>

        <View style={[styles.card, activeSection !== 'api' && styles.hidden]}>
          <Text style={styles.cardTitle}>API 설정</Text>
          <Text style={styles.label}>Provider</Text>
          <View style={styles.segmentRow}>
            {PROVIDERS.map(item => (
              <Pressable key={item} onPress={() => selectProvider(item)} style={[styles.segment, provider === item && styles.segmentActive]}>
                <Text style={[styles.segmentText, provider === item && styles.segmentTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Endpoint</Text>
          <TextInput value={endpoint} onChangeText={setEndpoint} style={styles.input} autoCapitalize="none" />
          <Text style={styles.label}>모델</Text>
          <TextInput value={model} onChangeText={setModel} style={styles.input} autoCapitalize="none" />
          {PROVIDER_PRESETS[provider]?.length ? (
            <View style={styles.presetRow}>
              {PROVIDER_PRESETS[provider]?.map(item => (
                <Pressable key={`${item.endpoint}:${item.model}`} onPress={() => { setEndpoint(item.endpoint); setModel(item.model); }} style={styles.presetButton}>
                  <Text style={styles.presetText}>{item.model}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => setShowKeys(!showKeys)} style={styles.keyToggle}><Text style={styles.keyToggleText}>{showKeys ? 'API 키 숨기기' : 'API 키 보기'}</Text></Pressable>
          <Text style={styles.label}>API 키 1</Text>
          <TextInput value={apiKey1} onChangeText={setApiKey1} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
          <Text style={styles.label}>API 키 2</Text>
          <TextInput value={apiKey2} onChangeText={setApiKey2} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
          <Text style={styles.label}>API 키 3</Text>
          <TextInput value={apiKey3} onChangeText={setApiKey3} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>최대 응답 크기</Text>
              <TextInput value={maxTokens} onChangeText={setMaxTokens} style={styles.input} keyboardType="number-pad" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Temperature</Text>
              <TextInput value={temperature} onChangeText={setTemperature} style={styles.input} keyboardType="decimal-pad" />
            </View>
          </View>
          <Text style={styles.help}>키 1번 실패 시 2번, 3번 순서로 자동 재시도합니다. 성공한 키 번호는 다음 호출의 시작점으로 저장됩니다.</Text>
          <View style={styles.buttonRow}>
            <Pressable onPress={saveApi} disabled={saving} style={[styles.primary, styles.rowButton, saving && styles.disabled]}><Text style={styles.primaryText}>API 저장</Text></Pressable>
            <Pressable onPress={testApi} disabled={testingApi || saving} style={[styles.secondaryInline, styles.rowButton, (testingApi || saving) && styles.disabled]}><Text style={styles.secondaryText}>{testingApi ? '테스트 중' : 'API 테스트'}</Text></Pressable>
          </View>
        </View>

        <View style={[styles.card, activeSection !== 'screen' && styles.hidden]}>
          <Text style={styles.cardTitle}>화면</Text>
          <Text style={styles.label}>SNS 테마</Text>
          <View style={styles.segmentRow}>
            <Pressable onPress={() => setSnsTheme('default')} style={[styles.segment, (state.config.snsTheme || 'default') === 'default' && styles.segmentActive]}>
              <Text style={[styles.segmentText, (state.config.snsTheme || 'default') === 'default' && styles.segmentTextActive]}>기본</Text>
            </Pressable>
            <Pressable onPress={() => setSnsTheme('kakao')} style={[styles.segment, state.config.snsTheme === 'kakao' && styles.segmentActive]}>
              <Text style={[styles.segmentText, state.config.snsTheme === 'kakao' && styles.segmentTextActive]}>카카오톡</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>채팅 목록 화면의 레이아웃과 색을 바꿉니다. 저장 버튼 없이 바로 저장됩니다.</Text>
        </View>

        <View style={[styles.card, activeSection !== 'image' && styles.hidden]}>
          <Text style={styles.cardTitle}>이미지 생성</Text>
          <SwitchLine label="AI 이미지 생성 사용" value={imageEnabled} onChange={setImageEnabled} />
          <SwitchLine label="삽화/태그 모드" value={imageIllustration} onChange={setImageIllustration} />
          <SwitchLine label="NSFW 프롬프트 허용" value={imageNsfw} onChange={setImageNsfw} />
          <Text style={styles.label}>Endpoint</Text>
          <TextInput value={imageEndpoint} onChangeText={setImageEndpoint} style={styles.input} autoCapitalize="none" />
          <Text style={styles.label}>모델</Text>
          <TextInput value={imageModel} onChangeText={setImageModel} style={styles.input} autoCapitalize="none" />
          <Text style={styles.label}>이미지 API 키</Text>
          <TextInput value={imageApiKey} onChangeText={setImageApiKey} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>크기</Text>
              <TextInput value={imageSize} onChangeText={setImageSize} style={styles.input} autoCapitalize="none" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>품질</Text>
              <TextInput value={imageQuality} onChangeText={setImageQuality} style={styles.input} autoCapitalize="none" />
            </View>
          </View>
          <Text style={styles.label}>프롬프트 접두 지시</Text>
          <TextInput value={imagePrefix} onChangeText={setImagePrefix} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
          <Text style={styles.label}>네거티브 프롬프트</Text>
          <TextInput value={imageNegative} onChangeText={setImageNegative} style={[styles.input, styles.textareaSmall]} multiline textAlignVertical="top" />
          <Text style={styles.help}>OpenAI Responses image_generation 또는 /images/generations 호환 endpoint를 사용할 수 있습니다. 비워두면 OpenAI 텍스트 API 키를 대체 사용합니다.</Text>
          <Pressable onPress={saveImageGeneration} style={styles.primary}><Text style={styles.primaryText}>이미지 설정 저장</Text></Pressable>
        </View>

        <View style={[styles.card, activeSection !== 'prompts' && styles.hidden]}>
          <Text style={styles.cardTitle}>SNS 생성 옵션</Text>
          <Text style={styles.label}>기본 플랫폼</Text>
          <View style={styles.segmentRow}>
            {['hybrid', 'instagram', 'twitter'].map(item => (
              <Pressable key={item} onPress={() => setSnsDefaultPlatform(item)} style={[styles.segment, snsDefaultPlatform === item && styles.segmentActive]}>
                <Text style={[styles.segmentText, snsDefaultPlatform === item && styles.segmentTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>댓글 수</Text>
              <TextInput value={snsCommentQty} onChangeText={setSnsCommentQty} style={styles.input} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>무드</Text>
              <TextInput value={snsMood} onChangeText={setSnsMood} style={styles.input} />
            </View>
          </View>
          <Text style={styles.label}>소재</Text>
          <TextInput value={snsSubject} onChangeText={setSnsSubject} style={styles.input} />
          <SwitchLine label="익명계" value={snsAnonymous} onChange={setSnsAnonymous} />
          <SwitchLine label="NSFW 뒷계" value={snsNsfw} onChange={setSnsNsfw} />
          <SwitchLine label="하이브리드 NSFW 분리" value={snsHybridNsfwSplit} onChange={setSnsHybridNsfwSplit} />
          <SwitchLine label="글만 생성" value={snsTextOnly} onChange={setSnsTextOnly} />
          <SwitchLine label="AI 댓글 자동 생성" value={snsAutoComments} onChange={setSnsAutoComments} />
          <SwitchLine label="SNS DM 생성 안함" value={snsNoDM} onChange={setSnsNoDM} />
          <SwitchLine label="제3자 DM 허용" value={snsThirdPartyDM} onChange={setSnsThirdPartyDM} />
          <SwitchLine label="이미지 자동 생성" value={snsAutoImage} onChange={setSnsAutoImage} />
          <Text style={styles.help}>NSFW 뒷계는 성인 캐릭터의 비공개 계정 분위기 지시입니다. 하이브리드 분리는 Instagram은 공개용 SFW, X는 뒷계 톤으로 나누도록 지시합니다.</Text>
          <Pressable onPress={saveSnsOptions} style={styles.primary}><Text style={styles.primaryText}>SNS 옵션 저장</Text></Pressable>
        </View>

        <View style={[styles.card, activeSection !== 'user' && styles.hidden]}>
          <Text style={styles.cardTitle}>자동화</Text>
          <SwitchLine label="전체 자동화" value={autoEnabled} onChange={setAutoEnabled} />
          <SwitchLine label="개인톡 먼저 말하기" value={privateFirst} onChange={setPrivateFirst} />
          <SwitchLine label="단톡 먼저 말하기" value={groupFirst} onChange={setGroupFirst} />
          <SwitchLine label="랜덤 첫 메시지" value={randomDmEnabled} onChange={setRandomDmEnabled} />
          <SwitchLine label="SNS 자동 게시" value={snsAutoPostEnabled} onChange={setSnsAutoPostEnabled} />
          <SwitchLine label="캐릭터 먼저 전화" value={characterPhoneCallEnabled} onChange={setCharacterPhoneCallEnabled} />
          <View style={styles.twoCols}>
            <View style={styles.col}>
              <Text style={styles.label}>SNS 자동 게시 확률(%)</Text>
              <TextInput value={snsAutoChance} onChangeText={setSnsAutoChance} style={styles.input} keyboardType="number-pad" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>SNS 시작 메시지 수</Text>
              <TextInput value={snsStartCount} onChangeText={setSnsStartCount} style={styles.input} keyboardType="number-pad" />
            </View>
          </View>
          <Pressable onPress={saveAutomation} style={styles.primary}><Text style={styles.primaryText}>자동화 저장</Text></Pressable>
        </View>

        <View style={[styles.card, activeSection !== 'user' && styles.hidden]}>
          <Text style={styles.cardTitle}>백업</Text>
          <Text style={styles.help}>현재 WebView 앱에서 백업한 msgod_state_v2.json을 새 저장소로 가져오거나, RN 앱의 현재 데이터를 JSON으로 내보냅니다.</Text>
          <Text style={styles.label}>백업 JSON 붙여넣기</Text>
          <TextInput value={importJson} onChangeText={setImportJson} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" autoCapitalize="none" />
          <Pressable onPress={importBackupFile} disabled={saving} style={[styles.secondary, saving && styles.disabled]}><Text style={styles.secondaryText}>JSON 파일 선택 임포트</Text></Pressable>
          <Pressable onPress={importPastedBackup} disabled={saving} style={[styles.secondary, saving && styles.disabled]}><Text style={styles.secondaryText}>붙여넣은 JSON 임포트</Text></Pressable>
          <Pressable onPress={exportBackup} style={styles.secondary}><Text style={styles.secondaryText}>현재 데이터 내보내기/공유</Text></Pressable>
        </View>
        <View style={[styles.card, activeSection !== 'prompts' && styles.hidden]}>
          <Text style={styles.cardTitle}>프롬프트</Text>
          <Text style={styles.help}>대화, SNS, 프로필 생성 지시문을 원본 PC 버전처럼 별도 화면에서 편집합니다.</Text>
          <Pressable onPress={onOpenPrompts} style={styles.secondary}><Text style={styles.secondaryText}>프롬프트 관리</Text></Pressable>
        </View>
        <View style={[styles.card, activeSection !== 'lorebook' && styles.hidden]}>
          <Text style={styles.cardTitle}>공통 로어북</Text>
          <Text style={styles.help}>트리거 단어가 나올 때만 참고하는 설정입니다. 현재 공통/캐릭터 로어북 항목은 {(state.loreEntries || []).length}개입니다.</Text>
          <Pressable onPress={onOpenLorebook} style={styles.secondary}><Text style={styles.secondaryText}>로어북 관리</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SwitchLine({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.switchLine}>
      <Text style={styles.switchLineText}>{label}</Text>
      <Text style={[styles.switchPill, value && styles.switchPillActive]}>{value ? '켬' : '끔'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 72, paddingTop: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#eee8dc' },
  backText: { fontSize: 32, color: colors.text, lineHeight: 34 },
  title: { fontSize: 21, fontWeight: '900', color: colors.text },
  sectionBar: { backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  sectionTab: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  sectionTabActive: { backgroundColor: colors.accent, borderColor: '#b89117' },
  sectionTabText: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  sectionTabTextActive: { color: '#241a00' },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  hidden: { display: 'none' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 12 },
  missingTitle: { marginTop: 14, marginBottom: 6, color: colors.text, fontWeight: '900' },
  label: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 10, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, color: colors.text, backgroundColor: '#fffefa' },
  profileTextarea: { height: 112, paddingVertical: 10 },
  textarea: { minHeight: 128, paddingVertical: 10 },
  textareaSmall: { minHeight: 86, paddingVertical: 10 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  segmentActive: { backgroundColor: colors.accent, borderColor: '#b89117' },
  segmentText: { color: colors.sub, fontWeight: '900' },
  segmentTextActive: { color: '#241a00' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', justifyContent: 'center' },
  presetText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  keyToggle: { alignSelf: 'flex-start', marginTop: 10, minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#eee8dc', justifyContent: 'center' },
  keyToggleText: { color: colors.text, fontWeight: '900' },
  twoCols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  primary: { marginTop: 14, height: 44, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' },
  primarySmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primarySmallText: { color: '#241a00', fontWeight: '900' },
  secondary: { marginTop: 12, height: 42, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryInline: { marginTop: 14, height: 44, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  rowButton: { flex: 1 },
  disabled: { opacity: 0.55 },
  switchLine: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchLineText: { color: colors.text, fontWeight: '900' },
  switchPill: { minWidth: 44, overflow: 'hidden', textAlign: 'center', lineHeight: 28, height: 28, borderRadius: 14, backgroundColor: '#eee8dc', color: colors.sub, fontWeight: '900' },
  switchPillActive: { backgroundColor: colors.accent, color: '#241a00' },
  help: { color: colors.sub, lineHeight: 20 }
  ,
  statusBox: { backgroundColor: '#fff3c4', borderWidth: 1, borderColor: '#d6b84c', borderRadius: 8, padding: 12 },
  statusText: { color: '#3a2a00', fontWeight: '900', lineHeight: 20 },
  listRow: { minHeight: 64, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarDot: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarDotText: { color: colors.text, fontWeight: '900' },
  listBody: { flex: 1 },
  listTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  listSub: { marginTop: 3, color: colors.sub, fontSize: 12, fontWeight: '700' },
  chevron: { color: colors.sub, fontSize: 24, fontWeight: '900' },
  stickerIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  stickerIconText: { color: colors.text, fontWeight: '900' },
  stickerCard: { marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', flexDirection: 'row', gap: 12 },
  stickerPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#eee8dc' },
  stickerEditBody: { flex: 1 },
  inlineActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  dangerButton: { flex: 1, minHeight: 42, borderRadius: 7, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: '#d14444', fontWeight: '900' },
  emptyText: { marginTop: 10, color: colors.sub, fontWeight: '800' },
  eventRow: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f0eee8', flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventPrompt: { marginTop: 5, color: colors.sub, lineHeight: 18 },
  deleteButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#d14444', fontWeight: '900' }
});
