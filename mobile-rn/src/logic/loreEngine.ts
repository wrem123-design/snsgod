import { LoreEntry, SNSGodRoom, SNSGodState } from '../types';
import { makeId } from './ids';

export type LoreResolveOptions = {
  room: SNSGodRoom;
  characterId?: string;
  text: string;
  limit?: number;
};

function normalizeKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return [];
}

export function normalizeLoreEntry(entry: Partial<LoreEntry>): LoreEntry {
  return {
    id: String(entry.id || makeId('lore')),
    title: String(entry.title || '로어'),
    keys: normalizeKeys(entry.keys),
    secondKeys: normalizeKeys(entry.secondKeys),
    content: String(entry.content || ''),
    enabled: entry.enabled !== false,
    alwaysActive: entry.alwaysActive === true,
    regex: entry.regex === true,
    selective: entry.selective === true,
    insertOrder: Number.isFinite(Number(entry.insertOrder ?? entry.priority)) ? Number(entry.insertOrder ?? entry.priority) : 100,
    priority: Number.isFinite(Number(entry.priority ?? entry.insertOrder)) ? Number(entry.priority ?? entry.insertOrder) : 100,
    folderId: entry.folderId ? String(entry.folderId) : undefined,
    dailyMemory: entry.dailyMemory === true,
    dateKey: entry.dateKey ? String(entry.dateKey) : undefined,
    characterId: entry.characterId ? String(entry.characterId) : undefined,
    roomId: entry.roomId ? String(entry.roomId) : undefined
  };
}

export function normalizeLoreEntries(state: SNSGodState): SNSGodState {
  return {
    ...state,
    loreEntries: (state.loreEntries || [])
      .map(entry => normalizeLoreEntry(entry))
      .filter(entry => entry.content.trim())
      .slice(-300)
  };
}

function matchesKey(text: string, key: string, regex?: boolean): boolean {
  if (!key) return false;
  if (!regex) return text.includes(key.toLowerCase());
  try {
    return new RegExp(key, 'iu').test(text);
  } catch {
    return false;
  }
}

function scopeMatches(entry: LoreEntry, room: SNSGodRoom, characterId?: string): boolean {
  if (entry.roomId && entry.roomId !== room.id) return false;
  if (entry.characterId && entry.characterId !== (characterId || room.characterId)) return false;
  return true;
}

export function resolveActiveLore(state: SNSGodState, options: LoreResolveOptions): LoreEntry[] {
  const haystack = String(options.text || '').toLowerCase();
  const limit = Math.max(1, options.limit || 8);
  return (state.loreEntries || [])
    .map(entry => normalizeLoreEntry(entry))
    .filter(entry => {
      if (entry.enabled === false || !scopeMatches(entry, options.room, options.characterId)) return false;
      if (entry.alwaysActive) return true;
      const firstHit = (entry.keys || []).some(key => matchesKey(haystack, key, entry.regex));
      if (!firstHit) return false;
      if (!entry.selective) return true;
      const secondKeys = entry.secondKeys || [];
      if (!secondKeys.length) return true;
      return secondKeys.some(key => matchesKey(haystack, key, entry.regex));
    })
    .sort((a, b) => Number(b.insertOrder || 0) - Number(a.insertOrder || 0))
    .slice(0, limit);
}

export function lorePromptBlock(entries: LoreEntry[]): string {
  if (!entries.length) return '';
  return entries.map(entry => `- ${entry.title}: ${entry.content}`).join('\n');
}

export function importRisuLorebook(payload: unknown): LoreEntry[] {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const entries = Array.isArray(source.entries)
    ? source.entries
    : Array.isArray(source.data)
      ? source.data
      : Array.isArray(payload)
        ? payload
        : [];
  return entries.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return normalizeLoreEntry({
      id: String(item.id || item.uid || makeId('lore')),
      title: String(item.comment || item.name || item.title || `Risu Lore ${index + 1}`),
      keys: normalizeKeys(item.key || item.keys),
      secondKeys: normalizeKeys(item.secondkey || item.secondKeys),
      content: String(item.content || item.value || ''),
      enabled: item.enabled !== false,
      alwaysActive: item.alwaysActive === true || item.constant === true,
      regex: item.regex === true,
      selective: item.selective === true,
      insertOrder: Number(item.insertorder ?? item.insertOrder ?? item.priority ?? 100)
    });
  }).filter(entry => entry.content.trim());
}

export function exportRisuLorebook(entries: LoreEntry[]) {
  return {
    type: 'risu-lorebook',
    entries: entries.map(entry => ({
      id: entry.id,
      comment: entry.title,
      key: entry.keys || [],
      secondkey: entry.secondKeys || [],
      content: entry.content,
      enabled: entry.enabled !== false,
      constant: entry.alwaysActive === true,
      regex: entry.regex === true,
      selective: entry.selective === true,
      insertorder: entry.insertOrder || entry.priority || 100
    }))
  };
}
