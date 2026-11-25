import { db } from './db';
import { createContent } from './content';
import { addToCollection, createCollection } from './collections';
import { getSettings, setSetting } from './settings';
import { resolveEditCategory, type EditCategory } from '../sync/buildNotes';

// Build notes: changes Cassidy wants made to YOUrigin itself, jotted from anywhere in the
// app. Each is an ordinary note in the edit-notes category (Settings → Edit notes → Notion),
// so it goes to Notion's Build Notes under YOUrigin the same way edit notes always have.

/** The collection made for build notes when no edit-notes home exists yet. */
export const BUILD_NOTES_HOME = 'YOUrigin build notes';

/** Where build notes live: the chosen edit-notes category, or a new collection (remembered). */
export async function buildNotesHome(): Promise<EditCategory> {
  const settings = await getSettings();
  const [tags, collections] = await Promise.all([db.tags.toArray(), db.collections.toArray()]);
  const found = resolveEditCategory(settings.editNotesCategory === 'off' ? '' : settings.editNotesCategory, tags, collections);
  if (found) return found;
  const existing = collections.find((c) => c.name === BUILD_NOTES_HOME);
  const id = existing?.id ?? (await createCollection(BUILD_NOTES_HOME, [], 'Changes to make to YOUrigin. They go to Build Notes in Notion.'));
  // Sending stays off if it was turned off; otherwise this becomes the edit-notes home.
  if (settings.editNotesCategory !== 'off') await setSetting('editNotesCategory', `collection:${id}`);
  return { kind: 'collection', id, name: BUILD_NOTES_HOME };
}

/** First line as the title (Notion's too), the rest as the words. */
export function splitNote(text: string): { title: string; body: string } {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const [first, ...rest] = clean.split('\n');
  return { title: first.trim(), body: rest.join('\n').trim() };
}

/**
 * Saves a build note, with the screen it was written on, and returns its id.
 * Blank text saves nothing (null).
 */
export async function addBuildNote(text: string, seenOn = ''): Promise<string | null> {
  const { title, body } = splitNote(text);
  if (!title) return null;
  const home = await buildNotesHome();
  const where = seenOn.trim();
  const id = await createContent({
    title,
    body,
    type: 'note',
    status: 'seed',
    notes: where ? `Seen on: ${where}` : '',
    ...(home.kind === 'tag' ? { tagNames: [home.name.replace(/^#/, '')] } : {}),
  });
  if (home.kind === 'collection') await addToCollection(home.id, [id]);
  return id;
}

/** A plain name for the screen at this app path, followed by the path itself. */
export function screenName(path: string): string {
  const p = path.replace(/^#/, '').split('?')[0] || '/';
  const names: [RegExp, string][] = [
    [/^\/$/, 'Capture'],
    [/^\/posts\/[^/]+$/, 'A post'],
    [/^\/posts/, 'Posts'],
    [/^\/projects\/[^/]+\/read/, 'Book · Read'],
    [/^\/projects\/[^/]+\/book\/[^/]+/, 'Book · writing page'],
    [/^\/projects\/[^/]+\/book/, 'Book · glossary'],
    [/^\/projects\/[^/]+\/print/, 'Book · Print / PDF'],
    [/^\/projects\/[^/]+\/cover/, 'Book · cover'],
    [/^\/projects\/[^/]+\/write/, 'Book · workspace'],
    [/^\/projects\/[^/]+/, 'A Work'],
    [/^\/initiatives?\b/, 'Creations'],
    [/^\/item\//, 'A piece'],
    [/^\/library/, 'All notes'],
    [/^\/universe/, 'My Universe'],
    [/^\/atlas/, 'Creation Atlas'],
    [/^\/collections?/, 'Collections'],
    [/^\/tags?/, 'Tags'],
    [/^\/orphans/, 'Unsorted'],
    [/^\/spelling/, 'Spelling'],
    [/^\/portfolios?/, 'Portfolios'],
    [/^\/settings/, 'Settings'],
    [/^\/trash/, 'Trash'],
  ];
  const name = names.find(([re]) => re.test(p))?.[1] ?? 'YOUrigin';
  return `${name} (${p})`;
}
