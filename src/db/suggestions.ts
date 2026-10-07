import { db } from './db';
import { ensureTags } from './tags';
import type { ContentType, SuggestionKind } from '../domain/types';
import { newId, normaliseTagName } from '../domain/text';

/**
 * Records AI suggestions as *pending*. They are never applied automatically —
 * the user accepts or dismisses each one. Values already present on the piece,
 * or previously dismissed for it, are skipped.
 */
export async function recordSuggestions(
  contentId: string,
  kind: SuggestionKind,
  values: string[],
  provider: string,
): Promise<void> {
  await db.transaction('rw', db.suggestions, db.content, db.tags, async () => {
    const item = await db.content.get(contentId);
    if (!item) return;
    const previous = await db.suggestions.where('contentId').equals(contentId).toArray();
    const seen = new Set(previous.filter((s) => s.kind === kind).map((s) => s.value));
    let skip = new Set<string>();
    if (kind === 'tags') {
      const names = (await db.tags.bulkGet(item.tagIds)).map((t) => t?.name);
      skip = new Set(names.filter((n): n is string => !!n));
    } else if (kind === 'type') {
      skip = new Set([item.type]);
    }
    const now = Date.now();
    const fresh = [...new Set(values.map((v) => (kind === 'tags' ? normaliseTagName(v) : v)))]
      .filter((v) => v && !seen.has(v) && !skip.has(v))
      .map((value) => ({
        id: newId(),
        contentId,
        kind,
        value,
        state: 'pending' as const,
        provider,
        createdAt: now,
        updatedAt: now,
      }));
    if (fresh.length) await db.suggestions.bulkAdd(fresh);
  });
}

export async function acceptSuggestion(id: string): Promise<void> {
  await db.transaction('rw', db.suggestions, db.content, db.tags, async () => {
    const s = await db.suggestions.get(id);
    if (!s) return;
    const item = await db.content.get(s.contentId);
    if (!item) return;
    const now = Date.now();
    if (s.kind === 'tags') {
      const map = await ensureTags([s.value]);
      const tagId = map.get(s.value)!;
      await db.content.update(item.id, { tagIds: [...new Set([...item.tagIds, tagId])], updatedAt: now });
    } else if (s.kind === 'type') {
      await db.content.update(item.id, { type: s.value as ContentType, updatedAt: now });
    }
    await db.suggestions.update(id, { state: 'accepted', updatedAt: now });
  });
}

export async function dismissSuggestion(id: string): Promise<void> {
  await db.suggestions.update(id, { state: 'dismissed', updatedAt: Date.now() });
}

export async function dismissAllPending(contentId: string): Promise<void> {
  await db.suggestions
    .where('contentId')
    .equals(contentId)
    .filter((s) => s.state === 'pending')
    .modify({ state: 'dismissed', updatedAt: Date.now() });
}
