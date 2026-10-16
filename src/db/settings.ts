import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ContentType, Status } from '../domain/types';

export interface Settings {
  onboarded: boolean;
  defaultStatus: Status;
  defaultType: ContentType;
  theme: 'system' | 'light' | 'dark';
  aiProvider: 'local' | 'claude';
  /** Stored only on this device; never included in backups. */
  claudeApiKey: string;
  claudeModel: string;
  captureDraft: string;
  lastBackupAt: number | null;
  /** Which tag or collection holds edit notes for Notion: '' = find by name, 'off', 'tag:<id>' or 'collection:<id>'. */
  editNotesCategory: string;
  /** Words the spell checker should accept (names, invented words). */
  spellingWords: string[];
  /** What you mainly make. Art puts the Gallery in the bottom bar. */
  craft: 'words' | 'art' | 'both';
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  defaultStatus: 'seed',
  defaultType: 'fragment',
  theme: 'dark',
  aiProvider: 'local',
  claudeApiKey: '',
  claudeModel: 'claude-opus-5-5',
  captureDraft: '',
  lastBackupAt: null,
  editNotesCategory: '',
  spellingWords: [],
  craft: 'words',
};

/** Keys that must never leave this device in an export. */
export const PRIVATE_SETTING_KEYS: (keyof Settings)[] = ['claudeApiKey', 'captureDraft'];

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value });
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}
