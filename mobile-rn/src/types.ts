export type ApiProvider = 'gemini' | 'openai' | 'anthropic' | 'custom' | 'vertex' | 'risuai';

export type ApiProfile = {
  apiKey?: string;
  apiKeys?: string[];
  apiEndpoint?: string;
  apiModel?: string;
  staticModel?: string;
  serviceAccountJson?: string;
  location?: string;
  serviceTier?: 'auto' | 'standard' | 'flex' | string;
  tokenBridgeUrl?: string;
  corsProxyUrl?: string;
  proxyAccessToken?: string;
  directMode?: boolean;
  fetchModels?: boolean;
  thinkingLevel?: 'off' | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | string;
  thinkingBudgetTokens?: number;
  maxTokens?: number;
  temperature?: number;
  contextMessageLimit?: number;
  snsContextMessageLimit?: number;
  phoneContextMessageLimit?: number;
  [key: string]: unknown;
};

export type ImageGenerationConfig = {
  enabled?: boolean;
  provider?: 'openai' | 'custom' | 'grok-local' | 'grok-cloud';
  apiKey?: string;
  apiEndpoint?: string;
  apiModel?: string;
  grokBaseUrl?: string;
  grokCloudBaseUrl?: string;
  grokResolution?: string;
  grokAspectRatio?: string;
  size?: string;
  quality?: string;
  promptPrefix?: string;
  negativePrompt?: string;
  forbiddenPromptRules?: string;
  referenceFaceChancePercent?: number;
  nsfw?: boolean;
  illustrationMode?: boolean;
};

export type PromptSet = {
  systemRules: string;
  roleObjective: string;
  characterActing: string;
  jsonFormat: string;
  memoryRules: string;
  stickerRules: string;
  language: string;
  adultBoundaryRules: string;
  chatImageRules: string;
  groupChatImageRules: string;
  imageGenerationToneRules: string;
  meetingEventRules: string;
  blindDateCandidateRules: string;
  datingAppProfileRules: string;
  randomCharacterRules: string;
  sumgodRules: string;
  snsPosting: string;
  snsSubjectGuide: string;
  snsNsfwBackAccount: string;
  profileCreation: string;
};

