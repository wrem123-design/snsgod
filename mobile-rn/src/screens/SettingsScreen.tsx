import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Image, InteractionManager, Linking, NativeModules, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';
import { ApiProvider, CalendarEvent, SNSGodState, Sticker } from '../types';
import { normalizeLegacyState } from '../storage/importLegacy';
import { callLLMText } from '../logic/api';
import { makeId } from '../logic/ids';
import { isRenderableMediaUri, pickStickerDataUri } from '../logic/media';
import { Avatar } from '../components/Avatar';
import { fetchGrokAccounts, fetchGrokBilling, fetchGrokStatus, GrokBilling, GrokLocalAccount, GrokLocalStatus, grokBaseUrl, grokCloudBaseUrl, logoutGrokOAuth, selectGrokOAuth, startGrokLogin, submitGrokOAuthCallback } from '../logic/grokLocal';
import { createBackupPayload } from '../logic/backup';
import { DEFAULT_USER_APPEARANCE_PROMPT } from '../logic/prompts';
import { MAX_CONTEXT_MESSAGES } from '../logic/limits';
import { editableForbiddenPromptRules } from '../logic/imagePromptRules';
import { getRecommendedOptimizationStatus, maybePromptBatteryOptimizationExemption, RecommendedOptimizationStatus } from '../logic/backgroundAutomation';

