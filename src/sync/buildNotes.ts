// Edit notes → Notion. Pieces in your edit-notes category (a tag or a
// collection, chosen in Settings) are sent to the "Build Notes" database in
// Notion, filed under the "YOUrigin" project, where Claude reads them when
// building. It uses the YOU app's `send-build-note` function in the shared
// Supabase project, so it needs the same sign-in as sync.
//
// The piece's id is sent as the Entry ID, so sending it again updates the
// same Notion page (its Status and Claude's note are left alone).
import type { Collection, ContentItem, Tag } from '../domain/types';
import { getClient } from './supabase';

export const BUILD_NOTES_PROJECT = 'YOUrigin';

export interface EditCategory {
  kind: 'tag' | 'collection';
  id: string;
  name: string;
}

/** '' = find it by name, 'off' = never send, otherwise 'tag:<id>' or 'collection:<id>'. */
export type EditCategorySetting = string;

const looksLikeEdits = (name: string) => /edit/i.test(name);

/** The chosen category, or (unset) the first collection or tag with "edit" in its name. */
export function resolveEditCategory(setting: EditCategorySetting, tags: Tag[], collections: Collection[]): EditCategory | null {
  if (setting === 'off') return null;
  const [kind, id] = setting.split(':');
  if (kind === 'collection') {
    const c = collections.find((x) => x.id === id);
    if (c) return { kind, id, name: c.name };
  }
  if (kind === 'tag') {
    const t = tags.find((x) => x.id === id);
    if (t) return { kind, id, name: '#' + t.name };
  }
  const c = collections.find((x) => looksLikeEdits(x.name));
  if (c) return { kind: 'collection', id: c.id, name: c.name };
  const t = tags.find((x) => looksLikeEdits(x.name));
  if (t) return { kind: 'tag', id: t.id, name: '#' + t.name };
  return null;
}

export function isEditNote(item: ContentItem, cat: EditCategory | null, collections: Collection[]): boolean {
  if (!cat || item.deletedAt) return false;
  if (cat.kind === 'tag') return item.tagIds.includes(cat.id);
  return !!collections.find((c) => c.id === cat.id)?.contentIds.includes(item.id);
}

/** Title, writing and notes-to-self, as one note. The first line becomes the Notion title. */
export function noteText(item: Pick<ContentItem, 'title' | 'body' | 'notes'>): string {
  const parts = [item.title.trim(), item.body.trim()].filter(Boolean);
  if (item.notes.trim()) parts.push('Notes to self:\n' + item.notes.trim());
  return parts.join('\n\n');
}

// What was last sent from this device, so unchanged pieces aren't re-sent.
// A convenience only: losing it just means a harmless re-send.
interface Sent {
  text: string;
  url?: string;
  at: number;
}
const sentKey = (id: string) => `yourigin.buildNote.${id}`;

export function lastSent(id: string): Sent | null {
  try {
    const raw = localStorage.getItem(sentKey(id));
    return raw ? (JSON.parse(raw) as Sent) : null;
  } catch {
    return null;
  }
}

function remember(id: string, sent: Sent) {
  try {
    localStorage.setItem(sentKey(id), JSON.stringify(sent));
  } catch {
    /* private window or storage blocked */
  }
}

export function needsSending(item: ContentItem): boolean {
  const text = noteText(item);
  return !!text && lastSent(item.id)?.text !== text;
}

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function isSignedIn(): Promise<boolean> {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  return !!data.session;
}

/** Sends (or updates) one piece in Notion. Returns the Notion page link. */
export async function sendEditNote(item: ContentItem): Promise<string | undefined> {
  const text = noteText(item);
  if (!text) throw new Error('This piece is empty.');
  if (!navigator.onLine) throw new Error('You’re offline. It will send when you’re back online.');
  const client = await getClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session) throw new Error('Sign in under Settings → Sync to send edit notes to Notion.');
  const { data, error } = await client.functions.invoke('send-build-note', {
    body: { text, project: BUILD_NOTES_PROJECT, source: 'Quick note', entryId: item.id, date: localDate(item.createdAt) },
  });
  if (error) {
    let message = 'Couldn’t send the note to Notion just now.';
    try {
      message = (await error.context.json()).error || message;
    } catch {
      /* keep the default */
    }
    throw new Error(message);
  }
  const url = (data as { url?: string } | null)?.url;
  remember(item.id, { text, url, at: Date.now() });
  return url;
}
