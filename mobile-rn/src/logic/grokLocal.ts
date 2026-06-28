import { ImageGenerationConfig } from '../types';

export type GrokLocalStatus = {
  ok: boolean;
  hermesAuthenticated?: boolean;
  authFileExists?: boolean;
  tokenLabel?: string;
  tokenMessage?: string;
  models?: Record<string, string>;
  recentErrors?: unknown[];
};

export type GrokLocalAccount = {
  id?: string;
  name?: string;
  provider?: string;
  current?: boolean;
  label?: string;
  message?: string;
};

export type GrokBilling = {
  monthly_limit?: number;
  used?: number;
  remaining?: number;
  remaining_percent?: number;
  checked_at?: string;
};

export function grokBaseUrl(config?: ImageGenerationConfig): string {
  return String(config?.grokBaseUrl || 'http://127.0.0.1:5000').replace(/\/$/, '');
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: { message: text || `HTTP ${response.status}` } };
  }
}

async function grokFetch(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await readJson(response);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `Grok Local Studio ${response.status}`);
  return payload;
}

export async function fetchGrokStatus(baseUrl: string): Promise<GrokLocalStatus> {
  const payload = await grokFetch(baseUrl, '/api/settings');
  const hermes = payload.hermes_status || {};
  const token = payload.token_status || {};
  return {
    ok: true,
    hermesAuthenticated: payload.hermes_authenticated === true,
    authFileExists: hermes.auth_file_exists === true,
    tokenLabel: token.label || (payload.hermes_authenticated ? '정상' : '로그인 필요'),
    tokenMessage: token.message || '',
    models: payload.models || {},
    recentErrors: payload.recent_errors || []
  };
}

export async function fetchGrokBilling(baseUrl: string): Promise<GrokBilling> {
  const payload = await grokFetch(baseUrl, '/api/billing');
  return payload.billing || {};
}

export async function fetchGrokAccounts(baseUrl: string): Promise<GrokLocalAccount[]> {
  const payload = await grokFetch(baseUrl, '/api/hermes/accounts');
  return Array.isArray(payload.accounts) ? payload.accounts : [];
}

export async function startGrokLogin(baseUrl: string) {
  return grokFetch(baseUrl, '/api/hermes/login', { method: 'POST' });
}

export async function selectGrokOAuth(baseUrl: string) {
  return grokFetch(baseUrl, '/api/hermes/select', { method: 'POST' });
}

export async function logoutGrokOAuth(baseUrl: string) {
  return grokFetch(baseUrl, '/api/hermes/logout', { method: 'POST' });
}
