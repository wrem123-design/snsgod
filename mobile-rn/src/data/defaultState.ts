import { SNSGodState } from '../types';
import { DEFAULT_PROMPTS } from '../logic/prompts';
import { STATE_SCHEMA_VERSION } from '../logic/limits';

export function createDefaultState(): SNSGodState {
  const now = Date.now();
  const roomId = `mika_${now.toString(36)}`;
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    config: {
      apiType: 'vertex',
      apiProfiles: {
        vertex: {
          serviceAccountJson: '',
          location: 'global',
          serviceTier: 'auto',
          tokenBridgeUrl: '',
          corsProxyUrl: '',
          proxyAccessToken: '',
          directMode: false,
          fetchModels: false,
          apiEndpoint: '',
          apiModel: 'gemini-3-flash-preview',
          thinkingLevel: 'off',
          thinkingBudgetTokens: 0,
          maxTokens: 4096,
          temperature: 0.85
        },
        gemini: {
          apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
          apiModel: 'gemini-2.5-pro',
          maxTokens: 700,
          temperature: 0.85
        }
      },
      userName: '나',
      userDescription: '',
      roomName: '채팅',
      language: 'Korean',
      snsTheme: 'kakao',
      prompts: DEFAULT_PROMPTS,
      autoEnabled: true,
      snsAutoChance: 40,
      snsStartCount: 6,
      privateFirst: false,
      groupFirst: false,
      randomDmEnabled: true,
      snsAutoPostEnabled: true,
      characterPhoneCallEnabled: true,
      characterPhoneCallRarityLevel: 0,
      characterPhoneCallChancePercent: 33,
      characterPhoneCallMinCooldownMinutes: 360,
      characterPhoneCallGlobalCooldownMinutes: 180,
      characterPhoneCallMinCooldownHours: 6,
      characterPhoneCallGlobalCooldownHours: 3
      ,
      imageGeneration: {
        enabled: false,
        provider: 'grok-local',
        apiKey: '',
        apiEndpoint: 'https://api.openai.com/v1/responses',
        apiModel: 'gpt-5',
        grokBaseUrl: 'http://127.0.0.1:5000',
        grokCloudBaseUrl: 'http://168.110.122.66',
        grokResolution: '1k',
        grokAspectRatio: 'auto',
        size: '1024x1024',
        quality: 'auto',
        promptPrefix: 'Create a realistic in-character phone photo. Natural lighting, casual composition, no text overlay, no watermark.',
        negativePrompt: 'lowres, worst quality, watermark, text, logo, bad anatomy',
        nsfw: false,
        illustrationMode: false
      },
      sns: {
        platform: 'instagram',
        anonymous: false,
        nsfw: false,
        textOnly: false,
        noDM: false,
        thirdPartyDM: false,
        includeUserInDM: true,
        autoComments: true,
        commentQty: '2-4',
        subject: '',
        mood: '',
        autoImage: true,
        platformOptions: {
          instagram: {
            anonymous: false,
            nsfw: false,
            textOnly: false,
            noDM: false,
            thirdPartyDM: false,
            autoComments: true,
            commentQty: '2-4',
            subject: '',
            mood: '',
            autoImage: true
          },
          twitter: {
            anonymous: false,
            nsfw: false,
            textOnly: false,
            noDM: false,
            thirdPartyDM: false,
            autoComments: true,
            commentQty: '2-4',
            subject: '',
            mood: '',
            autoImage: true
          }
        }
      }
    },
    characters: [
      {
        id: 'mika',
        name: '미카',
        handle: 'mika',
        avatarText: '미',
        color: '#8bd3dd',
        prompt: '밝고 장난기 있지만 은근히 외로움을 타는 친구.',
        firstMessage: '오늘도 접속했네. 무슨 얘기부터 할까?',
        enabled: true,
        proactiveEnabled: true,
        messageStyle: 'balanced',
        responseDelayMin: 1,
        responseDelayMax: 8,
        messageGapMin: 1,
        messageGapMax: 3,
        responseTime: 6,
        thinkingTime: 6,
        reactivity: 8,
        tone: 8,
        frequencyMinutes: 10,
        initiative: 40,
        statusMessage: '접속 중',
        memories: [],
        stickers: []
      }
    ],
    chatRooms: {
      mika: [{ id: roomId, characterId: 'mika', name: '기본 채팅', createdAt: now, lastActivity: now }]
    },
    messages: {
      [roomId]: [{ id: `msg_${now.toString(36)}`, role: 'character', characterId: 'mika', content: '오늘도 접속했네. 무슨 얘기부터 할까?', createdAt: now }]
    },
    unreadCounts: {},
    snsPosts: [],
    snsDmThreads: [],
    groupRooms: [],
    randomChats: [],
    loreEntries: [],
    loreFolders: [],
    userStickers: [],
    notifications: [],
    selectedRoomId: roomId
  };
}
