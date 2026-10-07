import type { AIProvider, Placement, ProposedSection, Related, Theme } from './types';
import type { ContentItem, ContentType } from '../domain/types';
import { THEME_LEXICON, TYPE_SECTION_HINTS } from './lexicon';
import { buildIndex, mostSimilar, sharedWords, similarity, type SimilarityIndex } from '../domain/similarity';
import { displayTitle, keywords, stem, wordCount } from '../domain/text';
import { TYPE_LABEL } from '../domain/constants';

function lexiconHit(word: string, entry: string): boolean {
  return word === entry || (entry.length >= 5 && word.startsWith(entry));
}

/** Theme names whose lexicon appears in the text, strongest first. */
function lexiconThemes(text: string): string[] {
  const words = keywords(text);
  const scores: [string, number][] = [];
  for (const [theme, entries] of Object.entries(THEME_LEXICON)) {
    let s = 0;
    for (const w of words) if (entries.some((e) => lexiconHit(w, e))) s++;
    if (s) scores.push([theme, s]);
  }
  return scores.sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// Index caching: rebuilding is cheap but not free for big libraries.
let cachedIndex: { key: string; index: SimilarityIndex } | null = null;
function indexFor(items: ContentItem[]): SimilarityIndex {
  const key = items.length + ':' + items.reduce((m, i) => Math.max(m, i.updatedAt), 0);
  if (cachedIndex?.key !== key) cachedIndex = { key, index: buildIndex(items) };
  return cachedIndex.index;
}

function live(items: ContentItem[]) {
  return items.filter((i) => !i.deletedAt);
}

/**
 * Deterministic, offline "assistant". It is intentionally modest: it notices
 * words, tags and shapes, and asks questions — it never writes on your behalf.
 */
export const localProvider: AIProvider = {
  id: 'local',
  label: 'On-device suggestions',
  remote: false,

  async suggestTags(item, ctx) {
    const text = `${item.title}\n${item.body}`;
    const words = new Set(keywords(text));
    const existing = new Set(item.tagIds.map((id) => ctx.tagName.get(id)));
    const out: string[] = [];
    // Tags the writer already uses elsewhere and that appear in this text.
    for (const name of new Set(ctx.tagName.values())) {
      if (existing.has(name)) continue;
      if (words.has(stem(name)) || words.has(name)) out.push(name);
    }
    for (const t of lexiconThemes(text)) if (!existing.has(t) && !out.includes(t)) out.push(t);
    return out.slice(0, 6);
  },

  async classifyContent(item) {
    const body = item.body.trim();
    const lines = body.split('\n').filter((l) => l.trim());
    const words = wordCount(body);
    const avgLine = lines.length ? words / lines.length : words;
    const lower = body.toLowerCase();
    if (/^["“].+["”]\s*\n?\s*[—–-]\s*\S/s.test(body)) return 'quote';
    if (/^(write about|journal|describe|what|when|where|how|who|why|imagine|list)\b/i.test(lower) && body.includes('?'))
      return 'prompt';
    if (/\b(light a candle|place your|breathe in|close your eyes|sit with|repeat|step \d|begin by)\b/i.test(lower))
      return 'ritual';
    if (/^(idea|what if|concept)\b/i.test(lower)) return 'idea';
    if (words <= 25 && lines.length <= 2) return 'fragment';
    if (lines.length >= 3 && avgLine <= 9) return 'poem';
    if (/\b(you must|practice|the teaching|remember that|we learn|this means)\b/i.test(lower)) return 'teaching';
    if (/\b(once upon|she said|he said|they said|years later)\b/i.test(lower)) return 'story';
    if (/\b(source|according to|study|research|citation|https?:\/\/)\b/i.test(lower)) return 'research';
    if (/\b(i feel|i felt|i notice|i wonder|i think|i remember|lately)\b/i.test(lower)) return 'reflection';
    return words > 120 ? 'reflection' : 'note';
  },

  async findRelatedContent(item, ctx) {
    const pool = live(ctx.items);
    const index = indexFor(pool.some((p) => p.id === item.id) ? pool : [...pool, item]);
    return mostSimilar(index, item.id, pool.map((p) => p.id), 6).map(({ id, score }): Related => {
      const other = pool.find((p) => p.id === id)!;
      const sharedTags = item.tagIds.filter((t) => other.tagIds.includes(t)).map((t) => '#' + ctx.tagName.get(t));
      const words = sharedWords(index, item.id, id);
      const reason = sharedTags.length
        ? `Shares ${sharedTags.slice(0, 3).join(' ')}`
        : words.length
          ? `Both speak of “${words.join('”, “')}”`
          : 'Similar language';
      return { id, score, reason };
    });
  },

  async suggestBookPlacement(item, ctx) {
    const pool = live(ctx.items);
    const index = indexFor(pool.some((p) => p.id === item.id) ? pool : [...pool, item]);
    const out: Placement[] = [];
    for (const { book, sections, entries } of ctx.books) {
      if (book.archived) continue;
      if (entries.some((e) => e.contentId === item.id)) continue;
      const ids = entries.map((e) => e.contentId);
      if (!ids.length && !sections.length) continue;
      const scores = ids.map((id) => ({ id, s: index.profiles.has(id) ? similarity(index, item.id, id) : 0 }));
      scores.sort((a, b) => b.s - a.s);
      const top = scores.slice(0, 3);
      const affinity = top.length ? top.reduce((m, x) => m + x.s, 0) / top.length : 0;
      // Section: where its nearest neighbour lives, else a section whose name fits the type.
      let sectionId: string | null = null;
      let reason = '';
      const nearest = top[0] && top[0].s > 0.08 ? entries.find((e) => e.contentId === top[0].id) : undefined;
      if (nearest?.sectionId) {
        sectionId = nearest.sectionId;
        const other = pool.find((p) => p.id === nearest.contentId);
        reason = other ? `Near “${displayTitle(other)}”` : 'Near related material';
      }
      const hints = TYPE_SECTION_HINTS[item.type] ?? [];
      const typeSection = sections.find((s) => hints.includes(s.title.toLowerCase()));
      if (!sectionId && typeSection) {
        sectionId = typeSection.id;
        reason = `${TYPE_LABEL[item.type]}s often live in “${typeSection.title}”`;
      }
      const score = affinity + (typeSection ? 0.05 : 0);
      if (score < 0.06) continue;
      out.push({ bookId: book.id, sectionId, reason: reason || 'Shares themes with this book', score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  },

  async detectThemes(items, ctx) {
    const pool = live(items);
    const byTag = new Map<string, string[]>();
    for (const i of pool) for (const t of i.tagIds) byTag.set(t, [...(byTag.get(t) ?? []), i.id]);
    const themes: Theme[] = [...byTag.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .map(([t, ids]) => ({ theme: '#' + (ctx.tagName.get(t) ?? t), itemIds: ids }));
    // Untagged material: group by lexicon themes.
    const byLex = new Map<string, string[]>();
    for (const i of pool) {
      const top = lexiconThemes(`${i.title} ${i.body}`)[0];
      if (top) byLex.set(top, [...(byLex.get(top) ?? []), i.id]);
    }
    for (const [t, ids] of byLex) {
      if (ids.length < 2 || themes.some((th) => th.theme === '#' + t)) continue;
      themes.push({ theme: t, itemIds: ids });
    }
    return themes.sort((a, b) => b.itemIds.length - a.itemIds.length).slice(0, 12);
  },

  async suggestDevelopment(item) {
    const words = keywords(item.body);
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const anchor = key ? `“${key}”` : 'this';
    const lines = item.body.split('\n').filter((l) => l.trim());
    const last = lines[lines.length - 1]?.trim();
    const out: string[] = [];
    if (item.status === 'seed') {
      out.push(`What is the image underneath ${anchor}? Write three lines that only show it, without explaining.`);
      out.push(`Who is speaking here, and to whom? Try it again addressed to someone specific.`);
    }
    if (item.type === 'poem' || item.type === 'fragment') {
      out.push(`Read the last line aloud${last ? ` (“${last.slice(0, 50)}”)` : ''}. Does it open or close? Try one ending that does the opposite.`);
      out.push(`Which word is doing the least work? Remove it and see what the line wants instead.`);
    } else if (item.type === 'reflection' || item.type === 'teaching') {
      out.push(`What would someone who disagrees say? Let them speak for a paragraph.`);
      out.push(`Find the one sentence that holds the whole piece. Could it be the opening?`);
    } else if (item.type === 'idea') {
      out.push(`What would this look like as a poem, a prompt and a ritual? Sketch each in two lines.`);
    } else if (item.type === 'prompt') {
      out.push(`Answer your own prompt for five minutes. What surprised you?`);
    }
    out.push(`Where else in your library does ${anchor} appear? Gather those pieces side by side.`);
    return out.slice(0, 4);
  },

  async suggestStructure(items, ctx) {
    const pool = live(items);
    const groups = new Map<string, string[]>();
    for (const i of pool) {
      const tag = i.tagIds.map((t) => ctx.tagName.get(t)).find(Boolean);
      const key = tag ? capitalise(tag) : TYPE_LABEL[i.type] + 's';
      groups.set(key, [...(groups.get(key) ?? []), i.id]);
    }
    const order = { polished: 0, developing: 1, seed: 2 } as const;
    const byId = new Map(pool.map((p) => [p.id, p]));
    return [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([title, ids]): ProposedSection => ({
        title,
        itemIds: ids.sort((a, b) => order[byId.get(a)!.status] - order[byId.get(b)!.status]),
      }));
  },

  async detectRepetition(items) {
    const grams = new Map<string, Set<string>>();
    for (const i of live(items)) {
      const words = i.body.toLowerCase().match(/[\p{L}']+/gu) ?? [];
      for (let n = 0; n + 3 <= words.length; n++) {
        const g = words.slice(n, n + 3).join(' ');
        if (keywords(g).length < 2) continue;
        grams.set(g, (grams.get(g) ?? new Set()).add(i.id));
      }
    }
    return [...grams.entries()]
      .filter(([, ids]) => ids.size >= 2)
      .map(([phrase, ids]) => ({ phrase, itemIds: [...ids] }))
      .sort((a, b) => b.itemIds.length - a.itemIds.length)
      .slice(0, 10);
  },

  async refine(item) {
    // Offline mode never rewrites; it offers observations instead.
    const notes: string[] = [];
    const words = item.body.toLowerCase().match(/[\p{L}']+/gu) ?? [];
    const counts = new Map<string, number>();
    for (const w of words) if (w.length > 3) counts.set(w, (counts.get(w) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, c]) => c >= 3).map(([w]) => `“${w}”`);
    if (repeated.length) notes.push(`Repeated words: ${repeated.slice(0, 5).join(', ')}. Intentional echo, or habit?`);
    const adverbs = [...new Set(words.filter((w) => w.length > 5 && w.endsWith('ly')))];
    if (adverbs.length >= 2) notes.push(`Adverbs to test: ${adverbs.slice(0, 5).join(', ')}.`);
    const long = item.body.split('\n').filter((l) => wordCount(l) > 18).length;
    if (long && item.type === 'poem') notes.push(`${long} long line${long > 1 ? 's' : ''} — would a break create breath?`);
    if (!notes.length) notes.push('Nothing obvious to flag. Try reading it aloud, slowly.');
    notes.push('Connect Claude in Settings to draft alternative versions (your original is never changed).');
    return { text: '', notes };
  },
};

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function typeIsValid(v: string): v is ContentType {
  return v in TYPE_LABEL;
}

