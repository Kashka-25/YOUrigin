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
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  defaultStatus: 'seed',
  defaultType: 'fragment',
  theme: 'system',
  aiProvider: 'local',
  claudeApiKey: '',
  claudeModel: 'claude-opus-5-5',
  captureDraft: '',
  lastBackupAt: null,
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
