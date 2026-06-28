import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { makeId } from './ids';
import { DEFAULT_PROMPTS } from './prompts';
import { SNSDmThread, SNSGodCharacter, SNSGodState, SNSPost } from '../types';

type GeneratedPlatform = {
  platform?: string;
  displayName?: string;
  handle?: string;
  text?: string;
  content?: string;
  hashtags?: string[];
  time?: string;
  stats?: { views?: number; likes?: number; replies?: number; reposts?: number; bookmarks?: number };
  comments?: { name?: string; author?: string; handle?: string; body?: string; content?: string; likes?: number }[];
  imagePrompt?: string;
  imageCaption?: string;
};

type GeneratedSns = {
  platforms?: GeneratedPlatform[];
  dms?: { title?: string; messages?: { from?: string; body?: string; content?: string }[] }[];
  content?: string;
  post?: string;
  message?: string;
  hashtags?: string[];
};

function parsePostText(text: string, platform: SNSPost['platform']): GeneratedSns {
  const parsed = parseJsonObject<GeneratedSns>(text);
  if (parsed) {
    if (Array.isArray(parsed.platforms)) return parsed;
    return { platforms: [{ platform, text: String(parsed.content || parsed.post || parsed.message || '').trim(), hashtags: parsed.hashtags || [] }], dms: parsed.dms || [] };
  }
  const tags = Array.from(text.matchAll(/#([\p{L}\p{N}_]+)/gu)).map(item => item[1]);
  const looksLikeBrokenJson = /^[`'\s]*(json)?\s*[\{\[]/i.test(text.trim()) || /\"platforms\"|```json/i.test(text);
  return { platforms: [{ platform, text: looksLikeBrokenJson ? '오늘은 조용히 지나가고 싶은 날.' : text.replace(/#[\p{L}\p{N}_]+/gu, '').trim() || text.trim(), hashtags: tags }], dms: [] };
}

function platformMatches(value: string | undefined, requested: SNSPost['platform']) {
  const normalized = String(value || requested).toLowerCase();
  return requested === 'twitter' ? normalized.includes('twitter') || normalized.includes('x') : normalized.includes('instagram') || normalized.includes('ig');
}

function commentCountHint(value: string | undefined): number {
  const match = String(value || '').match(/(\d+)(?:\D+(\d+))?/);
  if (!match) return 3;
  const min = Number(match[1]) || 2;
  const max = Number(match[2] || match[1]) || min;
  return Math.max(0, Math.min(8, Math.round(min + Math.random() * Math.max(0, max - min))));
}

function shouldGenerateComments(state: SNSGodState): boolean {
  return state.config.sns?.autoComments !== false && commentCountHint(state.config.sns?.commentQty) > 0;
}

function toPost(item: GeneratedPlatform, character: SNSGodCharacter, platform: SNSPost['platform']): SNSPost {
  const stats = item.stats || {};
  const comments = (item.comments || []).map(comment => ({
    id: makeId('comment'),
    author: String(comment.name || comment.author || '익명'),
    handle: comment.handle ? String(comment.handle).replace(/^@/, '') : undefined,
    content: String(comment.body || comment.content || ''),
    likes: Number(comment.likes || Math.floor(Math.random() * 20)),
    createdAt: Date.now(),
    ai: true
  })).filter(comment => comment.content);
  return {
    id: makeId('sns'),
    characterId: character.id,
    platform,
    displayName: item.displayName || character.name,
    handle: String(item.handle || character.handle || character.id).replace(/^@/, ''),
    content: String(item.text || item.content || '').trim() || '...',
    hashtags: Array.isArray(item.hashtags) ? item.hashtags.map(tag => String(tag).replace(/^#/, '')).filter(Boolean) : [],
    createdAt: Date.now(),
    likes: Number(stats.likes || Math.floor(12 + Math.random() * 90)),
    replies: Number(stats.replies || comments.length),
    reposts: Number(stats.reposts || 0),
    bookmarks: Number(stats.bookmarks || 0),
    views: Number(stats.views || Math.floor(300 + Math.random() * 9000)),
    comments,
    imagePrompt: item.imagePrompt,
    imageCaption: item.imageCaption
  };
}

function toDmThreads(generated: GeneratedSns, character: SNSGodCharacter, postId?: string): SNSDmThread[] {
  return (generated.dms || []).map(thread => ({
    id: makeId('snsdm'),
    postId,
    characterId: character.id,
    title: String(thread.title || `${character.name} SNS DM`),
    messages: (thread.messages || []).map(message => ({
      id: makeId('snsdmmsg'),
      from: String(message.from || '').toLowerCase().includes('user') ? 'user' as const : String(message.from || '').toLowerCase().includes('third') ? 'thirdParty' as const : 'character' as const,
      author: message.from,
      body: String(message.body || message.content || ''),
      createdAt: Date.now()
    })).filter(message => message.body),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    unread: 1
  })).filter(thread => thread.messages.length);
}

export async function generateSNSPost(state: SNSGodState, character: SNSGodCharacter, platform: SNSPost['platform']): Promise<SNSGodState> {
  const sns = state.config.sns || {};
  const recentRooms = state.chatRooms[character.id] || [];
  const transcript = recentRooms.flatMap(room => state.messages[room.id] || []).slice(-Number(state.config.apiProfiles[state.config.apiType]?.snsContextMessageLimit || 12))
    .map(message => `${message.role === 'user' ? state.config.userName : character.name}: ${message.content}`)
    .join('\n');
  const targetPlatform = sns.platform === 'hybrid' ? 'twitter and instagram' : platform;
  const prompt = [
    (state.config.prompts?.snsPosting || DEFAULT_PROMPTS.snsPosting).replaceAll('{character.name}', character.name),
    'Create a Lightboard SNS result with believable platform UI data, audience comments, and optional DM snippets.',
    'Return only JSON: {"platforms":[{"platform":"twitter|instagram","displayName":"","handle":"","text":"","hashtags":[""],"stats":{"views":0,"likes":0,"replies":0,"reposts":0,"bookmarks":0},"comments":[{"name":"","handle":"","body":"","likes":0}],"imagePrompt":"","imageCaption":""}],"dms":[{"title":"","messages":[{"from":"","body":""}]}]}.',
    `Target platform: ${targetPlatform}.`,
    `Comment count per platform: ${sns.commentQty || '2-4'} (${commentCountHint(sns.commentQty)} desired).`,
    sns.autoComments === false ? 'Do not invent audience comments; return comments as an empty array.' : 'Invent fresh believable audience comments for this post only.',
    sns.anonymous ? 'Use a private/anonymous account vibe.' : 'Use the character account openly.',
    sns.nsfw ? 'This is an adult private back-account version. Mature/NSFW tone is allowed only when it fits the adult fictional character and context.' : 'Keep it SFW unless the current conversation explicitly requires otherwise.',
    (sns.nsfw || sns.hybridNsfwSplit) ? 'When hybrid NSFW split is enabled, Instagram must stay public-safe and polished; Twitter/X may use the private alt-account vibe. Avoid explicit terms for Instagram.' : '',
    sns.textOnly ? 'Do not include imagePrompt.' : 'If an image fits, include imagePrompt as English visual prompt.',
    sns.noDM ? 'Do not create dms.' : 'Create one short SNS DM thread when natural.',
    sns.thirdPartyDM ? 'Third-party commenters may initiate DMs if useful.' : 'DMs should stay centered on the character and user.',
    sns.subject ? `User direction / subject: ${sns.subject}` : '',
    sns.mood ? `Mood: ${sns.mood}` : '',
    `Character profile: ${character.prompt || '(empty)'}`,
    `Recent private chat context:\n${transcript || '(empty)'}`,
    `Previous posts:\n${(state.snsPosts || []).filter(post => post.characterId === character.id).slice(0, 5).map(post => `- ${post.platform}: ${post.content}`).join('\n') || '(none)'}`
  ].filter(Boolean).join('\n\n');
  const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: prompt }]);
  const parsed = parsePostText(text, platform);
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const generatedPlatforms = (parsed.platforms || []).filter(item => platformMatches(item.platform, platform));
  const posts: SNSPost[] = (generatedPlatforms.length ? generatedPlatforms : [{ platform, text: text.trim() }]).map(item => {
    const next = toPost(item, character, platform);
    return shouldGenerateComments(state) ? next : { ...next, comments: [], replies: 0 };
  });
  const postsWithImages: SNSPost[] = [];
  for (const post of posts) {
    if (post.imagePrompt && sns.autoImage !== false && state.config.imageGeneration?.enabled) {
      try {
        postsWithImages.push({ ...post, image: await generateImageDataUri(state, post.imagePrompt, character) });
      } catch (error) {
        postsWithImages.push({ ...post, imageCaption: `${post.imageCaption || ''}\n이미지 생성 실패: ${error instanceof Error ? error.message : String(error)}`.trim() });
      }
    } else {
      postsWithImages.push(post);
    }
  }
  const dmThreads = toDmThreads(parsed, character, postsWithImages[0]?.id);
  return {
    ...state,
    config: {
      ...state.config,
      apiProfiles: {
        ...state.config.apiProfiles,
        [state.config.apiType]: { ...profile, apiKeyIndex: keyIndex }
      }
    },
    snsPosts: [...postsWithImages, ...(state.snsPosts || [])],
    snsDmThreads: [...dmThreads, ...(state.snsDmThreads || [])],
    notifications: [{
      id: makeId('noti'),
      type: 'sns',
      title: `${character.name} SNS 게시`,
      body: postsWithImages[0]?.content || '새 SNS 게시물',
      characterId: character.id,
      createdAt: Date.now()
    }, ...(state.notifications || [])]
  };
}

export async function generateSNSCommentReply(state: SNSGodState, post: SNSPost, content: string): Promise<{ comment: NonNullable<SNSPost['comments']>[number]; keyIndex: number }> {
  const character = state.characters.find(item => item.id === post.characterId);
  const prompt = [
    'You are simulating a private SNS comment reply. Return JSON only.',
    '{"author":"","handle":"","content":"","likes":0}',
    `Post by ${character?.name || 'Character'}: ${post.content}`,
    `User/comment direction: ${content}`,
    `Character profile: ${character?.prompt || '(empty)'}`,
    'Write one believable Korean comment from the character account or a follower depending on context.'
  ].join('\n\n');
  const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: prompt }]);
  const parsed = parseJsonObject<{ author?: string; handle?: string; content?: string; likes?: number }>(text) || { content: text };
  return {
    keyIndex,
    comment: {
      id: makeId('comment'),
      author: String(parsed.author || character?.name || 'Character'),
      handle: parsed.handle ? String(parsed.handle).replace(/^@/, '') : character?.handle,
      content: String(parsed.content || text).trim(),
      likes: Number(parsed.likes || 0),
      createdAt: Date.now(),
      ai: true
    }
  };
}

export async function generateSnsDmReply(state: SNSGodState, threadId: string, userText: string): Promise<SNSGodState> {
  const thread = (state.snsDmThreads || []).find(item => item.id === threadId);
  if (!thread) throw new Error('SNS DM 스레드를 찾을 수 없습니다.');
  const character = state.characters.find(item => item.id === thread.characterId);
  const transcript = thread.messages.slice(-12).map(message => `${message.from === 'user' ? state.config.userName : message.author || character?.name || 'Character'}: ${message.body}`).join('\n');
  const prompt = [
    'Continue this private SNS DM as the character. Return JSON only.',
    '{"messages":[{"body":"short Korean DM bubble"}]}',
    `Character profile: ${character?.prompt || '(empty)'}`,
    `SNS DM title: ${thread.title}`,
    `Recent SNS DM:\n${transcript || '(empty)'}`,
    `Latest user message: ${userText}`
  ].join('\n\n');
  const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: prompt }]);
  const parsed = parseJsonObject<{ messages?: { body?: string; content?: string }[] }>(text) || { messages: [{ body: text }] };
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const replies = (parsed.messages?.length ? parsed.messages : [{ body: text }]).map(item => ({
    id: makeId('snsdmmsg'),
    from: 'character' as const,
    author: character?.name,
    body: String(item.body || item.content || '').trim(),
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
}
