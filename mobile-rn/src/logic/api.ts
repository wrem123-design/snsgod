import * as FileSystem from 'expo-file-system';
import { KJUR } from 'jsrsasign';

import { ApiProfile, ImageGenerationConfig, SNSGodCharacter, SNSGodState } from '../types';
import { editableForbiddenPromptRules } from './imagePromptRules';
import { appendDebugLog } from './debugLog';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageData?: string;
  imageMimeType?: string;
};

type VertexServiceAccount = {
  type: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
};

export type LLMReply = {
  reactionDelay: number;
  messages: {
    delay?: number;
    content: string;
    sticker?: string;
    imagePrompt?: string;
    imageCaption?: string;
    callInvite?: boolean;
    phoneCall?: boolean;
    callTitle?: string;
    callLine?: string;
    phoneTitle?: string;
    phoneLine?: string;
  }[];
  newMemory?: string;
};

function apiKeys(profile: ApiProfile): string[] {
  const keys = [profile.apiKey, ...(profile.apiKeys || [])].map(value => String(value || '').trim()).filter(Boolean);
  return Array.from(new Set(keys));
}

const vertexTokenCache: Record<string, { token: string; expiry: number }> = {};

function parseVertexServiceAccount(value: unknown): VertexServiceAccount {
  const source = String(value || '').trim();
  if (!source) throw new Error('Vertex Service Account JSON이 비어 있습니다.');
  if (/^[A-Za-z]:\\/.test(source) || /^\\\\[^\\]/.test(source)) throw new Error('파일 경로가 아니라 JSON 본문을 그대로 붙여넣으세요.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Vertex JSON 파싱 실패: ${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Vertex JSON은 객체 형식이어야 합니다.');
  const record = parsed as Partial<VertexServiceAccount>;
  if (record.type !== 'service_account') throw new Error('Vertex JSON type이 service_account가 아닙니다.');
  if (!record.client_email || !record.private_key) throw new Error('Vertex JSON에 client_email 또는 private_key가 없습니다.');
  if (!String(record.private_key).includes('-----BEGIN') || !String(record.private_key).includes('PRIVATE KEY-----')) {
    throw new Error('Vertex private_key가 PEM 형식이 아닙니다.');
  }
  return {
    type: 'service_account',
    project_id: record.project_id ? String(record.project_id) : undefined,
    private_key_id: record.private_key_id ? String(record.private_key_id) : undefined,
    private_key: String(record.private_key),
    client_email: String(record.client_email),
    token_uri: record.token_uri ? String(record.token_uri) : 'https://oauth2.googleapis.com/token'
  };
}

function vertexJwt(serviceAccount: VertexServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(serviceAccount.private_key_id ? { kid: serviceAccount.private_key_id } : {})
  };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  return KJUR.jws.JWS.sign('RS256', JSON.stringify(header), JSON.stringify(claim), serviceAccount.private_key);
}

async function fetchVertexAccessToken(profile: ApiProfile, serviceAccount: VertexServiceAccount): Promise<string> {
  const cacheKey = `${serviceAccount.client_email}:${serviceAccount.project_id || ''}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = vertexTokenCache[cacheKey];
  if (cached?.token && cached.expiry > now + 60) return cached.token;
  const assertion = vertexJwt(serviceAccount);
  const tokenBridgeUrl = String(profile.tokenBridgeUrl || '').trim();
  const formBody = new URLSearchParams();
  formBody.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  formBody.append('assertion', assertion);
  const response = await fetch(tokenBridgeUrl || (serviceAccount.token_uri || 'https://oauth2.googleapis.com/token'), {
    method: 'POST',
    headers: { 'Content-Type': tokenBridgeUrl ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: tokenBridgeUrl ? JSON.stringify({ assertion }) : formBody.toString()
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Vertex OAuth ${response.status}: ${friendlyVertexOAuthError(response.status, text)}`);
  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Vertex OAuth 응답 JSON 파싱 실패: ${text.slice(0, 160)}`);
  }
  const token = String(data.access_token || '');
  if (!token) throw new Error('Vertex OAuth 응답에 access_token이 없습니다.');
  vertexTokenCache[cacheKey] = { token, expiry: now + Number(data.expires_in || 3600) };
  return token;
}

export function extractJsonObjectText(text: string): string | undefined {
  const source = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/^[`'\s]*json\s*/i, '')
    .trim();
  const start = source.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return undefined;
}

export function parseJsonObject<T extends Record<string, unknown>>(text: string): T | undefined {
  const raw = extractJsonObjectText(text);
  if (!raw) return undefined;
  const attempts = [raw, repairJsonish(raw)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // Try the next repair variant.
    }
  }
  return undefined;
}

