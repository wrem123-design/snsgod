import { ApiProfile, ImageGenerationConfig, SNSGodCharacter, SNSGodState } from '../types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LLMReply = {
  reactionDelay: number;
  messages: { delay?: number; content: string; sticker?: string; imagePrompt?: string; imageCaption?: string }[];
  newMemory?: string;
};

function apiKeys(profile: ApiProfile): string[] {
  const keys = [profile.apiKey, ...(profile.apiKeys || [])].map(value => String(value || '').trim()).filter(Boolean);
  return Array.from(new Set(keys));
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
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseJsonish(text: string): LLMReply {
  const trimmed = text.trim();
  const parsed = parseJsonObject<Partial<LLMReply> & { content?: string; message?: string; text?: string }>(trimmed);
  if (parsed) {
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const normalizedMessages = messages.length
      ? messages.map(item => ({ ...item, content: String(item.content || '').trim() })).filter(item => item.content || item.sticker || item.imagePrompt)
      : [{ content: String(parsed.content || parsed.message || parsed.text || '').trim() }].filter(item => item.content);
    return {
      reactionDelay: Number(parsed.reactionDelay || 0),
      messages: normalizedMessages,
      newMemory: typeof parsed.newMemory === 'string' ? parsed.newMemory : undefined
    };
  }
  const looksLikeBrokenJson = /^[`'\s]*(json)?\s*[\{\[]/i.test(trimmed) || /reactionDelay|\"messages\"|```json/i.test(trimmed);
  return { reactionDelay: 0, messages: [{ content: looksLikeBrokenJson ? '응.' : trimmed || '응.' }] };
}

async function callGemini(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const endpoint = String(profile.apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = String(profile.apiModel || 'gemini-2.5-flash').replace(/^models\//, '');
  const response = await fetch(`${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      generationConfig: { maxOutputTokens: Number(profile.maxTokens || 700), temperature: Number(profile.temperature || 0.85) }
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
}

async function callOpenAI(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const endpoint = String(profile.apiEndpoint || 'https://api.openai.com/v1/responses');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: profile.apiModel || 'gpt-4.1-mini',
      input: messages,
      max_output_tokens: Number(profile.maxTokens || 700),
      temperature: Number(profile.temperature || 0.85)
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  return data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((item: { text?: string }) => item.text || '').join('') || '';
}

async function callAnthropic(profile: ApiProfile, key: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.find(message => message.role === 'system')?.content || '';
  const bodyMessages = messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
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
  if (state.config.apiType === 'gemini' || state.config.apiType === 'vertex') return callGemini(profile, key, messages);
  if (state.config.apiType === 'openai') return callOpenAI(profile, key, messages);
  if (state.config.apiType === 'anthropic') return callAnthropic(profile, key, messages);
  if (state.config.apiType === 'custom') return callOpenAI(profile, key, messages);
  throw new Error('RisuAI provider는 단독 RN 앱에서 직접 호출할 수 없습니다. Gemini/OpenAI/Anthropic/Custom API를 설정하세요.');
}

export async function callLLM(state: SNSGodState, messages: ChatMessage[]): Promise<{ reply: LLMReply; keyIndex: number }> {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const keys = apiKeys(profile);
  if (!keys.length) throw new Error('API 키가 없습니다. 설정에서 API 키를 입력하세요.');
  const start = Math.max(0, Math.min(keys.length - 1, Number(profile.apiKeyIndex || 0)));
  const errors: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (start + offset) % keys.length;
    try {
      const text = await callWithProvider(state, profile, keys[index], messages);
      return { reply: parseJsonish(text), keyIndex: index };
    } catch (error) {
      errors.push(`키 ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`API 호출에 실패했습니다.\n${errors.join('\n')}`);
}

export async function callLLMText(state: SNSGodState, messages: ChatMessage[]): Promise<{ text: string; keyIndex: number }> {
  const profile = state.config.apiProfiles[state.config.apiType] || {};
  const keys = apiKeys(profile);
  if (!keys.length) throw new Error('API 키가 없습니다. 설정에서 API 키를 입력하세요.');
  const start = Math.max(0, Math.min(keys.length - 1, Number(profile.apiKeyIndex || 0)));
  const errors: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (start + offset) % keys.length;
    try {
      const text = await callWithProvider(state, profile, keys[index], messages);
      return { text, keyIndex: index };
    } catch (error) {
      errors.push(`키 ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`API 호출에 실패했습니다.\n${errors.join('\n')}`);
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

function imagePromptFor(config: ImageGenerationConfig, character: SNSGodCharacter | undefined, prompt: string): string {
  const prefix = config.promptPrefix || 'Create a realistic in-character phone photo. Natural lighting, casual composition, no text overlay.';
  const profile = character?.prompt ? `Character profile: ${character.prompt}` : '';
  const name = character?.name ? `Character name: ${character.name}` : '';
  const nsfw = config.nsfw ? 'NSFW/private fictional image is allowed when appropriate.' : 'Keep it safe and non-explicit.';
  return [prefix, name, profile, nsfw, `Requested image: ${prompt}`, config.negativePrompt ? `Avoid: ${config.negativePrompt}` : ''].filter(Boolean).join('\n');
}

export async function generateImageDataUri(state: SNSGodState, prompt: string, character?: SNSGodCharacter): Promise<string> {
  const config = state.config.imageGeneration || {};
  if (config.enabled === false) throw new Error('이미지 생성 설정이 꺼져 있습니다.');
  const openAiProfile = state.config.apiProfiles.openai || {};
  const apiKey = String(config.apiKey || openAiProfile.apiKey || '').trim();
  if (!apiKey) throw new Error('이미지 생성 API 키가 비어 있습니다. 설정 > 이미지 생성에서 키를 입력하세요.');
  const endpoint = String(config.apiEndpoint || 'https://api.openai.com/v1/responses');
  const model = String(config.apiModel || 'gpt-5');
  const tool: Record<string, unknown> = { type: 'image_generation' };
  if (config.size) tool.size = config.size;
  if (config.quality) tool.quality = config.quality;
  const body = endpoint.includes('/images/generations')
    ? { model, prompt: imagePromptFor(config, character, prompt), size: config.size || '1024x1024', response_format: 'b64_json' }
    : { model, input: imagePromptFor(config, character, prompt), tools: [tool], tool_choice: { type: 'image_generation' } };
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