const PROVIDERS: ApiProvider[] = ['vertex', 'gemini', 'openai', 'anthropic', 'custom'];
const PROVIDER_PRESETS: Partial<Record<ApiProvider, { endpoint: string; model: string }[]>> = {
  vertex: [
    { endpoint: '', model: 'gemini-3-flash-preview' },
    { endpoint: '', model: 'gemini-3.1-pro-preview' },
    { endpoint: '', model: 'gemini-2.5-pro' },
    { endpoint: '', model: 'gemini-3.5-flash' }
  ],
  gemini: [
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-pro' },
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash-lite' },
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.5-flash' },
    { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3-flash-preview' }
  ],
  openai: [
    { endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-4.1-mini' },
    { endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-4.1' }
  ],
  anthropic: [
    { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5' }
  ],
  custom: [
    { endpoint: 'https://api.cerebras.ai/v1/chat/completions', model: 'gemma-4-31b' }
  ]
};

type ImageProvider = 'grok-local' | 'grok-cloud' | 'openai';

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
  if (value === 'prompts') return 'user';
  return SECTION_TABS.some(tab => tab.key === value) ? value as SettingsSection : 'user';
}

type SnsSettingsPlatform = 'instagram' | 'twitter';

function snsPlatform(value: unknown): SnsSettingsPlatform {
  return value === 'twitter' ? 'twitter' : 'instagram';
}

function snsPlatformOptions(config: SNSGodState['config']['sns'] | undefined, platform: SnsSettingsPlatform) {
  const base = config || {};
  return {
    anonymous: base.anonymous === true,
    nsfw: base.nsfw === true,
    textOnly: base.textOnly === true,
    noDM: base.noDM === true,
    thirdPartyDM: base.thirdPartyDM === true,
    autoComments: base.autoComments !== false,
    commentQty: base.commentQty || '2-4',
    subject: base.subject || '',
    mood: base.mood || '',
    autoImage: base.autoImage !== false,
    ...(base.platformOptions?.[platform] || {})
  };
}

function phoneRarityFromChancePercent(value: unknown): number {
  const numeric = Number(value);
  const chance = Math.max(0, Math.min(33, Number.isFinite(numeric) ? numeric : 33));
  return Math.max(0, Math.min(10, Math.round((33 - chance) / 3)));
}

function phoneMultiplierPercentFromRarity(value: unknown): number {
  const rarity = Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
  return Math.round((1 - rarity * 0.09) * 100);
}

function phoneCooldownMinutes(value: unknown, fallbackMinutes: number, legacyHours?: unknown): number {
  const minutes = Number(value);
  if (Number.isFinite(minutes)) return Math.max(0, Math.min(10080, Math.round(minutes)));
  const hours = Number(legacyHours);
  if (Number.isFinite(hours)) return Math.max(0, Math.min(10080, Math.round(hours * 60)));
  return fallbackMinutes;
}

function normalizeDatingAgeRangeInput(value: unknown): string {
  const numbers = String(value || '')
    .match(/\d{1,3}/g)
    ?.map(item => Number(item))
    .filter(Number.isFinite) || [];
  let min = numbers[0] ?? 19;
  let max = numbers[1] ?? numbers[0] ?? 43;
  if (min > max) [min, max] = [max, min];
  min = Math.max(19, Math.min(80, Math.round(min)));
  max = Math.max(19, Math.min(80, Math.round(max)));
  if (min > max) [min, max] = [max, min];
  return `${min}-${max}`;
}

function apiKeySlotsFromProfile(profile: SNSGodState['config']['apiProfiles'][ApiProvider] | undefined): [string, string, string] {
  const primary = String(profile?.apiKey || '');
  const extras = (profile?.apiKeys || [])
    .map(value => String(value || ''))
    .filter((value, index, values) => value && value !== primary && values.indexOf(value) === index);
  return [primary, extras[0] || '', extras[1] || ''];
}

type UserProfilePreset = NonNullable<SNSGodState['config']['userProfilePresets']>[number];

function normalizedUserProfilePresets(config: SNSGodState['config']): UserProfilePreset[] {
  const existing = Array.isArray(config.userProfilePresets) ? config.userProfilePresets : [];
  const cleaned = existing
    .map((item, index) => ({
      id: String(item.id || `user_profile_${index}`),
      label: String(item.label || item.userName || `프로필 ${index + 1}`),
      userName: String(item.userName || '나'),
      userDescription: String(item.userDescription || ''),
      userAppearancePrompt: String(item.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT),
      createdAt: Number(item.createdAt || Date.now()),
      updatedAt: Number(item.updatedAt || Date.now())
    }))
    .filter(item => item.id);
  if (cleaned.length) return cleaned;
  return [{
    id: 'default_user_profile',
    label: '기본 프로필',
    userName: config.userName || '나',
    userDescription: config.userDescription || '',
    userAppearancePrompt: config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }];
}

const EVENT_PRESETS = [
  { title: "나's birthday", date: '1985-02-08', type: '유저 생일', prompt: "Event type: the user's birthday. The celebrant is 나. Write as the character directly to 나 in a private DM." },
  { title: '연인 기념일', date: 'MM-DD', type: '연인', prompt: 'Event type: relationship anniversary. The character remembers it naturally and may contact the user first.' },
  { title: '결혼기념일', date: 'MM-DD', type: '결혼기념일', prompt: 'Event type: wedding anniversary. Keep the tone intimate and in character.' },
  { title: '약속', date: 'YYYY-MM-DD', type: '약속', prompt: 'Event type: appointment. The character may mention or prepare for the plan.' }
];

const TERMUX_GROK_COMMAND = "cd ~/grok && (pkill -f 'python app.py' 2>/dev/null || true) && FLASK_HOST=127.0.0.1 FLASK_PORT=5000 nohup python app.py > ~/grok/grok.log 2>&1 &";
const TERMUX_GROK_LOGIN_COMMAND = 'cd ~/grok && hermes auth add xai-oauth';
const CLOUD_GROK_LOGIN_COMMAND = 'cd /opt/snsgod-grok && hermes auth add xai-oauth';

function grokLoginUrlFromPayload(payload: unknown): string {
  const seen = new Set<unknown>();
  const candidates: string[] = [];
  const collect = (value: unknown) => {
    if (!value || seen.has(value)) return;
    if (typeof value === 'string') {
      candidates.push(value);
      const embedded = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
      candidates.push(...embedded);
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);
    Object.values(value as Record<string, unknown>).forEach(collect);
  };
  collect(payload);
  return candidates
    .map(value => String(value || '').trim().replace(/[),.;]+$/g, ''))
    .find(value => /^https?:\/\//i.test(value)) || '';
}

function grokLoginMessageFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const nested = typeof record.result === 'object' && record.result ? record.result as Record<string, unknown> : {};
  return String(record.message || nested.message || record.detail || nested.detail || '').trim();
}

async function openExternalUrl(url: string): Promise<boolean> {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    await Linking.openURL(target);
    return true;
  } catch {
    const canOpen = await Linking.canOpenURL(target).catch(() => false);
    if (!canOpen) return false;
    await Linking.openURL(target);
    return true;
  }
}

const TermuxBridge = NativeModules.TermuxBridge as undefined | {
  openTermux: () => Promise<string>;
  runCommand: (command: string) => Promise<string>;
  copyText: (text: string) => Promise<string>;
};

async function requestTermuxRunPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permission = 'com.termux.permission.RUN_COMMAND' as never;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Termux 실행 권한',
    message: 'SNSGod가 Termux에 Grok 서버 실행 명령을 전달하려면 이 권한이 필요합니다.',
    buttonPositive: '허용',
    buttonNegative: '거부'
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function SettingsScreen({ state, onChange, onBack, onOpenLorebook, onOpenPrompts, onOpenCharacterSettings }: {
  state: SNSGodState;
  onChange: (next: SNSGodState, options?: { persist?: boolean }) => Promise<void> | void;
  onBack: () => void;
  onOpenLorebook?: () => void;
  onOpenPrompts?: () => void;
  onOpenCharacterSettings?: (characterId: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => getSettingsSection(state.config.lastSettingsSection));
  const [contentReady, setContentReady] = useState(false);
  const [optimizationStatus, setOptimizationStatus] = useState<RecommendedOptimizationStatus | null>(null);
  const [optimizationChecking, setOptimizationChecking] = useState(false);

  const refreshOptimizationStatus = useCallback(async () => {
    setOptimizationChecking(true);
    try {
      const next = await getRecommendedOptimizationStatus();
      setOptimizationStatus(next);
    } catch {
      setOptimizationStatus({
        ready: false,
        line: '추천 설정: 확인 실패 · 다시 눌러 검사',
        batteryExcluded: false,
        notificationsAllowed: false,
        keepAliveAvailable: false
      });
    } finally {
      setOptimizationChecking(false);
    }
  }, []);

  useEffect(() => {
    setContentReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setContentReady(true);
    });
    return () => task.cancel();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'user') return;
    void refreshOptimizationStatus();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') void refreshOptimizationStatus();
    });
    return () => sub.remove();
  }, [activeSection, refreshOptimizationStatus]);
  const [provider, setProvider] = useState<ApiProvider>(state.config.apiType);
  const profile = useMemo(() => state.config.apiProfiles[provider] || {}, [state.config.apiProfiles, provider]);
  const keySlots = useMemo(() => apiKeySlotsFromProfile(profile), [profile.apiKey, profile.apiKeys]);
  const [model, setModel] = useState(String(profile.apiModel || ''));
  const [endpoint, setEndpoint] = useState(String(profile.apiEndpoint || ''));
  const [maxTokens, setMaxTokens] = useState(String(profile.maxTokens || (provider === 'vertex' ? 4096 : 700)));
  const [temperature, setTemperature] = useState(String(profile.temperature || 0.85));
  const [contextMessageLimit, setContextMessageLimit] = useState(String(profile.contextMessageLimit || MAX_CONTEXT_MESSAGES));
  const [apiKey1, setApiKey1] = useState(keySlots[0]);
  const [apiKey2, setApiKey2] = useState(keySlots[1]);
  const [apiKey3, setApiKey3] = useState(keySlots[2]);
  const [vertexServiceAccountJson, setVertexServiceAccountJson] = useState(String(profile.serviceAccountJson || ''));
  const [vertexLocation, setVertexLocation] = useState(String(profile.location || 'global'));
  const [vertexServiceTier, setVertexServiceTier] = useState(String(profile.serviceTier || 'auto'));
  const [vertexTokenBridgeUrl, setVertexTokenBridgeUrl] = useState(String(profile.tokenBridgeUrl || ''));
  const [vertexCorsProxyUrl, setVertexCorsProxyUrl] = useState(String(profile.corsProxyUrl || ''));
  const [vertexProxyAccessToken, setVertexProxyAccessToken] = useState(String(profile.proxyAccessToken || ''));
  const [vertexDirectMode, setVertexDirectMode] = useState(profile.directMode === true);
  const [vertexFetchModels, setVertexFetchModels] = useState(profile.fetchModels === true);
  const [vertexThinkingLevel, setVertexThinkingLevel] = useState(String(profile.thinkingLevel || 'off'));
  const [vertexThinkingBudget, setVertexThinkingBudget] = useState(String(profile.thinkingBudgetTokens || 0));
  const userProfilePresets = normalizedUserProfilePresets(state.config);
  const activeUserProfileIndex = Math.max(0, userProfilePresets.findIndex(item => item.id === state.config.activeUserProfilePresetId));
  const activeUserProfile = userProfilePresets[activeUserProfileIndex] || userProfilePresets[0];
  const [userProfilePresetId, setUserProfilePresetId] = useState(activeUserProfile?.id || 'default_user_profile');
  const [userProfileLabel, setUserProfileLabel] = useState(activeUserProfile?.label || '기본 프로필');
  const [userName, setUserName] = useState(state.config.userName || '나');
  const [roomName, setRoomName] = useState(state.config.roomName || '채팅');
  const [language, setLanguage] = useState(state.config.language || 'Korean');
  const [userDescription, setUserDescription] = useState(state.config.userDescription || '');
  const [userAppearancePrompt, setUserAppearancePrompt] = useState(String(state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT));
  const [fontScale, setFontScale] = useState(String(state.config.fontScale || 1));
  const [snsAutoChance, setSnsAutoChance] = useState(String(state.config.snsAutoChance ?? 40));
  const [snsStartCount, setSnsStartCount] = useState(String(state.config.snsStartCount ?? 6));
  const [datingAppRefreshHours, setDatingAppRefreshHours] = useState(String(state.config.datingAppRefreshHours ?? state.datingApp?.refreshIntervalHours ?? 12));
  const [datingAppAcceptanceChance, setDatingAppAcceptanceChance] = useState(String(state.config.datingAppAcceptanceChancePercent ?? state.datingApp?.acceptanceChancePercent ?? 50));
  const [datingAppAgeRange, setDatingAppAgeRange] = useState(String(state.config.datingAppAgeRange || '19-43'));
  const [snsIncludeUserInDM, setSnsIncludeUserInDM] = useState((state.config.sns || {}).includeUserInDM !== false);
  const [autoEnabled, setAutoEnabled] = useState(state.config.autoEnabled !== false);
  const [privateFirst, setPrivateFirst] = useState(state.config.privateFirst === true);
  const [groupFirst, setGroupFirst] = useState(state.config.groupFirst === true);
  const [randomDmEnabled, setRandomDmEnabled] = useState(state.config.randomDmEnabled !== false);
  const [snsAutoPostEnabled, setSnsAutoPostEnabled] = useState(state.config.snsAutoPostEnabled !== false);
  const [characterPhoneCallEnabled, setCharacterPhoneCallEnabled] = useState(state.config.characterPhoneCallEnabled !== false);
  const [characterPhoneCallRarityLevel, setCharacterPhoneCallRarityLevel] = useState(Number(state.config.characterPhoneCallRarityLevel ?? phoneRarityFromChancePercent(state.config.characterPhoneCallChancePercent)));
  const [characterPhoneCallMinCooldownMinutes, setCharacterPhoneCallMinCooldownMinutes] = useState(String(phoneCooldownMinutes(state.config.characterPhoneCallMinCooldownMinutes, 360, state.config.characterPhoneCallMinCooldownHours)));
  const [characterPhoneCallGlobalCooldownMinutes, setCharacterPhoneCallGlobalCooldownMinutes] = useState(String(phoneCooldownMinutes(state.config.characterPhoneCallGlobalCooldownMinutes, 180, state.config.characterPhoneCallGlobalCooldownHours)));
  const imageConfig = state.config.imageGeneration || {};
  const snsConfig = state.config.sns || {};
  const [imageEnabled, setImageEnabled] = useState(imageConfig.enabled === true);
  const [imageProvider, setImageProvider] = useState<ImageProvider>(imageConfig.provider === 'grok-local' || imageConfig.provider === 'grok-cloud' ? imageConfig.provider : 'openai');
  const [imageApiKey, setImageApiKey] = useState(String(imageConfig.apiKey || ''));
  const [imageEndpoint, setImageEndpoint] = useState(String(imageConfig.apiEndpoint || 'https://api.openai.com/v1/responses'));
  const [grokLocalBaseUrl, setGrokLocalBaseUrl] = useState(grokBaseUrl(imageConfig));
  const [grokCloudUrl, setGrokCloudUrl] = useState(grokCloudBaseUrl(imageConfig));
  const [imageModel, setImageModel] = useState(String(imageConfig.apiModel || 'gpt-5'));
  const [imageSize, setImageSize] = useState(String(imageConfig.size || '1024x1024'));
  const [imageQuality, setImageQuality] = useState(String(imageConfig.quality || 'auto'));
  const [grokResolution, setGrokResolution] = useState(String(imageConfig.grokResolution || '1k'));
  const [grokAspectRatio, setGrokAspectRatio] = useState(String(imageConfig.grokAspectRatio || 'auto'));
  const [imagePrefix, setImagePrefix] = useState(String(imageConfig.promptPrefix || ''));
  const [imageNegative, setImageNegative] = useState(String(imageConfig.negativePrompt || ''));
  const [imageForbiddenRules, setImageForbiddenRules] = useState(editableForbiddenPromptRules(imageConfig.forbiddenPromptRules));
  const [imageNsfw, setImageNsfw] = useState(imageConfig.nsfw === true);
  const [imageIllustration, setImageIllustration] = useState(imageConfig.illustrationMode === true);
  const [grokStatus, setGrokStatus] = useState<GrokLocalStatus | undefined>();
  const [grokBilling, setGrokBilling] = useState<GrokBilling | undefined>();
  const [grokAccounts, setGrokAccounts] = useState<GrokLocalAccount[]>([]);
  const [grokLoginBusy, setGrokLoginBusy] = useState(false);
  const [grokOAuthCallback, setGrokOAuthCallback] = useState('');
  const [grokCallbackBusy, setGrokCallbackBusy] = useState(false);
  const [snsDefaultPlatform, setSnsDefaultPlatform] = useState<SnsSettingsPlatform>(() => snsPlatform(snsConfig.platform));
  const initialSnsOptions = useMemo(() => snsPlatformOptions(snsConfig, snsPlatform(snsConfig.platform)), [snsConfig]);
  const [snsCommentQty, setSnsCommentQty] = useState(String(initialSnsOptions.commentQty || '2-4'));
  const [snsSubject, setSnsSubject] = useState(String(initialSnsOptions.subject || ''));
  const [snsMood, setSnsMood] = useState(String(initialSnsOptions.mood || ''));
  const [snsAnonymous, setSnsAnonymous] = useState(initialSnsOptions.anonymous === true);
  const [snsNsfw, setSnsNsfw] = useState(initialSnsOptions.nsfw === true);
  const [snsTextOnly, setSnsTextOnly] = useState(initialSnsOptions.textOnly === true);
  const [snsNoDM, setSnsNoDM] = useState(initialSnsOptions.noDM === true);
  const [snsThirdPartyDM, setSnsThirdPartyDM] = useState(initialSnsOptions.thirdPartyDM === true);
  const [snsAutoComments, setSnsAutoComments] = useState(initialSnsOptions.autoComments !== false);
  const [snsAutoImage, setSnsAutoImage] = useState(initialSnsOptions.autoImage !== false);
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
  const hasUnsavedUserProfilePreset = !userProfilePresets.some(item => item.id === userProfilePresetId);

  useEffect(() => {
    const options = snsPlatformOptions(state.config.sns, snsDefaultPlatform);
    setSnsCommentQty(String(options.commentQty || '2-4'));
    setSnsSubject(String(options.subject || ''));
    setSnsMood(String(options.mood || ''));
    setSnsAnonymous(options.anonymous === true);
    setSnsNsfw(options.nsfw === true);
    setSnsTextOnly(options.textOnly === true);
    setSnsNoDM(options.noDM === true);
    setSnsThirdPartyDM(options.thirdPartyDM === true);
    setSnsAutoComments(options.autoComments !== false);
    setSnsAutoImage(options.autoImage !== false);
  }, [snsDefaultPlatform, state.config.sns]);

  useEffect(() => {
    const presets = normalizedUserProfilePresets(state.config);
    const index = Math.max(0, presets.findIndex(item => item.id === state.config.activeUserProfilePresetId));
    const preset = presets[index] || presets[0];
    if (!preset) return;
    setUserProfilePresetId(preset.id);
    setUserProfileLabel(preset.label || '기본 프로필');
    setUserName(state.config.userName || preset.userName || '나');
    setUserDescription(state.config.userDescription || preset.userDescription || '');
    setUserAppearancePrompt(String(state.config.userAppearancePrompt || preset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT));
  }, [state.config.activeUserProfilePresetId, state.config.userName, state.config.userDescription, state.config.userAppearancePrompt]);

  async function openSection(section: SettingsSection) {
    if (section === 'prompts' && onOpenPrompts) {
      onOpenPrompts();
      return;
    }
    setActiveSection(section);
  }

  function applyEventPreset(preset: typeof EVENT_PRESETS[number]) {
    setEventTitle(preset.title);
    setEventDate(preset.date);
    setEventType(preset.type);
    setEventPrompt(preset.prompt);
  }

  async function selectPersistedUserProfilePreset(offset: number, basePresetId = userProfilePresetId) {
    if (!userProfilePresets.length || saving) return;
    const currentIndex = Math.max(0, userProfilePresets.findIndex(item => item.id === basePresetId));
    const nextIndex = (currentIndex + offset + userProfilePresets.length) % userProfilePresets.length;
    const preset = userProfilePresets[nextIndex];
    setUserProfilePresetId(preset.id);
    setUserProfileLabel(preset.label);
    setUserName(preset.userName || '나');
    setUserDescription(preset.userDescription || '');
    setUserAppearancePrompt(String(preset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT));
    try {
      await onChange({
        ...state,
        config: {
          ...state.config,
          activeUserProfilePresetId: preset.id,
          userName: preset.userName || '나',
          userDescription: preset.userDescription || '',
          userAppearancePrompt: preset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT,
          userProfilePresets
        }
      });
      setStatus(`프로필 전환 완료: ${preset.label}`);
    } catch (error) {
      setStatus(`프로필 전환 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function selectUserProfilePreset(offset: number) {
    if (!userProfilePresets.length || saving) return;
    if (hasUnsavedUserProfilePreset) {
      const basePresetId = state.config.activeUserProfilePresetId || userProfilePresets[0]?.id || userProfilePresetId;
      Alert.alert(
        '저장하지 않은 프로필',
        '새 프로필이 아직 저장되지 않았습니다. 저장하지 않고 다른 프로필로 이동할까요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '이동',
            style: 'destructive',
            onPress: () => {
              void selectPersistedUserProfilePreset(offset, basePresetId);
            }
          }
        ]
      );
      return;
    }
    await selectPersistedUserProfilePreset(offset);
  }

  function newUserProfilePreset() {
    const id = makeId('userprofile');
    setUserProfilePresetId(id);
    setUserProfileLabel(`새 프로필 ${userProfilePresets.length + 1}`);
    setUserName('나');
    setUserDescription('');
    setUserAppearancePrompt(DEFAULT_USER_APPEARANCE_PROMPT);
    setStatus('새 프로필 초안입니다. 내용을 입력한 뒤 프로필 저장을 누르세요.');
  }

  function deleteCurrentUserProfilePreset() {
    if (saving) return;
    if (hasUnsavedUserProfilePreset) {
      const fallbackPreset = userProfilePresets[activeUserProfileIndex] || userProfilePresets[0];
      if (!fallbackPreset) return;
      Alert.alert(
        '새 프로필 버리기',
        '저장하지 않은 새 프로필을 버리고 이전 프로필로 돌아갈까요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '버리기',
            style: 'destructive',
            onPress: () => {
              setUserProfilePresetId(fallbackPreset.id);
              setUserProfileLabel(fallbackPreset.label);
              setUserName(fallbackPreset.userName || '나');
              setUserDescription(fallbackPreset.userDescription || '');
              setUserAppearancePrompt(String(fallbackPreset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT));
              setStatus('새 프로필 초안을 버렸습니다.');
            }
          }
        ]
      );
      return;
    }
    if (userProfilePresets.length <= 1) {
      setStatus('프로필은 최소 1개 이상 필요합니다.');
      return;
    }
    const currentIndex = Math.max(0, userProfilePresets.findIndex(item => item.id === userProfilePresetId));
    const currentPreset = userProfilePresets[currentIndex] || userProfilePresets[0];
    if (!currentPreset) return;
    Alert.alert(
      '프로필 삭제',
      `"${currentPreset.label}" 프로필을 삭제할까요? 삭제한 프로필은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const nextPresets = userProfilePresets.filter(item => item.id !== currentPreset.id);
                const nextPreset = nextPresets[Math.max(0, currentIndex - 1)] || nextPresets[0];
                if (!nextPreset) return;
                await onChange({
                  ...state,
                  config: {
                    ...state.config,
                    activeUserProfilePresetId: nextPreset.id,
                    userProfilePresets: nextPresets,
                    userName: nextPreset.userName || '나',
                    userDescription: nextPreset.userDescription || '',
                    userAppearancePrompt: nextPreset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT
                  }
                });
                setUserProfilePresetId(nextPreset.id);
                setUserProfileLabel(nextPreset.label);
                setUserName(nextPreset.userName || '나');
                setUserDescription(nextPreset.userDescription || '');
                setUserAppearancePrompt(String(nextPreset.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT));
                setStatus(`프로필 삭제 완료: ${currentPreset.label}`);
              } catch (error) {
                setStatus(`프로필 삭제 실패: ${error instanceof Error ? error.message : String(error)}`);
              } finally {
                setSaving(false);
              }
            })();
          }
        }
      ]
    );
  }

  function selectProvider(nextProvider: ApiProvider) {
    const nextProfile = state.config.apiProfiles[nextProvider] || {};
    const keys = apiKeySlotsFromProfile(nextProfile);
    setProvider(nextProvider);
    setModel(String(nextProfile.apiModel || ''));
    setEndpoint(String(nextProfile.apiEndpoint || ''));
    setMaxTokens(String(nextProfile.maxTokens || (nextProvider === 'vertex' ? 4096 : 700)));
    setTemperature(String(nextProfile.temperature || 0.85));
    setContextMessageLimit(String(nextProfile.contextMessageLimit || MAX_CONTEXT_MESSAGES));
    setApiKey1(keys[0] || '');
    setApiKey2(keys[1] || '');
    setApiKey3(keys[2] || '');
    setVertexServiceAccountJson(String(nextProfile.serviceAccountJson || ''));
    setVertexLocation(String(nextProfile.location || 'global'));
    setVertexServiceTier(String(nextProfile.serviceTier || 'auto'));
    setVertexTokenBridgeUrl(String(nextProfile.tokenBridgeUrl || ''));
    setVertexCorsProxyUrl(String(nextProfile.corsProxyUrl || ''));
    setVertexProxyAccessToken(String(nextProfile.proxyAccessToken || ''));
    setVertexDirectMode(nextProfile.directMode === true);
    setVertexFetchModels(nextProfile.fetchModels === true);
    setVertexThinkingLevel(String(nextProfile.thinkingLevel || 'off'));
    setVertexThinkingBudget(String(nextProfile.thinkingBudgetTokens || 0));
  }

  function buildApiState(): { next: SNSGodState; keyCount: number } {
    const profile = { ...(state.config.apiProfiles[provider] || {}) };
    const keys = Array.from(new Set([apiKey1, apiKey2, apiKey3].map(value => String(value || '').trim()).filter(Boolean)));
    const normalizedModel = model.trim() || (provider === 'vertex' ? 'gemini-3-flash-preview' : '');
    const normalizedMaxTokens = Math.max(32, Math.round(Number(maxTokens) || (provider === 'vertex' ? 4096 : 700)));
    const normalizedContextLimit = Math.max(4, Math.min(80, Math.round(Number(contextMessageLimit) || MAX_CONTEXT_MESSAGES)));
    const safeMaxTokens = provider === 'vertex' && /gemini-3/i.test(normalizedModel)
      ? Math.max(4096, normalizedMaxTokens)
      : normalizedMaxTokens;
    const nextProfile = provider === 'vertex'
      ? {
        ...profile,
        apiKey: '',
        apiKeys: [],
        serviceAccountJson: vertexServiceAccountJson.trim(),
        location: vertexLocation.trim() || 'global',
        serviceTier: vertexServiceTier.trim() || 'auto',
        tokenBridgeUrl: vertexTokenBridgeUrl.trim(),
        corsProxyUrl: vertexCorsProxyUrl.trim(),
        proxyAccessToken: vertexProxyAccessToken.trim(),
        directMode: vertexDirectMode,
        fetchModels: vertexFetchModels,
        apiEndpoint: endpoint.trim(),
        apiModel: normalizedModel,
        thinkingLevel: vertexThinkingLevel.trim() || 'off',
        thinkingBudgetTokens: Math.max(0, Math.round(Number(vertexThinkingBudget) || 0)),
        maxTokens: safeMaxTokens,
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.85,
        contextMessageLimit: normalizedContextLimit
      }
      : {
        ...profile,
        apiKey: keys[0] || '',
        apiKeys: keys.slice(1),
        apiEndpoint: endpoint.trim(),
        apiModel: normalizedModel,
        maxTokens: safeMaxTokens,
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.85,
        contextMessageLimit: normalizedContextLimit
      };
    const next: SNSGodState = {
      ...state,
      config: {
        ...state.config,
        apiType: provider,
        apiProfiles: {
          ...state.config.apiProfiles,
          [provider]: nextProfile
        }
      }
    };
    return { next, keyCount: provider === 'vertex' ? (vertexServiceAccountJson.trim() ? 1 : 0) : keys.length };
  }

  async function saveApi() {
    if (saving) return;
    const { next, keyCount } = buildApiState();
    setSaving(true);
    try {
      await onChange(next);
      setStatus(provider === 'vertex'
        ? `API 저장 완료: Vertex · ${model.trim() || 'gemini-3-flash-preview'} · ${vertexLocation.trim() || 'global'} · 서비스 계정 ${keyCount ? '입력됨' : '비어 있음'}`
        : `API 저장 완료: ${provider} · ${model.trim() || '(모델 없음)'} · 키 ${keyCount}개`);
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
      setStatus(provider === 'vertex' ? 'API 테스트 실패: Vertex Service Account JSON을 먼저 입력하세요.' : 'API 테스트 실패: API 키를 먼저 입력하세요.');
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
      const now = Date.now();
      const nextPreset: UserProfilePreset = {
        id: userProfilePresetId || makeId('userprofile'),
        label: userProfileLabel.trim() || userName.trim() || '내 프로필',
        userName: userName.trim() || '나',
        userDescription,
        userAppearancePrompt: userAppearancePrompt.trim() || DEFAULT_USER_APPEARANCE_PROMPT,
        createdAt: userProfilePresets.find(item => item.id === userProfilePresetId)?.createdAt || now,
        updatedAt: now
      };
      const nextPresets = [
        nextPreset,
        ...userProfilePresets.filter(item => item.id !== nextPreset.id)
      ];
      await onChange({
        ...state,
        config: {
          ...state.config,
          activeUserProfilePresetId: nextPreset.id,
          userProfilePresets: nextPresets,
          userName: nextPreset.userName,
          roomName: roomName.trim() || '채팅',
          language: language.trim() || 'Korean',
          fontScale: Math.max(0.7, Math.min(1.6, Number(fontScale) || 1)),
          userDescription: nextPreset.userDescription,
          userAppearancePrompt: nextPreset.userAppearancePrompt
        }
      });
      setUserProfilePresetId(nextPreset.id);
      setUserProfileLabel(nextPreset.label);
      setStatus(`내 프로필 저장 완료: ${nextPreset.label}`);
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
    const phoneRarity = Math.max(0, Math.min(10, Math.round(Number(characterPhoneCallRarityLevel) || 0)));
    const phoneChance = Math.round(33 * (phoneMultiplierPercentFromRarity(phoneRarity) / 100));
    const phoneCharacterCooldown = Number(characterPhoneCallMinCooldownMinutes);
    const phoneGlobalCooldown = Number(characterPhoneCallGlobalCooldownMinutes);
    const phoneCharacterCooldownMinutes = Math.max(1, Math.min(10080, Math.round(Number.isFinite(phoneCharacterCooldown) ? phoneCharacterCooldown : 360)));
    const phoneGlobalCooldownMinutes = Math.max(0, Math.min(10080, Math.round(Number.isFinite(phoneGlobalCooldown) ? phoneGlobalCooldown : 180)));
    const datingRefresh = Math.max(1, Math.min(168, Math.round(Number(datingAppRefreshHours) || 12)));
    const datingChance = Math.max(0, Math.min(100, Math.round(Number(datingAppAcceptanceChance) || 50)));
    const datingAgeRangeValue = normalizeDatingAgeRangeInput(datingAppAgeRange);
    const previousDatingRefresh = Math.max(1, Math.min(168, Math.round(Number(state.config.datingAppRefreshHours ?? state.datingApp?.refreshIntervalHours ?? 12) || 12)));
    const datingRefreshChanged = previousDatingRefresh !== datingRefresh;
    const datingAgeRangeChanged = normalizeDatingAgeRangeInput(state.config.datingAppAgeRange || '19-43') !== datingAgeRangeValue;
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
          characterPhoneCallRarityLevel: phoneRarity,
          characterPhoneCallChancePercent: phoneChance,
          characterPhoneCallMinCooldownMinutes: phoneCharacterCooldownMinutes,
          characterPhoneCallGlobalCooldownMinutes: phoneGlobalCooldownMinutes,
          characterPhoneCallMinCooldownHours: phoneCharacterCooldownMinutes / 60,
          characterPhoneCallGlobalCooldownHours: phoneGlobalCooldownMinutes / 60,
          datingAppRefreshHours: datingRefresh,
          datingAppAcceptanceChancePercent: datingChance,
          datingAppAgeRange: datingAgeRangeValue,
          snsAutoChance: Math.max(0, Math.min(100, Math.round(Number(snsAutoChance) || 0))),
          snsStartCount: Math.max(1, Math.round(Number(snsStartCount) || 6)),
          sns: {
            ...(state.config.sns || {}),
            includeUserInDM: snsIncludeUserInDM
          }
        },
        datingApp: {
          ...(datingRefreshChanged || datingAgeRangeChanged ? {} : (state.datingApp || {})),
          refreshIntervalHours: datingRefresh,
          acceptanceChancePercent: datingChance,
          requestStatus: datingRefreshChanged || datingAgeRangeChanged ? 'none' : state.datingApp?.requestStatus
        }
      });
      setDatingAppAgeRange(datingAgeRangeValue);
      setStatus(datingRefreshChanged ? '자동화 저장 완료: 데이트 어플 갱신 주기가 바뀌어 후보 라운드를 초기화했어요.' : '자동화 저장 완료');
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
            provider: imageProvider,
            apiKey: imageApiKey.trim(),
            apiEndpoint: imageEndpoint.trim() || 'https://api.openai.com/v1/responses',
            apiModel: imageModel.trim() || 'gpt-5',
            grokBaseUrl: grokLocalBaseUrl.trim() || 'http://127.0.0.1:5000',
            grokCloudBaseUrl: grokCloudUrl.trim() || 'http://168.110.122.66',
            grokResolution: grokResolution.trim() || '1k',
            grokAspectRatio: grokAspectRatio.trim() || 'auto',
            size: imageSize.trim() || '1024x1024',
            quality: imageQuality.trim() || 'auto',
            promptPrefix: imagePrefix,
            negativePrompt: imageNegative,
            forbiddenPromptRules: imageForbiddenRules,
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

  async function refreshGrokLocal(options?: { silent?: boolean }): Promise<GrokLocalStatus | undefined> {
    const baseUrl = imageProvider === 'grok-cloud' ? (grokCloudUrl.trim() || 'http://168.110.122.66') : (grokLocalBaseUrl.trim() || 'http://127.0.0.1:5000');
    try {
      const [nextStatus, nextBilling, nextAccounts] = await Promise.all([
        fetchGrokStatus(baseUrl),
        fetchGrokBilling(baseUrl).catch(error => ({ remaining_percent: 0, error: String(error instanceof Error ? error.message : error) } as GrokBilling)),
        fetchGrokAccounts(baseUrl).catch(() => [])
      ]);
      setGrokStatus(nextStatus);
      setGrokBilling(nextBilling);
      setGrokAccounts(nextAccounts);
      if (nextStatus.hermesAuthenticated) {
        setStatus(`Grok 상태 확인 완료: ${nextStatus.tokenLabel || '상태 확인됨'} · CREDIT ${Math.round(Number(nextBilling.remaining_percent || 0))}%`);
        if (!options?.silent) Alert.alert('Grok 상태 확인', `${nextStatus.tokenLabel || '상태 확인됨'}\nCREDIT ${Math.round(Number(nextBilling.remaining_percent || 0))}%`);
      } else {
        const message = `Grok 인증 필요: ${nextStatus.tokenMessage || nextStatus.tokenLabel || 'OAuth 토큰 검증이 통과하지 않았습니다.'}`;
        setStatus(message);
        if (!options?.silent) Alert.alert('Grok 인증 필요', `${message}\n새창 로그인 후 callback URL 또는 인증 코드를 다시 붙여넣어 주세요.`);
      }
      return nextStatus;
    } catch (error) {
      const message = `Grok 상태 확인 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      if (!options?.silent) Alert.alert('Grok 상태 확인 실패', `${message}\n서버가 실행 중인지 먼저 확인하세요.`);
      return undefined;
    }
  }

  async function startGrokOAuthLoginInTermux() {
    try {
      const baseUrl = grokLocalBaseUrl.trim() || 'http://127.0.0.1:5000';
      const currentStatus = await fetchGrokStatus(baseUrl).catch(() => undefined);
      if (currentStatus?.hermesAuthenticated) {
        setGrokStatus(currentStatus);
        const message = currentStatus.tokenMessage || '현재 복사된 Hermes OAuth 토큰이 정상으로 확인되었습니다.';
        setStatus(`Grok 계정 추가 불필요: ${currentStatus.tokenLabel || 'API 정상'}`);
        Alert.alert('Grok OAuth', `이미 로그인되어 있습니다.\n${message}`);
        return;
      }
      if (!TermuxBridge) throw new Error('Termux 네이티브 브릿지가 준비되지 않았습니다. 앱을 재설치해 주세요.');
      const granted = await requestTermuxRunPermission();
      if (!granted) throw new Error('Termux 실행 권한이 허용되지 않았습니다.');
      await TermuxBridge.copyText(TERMUX_GROK_LOGIN_COMMAND);
      const message = await TermuxBridge.runCommand(TERMUX_GROK_LOGIN_COMMAND);
      setStatus(`${message} Termux 화면에서 X 로그인 안내를 진행하세요.`);
      Alert.alert('Grok 계정 추가', `${message}\nTermux 화면에 표시되는 X 로그인 안내를 진행하세요. 명령도 클립보드에 복사해 두었습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await TermuxBridge?.copyText(TERMUX_GROK_LOGIN_COMMAND);
      } catch {
        // Ignore clipboard fallback errors; the visible command below is still selectable.
      }
      setStatus(`Grok 계정 추가는 Termux에서 직접 실행해야 합니다: ${message}`);
      Alert.alert('Grok 계정 추가', `Termux를 열고 아래 명령을 붙여넣어 주세요.\n\n${TERMUX_GROK_LOGIN_COMMAND}`);
    }
  }

  async function startGrokOAuthLoginOnServer(baseUrl: string) {
    if (grokLoginBusy) return;
    setGrokLoginBusy(true);
    try {
      const payload = await startGrokLogin(baseUrl);
      const loginUrl = grokLoginUrlFromPayload(payload);
      const opened = await openExternalUrl(loginUrl);
      if (opened) {
        setStatus('Grok 로그인 창을 열었습니다. 승인 후 브라우저의 callback URL 또는 표시된 코드를 복사해 앱의 연동 완료 칸에 붙여넣어 주세요.');
        setTimeout(() => {
          void refreshGrokLocal();
        }, 1200);
        return;
      }
      const serverMessage = grokLoginMessageFromPayload(payload);
      const message = serverMessage
        ? `${serverMessage}\n\n서버가 폰에서 열 수 있는 OAuth 로그인 URL을 반환하지 않았습니다. /api/hermes/login 응답에 auth_url, login_url, url 중 하나가 필요합니다.`
        : '서버가 폰에서 열 수 있는 OAuth 로그인 URL을 반환하지 않았습니다. /api/hermes/login 응답에 auth_url, login_url, url 중 하나가 필요합니다.';
      setStatus(message);
      Alert.alert('Grok 계정 추가', message);
    } catch (error) {
      const message = `Grok 계정 추가 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('Grok 계정 추가 실패', `${message}\n서버 주소가 맞는지, 서버가 /api/hermes/login POST에서 로그인 URL을 반환하는지 확인해 주세요.`);
    } finally {
      setGrokLoginBusy(false);
    }
  }

  async function submitCloudGrokOAuthCallback() {
    if (grokCallbackBusy) return;
    const callback = grokOAuthCallback.trim();
    if (!callback) {
      Alert.alert('Grok OAuth', '브라우저 주소창의 callback URL 전체 또는 화면에 표시된 인증 코드를 붙여넣어 주세요.');
      return;
    }
    const baseUrl = grokCloudUrl.trim() || 'http://168.110.122.66';
    setGrokCallbackBusy(true);
    try {
      await submitGrokOAuthCallback(baseUrl, callback);
      setGrokOAuthCallback('');
      const nextStatus = await refreshGrokLocal({ silent: true });
      if (nextStatus?.hermesAuthenticated) {
        setStatus('Grok OAuth 연동 완료');
        Alert.alert('Grok OAuth', '연동이 완료되었습니다.');
      } else {
        const tokenMessage = nextStatus?.tokenMessage || '서버가 OAuth 코드는 저장했지만 xAI API 검증이 아직 통과하지 않았습니다.';
        setStatus(`Grok OAuth 검증 필요: ${tokenMessage}`);
        Alert.alert('Grok OAuth 검증 필요', `${tokenMessage}\n상태 확인이 토큰을 지우지는 않도록 서버를 수정했습니다. 새창 로그인으로 한 번 더 인증해 주세요.`);
      }
    } catch (error) {
      const message = `Grok OAuth 완료 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('Grok OAuth 완료 실패', `${message}\ncallback URL 전체 또는 표시된 코드만 다시 붙여넣어 보세요.`);
    } finally {
      setGrokCallbackBusy(false);
    }
  }

  async function runGrokAction(action: 'login' | 'select' | 'logout') {
    const baseUrl = imageProvider === 'grok-cloud' ? (grokCloudUrl.trim() || 'http://168.110.122.66') : (grokLocalBaseUrl.trim() || 'http://127.0.0.1:5000');
    try {
      if (action === 'login') {
        if (imageProvider === 'grok-cloud') {
          await startGrokOAuthLoginOnServer(baseUrl);
        } else {
          await startGrokOAuthLoginInTermux();
        }
        return;
      }
      if (action === 'select') {
        try {
          await selectGrokOAuth(baseUrl);
        } catch (selectError) {
          const currentStatus = await fetchGrokStatus(baseUrl).catch(() => undefined);
          if (currentStatus?.hermesAuthenticated) {
            setGrokStatus(currentStatus);
            setStatus(`Grok OAuth 선택 완료: ${currentStatus.tokenLabel || 'API 정상'}`);
            Alert.alert('Grok OAuth', `현재 OAuth가 이미 정상 선택되어 있습니다.\n${currentStatus.tokenMessage || ''}`.trim());
            return;
          }
          throw selectError;
        }
      }
      if (action === 'logout') await logoutGrokOAuth(baseUrl);
      await refreshGrokLocal();
    } catch (error) {
      const message = `Grok OAuth 작업 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('Grok OAuth 작업 실패', `${message}\n서버가 실행 중인지 확인해 주세요.`);
    }
  }

  async function openTermuxForGrok() {
    try {
      if (!TermuxBridge) throw new Error('Termux 네이티브 브릿지가 준비되지 않았습니다. 앱을 재설치해 주세요.');
      const message = await TermuxBridge.openTermux();
      setStatus(`${message} 아래 명령을 Termux에 붙여넣으면 Grok 서버가 실행됩니다.`);
      Alert.alert('Termux', `${message}\n자동 실행이 안 되면 화면의 수동 실행 명령을 붙여넣어 주세요.`);
    } catch (error) {
      const message = `Termux 열기 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('Termux 열기 실패', message);
    }
  }

  async function runGrokServerInTermux() {
    try {
      if (!TermuxBridge) throw new Error('Termux 네이티브 브릿지가 준비되지 않았습니다. 앱을 재설치해 주세요.');
      const granted = await requestTermuxRunPermission();
      if (!granted) throw new Error('Termux 실행 권한이 허용되지 않았습니다.');
      const message = await TermuxBridge.runCommand(TERMUX_GROK_COMMAND);
      setStatus(`${message} Termux에서 서버 실행 로그를 확인하세요.`);
      Alert.alert('Grok 서버 실행', `${message}\n잠시 후 상태 확인을 눌러 주세요.`);
    } catch (error) {
      const message = `Termux 자동 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('Termux 자동 실행 실패', `${message}\nTermux 열기 후 수동 실행 명령을 붙여넣어 주세요.`);
    }
  }

  async function copyGrokServerCommand() {
    try {
      if (!TermuxBridge) throw new Error('클립보드 브릿지가 준비되지 않았습니다. 앱을 재설치해 주세요.');
      const message = await TermuxBridge.copyText(TERMUX_GROK_COMMAND);
      setStatus(`${message} Termux에 붙여넣고 Enter를 누르면 서버가 실행됩니다.`);
      Alert.alert('복사 완료', '서버 실행 명령을 복사했습니다. Termux에 붙여넣고 Enter를 누르세요.');
    } catch (error) {
      const message = `복사 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('복사 실패', message);
    }
  }

  async function copyCloudGrokLoginCommand() {
    try {
      if (!TermuxBridge) throw new Error('클립보드 브릿지가 준비되지 않았습니다. 앱을 재설치해 주세요.');
      const message = await TermuxBridge.copyText(CLOUD_GROK_LOGIN_COMMAND);
      setStatus(`${message} Oracle 서버 SSH에 붙여넣고 로그인 안내를 완료하세요.`);
      Alert.alert('복사 완료', '클라우드 OAuth 명령을 복사했습니다. Oracle 서버 SSH에 붙여넣고 로그인 안내를 완료하세요.');
    } catch (error) {
      const message = `복사 실패: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(message);
      Alert.alert('복사 실패', message);
    }
  }

  async function saveSnsOptions() {
    if (saving) return;
    setSaving(true);
    try {
      const base = state.config.sns || {};
      const platformOptions = {
        ...(base.platformOptions || {}),
        [snsDefaultPlatform]: {
          anonymous: snsAnonymous,
          nsfw: snsNsfw,
          textOnly: snsTextOnly,
          noDM: snsNoDM,
          thirdPartyDM: snsThirdPartyDM,
          autoComments: snsAutoComments,
          commentQty: snsCommentQty.trim() || '2-4',
          subject: snsSubject,
          mood: snsMood,
          autoImage: snsAutoImage
        }
      };
      await onChange({
        ...state,
        config: {
          ...state.config,
          sns: {
            ...base,
            platform: snsDefaultPlatform,
            platformOptions
          }
        }
      });
      setStatus(`${snsDefaultPlatform === 'instagram' ? 'Instagram' : 'X'} SNS 옵션 저장 완료`);
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
      const payload = JSON.stringify(createBackupPayload(state, { includeMedia: false }), null, 2);
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

  const visibleCharacters = useMemo(
    () => activeSection === 'characters' || activeSection === 'stickers'
      ? state.characters.filter(character => character.randomTemporary !== true)
      : [],
    [activeSection, state.characters]
  );

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
        {contentReady ? (
          <>
        {status ? <View style={styles.statusBox}><Text style={styles.statusText}>{status}</Text></View> : null}
        <View style={[styles.card, activeSection !== 'characters' && styles.hidden]}>
          <Text style={styles.cardTitle}>캐릭터별 설정</Text>
          <Text style={styles.help}>캐릭터, 능동 채팅, 삼화 태그, 로어북은 캐릭터 편집 화면에서 관리합니다.</Text>
          {visibleCharacters.map(character => (
            <Pressable key={character.id} onPress={() => onOpenCharacterSettings?.(character.id)} style={styles.listRow}>
              <Avatar character={character} size={42} />
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
          {activeSection === 'stickers' && (state.userStickers || []).length ? (state.userStickers || []).map(sticker => {
            const draft = stickerDraft(sticker);
            return (
              <View key={sticker.id} style={styles.stickerCard}>
                {isRenderableMediaUri(sticker.data || sticker.mediaData) ? <Image source={{ uri: sticker.data || sticker.mediaData || '' }} style={styles.stickerPreview} resizeMode="cover" /> : <View style={styles.stickerIcon}><Text style={styles.stickerIconText}>S</Text></View>}
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
          }) : activeSection === 'stickers' ? <Text style={styles.emptyText}>스티커를 추가하세요.</Text> : null}
          <Text style={styles.cardTitle}>캐릭터 스티커</Text>
          <Text style={styles.help}>캐릭터 스티커는 캐릭터 답장에 사용할 수 있는 스티커입니다. 캐릭터별 설정에서 관리합니다.</Text>
          {visibleCharacters.map(character => (
            <Pressable key={character.id} onPress={() => onOpenCharacterSettings?.(character.id)} style={styles.listRow}>
              <Avatar character={character} size={42} />
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
          <Text style={styles.label}>프로필 프리셋</Text>
          <View style={styles.profilePresetSwitcher}>
            <Pressable onPress={() => void selectUserProfilePreset(-1)} disabled={saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length < 2)} style={[styles.profileArrow, (saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length < 2)) && styles.disabled]}>
              <Text style={styles.profileArrowText}>‹</Text>
            </Pressable>
            <View style={styles.profilePresetCenter}>
              <View style={styles.profilePresetNameBox}>
                <TextInput value={userProfileLabel} onChangeText={setUserProfileLabel} style={[styles.input, styles.profilePresetInput]} placeholder="프로필 이름" />
                <View style={styles.profilePresetActions}>
                  <Pressable onPress={newUserProfilePreset} disabled={saving || hasUnsavedUserProfilePreset} style={[styles.profilePresetAction, (saving || hasUnsavedUserProfilePreset) && styles.profilePresetActionDisabled]}>
                    <Text style={styles.profilePresetActionText}>+</Text>
                  </Pressable>
                  <Pressable onPress={deleteCurrentUserProfilePreset} disabled={saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length <= 1)} style={[styles.profilePresetAction, styles.profilePresetDeleteAction, (saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length <= 1)) && styles.profilePresetActionDisabled]}>
                    <Text style={[styles.profilePresetActionText, styles.profilePresetDeleteText]}>-</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.profilePresetMeta}>{userProfilePresets.findIndex(item => item.id === userProfilePresetId) >= 0 ? `${Math.max(1, userProfilePresets.findIndex(item => item.id === userProfilePresetId) + 1)} / ${userProfilePresets.length}` : `신규 / ${userProfilePresets.length + 1}`}</Text>
            </View>
            <Pressable onPress={() => void selectUserProfilePreset(1)} disabled={saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length < 2)} style={[styles.profileArrow, (saving || (!hasUnsavedUserProfilePreset && userProfilePresets.length < 2)) && styles.disabled]}>
              <Text style={styles.profileArrowText}>›</Text>
            </Pressable>
          </View>
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
          <Text style={styles.label}>내 외모 프롬프트</Text>
          <TextInput
            value={userAppearancePrompt}
            onChangeText={setUserAppearancePrompt}
            style={[styles.input, styles.profileTextarea]}
            multiline
            scrollEnabled
            textAlignVertical="top"
          />
          <Text style={styles.help}>만남 이벤트 스틸샷에서 유저 외모를 그릴 때 사용합니다. 비워두면 기본 20대 초반 한국 남성 외모로 저장됩니다.</Text>
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
          <TextInput value={endpoint} onChangeText={setEndpoint} style={styles.input} autoCapitalize="none" placeholder={provider === 'vertex' ? '비워두면 location 기반 Vertex endpoint 자동 사용' : ''} placeholderTextColor="#9a9387" />
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
          <Pressable onPress={() => setShowKeys(!showKeys)} style={styles.keyToggle}><Text style={styles.keyToggleText}>{showKeys ? '인증 정보 숨기기' : '인증 정보 보기'}</Text></Pressable>
          {provider === 'vertex' ? (
            <>
              <Text style={styles.label}>Service Account JSON Key</Text>
              <TextInput
                value={showKeys ? vertexServiceAccountJson : (vertexServiceAccountJson ? '저장된 서비스 계정 JSON이 있습니다.' : '')}
                onChangeText={setVertexServiceAccountJson}
                editable={showKeys}
                style={[styles.input, styles.vertexJsonBox]}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                placeholder="Google Cloud 서비스 계정 JSON 본문을 그대로 붙여넣기"
                placeholderTextColor="#9a9387"
              />
              <Text style={styles.help}>키 파일 경로가 아니라 JSON 본문 전체를 붙여넣습니다. 이 값은 앱 저장소에만 저장되고 소스코드에는 넣지 않습니다.</Text>
              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={styles.label}>Location Endpoint</Text>
                  <TextInput value={vertexLocation} onChangeText={setVertexLocation} style={styles.input} autoCapitalize="none" placeholder="global 또는 us-central1" placeholderTextColor="#9a9387" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Service Tier</Text>
                  <TextInput value={vertexServiceTier} onChangeText={setVertexServiceTier} style={styles.input} autoCapitalize="none" placeholder="auto / standard / flex" placeholderTextColor="#9a9387" />
                </View>
              </View>
              <Text style={styles.label}>Token Bridge URL</Text>
              <TextInput value={vertexTokenBridgeUrl} onChangeText={setVertexTokenBridgeUrl} style={styles.input} autoCapitalize="none" placeholder="선택사항" placeholderTextColor="#9a9387" />
              <Text style={styles.label}>CORS Proxy URL</Text>
              <TextInput value={vertexCorsProxyUrl} onChangeText={setVertexCorsProxyUrl} style={styles.input} autoCapitalize="none" placeholder="선택사항, RN 직접 호출에서는 보통 비워둠" placeholderTextColor="#9a9387" />
              <Text style={styles.label}>Proxy Access Token</Text>
              <TextInput value={vertexProxyAccessToken} onChangeText={setVertexProxyAccessToken} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" placeholder="선택사항" placeholderTextColor="#9a9387" />
              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={styles.label}>Thinking Level</Text>
                  <TextInput value={vertexThinkingLevel} onChangeText={setVertexThinkingLevel} style={styles.input} autoCapitalize="characters" placeholder="off / MINIMAL / LOW / MEDIUM / HIGH" placeholderTextColor="#9a9387" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Thinking Budget Tokens</Text>
                  <TextInput value={vertexThinkingBudget} onChangeText={setVertexThinkingBudget} style={styles.input} keyboardType="number-pad" />
                </View>
              </View>
              <SwitchLine label="Direct 모드" value={vertexDirectMode} onChange={setVertexDirectMode} />
              <SwitchLine label="서버에서 모델 목록 불러오기" value={vertexFetchModels} onChange={setVertexFetchModels} />
            </>
          ) : (
            <>
              <Text style={styles.label}>API 키 1</Text>
              <TextInput value={apiKey1} onChangeText={setApiKey1} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
              <Text style={styles.label}>API 키 2</Text>
              <TextInput value={apiKey2} onChangeText={setApiKey2} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
              <Text style={styles.label}>API 키 3</Text>
              <TextInput value={apiKey3} onChangeText={setApiKey3} style={styles.input} secureTextEntry={!showKeys} autoCapitalize="none" />
            </>
          )}
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
          <Text style={styles.label}>이전 대화 참조 개수</Text>
          <TextInput value={contextMessageLimit} onChangeText={setContextMessageLimit} style={styles.input} keyboardType="number-pad" />
          <Text style={styles.help}>일반 채팅 답장 생성에 넣는 최근 메시지 수입니다. 기본값은 {MAX_CONTEXT_MESSAGES}개이며, 너무 크게 잡으면 응답이 느려질 수 있습니다.</Text>
          <Text style={styles.help}>{provider === 'vertex' ? 'Vertex는 서비스 계정 JSON으로 OAuth 토큰을 발급받아 호출합니다. 키 1/2/3 회전은 사용하지 않습니다.' : '키 1번 실패 시 2번, 3번 순서로 자동 재시도합니다. 성공한 키 번호는 다음 호출의 시작점으로 저장됩니다.'}</Text>
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
          <Text style={styles.label}>이미지 Provider</Text>
          <View style={styles.segmentRow}>
            {[
              ['grok-local', 'Grok 로컬'],
              ['grok-cloud', '클라우드'],
              ['openai', 'OpenAI 호환']
            ].map(([value, label]) => (
              <Pressable key={value} onPress={() => setImageProvider(value as ImageProvider)} style={[styles.segment, imageProvider === value && styles.segmentActive]}>
                <Text style={[styles.segmentText, imageProvider === value && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {imageProvider === 'grok-local' ? (
            <View style={styles.subPanel}>
              <Text style={styles.label}>Grok Local Studio 서버</Text>
              <TextInput value={grokLocalBaseUrl} onChangeText={setGrokLocalBaseUrl} style={styles.input} autoCapitalize="none" placeholder="http://192.168.0.x:5000" placeholderTextColor="#9a9387" />
              <View style={styles.termuxPanel}>
                <Text style={styles.listTitle}>Termux 서버 도우미</Text>
                <Text style={styles.listSub}>현재 폰에 설치된 ~/grok 서버를 실행합니다. 상태 확인은 서버 접속, OAuth 상태, CREDIT 정보를 함께 확인합니다.</Text>
                <View style={styles.buttonRow}>
                  <Pressable onPress={openTermuxForGrok} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>Termux 열기</Text></Pressable>
                  <Pressable onPress={runGrokServerInTermux} style={[styles.primaryInline, styles.rowButton]}><Text style={styles.primaryText}>서버 실행 시도</Text></Pressable>
                </View>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.label}>서버 실행 명령</Text>
                  <Pressable onPress={copyGrokServerCommand} style={styles.smallInline}><Text style={styles.secondaryText}>복사</Text></Pressable>
                </View>
                <TextInput
                  value={TERMUX_GROK_COMMAND}
                  editable={false}
                  selectTextOnFocus
                  multiline
                  style={[styles.input, styles.commandBox]}
                  textAlignVertical="top"
                />
                <Text style={styles.help}>자동 실행은 Termux의 외부 명령 허용이 켜져 있을 때만 동작합니다. 실패하면 복사 버튼을 누른 뒤 Termux에 붙여넣고 Enter를 누르세요.</Text>
              </View>
              <View style={styles.buttonRow}>
                <Pressable onPress={() => { void refreshGrokLocal(); }} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>상태 확인</Text></Pressable>
                <Pressable onPress={() => runGrokAction('login')} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>계정 추가</Text></Pressable>
              </View>
              <View style={styles.buttonRow}>
                <Pressable onPress={() => runGrokAction('select')} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>OAuth 선택</Text></Pressable>
                <Pressable onPress={() => runGrokAction('logout')} style={[styles.dangerInline, styles.rowButton]}><Text style={styles.dangerText}>삭제</Text></Pressable>
              </View>
              <View style={styles.statusBox}>
                <Text style={styles.listTitle}>Grok OAuth 상태: {grokStatus?.tokenLabel || '확인 전'}</Text>
                <Text style={styles.listSub}>{grokStatus?.tokenMessage || 'Grok Local Studio가 실행 중이면 상태 확인을 눌러주세요.'}</Text>
                <Text style={styles.listSub}>계정 {grokAccounts.length}개 · CREDIT {grokBilling?.remaining_percent ?? '--'}%</Text>
                <View style={styles.creditTrack}><View style={[styles.creditFill, { width: `${Math.max(0, Math.min(100, Number(grokBilling?.remaining_percent || 0)))}%` }]} /></View>
              </View>
              {grokAccounts.length ? grokAccounts.map((account, index) => (
                <View key={`${account.id || account.provider || 'account'}-${index}`} style={styles.eventRow}>
                  <View style={styles.listBody}>
                    <Text style={styles.listTitle}>{account.name || account.label || 'xAI Grok OAuth'}</Text>
                    <Text style={styles.listSub}>{account.provider || 'xai-oauth'}{account.current ? ' · 현재 선택' : ''}</Text>
                  </View>
                </View>
              )) : null}
              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={styles.label}>해상도</Text>
                  <TextInput value={grokResolution} onChangeText={setGrokResolution} style={styles.input} autoCapitalize="none" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>비율</Text>
                  <TextInput value={grokAspectRatio} onChangeText={setGrokAspectRatio} style={styles.input} autoCapitalize="none" />
                </View>
              </View>
              <Text style={styles.help}>기본값은 저용량 1k, 비율 auto입니다. 프로필 레퍼런스 이미지가 있는 경우 /api/i2i, 없는 경우 /api/t2i로 생성합니다.</Text>
            </View>
          ) : null}
          {imageProvider === 'grok-cloud' ? (
            <View style={styles.subPanel}>
              <Text style={styles.label}>Cloud Grok 서버</Text>
              <TextInput value={grokCloudUrl} onChangeText={setGrokCloudUrl} style={styles.input} autoCapitalize="none" placeholder="http://168.110.122.66" placeholderTextColor="#9a9387" />
              <View style={[styles.cloudConnectCard, grokStatus?.hermesAuthenticated && styles.cloudConnectCardReady]}>
                <View style={styles.cloudStatusRow}>
                  <View style={[styles.cloudDot, grokStatus?.hermesAuthenticated && styles.cloudDotReady]} />
                  <View style={styles.listBody}>
                    <Text style={styles.cloudTitle}>{grokStatus?.hermesAuthenticated ? 'Cloud Grok 연동됨' : 'Cloud Grok 로그인 필요'}</Text>
                    <Text style={styles.cloudSub}>{grokStatus?.tokenMessage || '아래 버튼을 누르면 X/Grok 로그인 창을 바로 엽니다.'}</Text>
                  </View>
                </View>
                <Pressable onPress={() => runGrokAction('login')} disabled={grokLoginBusy} style={[styles.cloudLoginButton, grokLoginBusy && styles.disabled]}>
                  <Text style={styles.cloudLoginText}>{grokLoginBusy ? '로그인 창 여는 중...' : '새창 로그인으로 연동'}</Text>
                </Pressable>
                <Text style={styles.cloudHint}>로그인 완료 후 앱으로 돌아와 상태 확인을 누르면 계정과 CREDIT이 갱신됩니다.</Text>
              </View>
              <View style={styles.cloudCallbackBox}>
                <Text style={styles.label}>callback URL 또는 인증 코드</Text>
                <TextInput
                  value={grokOAuthCallback}
                  onChangeText={setGrokOAuthCallback}
                  style={[styles.input, styles.cloudCallbackInput]}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  placeholder="브라우저 주소창의 http://127.0.0.1:.../callback?code=... 전체 URL 또는 화면에 표시된 코드"
                  placeholderTextColor="#9a9387"
                />
                <Pressable onPress={submitCloudGrokOAuthCallback} disabled={grokCallbackBusy} style={[styles.cloudCompleteButton, grokCallbackBusy && styles.disabled]}>
                  <Text style={styles.cloudCompleteText}>{grokCallbackBusy ? '연동 확인 중...' : '연동 완료'}</Text>
                </Pressable>
                <Text style={styles.cloudHint}>새창 로그인 후 브라우저가 실패 화면을 보여도 정상입니다. 그때 주소창 전체를 복사해서 여기에 붙여넣으세요.</Text>
              </View>
              <View style={styles.cloudMetricRow}>
                <View style={styles.cloudMetric}>
                  <Text style={styles.cloudMetricLabel}>상태</Text>
                  <Text style={styles.cloudMetricValue}>{grokStatus?.tokenLabel || '확인 전'}</Text>
                </View>
                <View style={styles.cloudMetric}>
                  <Text style={styles.cloudMetricLabel}>계정</Text>
                  <Text style={styles.cloudMetricValue}>{grokAccounts.length}개</Text>
                </View>
                <View style={styles.cloudMetric}>
                  <Text style={styles.cloudMetricLabel}>CREDIT</Text>
                  <Text style={styles.cloudMetricValue}>{grokBilling?.remaining_percent ?? '--'}%</Text>
                </View>
              </View>
              <View style={styles.creditTrack}><View style={[styles.creditFill, { width: `${Math.max(0, Math.min(100, Number(grokBilling?.remaining_percent || 0)))}%` }]} /></View>
              <View style={styles.buttonRow}>
                <Pressable onPress={() => { void refreshGrokLocal(); }} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>상태 확인</Text></Pressable>
                <Pressable onPress={() => runGrokAction('select')} style={[styles.secondaryInline, styles.rowButton]}><Text style={styles.secondaryText}>OAuth 선택</Text></Pressable>
                <Pressable onPress={() => runGrokAction('logout')} style={[styles.dangerInline, styles.rowButton]}><Text style={styles.dangerText}>삭제</Text></Pressable>
              </View>
              {grokAccounts.length ? grokAccounts.map((account, index) => (
                <View key={`${account.id || account.provider || 'cloud-account'}-${index}`} style={styles.eventRow}>
                  <View style={styles.listBody}>
                    <Text style={styles.listTitle}>{account.name || account.label || 'xAI Grok OAuth'}</Text>
                    <Text style={styles.listSub}>{account.provider || 'xai-oauth'}{account.current ? ' · 현재 선택' : ''}</Text>
                  </View>
                </View>
              )) : <Text style={styles.help}>토큰 오류가 뜨면 계정 추가/재인증을 누르고 로그인 후 상태 확인을 다시 누르세요.</Text>}
              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={styles.label}>해상도</Text>
                  <TextInput value={grokResolution} onChangeText={setGrokResolution} style={styles.input} autoCapitalize="none" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>비율</Text>
                  <TextInput value={grokAspectRatio} onChangeText={setGrokAspectRatio} style={styles.input} autoCapitalize="none" />
                </View>
              </View>
              <Text style={styles.help}>로컬 폰 서버 주소는 보존됩니다. 클라우드를 선택하고 저장하면 이미지 생성만 이 주소의 /api/t2i, /api/i2i로 요청합니다.</Text>
            </View>
          ) : null}
          {imageProvider === 'openai' ? (
            <>
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
            </>
          ) : null}
          <Text style={styles.label}>프롬프트 접두 지시</Text>
          <TextInput value={imagePrefix} onChangeText={setImagePrefix} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
          <Text style={styles.label}>네거티브 프롬프트</Text>
          <TextInput value={imageNegative} onChangeText={setImageNegative} style={[styles.input, styles.textareaSmall]} multiline textAlignVertical="top" />
          <Text style={styles.label}>AI 생성 금지 프롬프트 및 규칙</Text>
          <TextInput value={imageForbiddenRules} onChangeText={setImageForbiddenRules} style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
          <Text style={styles.help}>모든 이미지 생성 프롬프트 본문에 전역 규칙으로 추가됩니다. 접두 지시와 네거티브 프롬프트처럼 프로필, 채팅, SNS, 만남 이미지에 공통 적용됩니다.</Text>
          <Text style={styles.help}>Grok OAuth는 PC의 Grok Local Studio 서버를 통해 Hermes xAI OAuth를 사용합니다. 휴대폰에서는 PC IP:5000 주소를 입력하세요.</Text>
          <Pressable onPress={saveImageGeneration} style={styles.primary}><Text style={styles.primaryText}>이미지 설정 저장</Text></Pressable>
        </View>

        <View style={[styles.card, activeSection !== 'prompts' && styles.hidden]}>
          <Text style={styles.cardTitle}>SNS 생성 설정</Text>
          <Text style={styles.help}>SNS 생성 세부값은 캐릭터마다 다르게 적용됩니다. Instagram/X별 무드, 소재, 댓글, DM, 이미지 옵션은 SNS 화면에서 캐릭터를 선택한 뒤 저장하세요.</Text>
          <Text style={styles.help}>이 화면에는 전역 자동화와 프롬프트만 남겨 캐릭터별 고유 SNS 옵션과 섞이지 않게 했습니다.</Text>
        </View>

        <View style={[styles.card, activeSection !== 'user' && styles.hidden]}>
          <Text style={styles.cardTitle}>자동화</Text>
          <Text style={styles.help}>전체 자동화가 켜져 있으면 약 60초마다 조건을 확인합니다. 홈으로 나가 백그라운드에 둔 상태에서도 알림 표시(자동화 실행 중)로 프로세스를 유지해 선톡·SNS 등을 계속 돌립니다. 최근 앱에서 스와이프해 완전 종료하면 멈춥니다. API 설정이 비어 있으면 자동 생성은 실행되지 않습니다.</Text>
          <Pressable
            onPress={() => { void refreshOptimizationStatus(); }}
            style={[styles.optimizationLine, optimizationStatus?.ready ? styles.optimizationLineOk : styles.optimizationLineWarn]}
          >
            <Text style={[styles.optimizationLineText, optimizationStatus?.ready ? styles.optimizationLineTextOk : styles.optimizationLineTextWarn]} numberOfLines={2}>
              {optimizationChecking
                ? '추천 설정: 검사 중…'
                : (optimizationStatus?.line || '추천 설정: 탭해서 검사')}
            </Text>
          </Pressable>
          <SwitchLine label="전체 자동화" value={autoEnabled} onChange={setAutoEnabled} />
          <Text style={styles.help}>전체 자동화: 아래 자동 메시지, 기념일, 프로필 이미지 변경, 전화 초대의 공통 전원입니다. 켜면 상태바에 「SNSGod 자동화 실행 중」 알림이 뜹니다.</Text>
          <Pressable
            onPress={() => {
              void (async () => {
                await maybePromptBatteryOptimizationExemption({ force: true });
                await refreshOptimizationStatus();
              })();
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>배터리 최적화·절전 제외 설정</Text>
          </Pressable>
          <Text style={styles.help}>위 한 줄이 「모두 적용됨」이면 배터리 제외·알림 허용이 된 상태입니다. 설정 후 자동으로 다시 검사하며, 줄을 눌러 수동 검사할 수도 있습니다.</Text>
          <SwitchLine label="개인톡 먼저 말하기" value={privateFirst} onChange={setPrivateFirst} />
          <Text style={styles.help}>개인톡 먼저 말하기: 사용자가 보내지 않아도 캐릭터가 빈도/주도성 설정에 따라 1:1 채팅을 먼저 시작합니다.</Text>
          <SwitchLine label="단톡 먼저 말하기" value={groupFirst} onChange={setGroupFirst} />
          <Text style={styles.help}>단톡 먼저 말하기: 단톡방 참여 캐릭터 중 한 명이 방 빈도와 주도성 조건에 맞으면 먼저 말합니다.</Text>
          <SwitchLine label="랜덤 첫 메시지" value={randomDmEnabled} onChange={setRandomDmEnabled} />
          <Text style={styles.help}>랜덤 첫 메시지: 아직 사용자가 말하지 않은 새 1:1 방에서 첫 인사를 자동으로 보냅니다.</Text>
          <SwitchLine label="SNS 자동 게시" value={snsAutoPostEnabled} onChange={setSnsAutoPostEnabled} />
          <Text style={styles.help}>SNS 자동 게시: 일반 채팅 답장 뒤 메시지 수, 쿨다운, 확률 조건을 만족하면 Instagram 또는 X 게시물을 생성합니다.</Text>
          <SwitchLine label="SNS DM에 유저 포함" value={snsIncludeUserInDM} onChange={setSnsIncludeUserInDM} />
          <Text style={styles.help}>켜면 게시물에서 나와 캐릭터의 DM도 만들 수 있습니다. 끄면 SNS 게시물에 반응한 제3자/캐릭터 DM만 만들고 유저 이름은 DM 참가자로 넣지 않습니다.</Text>
          <SwitchLine label="캐릭터 먼저 전화" value={characterPhoneCallEnabled} onChange={setCharacterPhoneCallEnabled} />
          <Text style={styles.help}>캐릭터 먼저 전화: 캐릭터 주도성과 빈도 조건에 따라 드물게 전화 카드 알림을 만듭니다.</Text>
          {characterPhoneCallEnabled ? (
            <View style={styles.subPanel}>
              <Text style={styles.label}>자동 전화 빈도</Text>
              <NumberScale
                value={characterPhoneCallRarityLevel}
                onChange={setCharacterPhoneCallRarityLevel}
                minLabel="0 자주"
                maxLabel="10 아주 가끔"
              />
              <Text style={styles.help}>0은 캐릭터 원래 전화 확률 그대로, 10은 원래 확률의 약 10%만 사용합니다. 현재 단계는 원래 확률의 약 {phoneMultiplierPercentFromRarity(characterPhoneCallRarityLevel)}%입니다.</Text>
              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={styles.label}>같은 캐릭터 전화 간격(분)</Text>
                  <TextInput value={characterPhoneCallMinCooldownMinutes} onChangeText={setCharacterPhoneCallMinCooldownMinutes} style={styles.input} keyboardType="number-pad" />
                  <Text style={styles.help}>숫자를 높이면 같은 캐릭터가 더 늦게 다시 전화합니다.</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>전체 자동 전화 간격(분)</Text>
                  <TextInput value={characterPhoneCallGlobalCooldownMinutes} onChangeText={setCharacterPhoneCallGlobalCooldownMinutes} style={styles.input} keyboardType="number-pad" />
                  <Text style={styles.help}>숫자를 높이면 모든 캐릭터의 자동 전화가 덜 자주 옵니다.</Text>
                </View>
              </View>
            </View>
          ) : null}
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
          <View style={styles.subPanel}>
            <Text style={styles.cardTitle}>데이트 어플</Text>
            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={styles.label}>갱신 주기(시간)</Text>
                <TextInput value={datingAppRefreshHours} onChangeText={setDatingAppRefreshHours} style={styles.input} keyboardType="number-pad" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>수락 확률(%)</Text>
                <TextInput value={datingAppAcceptanceChance} onChangeText={setDatingAppAcceptanceChance} style={styles.input} keyboardType="number-pad" />
              </View>
            </View>
            <Text style={styles.label}>AI 여성 생성 나이 범위</Text>
            <TextInput
              value={datingAppAgeRange}
              onChangeText={setDatingAppAgeRange}
              style={styles.input}
              placeholder="19-43"
              placeholderTextColor="#9a9387"
            />
            <Text style={styles.help}>예: 19-43, 25~35. 저장 시 19세 이상 범위로 보정되고, 변경하면 기존 소개팅 후보 라운드는 초기화됩니다.</Text>
            <Text style={styles.help}>ETC의 데이트 어플 후보 갱신과 대화신청 수락/거절 확률에 적용됩니다.</Text>
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
          </>
        ) : (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>설정 불러오는 중...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NumberScale({ value, onChange, minLabel, maxLabel }: { value: number; onChange: (value: number) => void; minLabel: string; maxLabel: string }) {
  const current = Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
  return (
    <View style={styles.scaleWrap}>
      <View style={styles.scaleLabelRow}>
        <Text style={styles.scaleEdgeLabel}>{minLabel}</Text>
        <Text style={styles.scaleEdgeLabel}>{maxLabel}</Text>
      </View>
      <View style={styles.scaleRow}>
        {Array.from({ length: 11 }, (_, index) => (
          <Pressable key={index} onPress={() => onChange(index)} style={[styles.scaleStep, current === index && styles.scaleStepActive]}>
            <Text style={[styles.scaleStepText, current === index && styles.scaleStepTextActive]}>{index}</Text>
          </Pressable>
        ))}
      </View>
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
  loadingCard: { minHeight: 96, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', padding: 14 },
  loadingText: { color: colors.sub, fontWeight: '900' },
  cardHeadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  hidden: { display: 'none' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 12 },
  missingTitle: { marginTop: 14, marginBottom: 6, color: colors.text, fontWeight: '900' },
  label: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 10, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, color: colors.text, backgroundColor: '#fffefa' },
  profileTextarea: { height: 112, paddingVertical: 10 },
  textarea: { minHeight: 128, paddingVertical: 10 },
  textareaSmall: { minHeight: 86, paddingVertical: 10 },
  vertexJsonBox: { minHeight: 150, maxHeight: 230, paddingVertical: 10, fontSize: 12, lineHeight: 18 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  segmentActive: { backgroundColor: colors.accent, borderColor: '#b89117' },
  segmentText: { color: colors.sub, fontWeight: '900' },
  segmentTextActive: { color: '#241a00' },
  scaleWrap: { gap: 8 },
  scaleLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scaleEdgeLabel: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  scaleRow: { flexDirection: 'row', gap: 4 },
  scaleStep: { flex: 1, minWidth: 0, height: 34, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  scaleStepActive: { backgroundColor: colors.accent, borderColor: '#b89117' },
  scaleStepText: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  scaleStepTextActive: { color: '#241a00' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', justifyContent: 'center' },
  presetText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  profilePresetSwitcher: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  profileArrow: { width: 48, height: 48, marginTop: 4, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  profileArrowText: { color: colors.text, fontSize: 30, lineHeight: 32, fontWeight: '900' },
  profilePresetCenter: { flex: 1 },
  profilePresetNameBox: { position: 'relative', justifyContent: 'center' },
  profilePresetInput: { marginTop: 0, paddingRight: 88 },
  profilePresetActions: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 6 },
  profilePresetAction: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  profilePresetDeleteAction: { borderColor: '#f0b7b7', backgroundColor: '#fff1f1' },
  profilePresetActionDisabled: { opacity: 0.35 },
  profilePresetActionText: { color: colors.text, fontSize: 20, lineHeight: 22, fontWeight: '900' },
  profilePresetDeleteText: { color: colors.danger },
  profilePresetMeta: { marginTop: 4, color: colors.sub, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  keyToggle: { alignSelf: 'flex-start', marginTop: 10, minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#eee8dc', justifyContent: 'center' },
  keyToggleText: { color: colors.text, fontWeight: '900' },
  twoCols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  primary: { marginTop: 14, height: 44, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' },
  primaryInline: { marginTop: 14, height: 44, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primarySmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primarySmallText: { color: '#241a00', fontWeight: '900' },
  secondary: { marginTop: 12, height: 42, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryInline: { marginTop: 14, height: 44, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dangerInline: { marginTop: 14, height: 44, borderRadius: 7, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  optimizationLine: { marginTop: 10, marginBottom: 4, minHeight: 40, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  optimizationLineOk: { backgroundColor: '#eefbf3', borderColor: '#8ac6a5' },
  optimizationLineWarn: { backgroundColor: '#fff6e8', borderColor: '#e0c48a' },
  optimizationLineText: { fontSize: 13, fontWeight: '900', lineHeight: 18 },
  optimizationLineTextOk: { color: '#0f6b48' },
  optimizationLineTextWarn: { color: '#7a4e00' },
  sectionHeaderRow: { marginTop: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smallInline: { minHeight: 34, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  rowButton: { flex: 1 },
  subPanel: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f7f3ea' },
  termuxPanel: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d6c48f', backgroundColor: '#fff8dd' },
  cloudConnectCard: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d8c99c', backgroundColor: '#fff8dd', gap: 10 },
  cloudConnectCardReady: { borderColor: '#8ac6a5', backgroundColor: '#eefbf3' },
  cloudStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cloudDot: { width: 12, height: 12, marginTop: 4, borderRadius: 6, backgroundColor: '#d14444' },
  cloudDotReady: { backgroundColor: '#0f8f62' },
  cloudTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  cloudSub: { marginTop: 3, color: colors.sub, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  cloudLoginButton: { minHeight: 52, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cloudLoginText: { color: '#241a00', fontSize: 16, fontWeight: '900' },
  cloudHint: { color: colors.sub, fontSize: 12, fontWeight: '800', lineHeight: 18 },
  cloudCallbackBox: { marginTop: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', gap: 8 },
  cloudCallbackInput: { minHeight: 92, paddingVertical: 10, fontSize: 12, lineHeight: 18 },
  cloudCompleteButton: { minHeight: 46, borderRadius: 8, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  cloudCompleteText: { color: '#ffffff', fontWeight: '900' },
  cloudMetricRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  cloudMetric: { flex: 1, minHeight: 62, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', justifyContent: 'center' },
  cloudMetricLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  cloudMetricValue: { marginTop: 4, color: colors.text, fontSize: 14, fontWeight: '900' },
  commandBox: { minHeight: 118, marginTop: 4, paddingVertical: 10, fontSize: 12, lineHeight: 18 },
  creditTrack: { marginTop: 8, height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e1d8c8', borderWidth: 1, borderColor: colors.border },
  creditFill: { height: '100%', backgroundColor: '#0f766e' },
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
