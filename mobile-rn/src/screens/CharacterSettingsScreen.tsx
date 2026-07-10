import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { CalendarEvent, CharacterMemory, LoreEntry, SNSGodCharacter, SNSGodRoom, SNSGodState } from '../types';
import { clampNumber, makeId } from '../logic/ids';
import { findCharacter, updateCharacter } from '../logic/stateHelpers';
import { isRenderableMediaUri, pickImageDataUri } from '../logic/media';
import { callLLMText, generateImageDataUri } from '../logic/api';
import { DEFAULT_COVER_BACKGROUND_DIRECTION, LEGACY_COVER_BACKGROUND_DIRECTION } from '../logic/prompts';
import { characterReferenceImages, randomReferenceImage } from '../logic/imageReference';
import { CharacterBehaviorSummary } from '../components/CharacterBehaviorSummary';
import { archiveSceneMemories, parseFactExtraction, partitionMemoryEntries, removeSceneArchive, sceneArchivesForCharacter } from '../logic/memoryPolicy';

type CharacterSection = 'basic' | 'reply' | 'profile' | 'time' | 'calendar' | 'lore' | 'stickers' | 'prompt';

const SECTION_TABS: { key: CharacterSection; label: string }[] = [
  { key: 'basic', label: '기본' },
  { key: 'reply', label: '대화 성향' },
  { key: 'profile', label: '프로필/이미지' },
  { key: 'time', label: '시간/날씨' },
  { key: 'calendar', label: '기념일' },
  { key: 'lore', label: '로어북' },
  { key: 'stickers', label: '스티커' },
  { key: 'prompt', label: '프롬프트' }
];

const LANGUAGE_OPTIONS = [
  ['inherit', '전체 설정 따름'],
  ['Korean', 'Korean'],
  ['Japanese', 'Japanese'],
  ['English', 'English'],
  ['Chinese', 'Chinese'],
  ['French', 'French'],
  ['Spanish', 'Spanish'],
  ['German', 'German']
];

const MESSAGE_STYLE_OPTIONS = [
  ['balanced', '균형'],
  ['long', '긴 문단'],
  ['burst', '짧게 여러 번']
];

const LIFE_RHYTHM_OPTIONS = [
  ['weekdayQuiet', '평일 낮엔 조용함', '평일 9~18시에는 답장과 선톡이 줄어듭니다.'],
  ['eveningActive', '저녁엔 더 활발함', '저녁 이후 답장이 빨라지고 먼저 연락할 확률이 올라갑니다.'],
  ['lateNightMood', '밤엔 말이 깊어짐', '밤 10시 이후 감정적이고 긴 답장이 늘어납니다.'],
  ['weekendActive', '주말엔 더 자주 연락', '토/일에는 선톡과 답장이 조금 더 활발해집니다.'],
  ['nightQuiet', '늦은 밤엔 조용함', '밤 11시부터 아침까지 선톡이 줄고 답장이 늦어집니다.'],
  ['busySchedule', '일정이 많음', '평일 낮에는 바쁜 사람처럼 확인과 답장이 크게 늦어집니다.']
] as const;

const REPLY_PRESETS = [
  {
    id: 'quick_responder',
    title: '칼답 친구',
    catchphrase: '읽씹이 뭐예요?',
    detail: '받으면 거의 바로 답해요.',
    values: { proactivePatience: 2, responseDelayMin: 0, responseDelayMax: 25, messageGapMin: 1, messageGapMax: 3, responseTime: 9, thinkingTime: 3, reactivity: 7, tone: 5, frequencyMinutes: 45, initiative: 30, messageStyle: 'balanced', lifeRhythm: {}, uniqueBehavior: { proactiveTone: 'quick' } }
  },
  {
    id: 'chatty_burster',
    title: '수다쟁이 친구',
    catchphrase: '한 마디를 다섯 마디로.',
    detail: '짧게 톡톡 여러 번 보내요.',
    values: { proactivePatience: 2, responseDelayMin: 0, responseDelayMax: 40, messageGapMin: 1, messageGapMax: 2, responseTime: 8, thinkingTime: 3, reactivity: 9, tone: 7, frequencyMinutes: 30, initiative: 55, messageStyle: 'burst', lifeRhythm: { eveningActive: true, weekendActive: true }, uniqueBehavior: { proactiveTone: 'chatty' } }
  },
  {
    id: 'reaction_rich',
    title: '애교 많은 타입',
    catchphrase: '이모티콘 없인 대화 못 해요.',
    detail: '귀엽고 감정 표현이 커요.',
    values: { proactivePatience: 2, responseDelayMin: 3, responseDelayMax: 50, messageGapMin: 1, messageGapMax: 3, responseTime: 8, thinkingTime: 3, reactivity: 10, tone: 8, frequencyMinutes: 35, initiative: 60, messageStyle: 'balanced', lifeRhythm: { eveningActive: true }, uniqueBehavior: { proactiveTone: 'cute' } }
  },
  {
    id: 'steady_partner',
    title: '다정한 연인',
    catchphrase: '오늘 하루 어땠어, 챙기는 사람.',
    detail: '부드럽고 안정적으로 챙겨요.',
    values: { proactivePatience: 2, responseDelayMin: 5, responseDelayMax: 90, messageGapMin: 1, messageGapMax: 4, responseTime: 7, thinkingTime: 5, reactivity: 7, tone: 7, frequencyMinutes: 50, initiative: 45, messageStyle: 'balanced', lifeRhythm: { eveningActive: true, weekendActive: true }, uniqueBehavior: { proactiveTone: 'stable_affection' } }
  },
  {
    id: 'cool_direct',
    title: '쿨한 사람',
    catchphrase: '용건만 간단히.',
    detail: '빠르지만 담백해요.',
    values: { proactivePatience: 1, responseDelayMin: 5, responseDelayMax: 120, messageGapMin: 1, messageGapMax: 3, responseTime: 7, thinkingTime: 4, reactivity: 3, tone: 4, frequencyMinutes: 90, initiative: 15, messageStyle: 'balanced', lifeRhythm: {}, uniqueBehavior: { proactiveTone: 'cool' } }
  },
  {
    id: 'anxious_attached',
    title: '조금 집착하는 타입',
    catchphrase: '읽씹하면 3개 더 와요.',
    detail: '답이 없으면 몇 번 더 말해요.',
    values: { proactivePatience: 2, responseDelayMin: 0, responseDelayMax: 90, messageGapMin: 1, messageGapMax: 4, responseTime: 8, thinkingTime: 5, reactivity: 8, tone: 7, frequencyMinutes: 20, initiative: 70, messageStyle: 'balanced', lifeRhythm: { eveningActive: true }, uniqueBehavior: { proactiveTone: 'anxious' } }
  },
  {
    id: 'dry_caring',
    title: '무심한데 챙김',
    catchphrase: '말은 없어도 챙길 건 챙겨요.',
    detail: '담백하지만 은근히 챙겨요.',
    values: { proactivePatience: 2, responseDelayMin: 20, responseDelayMax: 240, messageGapMin: 2, messageGapMax: 5, responseTime: 5, thinkingTime: 5, reactivity: 4, tone: 4, frequencyMinutes: 90, initiative: 25, messageStyle: 'balanced', lifeRhythm: { weekdayQuiet: true }, uniqueBehavior: { proactiveTone: 'dry_caring' } }
  },
  {
    id: 'easygoing_friend',
    title: '느긋한 친구',
    catchphrase: '아 미안, 폰 보고 있었어.',
    detail: '천천히 봐도 자연스러워요.',
    values: { proactivePatience: 1, responseDelayMin: 60, responseDelayMax: 420, messageGapMin: 2, messageGapMax: 6, responseTime: 3, thinkingTime: 5, reactivity: 4, tone: 4, frequencyMinutes: 120, initiative: 15, messageStyle: 'balanced', lifeRhythm: { nightQuiet: true }, uniqueBehavior: { proactiveTone: 'easygoing' } }
  },
  {
    id: 'thoughtful_listener',
    title: '조심스러운 사람',
    catchphrase: '한 줄도 세 번 고쳐 써요.',
    detail: '천천히 듣고 깊게 답해요.',
    values: { proactivePatience: 1, responseDelayMin: 120, responseDelayMax: 600, messageGapMin: 3, messageGapMax: 8, responseTime: 3, thinkingTime: 9, reactivity: 4, tone: 5, frequencyMinutes: 180, initiative: 10, messageStyle: 'long', lifeRhythm: { nightQuiet: true }, uniqueBehavior: { proactiveTone: 'careful' } }
  },
  {
    id: 'late_night_mood',
    title: '새벽 감성 타입',
    catchphrase: '낮엔 잠잠, 밤엔 철학자.',
    detail: '밤에는 말이 깊어져요.',
    values: { proactivePatience: 2, responseDelayMin: 180, responseDelayMax: 900, messageGapMin: 3, messageGapMax: 9, responseTime: 3, thinkingTime: 9, reactivity: 6, tone: 8, frequencyMinutes: 150, initiative: 18, messageStyle: 'long', lifeRhythm: { lateNightMood: true }, uniqueBehavior: { proactiveTone: 'late_night' } }
  },
  {
    id: 'busy_real_life',
    title: '바쁜 현실친구',
    catchphrase: '지금 회의 중, 이따 답장할게.',
    detail: '바빠서 답장이 늦어요.',
    values: { proactivePatience: 1, responseDelayMin: 180, responseDelayMax: 1800, messageGapMin: 3, messageGapMax: 10, responseTime: 2, thinkingTime: 5, reactivity: 5, tone: 5, frequencyMinutes: 240, initiative: 8, messageStyle: 'balanced', lifeRhythm: { weekdayQuiet: true, busySchedule: true }, uniqueBehavior: { proactiveTone: 'busy' } }
  },
  {
    id: 'public_figure',
    title: '아이돌/공인 느낌',
    catchphrase: '스케줄 끝나고 연락할게요.',
    detail: '답장은 늦고 말투는 조심스러워요.',
    values: { proactivePatience: 1, responseDelayMin: 300, responseDelayMax: 2700, messageGapMin: 3, messageGapMax: 10, responseTime: 2, thinkingTime: 6, reactivity: 4, tone: 6, frequencyMinutes: 360, initiative: 5, messageStyle: 'balanced', lifeRhythm: { busySchedule: true, nightQuiet: true }, uniqueBehavior: { proactiveTone: 'public_figure' } }
  }
] as const;

