import { callLLMText, generateImageDataUri, imagePromptWithoutCharacterName, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { characterReferenceImageForPrompt } from './imageReference';
import { makeId } from './ids';
import { MAX_SNS_CONTEXT_MESSAGES, MAX_SNS_DM_CONTEXT_MESSAGES } from './limits';
import { lorePromptBlock, resolveActiveLore } from './loreEngine';
import { pushNotification } from './notifications';
import { DEFAULT_PROMPTS } from './prompts';
import { SNSDmThread, SNSGodCharacter, SNSGodState, SNSPost } from '../types';

type GeneratedPlatform = {
  platform?: string;
  displayName?: string;
  handle?: string;
  text?: string;
  content?: string;
  post?: string;
  tweet?: string;
  caption?: string;
  body?: string;
  hashtags?: string[];
  stats?: { views?: number; likes?: number; replies?: number; reposts?: number; bookmarks?: number };
  comments?: { name?: string; author?: string; handle?: string; body?: string; content?: string; likes?: number }[];
  replies?: { name?: string; author?: string; handle?: string; body?: string; content?: string; likes?: number }[];
  imagePrompt?: string;
  imageCaption?: string;
};

type GeneratedSns = {
  platforms?: GeneratedPlatform[];
  messages?: { content?: string; body?: string; text?: string; caption?: string }[];
  replies?: { content?: string; body?: string; text?: string; caption?: string }[];
  posts?: { content?: string; body?: string; text?: string; caption?: string }[];
  text?: string;
  tweet?: string;
  caption?: string;
  body?: string;
  content?: string;
  post?: string;
  message?: string;
  hashtags?: string[];
  comments?: GeneratedPlatform['comments'];
  stats?: GeneratedPlatform['stats'];
  imagePrompt?: string;
  imageCaption?: string;
  dms?: {
    title?: string;
    participants?: { id?: string; name?: string; handle?: string; avatar?: string; role?: 'user' | 'character' | 'thirdParty' }[];
    messages?: { from?: string; fromName?: string; body?: string; content?: string }[];
  }[];
};

const autoPostingRooms = new Set<string>();
const snsDmGeneratingThreads = new Set<string>();
const MAX_SNS_POSTS = 120;

async function logAutoSns(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  await appendDebugLog('sns.auto', message, level);
}

function commentCountHint(value: string | undefined): number {
  const match = String(value || '').match(/(\d+)(?:\D+(\d+))?/);
  if (!match) return 3;
  const min = Number(match[1]) || 2;
  const max = Number(match[2] || match[1]) || min;
  return Math.max(0, Math.min(8, Math.round(min + Math.random() * Math.max(0, max - min))));
}

export function snsOptionsFor(state: SNSGodState, platform: SNSPost['platform'], character?: SNSGodCharacter) {
  const characterOptions = character?.snsOptions?.[platform] || {};
  return {
    anonymous: false,
    nsfw: false,
    textOnly: false,
    noDM: false,
    thirdPartyDM: false,
    enabled: true,
    autoComments: true,
    commentQty: '2-4',
    subject: '',
    mood: '',
    autoImage: true,
    ...characterOptions,
    platform
  };
}

function cleanSnsText(value: unknown): string {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\\n/g, '\n')
    .replace(/["']?\s*(reactionDelay|messages|platforms|content|body|text|caption|tweet|post|imagePrompt|imageCaption)\s*["']?\s*[:;]?\s*/gi, '')
    .replace(/\bPHONE_CALL\b|phone_call|call invite|missed call|call log/gi, '')
    .replace(/^[{}\[\],:"'\s]+/, '')
    .replace(/[{}\[\]]+$/g, '')
    .trim();
}

function textFromMessageArray(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map(item => {
      const record = (item || {}) as { content?: unknown; body?: unknown; text?: unknown; caption?: unknown };
      return cleanSnsText(record.content || record.body || record.text || record.caption || '');
    })
    .filter(Boolean)
    .join('\n');
}

function fallbackSnsText(character: SNSGodCharacter, platform: SNSPost['platform']): string {
  return platform === 'instagram'
    ? `${character.name}의 오늘을 조용히 남겨둔다.`
    : `${character.name}의 짧은 근황.`;
}

function fallbackSnsImagePrompt(character: SNSGodCharacter, text: string): string {
  return `Natural phone photo matching this social post mood: ${cleanSnsText(text).slice(0, 160) || 'quiet daily moment'}, no text overlay, no watermark`;
}

function ensureNsfwTag(prompt: string): string {
  return /\bnsfw\b|adult/i.test(prompt) ? prompt : `adult private account mood, ${prompt}`;
}

function platformMatches(value: string | undefined, requested: SNSPost['platform']) {
  const normalized = String(value || requested).toLowerCase();
  return requested === 'twitter' ? normalized.includes('twitter') || normalized.includes('x') : normalized.includes('instagram') || normalized.includes('ig');
}

function extractLooseHashtags(raw: string, text: string): string[] {
  const tags = Array.from(`${raw}\n${text}`.matchAll(/#([\p{L}\p{N}_]+)/gu)).map(item => item[1]);
  return Array.from(new Set(tags)).slice(0, 8);
}

function parsePostText(raw: string, platform: SNSPost['platform'], character: SNSGodCharacter): GeneratedSns {
  const parsed = parseJsonObject<GeneratedSns>(raw);
  if (parsed) {
    if (Array.isArray(parsed.platforms) && parsed.platforms.length) return parsed;
    const text = cleanSnsText(
      parsed.text || parsed.post || parsed.tweet || parsed.caption || parsed.body || parsed.content || parsed.message
      || textFromMessageArray(parsed.messages || parsed.replies || parsed.posts)
    );
    return {
      platforms: [{
        platform,
        text: text || fallbackSnsText(character, platform),
        hashtags: parsed.hashtags || extractLooseHashtags(raw, text),
        comments: parsed.comments,
        stats: parsed.stats,
        imagePrompt: parsed.imagePrompt,
        imageCaption: parsed.imageCaption || parsed.caption
      }],
      dms: parsed.dms || []
    };
  }
  const text = cleanSnsText(raw.replace(/#[\p{L}\p{N}_]+/gu, ''));
  return {
    platforms: [{
      platform,
      text: text || fallbackSnsText(character, platform),
      hashtags: extractLooseHashtags(raw, text)
    }],
    dms: []
  };
}

function normalizeGeneratedPlatforms(generated: GeneratedSns, platform: SNSPost['platform'], character: SNSGodCharacter): GeneratedPlatform[] {
  const source = Array.isArray(generated.platforms) && generated.platforms.length
    ? generated.platforms
    : [{ platform, text: generated.text || generated.post || generated.content || generated.message || fallbackSnsText(character, platform) }];
  const matched = source.filter(item => platformMatches(item.platform, platform));
  const picked = matched.length ? matched : [source[0]];
  return picked.slice(0, 1).map(item => ({
    ...item,
    platform,
    text: cleanSnsText(item.text || item.content || item.post || item.tweet || item.caption || item.body) || fallbackSnsText(character, platform),
    hashtags: Array.isArray(item.hashtags) ? item.hashtags : extractLooseHashtags(String(item.text || ''), String(item.text || '')),
    comments: item.comments || item.replies || []
  }));
}

function normalizeComments(item: GeneratedPlatform, count: number, character: SNSGodCharacter) {
  const comments = (item.comments || []).map(comment => ({
    id: makeId('comment'),
    author: String(comment.name || comment.author || 'Follower'),
    handle: comment.handle ? String(comment.handle).replace(/^@/, '') : undefined,
    content: cleanSnsText(comment.body || comment.content || ''),
    likes: Number(comment.likes || Math.floor(Math.random() * 20)),
    createdAt: Date.now(),
    ai: true
  })).filter(comment => comment.content);
  while (comments.length < count) {
    comments.push({
      id: makeId('comment'),
      author: `${character.name} fan`,
      handle: undefined,
      content: count > 1 ? '분위기 좋다.' : '좋다.',
      likes: Math.floor(Math.random() * 12),
      createdAt: Date.now(),
      ai: true
    });
  }
  return comments.slice(0, count);
}

function toPost(item: GeneratedPlatform, character: SNSGodCharacter, platform: SNSPost['platform'], commentCount: number): SNSPost {
  const stats = item.stats || {};
  const comments = commentCount > 0 ? normalizeComments(item, commentCount, character) : [];
  return {
    id: makeId('sns'),
    characterId: character.id,
    platform,
    displayName: item.displayName || character.name,
    handle: String(item.handle || character.handle || character.id).replace(/^@/, ''),
    content: cleanSnsText(item.text || item.content || item.caption || item.body) || fallbackSnsText(character, platform),
    hashtags: Array.isArray(item.hashtags) ? item.hashtags.map(tag => String(tag).replace(/^#/, '')).filter(Boolean).slice(0, 8) : [],
    createdAt: Date.now(),
    likes: Number(stats.likes || Math.floor(12 + Math.random() * 90)),
    replies: Number(stats.replies || comments.length),
    reposts: Number(stats.reposts || 0),
    bookmarks: Number(stats.bookmarks || 0),
    views: Number(stats.views || Math.floor(300 + Math.random() * 9000)),
    comments,
    imagePrompt: item.imagePrompt ? String(item.imagePrompt).trim() : undefined,
    imageCaption: item.imageCaption ? cleanSnsText(item.imageCaption) : undefined
  };
}

function toFailedPost(character: SNSGodCharacter, platform: SNSPost['platform'], error: unknown, roomId?: string): SNSPost {
  return {
    id: makeId('snsfail'),
    characterId: character.id,
    platform,
    displayName: character.name,
    handle: String(character.handle || character.id).replace(/^@/, ''),
    content: '',
    hashtags: [],
    createdAt: Date.now(),
    likes: 0,
    replies: 0,
    reposts: 0,
    bookmarks: 0,
    views: 0,
    comments: [],
    generationFailed: true,
    generationError: error instanceof Error ? error.message : String(error),
    generationRoomId: roomId
  };
}

function toPostDms(generated: GeneratedSns): NonNullable<SNSPost['dms']> {
  return (generated.dms || []).map(thread => ({
    id: makeId('snsdm'),
    title: String(thread.title || '다른 DM'),
    participants: (thread.participants || []).map(participant => ({
      id: String(participant.id || participant.name || makeId('dmuser')),
      name: String(participant.name || participant.id || 'DM 상대'),
      handle: participant.handle ? String(participant.handle).replace(/^@/, '') : undefined,
      avatar: participant.avatar ? String(participant.avatar) : undefined,
      role: (participant.role === 'character' || participant.role === 'user' ? participant.role : 'thirdParty') as 'user' | 'character' | 'thirdParty'
    })).filter(participant => participant.name),
    messages: (thread.messages || []).map(message => ({
      id: makeId('snsdmmsg'),
      from: String(message.from || 'Follower'),
      fromName: message.fromName ? String(message.fromName) : undefined,
      body: cleanSnsText(message.body || message.content || ''),
      createdAt: Date.now()
    })).filter(message => message.body),
  })).filter(thread => thread.messages.length);
}

function ensureThirdPartyDms(
  dms: NonNullable<SNSPost['dms']>,
  post: SNSPost | undefined,
  character: SNSGodCharacter,
  sns: ReturnType<typeof snsOptionsFor>
): NonNullable<SNSPost['dms']> {
  if (!sns.thirdPartyDM || sns.noDM || dms.length || !post) return dms;
  const preview = cleanSnsText(post.content).slice(0, 80);
  return [{
    id: makeId('snsdm'),
    title: `팔로워 ↔ ${character.name}`,
    participants: [
      { id: 'third:follower', name: '팔로워', role: 'thirdParty' },
      { id: `character:${character.id}`, name: character.name, handle: character.handle, avatar: character.profileImage || character.avatar, role: 'character' }
    ],
    messages: [
      {
        id: makeId('snsdmmsg'),
        from: '팔로워',
        body: preview ? `방금 글 봤는데, ${preview}` : '방금 올린 글 봤어. 분위기 좋다.',
        createdAt: Date.now()
      },
      {
        id: makeId('snsdmmsg'),
        from: character.name,
        body: '그냥 오늘 생각난 걸 조금 남겨봤어.',
        createdAt: Date.now()
      }
    ]
  }];
}

function roomTranscriptForSns(state: SNSGodState, character: SNSGodCharacter, roomId?: string): string {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const limit = Number(profile.snsContextMessageLimit || MAX_SNS_CONTEXT_MESSAGES);
  const rooms = roomId ? [{ id: roomId }] : state.chatRooms[character.id] || [];
  return rooms
    .flatMap(room => state.messages[room.id] || [])
    .filter(message => {
      if (!message.content?.trim()) return false;
      const text = message.content.toLowerCase();
      if (message.mediaType === 'phone-call' || message.phoneLog) return false;
      if (text.includes('phone_call') || text.includes('call log') || text.includes('missed call') || text.includes('통화기록') || text.includes('부재중')) return false;
      return message.role === 'user' || message.role === 'character';
    })
    .slice(-limit)
    .map(message => `${message.role === 'user' ? state.config.userName || 'User' : character.name}: ${message.content}`)
    .join('\n');
}

function timeContextForSns(state: SNSGodState) {
  try {
    return new Date().toLocaleString(undefined, { timeZone: String(state.config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || undefined) });
  } catch {
    return new Date().toLocaleString();
  }
}

function phoneSummaryForSns(state: SNSGodState, character: SNSGodCharacter): string {
  const logs = Array.isArray(state.callLogs) ? state.callLogs as Array<Record<string, unknown>> : [];
  return logs
    .filter(log => String(log.characterId || '') === character.id)
    .slice(0, 3)
    .map(log => {
      const lines = Array.isArray(log.lines) ? log.lines as Array<Record<string, unknown>> : [];
      const preview = lines.slice(-4).map(line => `${line.speaker === 'user' ? state.config.userName || 'User' : character.name}: ${line.text || line.body || ''}`).join(' / ');
      return `- ${new Date(Number(log.endedAt || log.startedAt || Date.now())).toLocaleString()}: ${preview}`;
    })
    .filter(Boolean)
    .join('\n');
}

function snsLoreBlock(state: SNSGodState, character: SNSGodCharacter, roomId: string | undefined, transcript: string) {
  const room = roomId
    ? { id: roomId, characterId: character.id, name: 'SNS context' }
    : { id: `sns_${character.id}`, characterId: character.id, name: 'SNS context' };
  const entries = resolveActiveLore(state, { room, characterId: character.id, text: transcript, limit: 8 });
  return lorePromptBlock(entries);
}

function withSnsTokenBudget(state: SNSGodState, platform: SNSPost['platform']): SNSGodState {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const minimum = platform === 'instagram' ? 3600 : 2800;
  return {
    ...state,
    config: {
      ...state.config,
      apiProfiles: {
        ...state.config.apiProfiles,
        [state.config.apiType]: {
          ...profile,
          maxTokens: Math.max(Number(profile.maxTokens || 0), minimum)
        }
      }
    }
  };
}

function postDmsToThreads(post: SNSPost, dms: NonNullable<SNSPost['dms']>, character: SNSGodCharacter): SNSDmThread[] {
  return dms.map((thread, index) => ({
    id: `postdmthread:${post.id}:${thread.id || index}`,
    postId: post.id,
    platformIndex: 0,
    characterId: post.characterId,
    kind: 'thirdParty' as const,
    title: String(thread.title || 'SNS DM'),
    context: `${post.platform === 'instagram' ? 'Instagram' : 'X'} post by ${post.displayName || character.name}: ${post.content}`,
    participants: thread.participants,
    messages: (thread.messages || []).map((message, messageIndex) => ({
      id: String(message.id || `postdmmsg_${messageIndex}`),
      from: message.from,
      fromName: message.fromName,
      body: message.body,
      createdAt: Number(message.createdAt || Date.now())
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    unread: Math.max(1, (thread.messages || []).length)
  })).filter(thread => thread.messages.length);
}

function snsNsfwInstruction(state: SNSGodState): string {
  const prompt = String(state.config.prompts?.snsNsfwBackAccount || DEFAULT_PROMPTS.snsNsfwBackAccount).trim();
  return prompt || DEFAULT_PROMPTS.snsNsfwBackAccount;
}

function snsSubjectInstruction(state: SNSGodState, subject: unknown): string {
  const guide = String(state.config.prompts?.snsSubjectGuide || DEFAULT_PROMPTS.snsSubjectGuide).trim() || DEFAULT_PROMPTS.snsSubjectGuide;
  const value = String(subject || '').trim();
  return value ? `${guide}\nGuide: ${value}` : '';
}

async function applySnsImagePolicy(state: SNSGodState, posts: SNSPost[], character: SNSGodCharacter, options: { image?: string }, sns: ReturnType<typeof snsOptionsFor>, rawText: string) {
  const result: SNSPost[] = [];
  for (const [index, post] of posts.entries()) {
    let next = { ...post };
    if (options.image && index === 0) next.image = options.image;
    if (sns.textOnly || sns.autoImage === false) {
      if (!next.image) next = { ...next, imagePrompt: undefined, imageCaption: undefined };
      result.push(next);
      continue;
    }
    if (!next.imagePrompt) next.imagePrompt = fallbackSnsImagePrompt(character, next.content || rawText);
    if (sns.nsfw && next.imagePrompt) next.imagePrompt = ensureNsfwTag(next.imagePrompt);
    if (next.imagePrompt) next.imagePrompt = imagePromptWithoutCharacterName(next.imagePrompt, character);
    if (!next.image && next.imagePrompt && state.config.imageGeneration?.enabled) {
      try {
        next.image = await generateImageDataUri(state, next.imagePrompt, character, {
          referenceImage: characterReferenceImageForPrompt(character, next.imagePrompt),
          kind: 'general'
        });
      } catch (error) {
        await appendDebugLog('sns.image', `SNS image generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      }
    }
    result.push(next);
  }
  return result;
}

export async function generateSNSPost(state: SNSGodState, character: SNSGodCharacter, platform: SNSPost['platform'], options: { roomId?: string; manual?: boolean; image?: string } = {}): Promise<SNSGodState> {
  const sns = snsOptionsFor(state, platform, character);
  const transcript = roomTranscriptForSns(state, character, options.roomId);
  const phoneSummary = phoneSummaryForSns(state, character);
  const lore = snsLoreBlock(state, character, options.roomId, `${transcript}\n${phoneSummary}`);
  const memories = (character.memories || []).slice(-8).map(item => `- ${item}`).join('\n');
  const targetPlatform = platform === 'instagram' ? 'instagram' : 'twitter/x';
  const dailyMicro = !transcript.trim() && !sns.subject && !options.image;
  const prompt = [
    (state.config.prompts?.snsPosting || DEFAULT_PROMPTS.snsPosting)
      .replaceAll('{character.name}', character.name)
      .replaceAll('{timeContext}', timeContextForSns(state)),
    'Create a Lightboard SNS result with believable platform UI data, audience comments, and optional DM snippets.',
    'This is SNS composition, not a private chat reply. Do not answer the latest DM directly. Write an indirect social update authored by the character.',
    'Make the post feel like an actual private/back-account SNS update: specific, indirect, character-authored, and socially readable.',
    'Do not write a generic fallback diary line. Use clean timeline, phone summary, character profile, mood, image, place/time, relationship beat, or inside joke.',
    'Never include phone-call UI artifacts, JSON keys, call markers, or direct messenger reply wording in the visible SNS text.',
    'Return only JSON: {"platforms":[{"platform":"twitter|instagram","displayName":"","handle":"","text":"","hashtags":[""],"stats":{"views":0,"likes":0,"replies":0,"reposts":0,"bookmarks":0},"comments":[{"name":"","handle":"","body":"","likes":0}],"imagePrompt":"","imageCaption":""}],"dms":[{"title":"A ↔ B","participants":[{"name":"","role":"thirdParty|character"}],"messages":[{"from":"","body":""}]}]}.',
    'For every DM message, from must be one of the participant display names. Do not make every message from the character. Create a plausible back-and-forth conversation.',
    `Target platform: ${targetPlatform}.`,
    `Current time context: ${timeContextForSns(state)}.`,
    dailyMicro ? 'Daily micro mode: no strong recent chat direction exists, so write a short ordinary daily/private account post. Set imagePrompt empty unless the user attached an image.' : '',
    `Comment count per platform: ${sns.commentQty || '2-4'} (${commentCountHint(sns.commentQty)} desired).`,
    sns.autoComments === false ? 'Do not invent audience comments; return comments as an empty array.' : 'Invent fresh believable audience comments for this post only.',
    sns.anonymous ? 'Use a private/anonymous account vibe.' : 'Use the character account openly.',
    sns.nsfw ? snsNsfwInstruction(state) : 'Keep it SFW unless the current conversation explicitly requires otherwise.',
    platform === 'instagram' ? 'Write for an Instagram-style public visual feed. Keep the tone polished and feed-friendly.' : 'Write for a Twitter/X-style timeline. Shorter, sharper, more conversational posts are allowed.',
    sns.textOnly ? 'Do not include imagePrompt.' : 'If an image fits, include imagePrompt as English visual prompt.',
    sns.noDM ? 'Do not create dms.' : 'Create one short SNS DM thread when natural.',
    sns.thirdPartyDM ? 'Third-party commenters may initiate DMs if useful.' : 'DMs should stay centered on the character and user.',
    snsSubjectInstruction(state, sns.subject),
    sns.mood ? `Mood: ${sns.mood}` : '',
    `Character profile: ${character.prompt || '(empty)'}`,
    `User profile: ${state.config.userDescription || '(empty)'}`,
    memories ? `Character memories:\n${memories}` : '',
    lore ? `Relevant lorebook:\n${lore}` : '',
    phoneSummary ? `Recent phone-call summary:\n${phoneSummary}` : '',
    `Clean recent private chat context:\n${transcript || '(empty)'}`,
    `Previous posts:\n${(state.snsPosts || []).filter(post => post.characterId === character.id).slice(0, 5).map(post => `- ${post.platform}: ${post.content}`).join('\n') || '(none)'}`,
    'Create the SNS JSON now.'
  ].filter(Boolean).join('\n\n');
  try {
  const snsState = withSnsTokenBudget(state, platform);
  const { text, keyIndex } = await callLLMText(snsState, [{ role: 'system', content: prompt }]);
  const parsed = parsePostText(text, platform, character);
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const commentCount = sns.autoComments === false ? 0 : commentCountHint(sns.commentQty);
  const posts = normalizeGeneratedPlatforms(parsed, platform, character).map(item => toPost(item, character, platform, commentCount));
  const postsWithImages = await applySnsImagePolicy(state, posts, character, options, dailyMicro ? { ...sns, autoImage: false } : sns, text);
  const postDms = sns.noDM ? [] : ensureThirdPartyDms(toPostDms(parsed), postsWithImages[0], character, sns);
  const createdDmThreads = postDms.length && postsWithImages[0] ? postDmsToThreads(postsWithImages[0], postDms, character) : [];
  if (postDms.length && postsWithImages[0]) postsWithImages[0] = { ...postsWithImages[0], dms: postDms };
  const nextState: SNSGodState = {
    ...state,
    config: {
      ...state.config,
      apiProfiles: {
        ...state.config.apiProfiles,
        [state.config.apiType]: { ...profile, apiKeyIndex: keyIndex }
      }
    },
    snsPosts: [...postsWithImages, ...(state.snsPosts || [])].slice(0, MAX_SNS_POSTS),
    snsDmThreads: [...createdDmThreads, ...(state.snsDmThreads || [])].slice(0, 120),
    characters: state.characters.map(item => item.id === character.id && options.roomId ? {
      ...item,
      lastSnsMessageCount: (state.messages[options.roomId] || []).length
    } : item)
  };
  return pushNotification(nextState, {
    type: 'sns',
    title: `${character.name} SNS 게시`,
    body: postsWithImages[0]?.content || '새 SNS 게시물',
    app: 'social',
    characterId: character.id,
    target: { app: 'social', characterId: character.id, postId: postsWithImages[0]?.id },
    collapseKey: `sns:${character.id}`
  });
  } catch (error) {
    await appendDebugLog('sns.generate', `SNS post generation failed character=${character.id} platform=${platform}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    const failedPost = toFailedPost(character, platform, error, options.roomId);
    return {
      ...state,
      snsPosts: [failedPost, ...(state.snsPosts || [])].slice(0, MAX_SNS_POSTS)
    };
  }
}

export async function maybeCreateAutoSNSPost(state: SNSGodState, character: SNSGodCharacter, roomId: string): Promise<SNSGodState> {
  const config = state.config;
  if (config.autoEnabled === false) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: global automation disabled`);
    return state;
  }
  if (config.snsAutoPostEnabled === false) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: SNS auto post disabled`);
    return state;
  }
  if (character.enabled === false) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: character disabled`);
    return state;
  }
  if (character.snsAutoEnabled === false) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: character SNS auto disabled`);
    return state;
  }
  if (character.randomTemporary === true) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: temporary random character`);
    return state;
  }
  if (autoPostingRooms.has(roomId)) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: SNS auto post already running`);
    return state;
  }
  const messages = state.messages[roomId] || [];
  if (!messages.length) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: no messages`);
    return state;
  }
  const latest = [...messages].reverse().find(message => message.role === 'user' || message.role === 'character');
  if (latest?.role !== 'character') {
    await logAutoSns(`skip room=${roomId} character=${character.id}: latest message is not character`);
    return state;
  }
  const minMessages = Math.max(2, Number(config.snsStartCount ?? config.autoSnsMinMessages ?? 6));
  const cooldown = Math.max(1, Number(config.autoSnsCooldownMessages ?? 4));
  const lastCount = Number(character.lastSnsMessageCount || 0);
  if (messages.length < minMessages) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: message count ${messages.length}/${minMessages}`);
    return state;
  }
  if (messages.length - lastCount < cooldown) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: cooldown ${messages.length - lastCount}/${cooldown}`);
    return state;
  }
  const chance = Math.max(0, Math.min(100, Number(config.snsAutoChance ?? config.autoSnsChance ?? 40)));
  const roll = Math.random() * 100;
  if (roll >= chance) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: chance missed ${roll.toFixed(1)}/${chance}`);
    return state;
  }
  const platform = Math.random() > 0.5 ? 'instagram' : 'twitter';
  if (snsOptionsFor(state, platform, character).enabled === false) {
    await logAutoSns(`skip room=${roomId} character=${character.id}: ${platform} disabled`);
    return state;
  }
  autoPostingRooms.add(roomId);
  try {
    await logAutoSns(`start room=${roomId} character=${character.id} platform=${platform}`);
    const next = await generateSNSPost(state, character, platform, { roomId, manual: false });
    const created = Math.max(0, (next.snsPosts || []).length - (state.snsPosts || []).length);
    await logAutoSns(`done room=${roomId} character=${character.id} platform=${platform} posts=${created}`);
    return next;
  } catch (error) {
    await logAutoSns(`failed room=${roomId} character=${character.id} platform=${platform}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    throw error;
  } finally {
    autoPostingRooms.delete(roomId);
  }
}

export async function generateSnsDmReply(state: SNSGodState, threadId: string, userText: string): Promise<SNSGodState> {
  if (snsDmGeneratingThreads.has(threadId)) return state;
  snsDmGeneratingThreads.add(threadId);
  try {
  const thread = (state.snsDmThreads || []).find(item => item.id === threadId);
  if (!thread) throw new Error('SNS DM thread not found.');
  const character = state.characters.find(item => item.id === thread.characterId);
  if (!character) throw new Error('SNS DM character not found.');
  const transcript = thread.messages.slice(-MAX_SNS_DM_CONTEXT_MESSAGES).map(message => `${message.from === 'user' ? state.config.userName : message.author || character?.name || 'Character'}: ${message.body}`).join('\n');
  const room = { id: `snsdm_${thread.id}`, characterId: character.id, name: 'SNS DM' };
  const lore = lorePromptBlock(resolveActiveLore(state, { room, characterId: character.id, text: `${thread.context || ''}\n${transcript}\n${userText}`, limit: 8 }));
  const prompt = [
    `Act as ${character.name} in a private SNS DM thread that is separate from the normal chat room.`,
    'This is not a public SNS post, normal messenger chat, phone call, or comment reply.',
    'Return JSON only: {"messages":[{"content":"visible DM text"}]}.',
    'Do not include JSON keys, braces, labels, analysis headings, phone-call markers, image prompts, stickers, or SNS captions in visible DM text.',
    `Output language: ${state.config.language || 'Korean'}.`,
    `Character profile: ${character.prompt || '(empty)'}`,
    `User profile: ${state.config.userDescription || '(empty)'}`,
    lore ? `Relevant lorebook:\n${lore}` : '',
    `SNS DM title: ${thread.title}`,
    `SNS post context:\n${thread.context || '(none)'}`,
    `Recent SNS DM:\n${transcript || '(empty)'}`,
    `Latest user message: ${userText}`
  ].filter(Boolean).join('\n\n');
  const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: prompt }]);
  const parsed = parseJsonObject<{ messages?: { body?: string; content?: string; text?: string }[]; content?: string; body?: string; text?: string }>(text) || { messages: [{ body: text }] };
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const sourceMessages = parsed.messages?.length ? parsed.messages : [{ body: parsed.body || parsed.content || parsed.text || text }];
  const replies = sourceMessages.map(item => ({
    id: makeId('snsdmmsg'),
    from: 'character' as const,
    author: character?.name,
    body: cleanSnsText(item.body || item.content || item.text || ''),
    createdAt: Date.now()
  })).filter(message => message.body);
  return {
    ...state,
    config: { ...state.config, apiProfiles: { ...state.config.apiProfiles, [state.config.apiType]: { ...profile, apiKeyIndex: keyIndex } } },
    snsDmThreads: (state.snsDmThreads || []).map(item => item.id === threadId ? {
      ...item,
      messages: [...item.messages, ...replies],
      updatedAt: Date.now(),
      unread: 0
    } : item)
  };
  } finally {
    snsDmGeneratingThreads.delete(threadId);
  }
}
