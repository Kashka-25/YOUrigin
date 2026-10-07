import { db } from './db';
import { createMany, purgeContent } from './content';
import { addToBook, createBook } from './books';
import { createCollection } from './collections';
import type { ContentType, Status } from '../domain/types';

const SAMPLES: { title?: string; body: string; type: ContentType; status: Status; tags: string[] }[] = [
  {
    title: 'The Shore',
    body: `The ocean doesn't ask the shore
for permission to leave.

It goes, and it returns,
and the shore is never the same shape twice.`,
    type: 'poem',
    status: 'polished',
    tags: ['water', 'surrender'],
  },
  { body: 'Sometimes grief is simply love looking for somewhere to go.', type: 'fragment', status: 'seed', tags: ['grief', 'love'] },
  {
    title: 'River Remembers',
    body: `The river remembers every stone
it has ever softened.
I want to be remembered like that —
not for the cutting, but for the smoothing.`,
    type: 'poem',
    status: 'developing',
    tags: ['water', 'memory'],
  },
  {
    title: 'Salt',
    body: `My mother kept salt by the door
for luck, for ghosts, for the sea
she left behind.`,
    type: 'poem',
    status: 'seed',
    tags: ['memory', 'water'],
  },
  {
    body: 'Write about a time you let something go before you were ready. What did your hands do afterwards?',
    type: 'prompt',
    status: 'polished',
    tags: ['surrender', 'grief'],
  },
  {
    title: 'Water ritual',
    body: `Fill a bowl with water.
Name one thing you are carrying.
Breathe on the surface until it trembles.
Pour it onto the earth and say: I don't need to hold this alone.`,
    type: 'ritual',
    status: 'developing',
    tags: ['water', 'surrender'],
  },
  {
    title: 'On softness',
    body: `Water teaches that softness is not weakness. It wears canyons out of mountains by refusing to stop moving. The lesson is not to be hard enough to resist, but fluid enough to continue.`,
    type: 'teaching',
    status: 'developing',
    tags: ['water', 'transformation'],
  },
  { body: 'what if the fire is not destroying the forest but finishing a sentence', type: 'idea', status: 'seed', tags: ['fire'] },
  {
    title: 'Ember',
    body: `Even the smallest ember
remembers it was once a sun.`,
    type: 'poem',
    status: 'polished',
    tags: ['fire', 'memory'],
  },
  {
    body: `I keep circling back to the idea that loss is a kind of shape. Not a hole — a shape. Something I can learn to hold.`,
    type: 'reflection',
    status: 'seed',
    tags: ['grief', 'loss'],
  },
];

const SAMPLE_KEY = 'sample';

export async function hasSample(): Promise<boolean> {
  return !!(await db.settings.get(SAMPLE_KEY));
}

/** Adds clearly-marked example material. Fully removable from Settings. */
export async function loadSample(): Promise<void> {
  if (await hasSample()) return;
  const ids = await createMany(
    SAMPLES.map((s) => ({ title: s.title, body: s.body, type: s.type, status: s.status, tagNames: s.tags, source: { kind: 'sample' } })),
  );
  const bookId = await createBook({
    title: 'YOU — Water',
    subtitle: 'A journal of surrender and flow',
    templateId: 'tpl-you-journal',
  });
  const sections = await db.sections.where('bookId').equals(bookId).sortBy('order');
  const byTitle = (t: string) => sections.find((s) => s.title === t)?.id ?? null;
  await addToBook(bookId, [ids[0]], byTitle('Opening'));
  await addToBook(bookId, [ids[6]], byTitle('Elemental Teaching'));
  await addToBook(bookId, [ids[4]], byTitle('Journal Prompts'));
  await addToBook(bookId, [ids[5]], byTitle('Ritual'));
  await addToBook(bookId, [ids[2]], null);
  const collectionId = await createCollection('Fire fragments', [ids[7], ids[8]]);
  await db.settings.put({ key: SAMPLE_KEY, value: { contentIds: ids, bookIds: [bookId], collectionIds: [collectionId] } });
}

export async function removeSample(): Promise<void> {
  const row = await db.settings.get(SAMPLE_KEY);
  if (!row) return;
  const v = row.value as { contentIds: string[]; bookIds: string[]; collectionIds: string[] };
  // Only remove sample pieces that are still marked as samples.
  const items = (await db.content.bulkGet(v.contentIds)).filter((i) => i?.source.kind === 'sample').map((i) => i!.id);
  await purgeContent(items);
  for (const bookId of v.bookIds) {
    await db.entries.where('bookId').equals(bookId).delete();
    await db.sections.where('bookId').equals(bookId).delete();
    await db.books.delete(bookId);
  }
  await db.collections.bulkDelete(v.collectionIds);
  await db.settings.delete(SAMPLE_KEY);
}