function repairJsonish(text: string): string {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/"messages"\s*;/g, '"messages":')
    .replace(/([{,]\s*)(reactionDelay|delay|messages|content|body|text|sticker|imagePrompt|imageCaption|newMemory|platforms|platform|displayName|handle|hashtags|stats|comments|dms|title|from|name|prompt|persona|profile|description|firstMessage|first_message|greeting|callInvite|phoneCall|callTitle|callLine|phoneTitle|phoneLine|call)\s*:/g, '$1"$2":')
    .replace(/([{,]\s*)'(reactionDelay|delay|messages|content|body|text|sticker|imagePrompt|imageCaption|newMemory|platforms|platform|displayName|handle|hashtags|stats|comments|dms|title|from|name|prompt|persona|profile|description|firstMessage|first_message|greeting|callInvite|phoneCall|callTitle|callLine|phoneTitle|phoneLine|call)'\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function sanitizeAssistantContent(value: unknown): string {
  let text = String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
  text = text
    .replace(/^\s*[{[\],:;]+/, '')
    .replace(/["']?\s*(reactionDelay|delay|messages|characterId|speakerId|speaker|name|displayName|character|content|body|text|imageCaption|newMemory|sticker|imagePrompt)\s*["']?\s*[:;]?\s*/gi, '')
    .replace(/^[{}\[\],:"'\s]+/, '')
    .replace(/[{}\[\]]+$/g, '')
    .trim();
  if (isJsonScaffoldText(text)) return '';
  return text.slice(0, 1200);
}

function isJsonScaffoldText(text: string): boolean {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/^[{}\[\],:"'\s0-9.-]+$/.test(value)) return true;
  if (/^(reactionDelay|delay|messages|characterId|speakerId|speaker|name|displayName|character|content|body|text|imageCaption|newMemory|sticker|imagePrompt)\b\s*[:;]?$/i.test(value)) return true;
  const withoutKeys = value.replace(/messages|reactionDelay|delay|characterId|speakerId|speaker|name|displayName|character|content|body|text|imageCaption|newMemory|sticker|imagePrompt/gi, '');
  if (/^\{?\s*["']?(messages|reactionDelay|delay)["']?\s*[:;]/i.test(value) && !/[가-힣ぁ-んァ-ン一-龥a-zA-Z]{2,}/.test(withoutKeys)) return true;
  return false;
}

function normalizedReplyFromParsed(parsed: Partial<LLMReply> & { content?: string; message?: string; body?: string; text?: string }): LLMReply {
  const sourceMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const normalizedMessages = sourceMessages.length
    ? sourceMessages.map(item => {
      const record = (item || {}) as {
        delay?: number;
        content?: string;
        body?: string;
        text?: string;
        sticker?: string;
        imagePrompt?: string;
        imageCaption?: string;
        callInvite?: boolean;
        phoneCall?: boolean;
        callTitle?: string;
        callLine?: string;
        phoneTitle?: string;
        phoneLine?: string;
        call?: boolean | { callInvite?: boolean; phoneCall?: boolean; title?: string; line?: string };
        type?: string;
        intent?: string;
        action?: string;
        marker?: string;
      };
      const callRecord = typeof record.call === 'object' && record.call ? record.call : undefined;
      const intentText = String(record.type || record.intent || record.action || record.marker || '').toLowerCase();
      const hasCall = record.callInvite === true
        || record.phoneCall === true
        || record.call === true
        || callRecord?.callInvite === true
        || callRecord?.phoneCall === true
        || /phone[_\s-]*call|incoming[_\s-]*call|call[_\s-]*(now|user|invite)/i.test(intentText);
      return {
        delay: Number(record.delay || 0),
        content: sanitizeAssistantContent(record.content || record.body || record.text || record.imageCaption || ''),
        sticker: record.sticker ? String(record.sticker) : undefined,
        imagePrompt: record.imagePrompt ? String(record.imagePrompt).trim() : undefined,
        imageCaption: record.imageCaption ? sanitizeAssistantContent(record.imageCaption) : undefined,
        callInvite: hasCall || undefined,
        phoneCall: hasCall || undefined,
        callTitle: record.callTitle || callRecord?.title ? String(record.callTitle || callRecord?.title || '').trim() : undefined,
        callLine: record.callLine || callRecord?.line ? sanitizeAssistantContent(record.callLine || callRecord?.line || '') : undefined,
        phoneTitle: record.phoneTitle ? String(record.phoneTitle).trim() : undefined,
        phoneLine: record.phoneLine ? sanitizeAssistantContent(record.phoneLine) : undefined
      };
    }).filter(item => item.content || item.sticker || item.imagePrompt || item.callInvite)
    : [sanitizeAssistantContent(parsed.content || parsed.message || parsed.body || parsed.text || '')]
      .filter(Boolean)
      .map(content => ({ content }));
  return {
    reactionDelay: Number(parsed.reactionDelay || 0),
    messages: normalizedMessages,
    newMemory: typeof parsed.newMemory === 'string' ? parsed.newMemory.trim() : undefined
  };
}

function parseJsonish(text: string): LLMReply {
  const trimmed = text.trim();
  if (!trimmed) return { reactionDelay: 0, messages: [] };
  const parsed = parseJsonObject<Partial<LLMReply> & { content?: string; message?: string; body?: string; text?: string }>(trimmed);
  if (parsed) return normalizedReplyFromParsed(parsed);

  const looksLikeBrokenJson = /^[`'\s]*(json)?\s*[\{\[]/i.test(trimmed) || /reactionDelay|["']messages["']|```json/i.test(trimmed);
  if (looksLikeBrokenJson) {
    const recovered = recoverMessageContents(trimmed).map(sanitizeAssistantContent).filter(Boolean);
    if (recovered.length) return { reactionDelay: 0, messages: recovered.map(content => ({ content })) };
    return { reactionDelay: 0, messages: [] };
  }
  return { reactionDelay: 0, messages: [{ content: sanitizeAssistantContent(trimmed) || '응.' }] };
}

function extractArrayBlock(source: string, key: string): string | undefined {
  const match = new RegExp(`["']?${key}["']?\\s*:`, 'i').exec(source);
  if (!match) return undefined;
  const start = source.indexOf('[', match.index + match[0].length);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (inString) {
      if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function readQuotedValue(source: string, start: number): { value: string; end: number } | undefined {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
  let value = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
  }
  return undefined;
}

function recoverMessageContents(text: string): string[] {
  const source = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^[`'\s]*json\s*/i, '')
    .trim();
  const block = extractArrayBlock(source, 'messages') || source;
  const results: string[] = [];
  const keyPattern = /["']?(content|body|text|imageCaption)["']?\s*[:;]\s*/gi;
  let match = keyPattern.exec(block);
  while (match) {
    let cursor = match.index + match[0].length;
    while (/\s/.test(block[cursor] || '')) cursor += 1;
    const quoted = readQuotedValue(block, cursor);
    if (quoted) {
      const value = sanitizeAssistantContent(quoted.value);
      if (value && !results.includes(value)) results.push(value);
      keyPattern.lastIndex = quoted.end;
    } else {
      const loose = block.slice(cursor).match(/^[^{}\[\],]+/);
      const value = sanitizeAssistantContent(loose?.[0] || '');
      if (value && !results.includes(value)) results.push(value);
    }
    match = keyPattern.exec(block);
  }
  return results.slice(0, 6);
}

function imagePayloadFromDataUri(imageData?: string): { mimeType: string; data: string } | undefined {
  const source = String(imageData || '').trim();
  const match = source.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return undefined;
  return { mimeType: match[1] || 'image/jpeg', data: match[2].replace(/\s/g, '') };
}

function imageMimeTypeFromSource(source: string, fallback?: string): string {
  const dataMime = source.match(/^data:([^;]+);base64,/i)?.[1];
  if (dataMime) return dataMime;
  const clean = source.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return fallback || 'image/jpeg';
}

async function imagePayloadFromSource(imageData?: string, imageMimeType?: string): Promise<{ mimeType: string; data: string; dataUri: string } | undefined> {
  const source = String(imageData || '').trim();
  if (!source) return undefined;
  const dataUri = imagePayloadFromDataUri(source);
  if (dataUri) return { ...dataUri, dataUri: `data:${dataUri.mimeType};base64,${dataUri.data}` };
  if (/^(file:|content:)/i.test(source) || /^[A-Za-z]:[\\/]/.test(source)) {
    try {
      const data = await FileSystem.readAsStringAsync(source, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = imageMimeTypeFromSource(source, imageMimeType);
      return { mimeType, data: data.replace(/\s/g, ''), dataUri: `data:${mimeType};base64,${data.replace(/\s/g, '')}` };
    } catch (error) {
      await appendDebugLog('llm.image', `local image read failed: ${source.slice(0, 120)}\n${error instanceof Error ? error.message : String(error)}`, 'warn');
      return undefined;
    }
  }
  if (/^https?:\/\//i.test(source)) {
    return { mimeType: imageMimeTypeFromSource(source, imageMimeType), data: '', dataUri: source };
  }
  await appendDebugLog('llm.image', `unsupported image source: ${source.slice(0, 120)}`, 'warn');
  return undefined;
}

async function geminiPartsForMessage(message: ChatMessage): Promise<Record<string, unknown>[]> {
  const parts: Record<string, unknown>[] = [{ text: message.content }];
  const image = await imagePayloadFromSource(message.imageData, message.imageMimeType);
  if (image?.data) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  return parts;
}

async function openAiInputForMessages(messages: ChatMessage[]): Promise<Record<string, unknown>[]> {
  return Promise.all(messages.map(async message => {
    const content: Record<string, unknown>[] = [{ type: 'input_text', text: message.content }];
    const image = await imagePayloadFromSource(message.imageData, message.imageMimeType);
    if (image) content.push({ type: 'input_image', image_url: image.dataUri });
    return {
      role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
      content
    };
  }));
}

async function chatCompletionMessages(messages: ChatMessage[]): Promise<{ role: 'system' | 'user' | 'assistant'; content: string | Record<string, unknown>[] }[]> {
  return Promise.all(messages.map(async message => {
    const role = message.role;
    const image = await imagePayloadFromSource(message.imageData, message.imageMimeType);
    if (!image) return { role, content: message.content };
    return {
      role,
      content: [
        { type: 'text', text: message.content },
        { type: 'image_url', image_url: { url: image.dataUri } }
      ]
    };
  }));
}

async function anthropicContentForMessage(message: ChatMessage): Promise<Record<string, unknown>[]> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: message.content }];
  const image = await imagePayloadFromSource(message.imageData, message.imageMimeType);
  if (image?.data) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.data
      }
    });
  }
  return content;
}

async function callGemini(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const endpoint = String(profile.apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = String(profile.apiModel || 'gemini-2.5-pro').replace(/^models\//, '');
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const contents = await Promise.all(messages
    .filter(message => message.role !== 'system')
    .map(async message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: await geminiPartsForMessage(message) })));
  const response = await fetch(`${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Generate the next reply now.' }] }],
      generationConfig: {
        maxOutputTokens: Number(profile.maxTokens || 700),
        temperature: Number(profile.temperature || 0.85),
        responseMimeType: 'application/json'
      }
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
}

function vertexEndpoint(profile: ApiProfile, serviceAccount: VertexServiceAccount, overrideLocation?: string): string {
  const location = String(overrideLocation || profile.location || 'global').trim() || 'global';
  const projectId = String(serviceAccount.project_id || '').trim();
  const model = String(profile.apiModel || 'gemini-3-flash-preview').replace(/^models\//, '').trim();
  if (!projectId) throw new Error('Vertex Service Account JSON에 project_id가 없습니다.');
  if (!model) throw new Error('Vertex 모델명이 비어 있습니다.');
  const baseEndpoint = vertexBaseEndpoint(profile, location);
  return `${baseEndpoint}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

function vertexBaseEndpoint(profile: ApiProfile, location: string): string {
  const customEndpoint = String(profile.apiEndpoint || '').trim().replace(/\/+$/, '');
  if (!customEndpoint) {
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return `https://${host}/v1`;
  }
  const withoutVersion = customEndpoint.replace(/\/v1$/i, '');
  if (location === 'global' && /^https:\/\/[^/]+-aiplatform\.googleapis\.com$/i.test(withoutVersion)) {
    return 'https://aiplatform.googleapis.com/v1';
  }
  if (/\/v1$/i.test(customEndpoint)) return customEndpoint;
  return `${customEndpoint}/v1`;
}

function friendlyVertexOAuthError(status: number, text: string): string {
  if (/unsupported_grant_type|invalid_grant_type/i.test(text)) {
    return 'OAuth 토큰 요청 형식이 거부되었습니다. 요청 바디를 URLSearchParams 폼 방식으로 전송하도록 보정했습니다. 계속 뜨면 서비스 계정 JSON의 token_uri와 private_key가 올바른지 확인하세요.';
  }
  if (status === 400 && /invalid_grant/i.test(text)) {
    return 'OAuth 인증 정보가 거부되었습니다. 서비스 계정 키가 폐기되었거나, 기기 시간이 크게 어긋났거나, JSON이 잘못 붙여넣어진 경우일 수 있습니다.';
  }
  return text.slice(0, 300);
}

function vertexLocationsToTry(profile: ApiProfile): string[] {
  const configured = String(profile.location || 'global').trim() || 'global';
  const model = String(profile.apiModel || '');
  const locations = [configured];
  if (/gemini-3/i.test(model) && configured !== 'global') locations.push('global');
  return Array.from(new Set(locations));
}

function vertexGenerationConfig(profile: ApiProfile): Record<string, unknown> {
  const model = String(profile.apiModel || '');
  const isGemini3 = /gemini-3[\d.]*-?/i.test(model);
  const requestedMaxOutputTokens = Math.max(32, Math.round(Number(profile.maxTokens || 700)));
  const config: Record<string, unknown> = {
    maxOutputTokens: isGemini3 ? Math.max(4096, requestedMaxOutputTokens) : requestedMaxOutputTokens,
    temperature: Number(profile.temperature || 0.85),
    responseMimeType: 'application/json'
  };
  const thinkingBudget = Math.max(0, Math.round(Number(profile.thinkingBudgetTokens || 0)));
  const thinkingLevel = String(profile.thinkingLevel || 'off');
  if (isGemini3 && thinkingLevel === 'off' && thinkingBudget <= 0) {
    config.thinkingConfig = { includeThoughts: false, thinkingBudget: 0 };
  } else if (isGemini3 && thinkingLevel !== 'off') {
    config.thinkingConfig = { includeThoughts: false, thinkingLevel: thinkingLevel.toUpperCase() };
  } else if (isGemini3 && thinkingBudget > 0) {
    const level = thinkingBudget < 4096 ? 'LOW' : thinkingBudget < 16384 ? 'MEDIUM' : 'HIGH';
    config.thinkingConfig = { includeThoughts: false, thinkingLevel: level };
  } else if (thinkingBudget > 0) {
    config.thinkingConfig = { includeThoughts: false, thinkingBudget };
  } else if (thinkingLevel !== 'off') {
    const budgetMap: Record<string, number> = { MINIMAL: 1024, LOW: 4096, MEDIUM: 10240, HIGH: 24576 };
    config.thinkingConfig = { includeThoughts: false, thinkingBudget: budgetMap[thinkingLevel.toUpperCase()] || Number(thinkingLevel) || 10240 };
  }
  return config;
}

async function callVertex(profile: ApiProfile, messages: ChatMessage[]): Promise<string> {
  const serviceAccount = parseVertexServiceAccount(profile.serviceAccountJson);
  const token = await fetchVertexAccessToken(profile, serviceAccount);
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const contents = await Promise.all(messages
    .filter(message => message.role !== 'system')
    .map(async message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: await geminiPartsForMessage(message) })));
  const payload = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Generate the next reply now.' }] }],
    generationConfig: vertexGenerationConfig(profile)
  };
  const first = await runVertexGenerate(profile, serviceAccount, token, JSON.stringify(payload));
  const firstData = parseVertexGenerateResponse(first.text);
  const firstOutput = vertexResponseText(firstData);
  if (firstOutput.trim()) return firstOutput;

  await appendDebugLog('vertex.empty', `1차 Vertex 응답에 text가 없습니다. location=${first.location}\nconfig=${JSON.stringify(payload.generationConfig)}\n${vertexResponseSummary(firstData)}\nraw=${first.text.slice(0, 1800)}`, 'warn');
  const relaxedConfig = { ...vertexGenerationConfig(profile) };
  delete relaxedConfig.responseMimeType;
  const retryPayload = { ...payload, generationConfig: relaxedConfig };
  const retry = await runVertexGenerate(profile, serviceAccount, token, JSON.stringify(retryPayload));
  const retryData = parseVertexGenerateResponse(retry.text);
  const retryOutput = vertexResponseText(retryData);
  if (retryOutput.trim()) return retryOutput;

  await appendDebugLog('vertex.empty', `2차 Vertex 응답에도 text가 없습니다. location=${retry.location}\nconfig=${JSON.stringify(retryPayload.generationConfig)}\n${vertexResponseSummary(retryData)}\nraw=${retry.text.slice(0, 1800)}`, 'error');
  throw new Error(`Vertex 응답에 표시할 텍스트가 없습니다. ${vertexResponseSummary(retryData)} ETC > 디버그의 vertex.empty 로그를 확인하세요.`);
}

async function runVertexGenerate(profile: ApiProfile, serviceAccount: VertexServiceAccount, token: string, body: string): Promise<{ text: string; status: number; location: string }> {
  let text = '';
  let lastStatus = 0;
  let lastLocation = '';
  for (const location of vertexLocationsToTry(profile)) {
    lastLocation = location;
    const response = await fetch(vertexEndpoint(profile, serviceAccount, location), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(profile.proxyAccessToken ? { 'X-Proxy-Token': String(profile.proxyAccessToken) } : {})
      },
      body
    });
    text = await response.text();
    lastStatus = response.status;
    if (response.ok) break;
    const shouldRetryGlobal = response.status === 404 && location !== 'global' && /was not found|does not have access|valid model name/i.test(text);
    if (!shouldRetryGlobal) {
      throw new Error(`Vertex ${response.status} (${location}): ${friendlyVertexError(response.status, text)}`);
    }
  }
  if (lastStatus < 200 || lastStatus >= 300) {
    throw new Error(`Vertex ${lastStatus} (${lastLocation}): ${friendlyVertexError(lastStatus, text)}`);
  }
  return { text, status: lastStatus, location: lastLocation };
}

type VertexGenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    safetyRatings?: unknown;
  }[];
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: unknown;
  };
  usageMetadata?: unknown;
};

function parseVertexGenerateResponse(text: string): VertexGenerateResponse {
  try {
    return JSON.parse(text) as VertexGenerateResponse;
  } catch {
    throw new Error(`Vertex 응답 JSON 파싱 실패: ${text.slice(0, 160)}`);
  }
}

function vertexResponseText(data: VertexGenerateResponse): string {
  return (data.candidates?.[0]?.content?.parts || [])
    .filter(part => !part.thought)
    .map(part => part.text || '')
    .join('');
}

function vertexResponseSummary(data: VertexGenerateResponse): string {
  const candidate = data.candidates?.[0];
  const partCount = candidate?.content?.parts?.length || 0;
  const textPartCount = (candidate?.content?.parts || []).filter(part => part.text).length;
  return [
    `finishReason=${candidate?.finishReason || '(none)'}`,
    `blockReason=${data.promptFeedback?.blockReason || '(none)'}`,
    `parts=${partCount}`,
    `textParts=${textPartCount}`,
    `usage=${JSON.stringify(data.usageMetadata || {}).slice(0, 240)}`
  ].join(', ');
}

function friendlyVertexError(status: number, text: string): string {
  if (status === 404 && /was not found|does not have access|valid model name/i.test(text)) {
    return '모델이 현재 Vertex 리전에 없거나 프로젝트 권한이 없습니다. 설정 > API에서 Location을 global로 바꾸거나, 접근 가능한 모델(gemini-2.5-pro 등)로 테스트해보세요.';
  }
  return text.slice(0, 300);
}

async function callOpenAI(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const endpoint = String(profile.apiEndpoint || 'https://api.openai.com/v1/responses');
  const usesChatCompletions = /\/chat\/completions\/?$/i.test(endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(usesChatCompletions
      ? {
        model: profile.apiModel || 'gpt-4.1-mini',
        messages: await chatCompletionMessages(messages),
        max_tokens: Number(profile.maxTokens || 700),
        temperature: Number(profile.temperature || 0.85)
      }
      : {
        model: profile.apiModel || 'gpt-4.1-mini',
        input: await openAiInputForMessages(messages),
        max_output_tokens: Number(profile.maxTokens || 700),
        temperature: Number(profile.temperature || 0.85)
      })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  if (usesChatCompletions) {
    return data.choices?.map((choice: { message?: { content?: string } }) => choice.message?.content || '').join('') || '';
  }
  return data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((item: { text?: string }) => item.text || '').join('') || '';
}

async function callAnthropic(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.find(message => message.role === 'system')?.content || '';
  const bodyMessages = await Promise.all(messages.filter(message => message.role !== 'system').map(async message => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: await anthropicContentForMessage(message)
  })));
  const response = await fetch(String(profile.apiEndpoint || 'https://api.anthropic.com/v1/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: profile.apiModel || 'claude-haiku-4-5',
      system,
      messages: bodyMessages.length ? bodyMessages : [{ role: 'user', content: system }],
      max_tokens: Number(profile.maxTokens || 700),
      temperature: Number(profile.temperature || 0.85)
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  return data.content?.map((part: { text?: string }) => part.text || '').join('') || '';
}

async function callWithProvider(state: SNSGodState, profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  if (state.config.apiType === 'gemini') return callGemini(profile, key, messages);
  if (state.config.apiType === 'openai') return callOpenAI(profile, key, messages);
  if (state.config.apiType === 'anthropic') return callAnthropic(profile, key, messages);
  if (state.config.apiType === 'custom') return callOpenAI(profile, key, messages);
  throw new Error('RisuAI provider는 단독 RN 앱에서 직접 호출할 수 없습니다. Gemini/OpenAI/Anthropic/Custom API를 설정하세요.');
}

export async function callLLM(state: SNSGodState, messages: ChatMessage[]): Promise<{ reply: LLMReply; keyIndex: number }> {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  if (state.config.apiType === 'vertex') {
    await appendDebugLog('llm.request', compactMessagesForLog(state.config.apiType, messages));
    const text = await callVertex(profile, messages);
    const reply = parseJsonish(text);
    await appendDebugLog('llm.response', compactReplyForLog(state.config.apiType, text, reply));
    return { reply, keyIndex: 0 };
  }
  const keys = apiKeys(profile);
  if (!keys.length) throw new Error('API 키가 없습니다. 설정에서 API 키를 입력하세요.');
  const start = Math.max(0, Math.min(keys.length - 1, Number(profile.apiKeyIndex || 0)));
  const errors: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (start + offset) % keys.length;
    try {
      await appendDebugLog('llm.request', compactMessagesForLog(`${state.config.apiType}#${index + 1}`, messages));
      const text = await callWithProvider(state, profile, keys[index], messages);
      const reply = parseJsonish(text);
      await appendDebugLog('llm.response', compactReplyForLog(`${state.config.apiType}#${index + 1}`, text, reply));
      return { reply, keyIndex: index };
    } catch (error) {
      errors.push(`키 ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      await appendDebugLog('llm.error', `provider=${state.config.apiType} key=${index + 1}\n${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }
  throw new Error(`API 호출에 실패했습니다.\n${errors.join('\n')}`);
}

export async function callLLMText(state: SNSGodState, messages: ChatMessage[]): Promise<{ text: string; keyIndex: number }> {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  if (state.config.apiType === 'vertex') {
    await appendDebugLog('llm-text.request', compactMessagesForLog(state.config.apiType, messages));
    const text = await callVertex(profile, messages);
    await appendDebugLog('llm-text.response', `provider=${state.config.apiType}\nraw=${text.slice(0, 1600)}`);
    return { text, keyIndex: 0 };
  }
  const keys = apiKeys(profile);
  if (!keys.length) throw new Error('API 키가 없습니다. 설정에서 API 키를 입력하세요.');
  const start = Math.max(0, Math.min(keys.length - 1, Number(profile.apiKeyIndex || 0)));
  const errors: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (start + offset) % keys.length;
    try {
      await appendDebugLog('llm-text.request', compactMessagesForLog(`${state.config.apiType}#${index + 1}`, messages));
      const text = await callWithProvider(state, profile, keys[index], messages);
      await appendDebugLog('llm-text.response', `provider=${state.config.apiType} key=${index + 1}\nraw=${text.slice(0, 1600)}`);
      return { text, keyIndex: index };
    } catch (error) {
      errors.push(`키 ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      await appendDebugLog('llm-text.error', `provider=${state.config.apiType} key=${index + 1}\n${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }
  throw new Error(`API 호출에 실패했습니다.\n${errors.join('\n')}`);
}

function compactMessagesForLog(provider: string, messages: ChatMessage[]): string {
  const body = messages
    .map(message => `[${message.role}]\n${message.content.slice(0, 1800)}`)
    .join('\n\n---\n\n');
  return `provider=${provider}\n${body.slice(0, 3600)}`;
}

function compactReplyForLog(provider: string, raw: string, reply: LLMReply): string {
  return [
    `provider=${provider}`,
    `parsedMessages=${reply.messages.length}`,
    `reactionDelay=${reply.reactionDelay}`,
    `raw=${raw.slice(0, 1800)}`,
    `parsed=${JSON.stringify(reply).slice(0, 1200)}`
  ].join('\n');
}

function extractImageBase64(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return value;
    if (/^[A-Za-z0-9+/=\s]{200,}$/.test(value)) return value.replace(/\s/g, '');
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageBase64(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['b64_json', 'base64', 'image_base64', 'data']) {
      const found = extractImageBase64(record[key]);
      if (found) return found;
    }
    if (record.type === 'image_generation_call') {
      const found = extractImageBase64(record.result);
      if (found) return found;
    }
    for (const nested of Object.values(record)) {
      const found = extractImageBase64(nested);
      if (found) return found;
    }
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function imagePromptWithoutCharacterName(prompt: string, character: SNSGodCharacter | undefined): string {
  const name = String(character?.name || '').trim();
  let next = String(prompt || '').trim();
  if (!name) return next;
  next = next
    .replace(new RegExp(`\\b${escapeRegex(name)}(?:'s)?\\b`, 'gi'), '')
    .replace(new RegExp(escapeRegex(name), 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,(])\s+/g, '$1')
    .replace(/^[\s,.;:，、-]+/, '')
    .replace(/[\s,.;:，、-]+$/, '')
    .trim();
  return next || String(prompt || '').trim();
}

type ImagePromptKind = 'profile' | 'profile-reference-face' | 'cover' | 'general' | 'meeting';

function samePromptText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function imagePromptFor(config: ImageGenerationConfig, character: SNSGodCharacter | undefined, prompt: string, options: { usesReference?: boolean; kind?: ImagePromptKind } = {}): string {
  const prefix = config.promptPrefix || 'Create a realistic in-character phone photo. Natural lighting, casual composition, no text overlay.';
  const forbiddenRules = editableForbiddenPromptRules(config.forbiddenPromptRules).trim();
  const globalRules = forbiddenRules ? `Global forbidden prompt rules: ${forbiddenRules}` : '';
  const profilePhotoPrompt = character?.profileAvatarPrompt ? imagePromptWithoutCharacterName(character.profileAvatarPrompt, character) : '';
  const requested = imagePromptWithoutCharacterName(prompt, character);
  const nsfw = config.nsfw ? 'NSFW/private fictional image is allowed when appropriate.' : 'Keep it safe and non-explicit.';
  if (options.kind === 'cover') {
    return [
      'Create a wide messenger profile cover/background image, not a profile photo.',
      'The image must be personless: no humans, no face, no body, no silhouette, no character, no crowd, no selfie, no portrait, no text, no logo, no UI.',
      'Use only scenery, room details, objects, weather, light, or environmental traces that fit the requested mood.',
      globalRules,
      `Requested cover background: ${requested}`,
      nsfw
    ].filter(Boolean).join('\n');
  }
  if (options.kind === 'meeting') {
    return [
      options.usesReference
        ? 'Use the attached reference image only for the female character visual identity. Preserve her face, hairstyle, and likeness from the reference. Do not apply the reference face to the male user.'
        : '',
      'Create a realistic horizontal cinematic still from an in-person meeting event, not a phone call, not a messenger screenshot, not SNS.',
      'Show the fictional female character and the male user as two distinct people when the scene calls for both. Keep their clothing and posture grounded in the recent conversation, time, place, and mood.',
      prefix,
      globalRules,
      `Requested meeting still: ${requested}`,
      'No text, no captions, no UI, no logos, no watermark.',
      nsfw
    ].filter(Boolean).join('\n');
  }
  if (options.usesReference) {
    if (options.kind === 'profile-reference-face') {
      return [
        'MANDATORY FACE REFERENCE: use the attached reference image as the primary facial identity source for this fictional adult female character.',
        'Preserve the reference face shape, facial proportions, eye spacing, nose/lip structure, jawline, and recognizable facial vibe. The generated face must clearly resemble the attached reference person.',
        'Only change outfit, background, pose, job context, expression, and photo setting according to the requested prompt. Do not copy the reference outfit, background, pose, age context, job, personality, or story.',
        'Do not ignore the attached image. Do not create a fully new unrelated face from text alone.',
        prefix,
        globalRules,
        `Requested character image: ${requested}`,
        nsfw
      ].filter(Boolean).join('\n');
    }
    return [
      'Use the attached reference image as the visual identity reference. Create the same person from the reference image, preserving face, hairstyle, and overall likeness.',
      prefix,
      globalRules,
      `Requested scene: ${requested}`,
      nsfw
    ].filter(Boolean).join('\n');
  }
  const baseIdentity = profilePhotoPrompt && !samePromptText(profilePhotoPrompt, requested)
    ? `Base visual identity from profile-photo prompt: ${profilePhotoPrompt}`
    : '';
  return [prefix, globalRules, baseIdentity, `Requested image: ${requested}`, nsfw].filter(Boolean).join('\n');
}

function normalizeGrokBaseUrl(value?: string): string {
  return String(value || 'http://127.0.0.1:5000').replace(/\/$/, '');
}

function absoluteGrokUrl(baseUrl: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${normalizeGrokBaseUrl(baseUrl)}${value.startsWith('/') ? value : `/${value}`}`;
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 data URI로 변환하지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Grok 이미지 다운로드 실패 ${response.status}`);
  return blobToDataUri(await response.blob());
}

async function dataUriToCacheFile(dataUri: string, name: string): Promise<{ uri: string; name: string; type: string }> {
  const mime = dataUri.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  const base64 = dataUri.replace(/^data:[^;]+;base64,/, '');
  const extension = mime.includes('jpeg') ? 'jpg' : mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
  const safeName = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_') || 'reference';
  const uri = `${FileSystem.cacheDirectory || ''}${safeName}-${Date.now()}.${extension}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri, name: `${safeName}.${extension}`, type: mime };
}

async function appendDataUriImage(form: FormData, field: string, dataUri: string, name: string) {
  const file = await dataUriToCacheFile(dataUri, name);
  form.append(field, file as unknown as Blob);
}

function mediaTypeForUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function appendReferenceImage(form: FormData, field: string, uri: string) {
  if (uri.startsWith('data:')) {
    await appendDataUriImage(form, field, uri, 'reference.png');
    return;
  }
  if (/^https?:\/\//i.test(uri)) {
    const dataUri = await fetchImageAsDataUri(uri);
    await appendDataUriImage(form, field, dataUri, 'reference.png');
    return;
  }
  if (/^(file:|content:|asset:)/i.test(uri)) {
    form.append(field, { uri, name: 'reference.jpg', type: mediaTypeForUri(uri) } as unknown as Blob);
  }
}

async function generateGrokLocalImage(state: SNSGodState, prompt: string, character?: SNSGodCharacter, options?: { referenceImage?: string; kind?: ImagePromptKind }): Promise<string> {
  const config = state.config.imageGeneration || {};
  const provider = config.provider || 'openai';
  const hasReference = /^(data:|file:|content:|asset:)/i.test(String(options?.referenceImage || ''));
  await appendDebugLog(
    'image.reference',
    `provider=${provider} kind=${options?.kind || 'general'} character=${character?.name || '-'} reference=${hasReference ? 'yes' : 'no'} supported=${provider === 'grok-local' || provider === 'grok-cloud' ? 'yes' : 'no'} prompt=${String(prompt || '').replace(/\s+/g, ' ').slice(0, 260)}`
  );
  const baseUrl = normalizeGrokBaseUrl(config.provider === 'grok-cloud' ? config.grokCloudBaseUrl : config.grokBaseUrl);
  const referenceImage = options?.kind === 'cover' ? '' : options?.referenceImage || '';
  const usesReference = /^(data:|file:|content:|asset:)/i.test(referenceImage);
  const finalPrompt = imagePromptFor(config, character, prompt, { usesReference, kind: options?.kind });
  const resolution = String(config.grokResolution || config.quality || '1k').includes('1k') ? '1k' : String(config.grokResolution || '1k');
  const aspectRatio = String(config.grokAspectRatio || 'auto');
  if (usesReference) {
    const form = new FormData();
    form.append('prompt', finalPrompt);
    form.append('resolution', resolution);
    await appendReferenceImage(form, 'image', referenceImage);
    const response = await fetch(`${baseUrl}/api/i2i`, { method: 'POST', body: form as unknown as RequestInit['body'] });
    const payload = await response.json() as { ok?: boolean; error?: { message?: string }; result?: { url?: string } };
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `Grok i2i ${response.status}`);
    const url = payload?.result?.url;
    if (!url) throw new Error('Grok i2i 응답에 이미지 URL이 없습니다.');
    return fetchImageAsDataUri(absoluteGrokUrl(baseUrl, String(url)));
  }
  const form = new FormData();
  form.append('prompt', finalPrompt);
  form.append('resolution', resolution);
  form.append('aspect_ratio', aspectRatio === 'auto' ? '1:1' : aspectRatio);
  const response = await fetch(`${baseUrl}/api/t2i`, { method: 'POST', body: form as unknown as RequestInit['body'] });
  const payload = await response.json() as { ok?: boolean; error?: { message?: string }; result?: { url?: string } };
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `Grok t2i ${response.status}`);
  const url = payload?.result?.url;
  if (!url) throw new Error('Grok t2i 응답에 이미지 URL이 없습니다.');
  return fetchImageAsDataUri(absoluteGrokUrl(baseUrl, String(url)));
}

export async function generateImageDataUri(state: SNSGodState, prompt: string, character?: SNSGodCharacter, options?: { referenceImage?: string; kind?: ImagePromptKind }): Promise<string> {
  const config = state.config.imageGeneration || {};
  if (config.provider !== 'grok-local' && config.provider !== 'grok-cloud') {
    const provider = config.provider || 'openai';
    const hasReference = /^(data:|file:|content:|asset:)/i.test(String(options?.referenceImage || ''));
    await appendDebugLog(
      'image.reference',
      `provider=${provider} kind=${options?.kind || 'general'} character=${character?.name || '-'} reference=${hasReference ? 'yes' : 'no'} supported=no prompt=${String(prompt || '').replace(/\s+/g, ' ').slice(0, 260)}`
    );
  }
  if (config.enabled === false) throw new Error('이미지 생성 설정이 꺼져 있습니다.');
  if (config.provider === 'grok-local' || config.provider === 'grok-cloud') return generateGrokLocalImage(state, prompt, character, options);
  const openAiProfile = state.config.apiProfiles.openai || {};
  const apiKey = String(config.apiKey || openAiProfile.apiKey || '').trim();
  if (!apiKey) throw new Error('이미지 생성 API 키가 비어 있습니다. 설정 > 이미지 생성에서 키를 입력하세요.');
  const endpoint = String(config.apiEndpoint || 'https://api.openai.com/v1/responses');
  const model = String(config.apiModel || 'gpt-5');
  const tool: Record<string, unknown> = { type: 'image_generation' };
  if (config.size) tool.size = config.size;
  if (config.quality) tool.quality = config.quality;
  const body = endpoint.includes('/images/generations')
    ? { model, prompt: imagePromptFor(config, character, prompt, { kind: options?.kind }), size: config.size || '1024x1024', response_format: 'b64_json' }
    : { model, input: imagePromptFor(config, character, prompt, { kind: options?.kind }), tools: [tool], tool_choice: { type: 'image_generation' } };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`이미지 API ${response.status}: ${text.slice(0, 320)}`);
  const base64 = extractImageBase64(JSON.parse(text));
  if (!base64) throw new Error('이미지 API 응답에 이미지 데이터가 없습니다.');
  return base64.startsWith('data:image/') ? base64 : `data:image/png;base64,${base64}`;
}