export type SNSGodConfig = {
  apiType: ApiProvider;
  apiProfiles: Partial<Record<ApiProvider, ApiProfile>>;
  userName: string;
  userDescription: string;
  userAppearancePrompt?: string;
  activeUserProfilePresetId?: string;
  userProfilePresets?: Array<{
    id: string;
    label: string;
    userName: string;
    userDescription: string;
    userAppearancePrompt?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  roomName: string;
  language: string;
  snsTheme?: 'default' | 'kakao';
  lastSettingsSection?: 'user' | 'characters' | 'stickers' | 'prompts' | 'lorebook' | 'screen' | 'api' | 'image';
  prompts?: Partial<PromptSet>;
  autoEnabled?: boolean;
  snsAutoChance?: number;
  snsStartCount?: number;
  privateFirst?: boolean;
  groupFirst?: boolean;
  randomDmEnabled?: boolean;
  snsAutoPostEnabled?: boolean;
  characterPhoneCallEnabled?: boolean;
  characterPhoneCallRarityLevel?: number;
  characterPhoneCallChancePercent?: number;
  characterPhoneCallMinCooldownMinutes?: number;
  characterPhoneCallGlobalCooldownMinutes?: number;
  characterPhoneCallMinCooldownHours?: number;
  characterPhoneCallGlobalCooldownHours?: number;
  datingAppRefreshHours?: number;
  datingAppAcceptanceChancePercent?: number;
  datingAppAgeRange?: string;
  imageGeneration?: ImageGenerationConfig;
  sns?: {
    platform?: 'instagram' | 'twitter';
    anonymous?: boolean;
    nsfw?: boolean;
    textOnly?: boolean;
    noDM?: boolean;
    thirdPartyDM?: boolean;
    includeUserInDM?: boolean;
    autoComments?: boolean;
    commentQty?: string;
    subject?: string;
    mood?: string;
    autoImage?: boolean;
    platformOptions?: Partial<Record<'instagram' | 'twitter', {
      anonymous?: boolean;
      nsfw?: boolean;
      textOnly?: boolean;
      noDM?: boolean;
      thirdPartyDM?: boolean;
      autoComments?: boolean;
      commentQty?: string;
      subject?: string;
      mood?: string;
      autoImage?: boolean;
    }>>;
  };
  [key: string]: unknown;
};

export type SnsPlatformOptions = {
  anonymous?: boolean;
  nsfw?: boolean;
  textOnly?: boolean;
  noDM?: boolean;
  thirdPartyDM?: boolean;
  autoComments?: boolean;
  commentQty?: string;
  subject?: string;
  mood?: string;
  autoImage?: boolean;
};

export type LifeRhythmToggles = {
  weekdayQuiet?: boolean;
  eveningActive?: boolean;
  lateNightMood?: boolean;
  weekendActive?: boolean;
  nightQuiet?: boolean;
  busySchedule?: boolean;
};

export type ConversationProactiveTone =
  | 'quick'
  | 'chatty'
  | 'cute'
  | 'stable_affection'
  | 'cool'
  | 'anxious'
  | 'dry_caring'
  | 'easygoing'
  | 'careful'
  | 'late_night'
  | 'busy'
  | 'public_figure';

export type SNSGodCharacter = {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
  avatarText?: string;
  color?: string;
  prompt?: string;
  userName?: string;
  userDescription?: string;
  firstMessage?: string;
  replyPresetId?: string;
  lifeRhythm?: LifeRhythmToggles;
  uniqueBehavior?: {
    proactiveTone?: ConversationProactiveTone;
    [key: string]: unknown;
  };
  messageStyle?: 'balanced' | 'long' | 'burst';
  responseDelayMin?: number;
  responseDelayMax?: number;
  messageGapMin?: number;
  messageGapMax?: number;
  responseTime?: number;
  thinkingTime?: number;
  reactivity?: number;
  tone?: number;
  frequencyMinutes?: number;
  initiative?: number;
  proactiveStyle?: string;
  proactivePatience?: number;
  statusMessage?: string;
  statusMessageAutoChange?: boolean;
  statusMessageChangeChance?: number;
  lastStatusMessageChangeAt?: number;
  profileMessage?: string;
  profileImage?: string;
  coverImage?: string;
  profileReferenceImage?: string;
  profileReferenceImages?: string[];
  profileImageHistory?: { id: string; image: string; prompt?: string; createdAt: number; kind?: 'profile' | 'cover' }[];
  lastProfilePhotoChangeAt?: number;
  lastCoverPhotoChangeAt?: number;
  profileAvatarPrompt?: string;
  profileCoverPrompt?: string;
  calendarEvents?: CalendarEvent[];
  memories?: string[];
  stickers?: Sticker[];
  snsAutoEnabled?: boolean;
  snsOptions?: Partial<Record<'instagram' | 'twitter', SnsPlatformOptions>>;
  enabled?: boolean;
  proactiveEnabled?: boolean;
  timeContextEnabled?: boolean;
  weatherEnabled?: boolean;
  [key: string]: unknown;
};

export type SNSGodRoom = {
  id: string;
  characterId: string;
  name: string;
  createdAt?: number;
  lastActivity?: number;
  relationshipNote?: string;
  userAlias?: string;
  roomPrompt?: string;
  pinned?: boolean;
  disabled?: boolean;
  disabledAt?: number;
  [key: string]: unknown;
};

export type RoomSummary = {
  id: string;
  roomId: string;
  roomType: 'private' | 'group';
  characterIds: string[];
  messageCount: number;
  /** Message count when the last LLM "현재 대화 요약" style summary was written. */
  llmSummaryMessageCount?: number;
  summary: string;
  topics: string[];
  mood: string;
  followUps: string[];
  updatedAt: number;
  lastMessageAt: number;
};

export type GroupRoomSummary = RoomSummary & {
  roomType: 'group';
  publicInfo: string[];
  characterTakeaways: Record<string, string[]>;
  relationshipChanges: string[];
};

export type CharacterMemory = {
  id: string;
  characterId: string;
  sourceRoomId: string;
  sourceRoomType: 'private' | 'group';
  visibility: 'private_with_user' | 'group_public' | 'character_private' | 'global';
  knownByCharacterIds: string[];
  content: string;
  importance: number;
  createdAt: number;
  lastUsedAt?: number;
};

export type RandomChatRoom = SNSGodRoom & {
  type: 'random';
  character: SNSGodCharacter;
  conceptSeed?: string;
  promoted?: boolean;
};

export type SNSGodMessage = {
  id: string;
  role: 'user' | 'character' | 'system';
  characterId?: string;
  content: string;
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
  sticker?: string;
  imagePrompt?: string;
  imageCaption?: string;
  mediaData?: string;
  [key: string]: unknown;
};

export type MeetingEventLine = {
  id: string;
  speaker: 'user' | 'character' | 'system';
  speakerType?: 'user' | 'character' | 'narration';
  characterId?: string;
  characterName?: string;
  targetCharacterId?: string;
  emotion?: string;
  isAside?: boolean;
  text: string;
  createdAt: number;
};

export type MeetingEventType =
  | 'first_meeting'
  | 'date'
  | 'handoff'
  | 'comfort'
  | 'confession_tension'
  | 'fight_reconcile'
  | 'accidental_meet'
  | 'late_night'
  | 'short_walk'
  | 'group_meet';

export type MeetingScenarioPhase = 'intro' | 'warmup' | 'tension' | 'turning' | 'climax' | 'afterglow' | 'ending';

export type MeetingChoiceStyle = 'gentle' | 'playful' | 'direct' | 'comfort' | 'silent' | 'teasing' | 'apology' | 'bold' | 'exit';

export type MeetingStats = {
  affection: number;
  trust: number;
  tension: number;
  awkwardness: number;
  intimacy: number;
};

export type MeetingChoice = {
  id: string;
  text: string;
  style: MeetingChoiceStyle;
  effects: Partial<MeetingStats>;
  targetCharacterId?: string;
  hiddenReactionHint?: string;
};

export type MeetingResultCard = {
  title: string;
  location: string;
  mood: string;
  keyMoment: string;
  characterImpression: string;
  relationshipChanges: Partial<MeetingStats>;
  futureHooks: string[];
  afterMessage?: string;
};

export type MeetingEventSession = {
  id: string;
  roomId: string;
  roomType?: 'dm' | 'group';
  mode?: 'dm' | 'group';
  characterId?: string;
  primaryCharacterId?: string;
  participantCharacterIds?: string[];
  presentCharacterIds?: string[];
  absentCharacterIds?: string[];
  startedAt: number;
  endedAt?: number;
  status: 'pending' | 'active' | 'dismissed' | 'ended';
  eventType?: MeetingEventType;
  phase?: MeetingScenarioPhase;
  phasePlan?: MeetingScenarioPhase[];
  phaseTurn?: number;
  totalUserTurns?: number;
  minTurns?: number;
  eventGoal?: string;
  eventConflict?: string;
  climaxQuestion?: string;
  expectedEndingTone?: string;
  hasClimaxChoiceResolved?: boolean;
  stats?: MeetingStats;
  resultCard?: MeetingResultCard;
  postMeetingMessageScheduled?: boolean;
  location?: string;
  reason?: string;
  mood?: string;
  seedSummary?: string;
  stillPrompt?: string;
  stillImage?: string;
  stillImageMode?: 'single_reference' | 'multi_character_scene' | 'atmosphere_only';
  turnCount: number;
  maxTurns: number;
  lines: MeetingEventLine[];
  speakerQueue?: string[];
  lastSpeakerCharacterId?: string;
  groupMood?: string;
  summary?: string;
  perCharacterSummaries?: Record<string, string>;
  relationshipDeltas?: Record<string, { affinity?: number; trust?: number; tension?: number }>;
};

export type BlindDateMode = 'encounter' | 'profile' | 'question' | 'worldcup' | 'rotation';

export type BlindDateStatus = 'setup' | 'generating' | 'active' | 'revealing' | 'dating' | 'completed';

export type CandidateAppearance = {
  ethnicityDetail: string;
  faceShape: string;
  eyes: string;
  eyelids: string;
  eyebrows: string;
  nose: string;
  lips: string;
  cheeks: string;
  jawline: string;
  chin: string;
  skinTone: string;
  distinctiveMarks?: string[];
  hairStyle: string;
  hairColor: string;
  heightCm: number;
  bodyType: 'slender' | 'slim_glamorous' | 'petite_slim' | 'tall_slender' | 'soft_slim' | 'athletic_slim';
  makeupStyle: string;
  outfitStyle: string;
};

export type BlindDateAnswer = {
  id: string;
  candidateId: string;
  anonymousLabel?: string;
  text: string;
  toneTags: string[];
  scoreDelta?: number;
};

export type BlindDateCandidate = {
  id: string;
  anonymousLabel?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  name: string;
  age: number;
  nationality: 'Korean' | 'Japanese' | 'Chinese';
  koreanFluency: 'native' | 'fluent';
  job: string;
  locationBase: string;
  personalitySummary: string;
  speechStyle: string;
  relationshipStyle: string;
  likes: string[];
  dislikes: string[];
  hobbies: string[];
  firstDm: string;
  contactPresetId: string;
  snsStyle: string;
  snsPreview?: string;
  callPreview?: string;
  personalityPresetId?: string;
  personalityPresetLabel?: string;
  personalityCategory?: string;
  personalityIntensity?: string;
  personalityAxes?: string;
  redFlagLevel?: 0 | 1 | 2 | 3;
  appearance: CandidateAppearance;
  imagePrompt: string;
  internalAppearancePrompt?: string;
  internalImagePrompt?: string;
  hiddenProfile?: string;
  publicObservation?: string;
  publicVibe?: string;
  profileImageUri?: string;
  faceReferenceImage?: string;
  answers: BlindDateAnswer[];
  score: number;
  selectedCount: number;
  createdAt: number;
};

export type BlindDateRound = {
  id: string;
  roundIndex: number;
  question: string;
  answers: BlindDateAnswer[];
  selectedAnswerId?: string;
  createdAt: number;
};

export type BlindDateRanking = {
  candidateId: string;
  rank: number;
  score: number;
  selectedCount: number;
  reason: string;
};

export type BlindDateWorldcupPair = {
  id: string;
  roundLabel: string;
  criterion: string;
  leftCandidateId: string;
  rightCandidateId: string;
  selectedCandidateId?: string;
};

export type BlindDateRotationTurn = {
  id: string;
  candidateId: string;
  userText: string;
  answerText: string;
  createdAt: number;
};

export type StreetEncounterStats = {
  affinity: number;
  caution: number;
  awkwardness: number;
  curiosity: number;
  mood: number;
  timePressure: number;
};

export type StreetEncounterChoice = {
  id: string;
  text: string;
  style: 'safe' | 'playful' | 'direct' | 'caring' | 'exit';
  affinityDelta: number;
  cautionDelta: number;
  awkwardnessDelta: number;
  curiosityDelta: number;
  moodDelta?: number;
};

export type StreetEncounterPhase = 'locations' | 'intro' | 'talk' | 'success' | 'failed' | 'passed';

export type BlindDateMemory = {
  mode: BlindDateMode;
  selectedAt: number;
  selectedReason: string;
  winningAnswers: string[];
  userPreferenceTags: string[];
  compatibilityScore: number;
  firstDateSummary?: string;
};

export type BlindDateCandidateArchive = {
  id: string;
  candidate: BlindDateCandidate;
  sessionId: string;
  archivedAt: number;
  canImport: boolean;
};

export type BlindDateSession = {
  id: string;
  mode: BlindDateMode;
  status: BlindDateStatus;
  candidateCount: number;
  questionTarget?: number;
  candidates: BlindDateCandidate[];
  rounds: BlindDateRound[];
  worldcupPairs?: BlindDateWorldcupPair[];
  worldcupIndex?: number;
  worldcupByeCandidateIds?: string[];
  rotationTurns?: BlindDateRotationTurn[];
  encounterLocations?: string[];
  encounterLocation?: string;
  encounterPhase?: StreetEncounterPhase;
  encounterNarration?: string;
  encounterNpcLine?: string;
  encounterTurn?: number;
  encounterMaxTurns?: number;
  encounterContactAttempted?: boolean;
  encounterContactChanceLabel?: string;
  encounterContactFailureReason?: string;
  encounterStats?: StreetEncounterStats;
  encounterChoices?: StreetEncounterChoice[];
  encounterHistory?: string[];
  encounterResult?: 'passed' | 'rejected' | 'contact_exchanged';
  selectedCandidateId?: string;
  finalRanking?: BlindDateRanking[];
  createdAt: number;
  completedAt?: number;
};

export type BlindDateProgress = {
  sessions: BlindDateSession[];
  activeSessionId?: string;
  archives?: BlindDateCandidateArchive[];
  encounterLocationUsage?: Record<string, string>;
  encounterDailyLocations?: {
    dayKey: string;
    locations: string[];
  };
};

export type DatingAppRequestStatus = 'none' | 'pending' | 'accepted' | 'rejected';
export type DatingAppDecision = 'liked' | 'passed';

export type DatingAppPhoto = {
  id: string;
  uri?: string;
  prompt: string;
  label: string;
  createdAt: number;
  error?: string;
};

export type DatingAppProfileQuestionCard = {
  question: string;
  lockedText: string;
};

export type DatingAppProfile = {
  id: string;
  name: string;
  age: number;
  job: string;
  location: string;
  distanceKm: number;
  heightCm: number;
  bodyLabel: string;
  alcohol: string;
  smoking: string;
  religion: string;
  education?: string;
  mbti?: string;
  verified: boolean;
  lastActiveLabel: string;
  bio: string;
  traits: string[];
  interests: string[];
  datingStyle: string[];
  lifestyle: string[];
  profileQuestionCards: DatingAppProfileQuestionCard[];
  personalitySummary: string;
  speechStyle: string;
  relationshipStyle: string;
  likes: string[];
  dislikes: string[];
  hobbies: string[];
  snsStyle: string;
  firstMessage: string;
  callPreview: string;
  personalityPresetId?: string;
  personalityPresetLabel?: string;
  personalityCategory?: string;
  personalityIntensity?: string;
  personalityAxes?: string;
  redFlagLevel?: 0 | 1 | 2 | 3;
  identityPrompt: string;
  imagePrompts: string[];
  photos: DatingAppPhoto[];
  createdAt: number;
  expiresAt: number;
};

export type DatingAppHistoryEntry = {
  id: string;
  savedAt: number;
  completedAt?: number;
  finalProfileId: string;
  finalProfile: DatingAppProfile;
  decisions: Array<{
    profileId: string;
    name: string;
    age: number;
    decision: DatingAppDecision;
    decidedAt: number;
  }>;
  requestStatus?: DatingAppRequestStatus;
  requestedAt?: number;
  resolvedAt?: number;
  rejectedReason?: string;
  acceptedRoomId?: string;
  acceptedCharacterId?: string;
};

export type DatingAppProgress = {
  currentProfile?: DatingAppProfile;
  profiles?: DatingAppProfile[];
  activeProfileIndex?: number;
  decisions?: Array<{
    profileId: string;
    decision: DatingAppDecision;
    decidedAt: number;
  }>;
  finalProfileId?: string;
  selectedReferencePhotoIds?: string[];
  completedAt?: number;
  lastGeneratedAt?: number;
  refreshIntervalHours?: number;
  acceptanceChancePercent?: number;
  requestStatus?: DatingAppRequestStatus;
  requestedAt?: number;
  resolveAt?: number;
  resolvedAt?: number;
  rejectedReason?: string;
  acceptedRoomId?: string;
  acceptedCharacterId?: string;
  history?: DatingAppHistoryEntry[];
};

export type Sticker = {
  id: string;
  name: string;
  description?: string;
  data?: string;
  mediaData?: string;
  type?: string;
};

export type ReferenceFaceSlot = {
  id: string;
  image: string;
  name?: string;
  createdAt: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type?: string;
  prompt?: string;
  triggered?: Record<string, string>;
  lastTriggeredAt?: number;
};

export type LoreEntry = {
  id: string;
  title: string;
  keys: string[];
  secondKeys?: string[];
  content: string;
  enabled?: boolean;
  alwaysActive?: boolean;
  regex?: boolean;
  selective?: boolean;
  insertOrder?: number;
  priority?: number;
  folderId?: string;
  dailyMemory?: boolean;
  dateKey?: string;
  characterId?: string;
  roomId?: string;
};

export type SNSPost = {
  id: string;
  characterId: string;
  platform: 'instagram' | 'twitter';
  title?: string;
  displayName?: string;
  handle?: string;
  content: string;
  hashtags?: string[];
  image?: string;
  imagePrompt?: string;
  imageCaption?: string;
  createdAt: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  bookmarks?: number;
  views?: number;
  comments?: { id: string; author: string; handle?: string; content: string; createdAt: number; likes?: number; ai?: boolean }[];
  dms?: { id?: string; title: string; participants?: SNSDmParticipant[]; messages: { id?: string; from: string; fromName?: string; body: string; createdAt?: number }[] }[];
  generationFailed?: boolean;
  generationError?: string;
  generationRoomId?: string;
  imageGenerationFailed?: boolean;
};

export type SNSDmParticipant = {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
  role: 'user' | 'character' | 'thirdParty';
};

export type SNSDmMessage = {
  id: string;
  from: string;
  fromName?: string;
  author?: string;
  body: string;
  createdAt: number;
};

export type SNSDmThread = {
  id: string;
  postId?: string;
  platformIndex?: number;
  characterId: string;
  kind?: 'user' | 'thirdParty';
  title: string;
  context?: string;
  participants?: SNSDmParticipant[];
  messages: SNSDmMessage[];
  createdAt: number;
  updatedAt?: number;
  unread?: number;
};

export type GroupRoom = {
  id: string;
  name: string;
  participantIds: string[];
  createdAt: number;
  lastActivity?: number;
  relationshipNote?: string;
  disabled?: boolean;
  disabledAt?: number;
};

export type NotificationItem = {
  id: string;
  type: 'chat' | 'sns' | 'system' | 'randomchat' | 'sumgod' | 'snsdm';
  title: string;
  body?: string;
  roomId?: string;
  characterId?: string;
  app?: 'messenger' | 'randomchat' | 'social' | 'snsdm' | 'sumgod' | 'system';
  target?: { app?: string; roomId?: string; characterId?: string; postId?: string; threadId?: string };
  collapseKey?: string;
  count?: number;
  createdAt: number;
  read?: boolean;
};

export type SumGodConversationItem = {
  role: 'user' | 'character';
  text: string;
  createdAt: number;
  kind?: 'reveal-comment' | 'talk';
};

export type SumGodEntry = {
  id: string;
  number: number;
  question: string;
  unlockedOn: string;
  createdAt: number;
  userAnswer: string;
  characterAnswer: string;
  completedOn?: string;
  completedAt?: number;
  conversation: SumGodConversationItem[];
  generatingAnswer?: boolean;
  generatingTalk?: boolean;
  generatingTalkIndex?: number;
  userAnswerEditedAt?: number;
  editingUserAnswer?: boolean;
  archiveEditing?: boolean;
  textEditedAt?: number;
  debugUnlocked?: boolean;
  cheatUnlocked?: boolean;
};

export type SumGodArchivedProgress = {
  id: string;
  characterId: string;
  characterName?: string;
  archivedAt: number;
  entries: SumGodEntry[];
};

export type SumGodProgress = {
  characterId: string;
  view: 'today' | 'archive';
  questionOpen: boolean;
  entries: SumGodEntry[];
  characterArchives?: SumGodArchivedProgress[];
  backedUpAt?: number;
};

export type SNSGodState = {
  schemaVersion?: number;
  config: SNSGodConfig;
  characters: SNSGodCharacter[];
  chatRooms: Record<string, SNSGodRoom[]>;
  messages: Record<string, SNSGodMessage[]>;
  unreadCounts: Record<string, number>;
  snsPosts: SNSPost[];
  snsDmThreads: SNSDmThread[];
  groupRooms?: GroupRoom[];
  roomSummaries?: RoomSummary[];
  groupRoomSummaries?: GroupRoomSummary[];
  characterMemories?: CharacterMemory[];
  loreEntries?: LoreEntry[];
  loreFolders?: unknown[];
  referenceFaceSlots?: ReferenceFaceSlot[];
  userStickers?: Sticker[];
  notifications?: NotificationItem[];
  randomChats?: RandomChatRoom[];
  randomCharacters?: SNSGodCharacter[];
  pendingReplies?: Record<string, { jobId: string; startedAt: number; phase?: 'delay' | 'typing' | 'generating' }>;
  meetingEventSessions?: MeetingEventSession[];
  activeMeetingEventId?: string;
  blindDate?: BlindDateProgress;
  datingApp?: DatingAppProgress;
  sumGod?: SumGodProgress;
  selectedRoomId?: string;
  __importedAt?: number;
  __savedAt?: number;
  __revision?: number;
  __writeSeq?: number;
  __contentHash?: string;
  __messageCount?: number;
  __characterCount?: number;
  __referenceImageCount?: number;
  __mediaCount?: number;
  __lastMessageAt?: number;
  [key: string]: unknown;
};