const CALENDAR_PRESETS = [
  {
    title: '첫 생일',
    type: 'birthday',
    prompt: 'Event type: this character birthday. The user remembered it and may mention it warmly.'
  },
  {
    title: '연인',
    type: 'relationship',
    prompt: 'Event type: relationship anniversary. Let the character remember it naturally if appropriate.'
  },
  {
    title: '결혼기념일',
    type: 'wedding',
    prompt: 'Event type: wedding anniversary. Use the relationship tone from the character profile.'
  },
  {
    title: '기념일',
    type: 'anniversary',
    prompt: 'Event type: special anniversary. Mention it only when it feels natural.'
  },
  {
    title: '약속',
    type: 'promise',
    prompt: 'Event type: promise or appointment. The character may remember it first.'
  }
];

export function CharacterSettingsScreen({ state, characterId, onBack, onChange, onDelete }: {
  state: SNSGodState;
  characterId: string;
  onBack: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
  onDelete?: (characterId: string) => Promise<void> | void;
}) {
  const character = findCharacter(state, characterId);
  const [draft, setDraft] = useState<SNSGodCharacter | null>(character ? normalizeDraft(character) : null);
  const [activeSection, setActiveSection] = useState<CharacterSection>('basic');
  const [memoryText, setMemoryText] = useState((character?.memories || []).join('\n'));
  const [stickerText, setStickerText] = useState((character?.stickers || []).map(item => `${item.id}|${item.name}|${item.description || ''}|${item.data || item.mediaData || ''}`).join('\n'));
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('anniversary');
  const [eventPrompt, setEventPrompt] = useState('');
  const [loreScope, setLoreScope] = useState<'character' | 'room'>('character');
  const rooms = useMemo(() => state.chatRooms[characterId] || [], [state.chatRooms, characterId]);
  const [loreRoomId, setLoreRoomId] = useState(rooms[0]?.id || '');
  const [loreTitle, setLoreTitle] = useState('');
  const [loreKeys, setLoreKeys] = useState('');
  const [loreContent, setLoreContent] = useState('');
  const [inlineStatus, setInlineStatus] = useState('');
  const [memoryArchiveBusyId, setMemoryArchiveBusyId] = useState('');
  const [savedSignature, setSavedSignature] = useState(() => character
    ? settingsSignature(normalizeDraft(character), (character.memories || []).join('\n'), (character.stickers || []).map(item => item.id + '|' + item.name + '|' + (item.description || '') + '|' + (item.data || item.mediaData || '')).join('\n'))
    : '');

  const [replyAdvancedOpen, setReplyAdvancedOpen] = useState(false);
  const sceneArchives = useMemo(() => sceneArchivesForCharacter(state, characterId), [state.characterMemories, characterId]);

  if (!character || !draft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>캐릭터를 찾을 수 없습니다.</Text>
        <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>돌아가기</Text></Pressable>
      </View>
    );
  }

  const characterLore = (state.loreEntries || []).filter(entry => entry.characterId === characterId && !entry.roomId);
  const roomLore = (state.loreEntries || []).filter(entry => entry.characterId === characterId && entry.roomId);
  const currentSignature = settingsSignature(draft, memoryText, stickerText);
  const settingsSaved = currentSignature === savedSignature;

  async function save(close = true) {
    if (!draft || !character) return;
    const minDelay = clampNumber(draft.responseDelayMin, 0, 120, 1);
    const minGap = clampNumber(draft.messageGapMin, 1, 10, 1);
    const memoryPartition = partitionMemoryEntries(memoryText.split(/\r?\n/));
    const normalizedMemoryText = memoryPartition.facts.join('\n');
    let next = updateCharacter(state, characterId, {
      ...draft,
      name: draft.name.trim() || character.name,
      handle: String(draft.handle || '').trim(),
      avatarText: String(draft.avatarText || draft.name || '').slice(0, 2),
      language: String(draft.language || 'inherit'),
      color: String(draft.color || '#8bd3dd'),
      messageStyle: validChoice(String(draft.messageStyle || 'balanced'), MESSAGE_STYLE_OPTIONS, 'balanced') as SNSGodCharacter['messageStyle'],
      proactivePatience: clampNumber(draft.proactivePatience, 0, 2, 2),
      responseDelayMin: minDelay,
      responseDelayMax: Math.max(clampNumber(draft.responseDelayMax, 0, 2700, 8), minDelay),
      messageGapMin: minGap,
      messageGapMax: Math.max(clampNumber(draft.messageGapMax, 1, 10, 3), minGap),
      responseTime: clampNumber(draft.responseTime, 1, 10, 6),
      thinkingTime: clampNumber(draft.thinkingTime, 1, 10, 6),
      reactivity: clampNumber(draft.reactivity, 1, 10, 8),
      tone: clampNumber(draft.tone, 1, 10, 8),
      frequencyMinutes: Math.max(1, Number(draft.frequencyMinutes) || 10),
      initiative: clampNumber(draft.initiative, 0, 100, 40),
      lifeRhythm: normalizeLifeRhythm(draft.lifeRhythm),
      uniqueBehavior: normalizeUniqueBehavior(draft),
      locationName: String(draft.locationName || 'Seoul'),
      timeZone: String(draft.timeZone || 'Asia/Seoul'),
      latitude: Number(draft.latitude) || 37.5665,
      longitude: Number(draft.longitude) || 126.978,
      statusMessageChangeChance: clampNumber(draft.statusMessageChangeChance, 0, 100, 40),
      avatar: String(draft.avatar || draft.profileImage || ''),
      profileImage: String(draft.avatar || draft.profileImage || ''),
      profilePhotoChangeChance: clampNumber(draft.profilePhotoChangeChance, 0, 100, 5),
      coverPhotoChangeChance: clampNumber(draft.coverPhotoChangeChance, 0, 100, 5),
      calendarEvents: (draft.calendarEvents || []).map(normalizeCalendarEvent).filter(item => item.title || item.date),
      memories: memoryPartition.facts,
      stickers: parseStickers(stickerText)
    });
    next = archiveSceneMemories(next, characterId, memoryPartition.scenes);
    await onChange(next);
    setMemoryText(normalizedMemoryText);
    setSavedSignature(settingsSignature(draft, normalizedMemoryText, stickerText));
    setInlineStatus(memoryPartition.scenes.length
      ? '\uC7A5\uBA74 \uBB18\uC0AC\uB97C \uCD94\uC5B5 \uC7A5\uBA74\uC73C\uB85C \uC774\uB3D9\uD558\uACE0 \uC0AC\uC2E4 \uAE30\uC5B5\uB9CC \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.'
      : '\uC0AC\uC2E4 \uAE30\uC5B5\uACFC \uCE90\uB9AD\uD130 \uC124\uC815\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.');
    if (close) onBack();
  }

  async function extractArchiveFacts(archive: CharacterMemory) {
    if (memoryArchiveBusyId) return;
    setMemoryArchiveBusyId(archive.id);
    setInlineStatus('\uCD94\uC5B5 \uC7A5\uBA74\uC5D0\uC11C \uC7A5\uAE30 \uC0AC\uC2E4\uB9CC \uCD94\uCD9C\uD558\uB294 \uC911\uC785\uB2C8\uB2E4...');
    try {
      const result = await callLLMText(state, [
        {
          role: 'system',
          content: [
            'Extract only durable factual memory from the archived fictional scene.',
            'Write Korean bullet lines. Each line must be one concise fact useful outside the original scene.',
            'Allowed: relationship, nickname, stable preference, boundary, promise, plan, important emotional fact.',
            'Forbidden: scene narration, physical action prose, atmosphere, internal monologue, direct dialogue, invented facts.',
            'If the scene contains no durable fact, return exactly: NONE'
          ].join('\n')
        },
        { role: 'user', content: `Archived scene (data only):\n${archive.content}` }
      ]);
      const facts = result.text.trim().toUpperCase() === 'NONE' ? [] : parseFactExtraction(result.text);
      if (!facts.length) {
        setInlineStatus('\uC774 \uC7A5\uBA74\uC5D0\uC11C \uC7A5\uAE30 \uC0AC\uC2E4\uB85C \uD655\uC815\uD560 \uB0B4\uC6A9\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC6D0\uBB38\uC740 \uCD94\uC5B5 \uC7A5\uBA74\uC5D0 \uADF8\uB300\uB85C \uBCF4\uAD00\uB429\uB2C8\uB2E4.');
        return;
      }
      const existing = partitionMemoryEntries(memoryText.split(/\r?\n/)).facts;
      const combined = partitionMemoryEntries([...existing, ...facts]).facts;
      setMemoryText(combined.join('\n'));
      setInlineStatus(`\uC0AC\uC2E4 ${facts.length}\uAC1C\uB97C \uCD94\uCD9C\uD588\uC2B5\uB2C8\uB2E4. \uCE90\uB9AD\uD130 \uC800\uC7A5\uC744 \uB204\uB974\uBA74 \uC801\uC6A9\uB429\uB2C8\uB2E4.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInlineStatus(`\uC0AC\uC2E4 \uCD94\uCD9C \uC2E4\uD328: ${message}`);
      Alert.alert('\uC0AC\uC2E4 \uCD94\uCD9C \uC2E4\uD328', message);
    } finally {
      setMemoryArchiveBusyId('');
    }
  }

  function confirmRemoveArchive(archive: CharacterMemory) {
    Alert.alert(
      '\uCD94\uC5B5 \uC7A5\uBA74 \uC0AD\uC81C',
      '\uC7A5\uBA74 \uC6D0\uBB38\uC744 \uC601\uAD6C\uC801\uC73C\uB85C \uC0AD\uC81C\uD560\uAE4C\uC694? \uC774 \uC791\uC5C5\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
      [
        { text: '\uCDE8\uC18C', style: 'cancel' },
        {
          text: '\uC0AD\uC81C',
          style: 'destructive',
          onPress: () => { void onChange(removeSceneArchive(state, archive.id)); }
        }
      ]
    );
  }
  function confirmDeleteCharacter() {
    const name = draft?.name || character?.name || '이 캐릭터';
    Alert.alert(
      '캐릭터 삭제',
      `${name} 캐릭터와 관련 개인 채팅방, 메시지, SNS 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            void onDelete?.(characterId);
          }
        }
      ]
    );
  }

  function set<K extends keyof SNSGodCharacter>(key: K, value: SNSGodCharacter[K]) {
    setInlineStatus('');
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function applyReplyPreset(preset: typeof REPLY_PRESETS[number]) {
    setDraft(prev => prev ? {
      ...prev,
      ...preset.values,
      lifeRhythm: normalizeLifeRhythm(preset.values.lifeRhythm),
      uniqueBehavior: normalizeUniqueBehavior(preset.values),
      replyPresetId: preset.id
    } : prev);
    setInlineStatus(`${preset.title} 연락 유형을 적용했습니다. 필요하면 세부 타이밍 조절에서 직접 바꿀 수 있습니다.`);
  }

  function setLifeRhythm(key: keyof NonNullable<SNSGodCharacter['lifeRhythm']>, value: boolean) {
    setDraft(prev => prev ? { ...prev, lifeRhythm: { ...normalizeLifeRhythm(prev.lifeRhythm), [key]: value } } : prev);
  }

  async function chooseImage(key: 'avatar' | 'coverImage') {
    try {
      const image = await pickImageDataUri();
      if (!image) return;
      if (key === 'avatar') {
        setDraft(prev => prev ? { ...prev, avatar: image, profileImage: image } : prev);
      } else {
        set(key, image);
      }
    } catch (error) {
      Alert.alert('사진 선택 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function addStickerImage() {
    try {
      const image = await pickImageDataUri();
      if (!image || !draft) return;
      const id = `sticker_${Date.now().toString(36)}`;
      const line = `${id}|${draft.name} 스티커|직접 추가한 이미지 스티커|${image}`;
      setStickerText(prev => prev.trim() ? `${prev.trim()}\n${line}` : line);
    } catch (error) {
      Alert.alert('스티커 선택 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function generateProfileImage(kind: 'avatar' | 'coverImage') {
    if (!draft) return;
    try {
      const prompt = kind === 'avatar'
        ? 'SNS profile photo'
        : String(draft.profileCoverPrompt || DEFAULT_COVER_BACKGROUND_DIRECTION);
      const referenceImage = kind === 'avatar' ? randomReferenceImage(normalizedReferenceImages(draft)) || '' : '';
      const image = await generateImageDataUri(state, prompt, draft, { referenceImage, kind: kind === 'avatar' ? 'profile' : 'cover' });
      const historyItem = { id: makeId('profile_image'), image, prompt, createdAt: Date.now(), kind: kind === 'avatar' ? 'profile' as const : 'cover' as const };
      if (kind === 'avatar') {
        setDraft(prev => prev ? { ...prev, avatar: image, profileImage: image, profileImageHistory: [historyItem, ...(prev.profileImageHistory || [])].slice(0, 60) } : prev);
      } else {
        setDraft(prev => prev ? { ...prev, coverImage: image, profileImageHistory: [historyItem, ...(prev.profileImageHistory || [])].slice(0, 60) } : prev);
      }
    } catch (error) {
      Alert.alert('AI 이미지 생성 실패', error instanceof Error ? error.message : String(error));
    }
  }

  async function chooseReferenceImage(index?: number) {
    try {
      const image = await pickImageDataUri();
      if (!image) return;
      setDraft(prev => {
        if (!prev) return prev;
        const next = [...normalizedReferenceImages(prev)];
        if (typeof index === 'number') {
          next[index] = image;
        } else if (next.length < 3) {
          next.push(image);
        }
        const compact = next.filter(Boolean).slice(0, 3);
        return { ...prev, profileReferenceImages: compact, profileReferenceImage: compact[0] || '' };
      });
    } catch (error) {
      Alert.alert('레퍼런스 선택 실패', error instanceof Error ? error.message : String(error));
    }
  }

  function removeReferenceImage(index: number) {
    setDraft(prev => {
      if (!prev) return prev;
      const compact = normalizedReferenceImages(prev).filter((_, itemIndex) => itemIndex !== index).slice(0, 3);
      return { ...prev, profileReferenceImages: compact, profileReferenceImage: compact[0] || '' };
    });
  }

  function applyCalendarPreset(preset: typeof CALENDAR_PRESETS[number]) {
    setEventTitle(preset.title);
    setEventType(preset.type);
    setEventPrompt(preset.prompt);
  }

  function addCalendarEvent() {
    if (!draft) return;
    const event = normalizeCalendarEvent({
      id: makeId('event'),
      title: eventTitle || '새 기념일',
      date: eventDate || 'MM-DD',
      type: eventType || 'anniversary',
      prompt: eventPrompt
    });
    set('calendarEvents', [event, ...(draft.calendarEvents || [])]);
    setEventTitle('');
    setEventDate('');
    setEventType('anniversary');
    setEventPrompt('');
  }

  function removeCalendarEvent(id: string) {
    if (!draft) return;
    set('calendarEvents', (draft.calendarEvents || []).filter(item => item.id !== id));
  }

  async function addLoreEntry() {
    const keys = loreKeys.split(',').map(item => item.trim()).filter(Boolean);
    if (!loreTitle.trim() && !keys.length && !loreContent.trim()) {
      setInlineStatus('로어북 제목, 트리거, 내용 중 하나는 입력해야 합니다.');
      return;
    }
    const entry: LoreEntry = {
      id: makeId('lore'),
      title: loreTitle.trim() || '새 로어북 블록',
      keys,
      content: loreContent.trim(),
      enabled: true,
      characterId,
      roomId: loreScope === 'room' ? loreRoomId || rooms[0]?.id : undefined
    };
    await onChange({ ...state, loreEntries: [entry, ...(state.loreEntries || [])] });
    setLoreTitle('');
    setLoreKeys('');
    setLoreContent('');
    setInlineStatus('로어북 블록을 추가했습니다.');
  }

  async function removeLoreEntry(id: string) {
    await onChange({ ...state, loreEntries: (state.loreEntries || []).filter(entry => entry.id !== id) });
    setInlineStatus('로어북 블록을 삭제했습니다.');
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>{character.name} 설정</Text>
        <Pressable onPress={() => save(false)} style={styles.saveTop}><Text style={styles.saveTopText}>저장</Text></Pressable>
      </View>
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {SECTION_TABS.map(tab => (
            <Pressable key={tab.key} onPress={() => setActiveSection(tab.key)} style={[styles.tab, activeSection === tab.key && styles.tabActive]}>
              <Text style={[styles.tabText, activeSection === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {inlineStatus ? <Text style={styles.status}>{inlineStatus}</Text> : null}

        {activeSection === 'basic' ? (
          <Section title="캐릭터 기본 설정">
            <CharacterBehaviorSummary state={state} character={draft} saved={settingsSaved} />
            <ChoiceRow label="캐릭터 언어" value={String(draft.language || 'inherit')} options={LANGUAGE_OPTIONS} onChange={value => set('language', value)} help="비워 두면 전체 설정 출력 언어를 따릅니다." />
            <Field label="이름" value={draft.name} onChangeText={value => set('name', value)} />
            <Field label="핸들" value={String(draft.handle || '')} onChangeText={value => set('handle', value)} help="SNS/검색에서 보이는 짧은 아이디입니다." />
            <Field label="아바타 글자" value={String(draft.avatarText || '')} onChangeText={value => set('avatarText', value)} />
            <Field label="이 캐릭터에게 보일 내 이름" value={String(draft.userName || '')} onChangeText={value => set('userName', value)} help="빈칸이면 기본 내 프로필 이름을 사용합니다. 방 설정의 호칭 지시가 있으면 방 설정이 최우선입니다." />
            <Field label="색상" value={String(draft.color || '#8bd3dd')} onChangeText={value => set('color', value)} help="HEX 직접 입력. 예: #8bd3dd" />
            <Palette value={String(draft.color || '#8bd3dd')} onChange={value => set('color', value)} />
            <ChoiceRow label="메시지 스타일" value={String(draft.messageStyle || 'balanced')} options={MESSAGE_STYLE_OPTIONS} onChange={value => set('messageStyle', value as SNSGodCharacter['messageStyle'])} />
            <SwitchRow label="활성화" value={draft.enabled !== false} onValueChange={value => set('enabled', value)} />
            <SwitchRow label="먼저 말하기" value={draft.proactiveEnabled === true} onValueChange={value => set('proactiveEnabled', value)} />
          </Section>
        ) : null}

        {activeSection === 'reply' ? (
          <Section title="대화 성향">
            <Text style={styles.help}>캐릭터의 연락 습관을 먼저 고르고, 필요할 때만 세부 타이밍 조절에서 직접 바꿉니다.</Text>
            <View style={styles.presetGrid}>
              {REPLY_PRESETS.map(preset => {
                const selected = selectedReplyPresetId(draft) === preset.id;
                const customized = selected && isReplyPresetCustomized(draft, preset);
                return (
                  <Pressable key={preset.id} onPress={() => applyReplyPreset(preset)} style={[styles.presetCard, selected && styles.presetCardSelected]}>
                    <Text style={[styles.presetTitle, selected && styles.presetTitleSelected]}>{preset.title}</Text>
                    {selected ? <Text style={styles.presetBadge}>{customized ? '기반 · 수정됨' : '선택됨'}</Text> : null}
                    <Text style={[styles.presetCatchphrase, selected && styles.presetCatchphraseSelected]}>{preset.catchphrase}</Text>
                    <Text style={[styles.presetSummary, selected && styles.presetSummarySelected]}>{preset.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setReplyAdvancedOpen(open => !open)} style={styles.advancedToggle}>
              <Text style={styles.advancedToggleText}>{replyAdvancedOpen ? '세부 타이밍 조절 닫기' : '세부 타이밍 조절'}</Text>
              <Text style={styles.advancedToggleIcon}>{replyAdvancedOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {replyAdvancedOpen ? (
              <View style={styles.advancedBody}>
                <SliderField label="답 없을 때 이어 말하기" value={draft.proactivePatience} min={0} max={2} leftLabel="0 금방 멈춤" rightLabel={'\uCD5C\uB300 2\uD68C \uCD94\uAC00 \uD6C4 \uB300\uAE30'} onChange={value => set('proactivePatience', value)} help="사용자가 답하지 않아도 캐릭터가 먼저 말을 몇 번 더 이어갈지 정합니다." />
                <NumberField label="가장 빨리 읽는 시간(초)" value={draft.responseDelayMin} onChange={value => set('responseDelayMin', value)} help="이 시간 전에는 캐릭터가 메시지를 확인하지 않습니다. 0-120초." />
                <NumberField label="늦어도 읽는 시간(초)" value={draft.responseDelayMax} onChange={value => set('responseDelayMax', value)} help="캐릭터가 늦게 확인하더라도 이 시간 안에는 확인합니다. 0-2700초." />
                <NumberField label="말풍선 최소 간격(초)" value={draft.messageGapMin} onChange={value => set('messageGapMin', value)} help="여러 메시지를 나눠 보낼 때 말풍선 사이의 가장 짧은 대기 시간입니다." />
                <NumberField label="말풍선 최대 간격(초)" value={draft.messageGapMax} onChange={value => set('messageGapMax', value)} help="여러 메시지를 나눠 보낼 때 말풍선 사이의 가장 긴 대기 시간입니다." />
                <SliderField label="읽는 속도" value={draft.responseTime} min={1} max={10} leftLabel="1 느림" rightLabel="10 빠름" onChange={value => set('responseTime', value)} />
                <SliderField label="답변 고민 정도" value={draft.thinkingTime} min={1} max={10} leftLabel="1 즉흥" rightLabel="10 깊게 생각" onChange={value => set('thinkingTime', value)} />
                <SliderField label="리액션 크기" value={draft.reactivity} min={1} max={10} leftLabel="1 차분함" rightLabel="10 크게 반응" onChange={value => set('reactivity', value)} help="사용자 말에 감정 표현이나 리액션을 얼마나 크게 드러낼지 정합니다." />
                <SliderField label="캐릭터 말투 개성" value={draft.tone} min={1} max={10} leftLabel="1 담백" rightLabel="10 강한 개성" onChange={value => set('tone', value)} />
                <NumberField label="먼저 말 걸 기회 간격(분)" value={draft.frequencyMinutes} onChange={value => set('frequencyMinutes', value)} help="작을수록 캐릭터가 먼저 말을 걸지 확인하는 기회가 자주 옵니다." />
                <SliderField label="먼저 말 걸 확률" value={draft.initiative} min={0} max={100} step={5} leftLabel="0 안 함" rightLabel="100 자주" onChange={value => set('initiative', value)} />
                <View style={styles.rhythmBlock}>
                  <Text style={styles.subhead}>생활 리듬</Text>
                  <Text style={styles.help}>사람마다 연락이 잘 되는 시간이 달라요. 켜두면 시간대에 따라 답장 속도와 선톡 빈도가 자연스럽게 달라집니다.</Text>
                  {LIFE_RHYTHM_OPTIONS.map(([key, label, help]) => (
                    <SwitchField
                      key={key}
                      label={label}
                      help={help}
                      value={normalizeLifeRhythm(draft.lifeRhythm)[key] === true}
                      onValueChange={value => setLifeRhythm(key, value)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </Section>
        ) : null}

        {activeSection === 'profile' ? (
          <Section title="프로필 / 상태 / 이미지">
            <Field label="상태 메시지" value={String(draft.statusMessage || '')} onChangeText={value => set('statusMessage', value)} />
            <Field label="프로필 소개" value={String(draft.profileMessage || '')} onChangeText={value => set('profileMessage', value)} multiline help="캐릭터 사진을 눌렀을 때 보이는 프로필 문구입니다." />
            <ImageField
              label="프로필/목록 사진"
              value={draft.avatar || draft.profileImage}
              onChoose={() => chooseImage('avatar')}
              onClear={() => setDraft(prev => prev ? { ...prev, avatar: '', profileImage: '' } : prev)}
              onGenerate={() => generateProfileImage('avatar')}
            />
            <ReferenceImagesField
              values={normalizedReferenceImages(draft)}
              onAdd={() => chooseReferenceImage()}
              onReplace={index => chooseReferenceImage(index)}
              onRemove={removeReferenceImage}
            />
            <ImageField label="프로필 배경 사진" value={draft.coverImage} onChoose={() => chooseImage('coverImage')} onClear={() => set('coverImage', '')} onGenerate={() => generateProfileImage('coverImage')} wide />
            <Text style={styles.help}>프로필 사진은 레퍼런스 이미지로 얼굴을 유지한 채 SNS 프로필용으로만 생성합니다. 별도 프로필사진 프롬프트는 사용하지 않습니다.</Text>
            <Field label="배경사진 지시문" value={String(draft.profileCoverPrompt || '')} onChangeText={value => set('profileCoverPrompt', value)} multiline help="AI 작성은 사용하지 않습니다. 자동 배경 변경은 최근 대화, 통화, 캐릭터 행적을 기준으로 만들며, 여기는 원하면 추가 방향만 적습니다." />
            <SwitchRow label="상태메시지 자동 변경" value={draft.statusMessageAutoChange !== false} onValueChange={value => set('statusMessageAutoChange', value)} />
            <SwitchRow label="프로필사진 자동 변경" value={draft.profilePhotoAutoChange === true} onValueChange={value => set('profilePhotoAutoChange', value)} />
            <SwitchRow label="배경사진 자동 변경" value={draft.coverPhotoAutoChange === true} onValueChange={value => set('coverPhotoAutoChange', value)} />
            <NumberField label="상태메시지 변경 확률(%)" value={draft.statusMessageChangeChance} onChange={value => set('statusMessageChangeChance', value)} />
            <NumberField label="프로필사진 변경 확률(%)" value={draft.profilePhotoChangeChance} onChange={value => set('profilePhotoChangeChance', value)} />
            <NumberField label="배경사진 변경 확률(%)" value={draft.coverPhotoChangeChance} onChange={value => set('coverPhotoChangeChance', value)} />
          </Section>
        ) : null}

        {activeSection === 'time' ? (
          <Section title="시간 / 날씨">
            <Field label="위치 이름" value={String(draft.locationName || '')} onChangeText={value => set('locationName', value)} />
            <Field label="타임존" value={String(draft.timeZone || '')} onChangeText={value => set('timeZone', value)} />
            <NumberField label="위도" value={draft.latitude} onChange={value => set('latitude', value)} />
            <NumberField label="경도" value={draft.longitude} onChange={value => set('longitude', value)} />
            <SwitchRow label="현재 시각 알려주기" value={draft.timeContextEnabled !== false} onValueChange={value => set('timeContextEnabled', value)} />
            <SwitchRow label="현재 날씨 알려주기" value={draft.weatherEnabled !== false} onValueChange={value => set('weatherEnabled', value)} />
            <Text style={styles.help}>답마다 강제로 말하지 않고, 필요할 때 자연스럽게 참고합니다.</Text>
          </Section>
        ) : null}

        {activeSection === 'calendar' ? (
          <Section title="캐릭터 기념일">
            <Text style={styles.help}>MM-DD는 매년 반복, YYYY-MM-DD는 한 번만 적용됩니다.</Text>
            <View style={styles.chips}>
              {CALENDAR_PRESETS.map(preset => (
                <Pressable key={preset.type} onPress={() => applyCalendarPreset(preset)} style={styles.chip}>
                  <Text style={styles.chipText}>{preset.title}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="제목" value={eventTitle} onChangeText={setEventTitle} />
            <Field label="날짜" value={eventDate} onChangeText={setEventDate} help="예: 05-12 또는 2026-05-12" />
            <Field label="종류" value={eventType} onChangeText={setEventType} />
            <Field label="이벤트 지시문" value={eventPrompt} onChangeText={setEventPrompt} multiline />
            <Pressable onPress={addCalendarEvent} style={styles.secondary}><Text style={styles.secondaryText}>기념일 추가</Text></Pressable>
            {(draft.calendarEvents || []).length ? (draft.calendarEvents || []).map(event => (
              <ListCard key={event.id} title={event.title || '기념일'} subtitle={`${event.date || '날짜 없음'} · ${event.type || 'event'}`} body={event.prompt} onDelete={() => removeCalendarEvent(event.id)} />
            )) : <Text style={styles.help}>아직 캐릭터 기념일이 없습니다.</Text>}
          </Section>
        ) : null}

        {activeSection === 'lore' ? (
          <Section title={`${character.name} 로어북`}>
            <Text style={styles.help}>트리거 단어가 대화에 등장할 때만 프롬프트에 들어갑니다. 캐릭터 범위는 모든 채팅방, 채팅방 범위는 선택한 방에서만 적용됩니다.</Text>
            <ChoiceRow label="적용 범위" value={loreScope} options={[['character', '캐릭터 전체'], ['room', '채팅방 전용']]} onChange={value => setLoreScope(value as 'character' | 'room')} />
            {loreScope === 'room' ? <ChoiceRow label="대상 채팅방" value={loreRoomId || rooms[0]?.id || ''} options={rooms.map(room => [room.id, room.name || '새 채팅'])} onChange={setLoreRoomId} /> : null}
            <Field label="제목" value={loreTitle} onChangeText={setLoreTitle} />
            <Field label="트리거 단어" value={loreKeys} onChangeText={setLoreKeys} help="쉼표로 구분합니다. 예: 학교, 첫사랑, 약속" />
            <Field label="내용" value={loreContent} onChangeText={setLoreContent} multiline />
            <Pressable onPress={addLoreEntry} style={styles.secondary}><Text style={styles.secondaryText}>새 블록</Text></Pressable>
            <Text style={styles.subhead}>캐릭터 로어북</Text>
            {characterLore.length ? characterLore.map(entry => <LoreCard key={entry.id} entry={entry} rooms={rooms} onDelete={() => removeLoreEntry(entry.id)} />) : <Text style={styles.help}>이 캐릭터 전체에 적용되는 로어북 블록이 아직 없습니다.</Text>}
            <Text style={styles.subhead}>채팅방 로어북</Text>
            {roomLore.length ? roomLore.map(entry => <LoreCard key={entry.id} entry={entry} rooms={rooms} onDelete={() => removeLoreEntry(entry.id)} />) : <Text style={styles.help}>채팅방 전용 로어북 블록이 아직 없습니다.</Text>}
          </Section>
        ) : null}

        {activeSection === 'stickers' ? (
          <Section title="캐릭터 스티커">
            <StickerPreview text={stickerText} />
            <Pressable onPress={addStickerImage} style={styles.imageButton}><Text style={styles.imageButtonText}>이미지 스티커 추가</Text></Pressable>
            <Field
              label="캐릭터 스티커"
              value={stickerText}
              onChangeText={setStickerText}
              multiline
              help="한 줄에 id|이름|설명|이미지dataURI 형식입니다. AI가 답변 JSON의 sticker 값으로 id를 반환하면 실제 이미지가 표시됩니다."
            />
          </Section>
        ) : null}

        {activeSection === 'prompt' ? (
          <Section title="프롬프트 / 메모리">
            <Field
              label="이 캐릭터에게 보일 내 프로필"
              value={String(draft.userDescription || '')}
              onChangeText={value => set('userDescription', value)}
              multiline
              help="값이 들어가면 기본 유저 프로필 내용을 대체합니다. 간단한 관계 추가는 방 설정의 관계/호칭 메모를 쓰는 편이 좋습니다."
            />
            <Field label="캐릭터 프롬프트" value={String(draft.prompt || '')} onChangeText={value => set('prompt', value)} multiline />
            <Field label="삽화 외형 태그" value={String(draft.illustrationTags || '')} onChangeText={value => set('illustrationTags', value)} multiline help="AI 이미지 생성 시 캐릭터 외형 태그로 참고합니다." />
            <Field label="첫 메시지" value={String(draft.firstMessage || '')} onChangeText={value => set('firstMessage', value)} multiline />
            <Field
              label={'\uC7A5\uAE30 \uC0AC\uC2E4 \uAE30\uC5B5'}
              value={memoryText}
              onChangeText={setMemoryText}
              multiline
              help={'\uD55C \uC904\uC5D0 \uD558\uB098\uC758 \uC9E7\uC740 \uC0AC\uC2E4\uB9CC \uC785\uB825\uD558\uC138\uC694. \uAD00\uACC4, \uD638\uCE6D, \uC120\uD638, \uACBD\uACC4, \uC57D\uC18D\uACFC \uC608\uC815\uB9CC \uB2F5\uC7A5 \uD504\uB86C\uD504\uD2B8\uC5D0 \uC0AC\uC6A9\uB429\uB2C8\uB2E4. \uC7A5\uBA74 \uBB18\uC0AC\uB97C \uC800\uC7A5\uD558\uBA74 \uC790\uB3D9\uC73C\uB85C \uCD94\uC5B5 \uC7A5\uBA74\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.'}
            />
            <View style={styles.memoryArchiveHeader}>
              <Text style={styles.subhead}>{`\uCD94\uC5B5 \uC7A5\uBA74 (${sceneArchives.length})`}</Text>
              <Text style={styles.memoryArchiveBadge}>{'\uB2F5\uC7A5 \uD504\uB86C\uD504\uD2B8 \uC81C\uC678'}</Text>
            </View>
            <Text style={styles.help}>{'\uB300\uD654\uC758 \uC6D0\uBB38, \uC9C1\uC811 \uB300\uC0AC, \uAC10\uC815\uC801 \uC7A5\uBA74 \uBB18\uC0AC\uB97C \uBCF4\uAD00\uD558\uB294 \uACF5\uAC04\uC785\uB2C8\uB2E4. \uBCF4\uAD00\uB9CC \uD558\uACE0 \uC77C\uBC18 \uB2F5\uC7A5\uC5D0\uB294 \uB123\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.'}</Text>
            {sceneArchives.length ? sceneArchives.map(archive => (
              <View key={archive.id} style={styles.memoryArchiveCard}>
                <View style={styles.listHeader}>
                  <View style={styles.listText}>
                    <Text style={styles.listTitle}>{'\uCD94\uC5B5 \uC7A5\uBA74'}</Text>
                    <Text style={styles.help}>{new Date(Number(archive.createdAt || Date.now())).toLocaleDateString('ko-KR')}</Text>
                  </View>
                  <Text style={styles.memoryArchiveBadge}>{'\uBCF4\uAD00 \uC804\uC6A9'}</Text>
                </View>
                <Text style={styles.listBody}>{archive.content}</Text>
                <View style={styles.memoryArchiveActions}>
                  <Pressable
                    onPress={() => { void extractArchiveFacts(archive); }}
                    disabled={Boolean(memoryArchiveBusyId)}
                    style={[styles.memoryArchiveAction, memoryArchiveBusyId && styles.inlineActionDisabled]}
                  >
                    <Text style={styles.secondaryText}>{memoryArchiveBusyId === archive.id ? '\uCD94\uCD9C \uC911...' : 'AI\uB85C \uC0AC\uC2E4 \uCD94\uCD9C'}</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmRemoveArchive(archive)} style={[styles.memoryArchiveAction, styles.memoryArchiveDelete]}>
                    <Text style={styles.dangerText}>{'\uC0AD\uC81C'}</Text>
                  </Pressable>
                </View>
              </View>
            )) : <Text style={styles.help}>{'\uBCF4\uAD00\uB41C \uCD94\uC5B5 \uC7A5\uBA74\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'}</Text>}
          </Section>
        ) : null}

        <View style={styles.footerActions}>
          <Pressable onPress={confirmDeleteCharacter} style={styles.deletePrimary}><Text style={styles.deletePrimaryText}>삭제</Text></Pressable>
          <Pressable onPress={() => save(true)} style={styles.primaryFooter}><Text style={styles.primaryText}>캐릭터 저장</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function settingsSignature(character: SNSGodCharacter, memoryText: string, stickerText: string): string {
  const imageKey = (value: unknown) => {
    const text = String(value || '');
    return text ? text.slice(0, 48) + ':' + text.length : '';
  };
  return JSON.stringify({
    ...character,
    avatar: imageKey(character.avatar),
    profileImage: imageKey(character.profileImage),
    coverImage: imageKey(character.coverImage),
    profileReferenceImage: imageKey(character.profileReferenceImage),
    profileReferenceImages: (character.profileReferenceImages || []).map(imageKey),
    profileImageHistory: (character.profileImageHistory || []).map(item => ({ id: item.id, createdAt: item.createdAt, kind: item.kind })),
    stickers: undefined,
    memories: undefined,
    memoryText,
    stickerText
  });
}
function normalizeDraft(character: SNSGodCharacter): SNSGodCharacter {
  const unifiedProfileImage = character.avatar || character.profileImage || '';
  const profileReferenceImages = normalizedReferenceImages(character);
  return {
    ...character,
    avatar: unifiedProfileImage,
    profileImage: unifiedProfileImage,
    profileReferenceImages,
    profileReferenceImage: profileReferenceImages[0] || '',
    language: String(character.language || 'inherit'),
    color: String(character.color || '#8bd3dd'),
    replyPresetId: selectedReplyPresetId(character),
    messageStyle: character.messageStyle || 'balanced',
    proactivePatience: Math.max(0, Math.min(2, Number(character.proactivePatience ?? 2))),
    responseDelayMin: Number(character.responseDelayMin ?? 1),
    responseDelayMax: Number(character.responseDelayMax ?? 8),
    messageGapMin: Number(character.messageGapMin ?? 1),
    messageGapMax: Number(character.messageGapMax ?? 3),
    responseTime: Number(character.responseTime ?? 6),
    thinkingTime: Number(character.thinkingTime ?? 6),
    reactivity: Number(character.reactivity ?? 8),
    tone: Number(character.tone ?? 8),
    frequencyMinutes: Number(character.frequencyMinutes ?? 10),
    initiative: Number(character.initiative ?? 40),
    lifeRhythm: normalizeLifeRhythm(character.lifeRhythm),
    uniqueBehavior: normalizeUniqueBehavior(character),
    statusMessage: String(character.statusMessage || '접속 중'),
    locationName: String(character.locationName || 'Seoul'),
    timeZone: String(character.timeZone || 'Asia/Seoul'),
    latitude: Number(character.latitude ?? 37.5665),
    longitude: Number(character.longitude ?? 126.978),
    statusMessageAutoChange: character.statusMessageAutoChange !== false,
    profilePhotoAutoChange: character.profilePhotoAutoChange === true,
    coverPhotoAutoChange: character.coverPhotoAutoChange === true,
    statusMessageChangeChance: Number(character.statusMessageChangeChance ?? 40),
    profilePhotoChangeChance: Number(character.profilePhotoChangeChance ?? 5),
    coverPhotoChangeChance: Number(character.coverPhotoChangeChance ?? 5),
    profileCoverPrompt: String(!character.profileCoverPrompt || character.profileCoverPrompt === LEGACY_COVER_BACKGROUND_DIRECTION ? DEFAULT_COVER_BACKGROUND_DIRECTION : character.profileCoverPrompt),
    weatherEnabled: character.weatherEnabled !== false,
    timeContextEnabled: character.timeContextEnabled !== false,
    calendarEvents: (character.calendarEvents || []).map(normalizeCalendarEvent)
  };
}

function selectedReplyPresetId(character: Partial<SNSGodCharacter>): string {
  const saved = String(character.replyPresetId || '');
  if (REPLY_PRESETS.some(preset => preset.id === saved)) return saved;
  const matched = REPLY_PRESETS.find(preset => presetScalarKeys(preset).every(([key, value]) => character[key as keyof SNSGodCharacter] === value));
  return matched?.id || '';
}

function presetScalarKeys(preset: typeof REPLY_PRESETS[number]) {
  return Object.entries(preset.values).filter(([key]) => key !== 'lifeRhythm' && key !== 'uniqueBehavior');
}

function isReplyPresetCustomized(character: Partial<SNSGodCharacter>, preset: typeof REPLY_PRESETS[number]): boolean {
  const scalarChanged = presetScalarKeys(preset).some(([key, value]) => character[key as keyof SNSGodCharacter] !== value);
  if (scalarChanged) return true;
  const expectedRhythm = normalizeLifeRhythm(preset.values.lifeRhythm);
  const currentRhythm = normalizeLifeRhythm(character.lifeRhythm);
  const rhythmChanged = LIFE_RHYTHM_OPTIONS.some(([key]) => expectedRhythm[key] !== currentRhythm[key]);
  const expectedTone = preset.values.uniqueBehavior?.proactiveTone || '';
  const currentTone = character.uniqueBehavior?.proactiveTone || '';
  return rhythmChanged || expectedTone !== currentTone;
}

function normalizeLifeRhythm(value: SNSGodCharacter['lifeRhythm']) {
  return {
    weekdayQuiet: value?.weekdayQuiet === true,
    eveningActive: value?.eveningActive === true,
    lateNightMood: value?.lateNightMood === true,
    weekendActive: value?.weekendActive === true,
    nightQuiet: value?.nightQuiet === true,
    busySchedule: value?.busySchedule === true
  };
}

function normalizeUniqueBehavior(character: Partial<SNSGodCharacter>) {
  const tone = String(character.uniqueBehavior?.proactiveTone || '');
  const allowed = REPLY_PRESETS.some(preset => preset.values.uniqueBehavior.proactiveTone === tone);
  return {
    ...(character.uniqueBehavior || {}),
    proactiveTone: allowed ? tone as NonNullable<SNSGodCharacter['uniqueBehavior']>['proactiveTone'] : undefined
  };
}

function normalizedReferenceImages(character: SNSGodCharacter): string[] {
  return characterReferenceImages(character).slice(0, 3);
}

function normalizeCalendarEvent(event: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: String(event.id || makeId('event')),
    title: String(event.title || ''),
    date: String(event.date || ''),
    type: String(event.type || 'anniversary'),
    prompt: String(event.prompt || '')
  };
}

function validChoice(value: string, options: string[][], fallback: string) {
  return options.some(([key]) => key === value) ? value : fallback;
}

function parseStickers(text: string) {
  return text.split('\n').map(item => item.trim()).filter(Boolean).map((line, index) => {
    const [id, name, description, data] = line.split('|').map(part => part.trim());
    return { id: id || `sticker_${index + 1}`, name: name || id || `스티커 ${index + 1}`, description: description || undefined, data: data || undefined, mediaData: data || undefined };
  }).slice(0, 80);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>;
}

function Field({ label, value, onChangeText, help, multiline, actionLabel, onAction, actionDisabled }: { label: string; value: string; onChangeText: (value: string) => void; help?: string; multiline?: boolean; actionLabel?: string; onAction?: () => void; actionDisabled?: boolean }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>{label}</Text>
        {onAction ? (
          <Pressable onPress={onAction} disabled={actionDisabled} style={[styles.inlineAction, actionDisabled && styles.inlineActionDisabled]}>
            <Text style={styles.inlineActionText}>{actionLabel || 'AI 작성'}</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput value={value} onChangeText={onChangeText} style={[styles.input, multiline && styles.textarea]} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} />
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function NumberField({ label, value, onChange, help }: { label: string; value: unknown; onChange: (value: number) => void; help?: string }) {
  return <Field label={label} value={String(value ?? '')} onChangeText={text => onChange(Number(text) || 0)} help={help} />;
}

function SliderField({ label, value, min, max, step = 1, leftLabel, rightLabel, onChange, help }: {
  label: string;
  value: unknown;
  min: number;
  max: number;
  step?: number;
  leftLabel: string;
  rightLabel: string;
  onChange: (value: number) => void;
  help?: string;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const numeric = Math.max(min, Math.min(max, Number(value ?? min) || min));
  const percent = max === min ? 0 : ((numeric - min) / (max - min)) * 100;
  function updateFromX(x: number) {
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, trackWidth)));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, Number(stepped.toFixed(4)))));
  }
  return (
    <View style={styles.field}>
      <View style={styles.sliderHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.sliderValue}>{numeric}</Text>
      </View>
      <Pressable
        onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
        onPress={event => updateFromX(event.nativeEvent.locationX)}
        style={styles.sliderTrack}
      >
        <View style={[styles.sliderFill, { width: `${percent}%` }]} />
        <View style={[styles.sliderThumb, { left: `${percent}%` }]} />
      </Pressable>
      <View style={styles.sliderScale}>
        <Text style={[styles.sliderScaleText, styles.sliderScaleLeft]}>{leftLabel}</Text>
        <Text style={[styles.sliderScaleText, styles.sliderScaleRight]}>{rightLabel}</Text>
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function ChoiceRow({ label, value, options, onChange, help }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; help?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.length ? options.map(([key, text]) => (
          <Pressable key={key} onPress={() => onChange(key)} style={[styles.chip, value === key && styles.chipActive]}>
            <Text style={[styles.chipText, value === key && styles.chipTextActive]}>{text}</Text>
          </Pressable>
        )) : <Text style={styles.help}>선택 가능한 항목이 없습니다.</Text>}
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function Palette({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const palette = ['#8bd3dd', '#79c2f2', '#5aa8e8', '#7686f4', '#9b75df', '#b66eed', '#eda1c7', '#ff7896', '#e95f72', '#f28ba7', '#ff9f43', '#ffc878', '#ffe66d', '#d8edb7', '#97d5b5', '#52b788', '#2ec4b6', '#94d2e9', '#b7c5f4', '#c7b5dc', '#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#a0c4ff', '#bdb2ff', '#f7f7f2', '#d5d8dc', '#34495e', '#0b1320'];
  return (
    <View style={styles.palette}>
      {palette.map(color => (
        <Pressable key={color} onPress={() => onChange(color)} style={[styles.swatch, { backgroundColor: color }, value.toLowerCase() === color.toLowerCase() && styles.swatchActive]} />
      ))}
    </View>
  );
}

function ImageField({ label, value, onChoose, onClear, onGenerate, wide }: { label: string; value?: string; onChoose: () => void; onClear: () => void; onGenerate?: () => void; wide?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.imageRow}>
        {value ? <Image source={{ uri: value }} style={[styles.preview, wide && styles.previewWide]} /> : <View style={[styles.preview, styles.emptyPreview, wide && styles.previewWide]}><Text style={styles.emptyPreviewText}>사진 없음</Text></View>}
        <View style={styles.imageButtons}>
          <Pressable onPress={onChoose} style={styles.imageButton}><Text style={styles.imageButtonText}>직접 넣기</Text></Pressable>
          {onGenerate ? <Pressable onPress={onGenerate} style={styles.imageButton}><Text style={styles.imageButtonText}>사진 직접 AI 생성</Text></Pressable> : null}
          <Pressable onPress={onClear} style={styles.imageButton}><Text style={styles.imageButtonText}>비우기</Text></Pressable>
        </View>
      </View>
      <Text style={styles.help}>휴대폰 갤러리에서 직접 선택합니다. 백업에는 이미지 데이터가 함께 저장됩니다.</Text>
    </View>
  );
}

function ReferenceImagesField({ values, onAdd, onReplace, onRemove }: { values: string[]; onAdd: () => void; onReplace: (index: number) => void; onRemove: (index: number) => void }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>프로필 생성 레퍼런스 원본</Text>
        <Text style={styles.help}>{values.length}/3</Text>
      </View>
      <View style={styles.referenceGrid}>
        {[0, 1, 2].map(index => {
          const value = values[index];
          return (
            <View key={index} style={styles.referenceSlot}>
              {value ? <Image source={{ uri: value }} style={styles.referenceImage} /> : <View style={styles.referenceEmpty}><Text style={styles.emptyPreviewText}>비어 있음</Text></View>}
              <Text style={styles.referenceRole}>{['\uC5BC\uAD74 \uC815\uCCB4\uC131', '\uD5E4\uC5B4\u00B7\uCCB4\uD615', '\uBD84\uC704\uAE30\u00B7\uC2A4\uD0C0\uC77C'][index]}</Text>
              <View style={styles.referenceActions}>
                <Pressable onPress={() => value ? onReplace(index) : onAdd()} style={styles.referenceButton}>
                  <Text style={styles.referenceButtonText}>{value ? '수정' : '추가'}</Text>
                </Pressable>
                {value ? (
                  <Pressable onPress={() => onRemove(index)} style={[styles.referenceButton, styles.referenceDelete]}>
                    <Text style={styles.referenceDeleteText}>삭제</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={styles.help}>{'\uCCAB \uBC88\uC9F8\uB294 \uC5BC\uAD74 \uC815\uCCB4\uC131, \uB450 \uBC88\uC9F8\uB294 \uD5E4\uC5B4\u00B7\uCCB4\uD615, \uC138 \uBC88\uC9F8\uB294 \uBD84\uC704\uAE30\u00B7\uC2A4\uD0C0\uC77C \uCC38\uACE0\uC6A9\uC785\uB2C8\uB2E4. \uC5BC\uAD74 \uC0AC\uC9C4\uC740 1\uBC88\uC744 \uC6B0\uC120\uD569\uB2C8\uB2E4.'}</Text>
    </View>
  );
}

function StickerPreview({ text }: { text: string }) {
  const stickers = parseStickers(text).slice(0, 12);
  if (!stickers.length) return <Text style={styles.help}>등록된 스티커가 없습니다.</Text>;
  return (
    <View style={styles.stickerGrid}>
      {stickers.map((item, index) => (
        <View key={`${item.id}-${index}`} style={styles.stickerTile}>
          {isRenderableMediaUri(item.data) ? <Image source={{ uri: item.data }} style={styles.stickerImage} /> : <Text style={styles.stickerFallback}>ID</Text>}
          <Text style={styles.stickerName} numberOfLines={1}>{item.name || item.id}</Text>
        </View>
      ))}
    </View>
  );
}

function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function SwitchField({ label, help, value, onValueChange }: { label: string; help: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchField}>
      <View style={styles.switchFieldHeader}>
        <View style={styles.switchFieldText}>
          <Text style={styles.switchLabel}>{label}</Text>
          <Text style={styles.help}>{help}</Text>
        </View>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}

function ListCard({ title, subtitle, body, onDelete }: { title: string; subtitle?: string; body?: string; onDelete: () => void }) {
  return (
    <View style={styles.listCard}>
      <View style={styles.listHeader}>
        <View style={styles.listText}>
          <Text style={styles.listTitle}>{title}</Text>
          {subtitle ? <Text style={styles.help}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onDelete} style={styles.danger}><Text style={styles.dangerText}>삭제</Text></Pressable>
      </View>
      {body ? <Text style={styles.listBody}>{body}</Text> : null}
    </View>
  );
}

function LoreCard({ entry, rooms, onDelete }: { entry: LoreEntry; rooms: SNSGodRoom[]; onDelete: () => void }) {
  const roomName = entry.roomId ? rooms.find(room => room.id === entry.roomId)?.name || '채팅방' : '캐릭터 전체';
  return <ListCard title={entry.title || '로어북 블록'} subtitle={`${roomName} · ${(entry.keys || []).join(', ') || '트리거 없음'}`} body={entry.content} onDelete={onDelete} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#eee8dc' },
  backText: { fontSize: 34, lineHeight: 36, color: colors.text },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: colors.text },
  saveTop: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveTopText: { color: '#241a00', fontWeight: '900' },
  tabsWrap: { backgroundColor: colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tabs: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  tab: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#111111', borderColor: '#111111' },
  tabText: { color: colors.text, fontWeight: '900', fontSize: 13 },
  tabTextActive: { color: '#ffffff' },
  content: { padding: 14, gap: 14, paddingBottom: 32 },
  status: { color: '#5e4d16', backgroundColor: '#fff1bf', borderWidth: 1, borderColor: '#e3c65f', padding: 10, borderRadius: 8, fontWeight: '900' },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  subhead: { marginTop: 8, color: colors.text, fontSize: 15, fontWeight: '900' },
  field: { gap: 6 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 12, color: colors.sub, fontWeight: '900' },
  inlineAction: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1, borderColor: '#d2c6b5', backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  inlineActionDisabled: { opacity: 0.55 },
  inlineActionText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sliderValue: { minWidth: 34, textAlign: 'right', color: colors.text, fontWeight: '900', fontSize: 13 },
  sliderTrack: { height: 30, borderRadius: 15, backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border, justifyContent: 'center', overflow: 'hidden' },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  sliderThumb: { position: 'absolute', top: 3, width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: '#111111', borderWidth: 2, borderColor: '#fffefa' },
  sliderScale: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderScaleText: { flex: 1, color: colors.sub, fontSize: 11, fontWeight: '800' },
  sliderScaleLeft: { textAlign: 'left' },
  sliderScaleRight: { textAlign: 'right' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fffefa', color: colors.text, fontSize: 15 },
  textarea: { minHeight: 116, maxHeight: 220 },
  help: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent, borderColor: '#b79427' },
  chipText: { color: colors.text, fontWeight: '900' },
  chipTextActive: { color: '#241a00' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetCard: { flexBasis: '48%', flexGrow: 1, minHeight: 118, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', padding: 10, gap: 5 },
  presetCardSelected: { backgroundColor: '#fff1bf', borderColor: '#b79427' },
  presetTitle: { color: colors.text, fontWeight: '900', fontSize: 14 },
  presetTitleSelected: { color: '#241a00' },
  presetBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: '#241a00', color: '#fffefa', fontSize: 10, fontWeight: '900', overflow: 'hidden' },
  presetCatchphrase: { color: '#9a5a00', fontSize: 12, fontWeight: '900', lineHeight: 17 },
  presetCatchphraseSelected: { color: '#7a4300' },
  presetSummary: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  presetSummarySelected: { color: '#5e4d16' },
  advancedToggle: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eee8dc', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  advancedToggleText: { color: colors.text, fontWeight: '900' },
  advancedToggleIcon: { color: colors.text, fontWeight: '900', fontSize: 18 },
  advancedBody: { gap: 10, paddingTop: 2 },
  rhythmBlock: { gap: 8, paddingTop: 6 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#8b867b' },
  swatchActive: { borderWidth: 3, borderColor: '#222222' },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.text, fontWeight: '900' },
  switchField: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', padding: 10 },
  switchFieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchFieldText: { flex: 1, gap: 3 },
  imageRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  preview: { width: 74, height: 74, borderRadius: 12, backgroundColor: '#eee8dc' },
  previewWide: { width: 132 },
  emptyPreview: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  emptyPreviewText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  imageButtons: { flex: 1, gap: 8 },
  imageButton: { minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  imageButtonText: { color: colors.text, fontWeight: '900' },
  referenceGrid: { flexDirection: 'row', gap: 8 },
  referenceSlot: { flex: 1, minWidth: 0, padding: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', gap: 7 },
  referenceImage: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#eee8dc' },
  referenceRole: { color: colors.text, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  referenceEmpty: { width: '100%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#eee8dc', alignItems: 'center', justifyContent: 'center' },
  referenceActions: { gap: 6 },
  referenceButton: { minHeight: 30, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f7f2e9', alignItems: 'center', justifyContent: 'center' },
  referenceButtonText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  referenceDelete: { borderColor: '#f0b7b7', backgroundColor: '#fff1f1' },
  referenceDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickerTile: { width: 74, padding: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center' },
  stickerImage: { width: 48, height: 48, borderRadius: 8 },
  stickerFallback: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', lineHeight: 48, textAlign: 'center', backgroundColor: '#eee8dc', color: colors.sub, fontWeight: '900' },
  stickerName: { marginTop: 5, fontSize: 11, color: colors.text, fontWeight: '800' },
  listCard: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f4f1ea', padding: 12, gap: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listText: { flex: 1 },
  listTitle: { color: colors.text, fontWeight: '900' },
  listBody: { color: colors.text, fontSize: 13, lineHeight: 19 },
  memoryArchiveHeader: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  memoryArchiveBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: '#e8f3ee', color: '#35624c', fontSize: 10, fontWeight: '900' },
  memoryArchiveCard: { borderRadius: 8, borderWidth: 1, borderColor: '#cbded4', backgroundColor: '#f6fbf8', padding: 12, gap: 9 },
  memoryArchiveActions: { flexDirection: 'row', gap: 8 },
  memoryArchiveAction: { flex: 1, minHeight: 38, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  memoryArchiveDelete: { flex: 0.45, borderColor: '#f2a9a9', backgroundColor: '#fff1f1' },
  secondary: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  danger: { minHeight: 34, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: '#f2a9a9', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' },
  primary: { minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  footerActions: { flexDirection: 'row', gap: 10 },
  primaryFooter: { flex: 2, minHeight: 48, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  deletePrimary: { flex: 1, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: '#e07f7f', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  deletePrimaryText: { color: colors.danger, fontWeight: '900', fontSize: 16 },
  primaryText: { color: '#241a00', fontWeight: '900', fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emptyText: { color: colors.text, fontWeight: '900', marginBottom: 14 }
});