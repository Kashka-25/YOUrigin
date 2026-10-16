import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLibrary } from '../hooks/useLibrary';
import { useBookOrder } from '../components/book/ContentsList';
import { setSetting, useSettings } from '../db/settings';
import { snapshotRevision, updateContent } from '../db/content';
import { useToast } from '../components/Toast';
import { EmptyState, Spinner } from '../components/ui';
import { displayTitle } from '../domain/text';
import { findMisspellings, loadSpeller, type Speller } from '../words/spell';
import { isSpellingPack, wordsDb } from '../words/store';
import { matchCase } from '../words/morph';
import type { ContentItem } from '../domain/types';

type Hit = { item: ContentItem; field: 'title' | 'body'; start: number; end: number; text: string };
type Group = { key: string; hits: Hit[] };
const PAGE = 25;

/** Spell check a whole project, collection, piece or the library at once. */
export function Spelling() {
  const lib = useLibrary();
  const settings = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const scope = params.get('in') ?? 'all';
  const order = useBookOrder(scope.startsWith('book:') ? scope.slice(5) : null);
  const pack = useLiveQuery(async () => (await wordsDb.packs.toArray()).find((p) => isSpellingPack(p.id)) ?? null, []);
  const own = useMemo(() => settings?.spellingWords ?? [], [settings?.spellingWords]);
  const [loaded, setLoaded] = useState<{ key: string; speller: Speller | null } | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const loadKey = `${pack?.id}:${pack?.installedAt}:${own.join('\n')}`;

  useEffect(() => {
    let live = true;
    if (pack !== undefined) void loadSpeller(own).then((speller) => live && setLoaded({ key: loadKey, speller }));
    return () => {
      live = false;
    };
  }, [pack, own, loadKey]);
  const speller = loaded?.key === loadKey ? loaded.speller : undefined;

  const items = useMemo<ContentItem[]>(() => {
    if (!lib) return [];
    const [kind, id] = scope.split(':');
    if (kind === 'book') return order ? [...order.flat, ...order.tray] : [];
    if (kind === 'collection') {
      const c = lib.collections.find((x) => x.id === id);
      return (c?.contentIds ?? []).map((cid) => lib.contentById.get(cid)).filter((x): x is ContentItem => !!x && !x.deletedAt);
    }
    if (kind === 'piece') return [lib.contentById.get(id)].filter((x): x is ContentItem => !!x);
    return lib.items;
  }, [lib, scope, order]);

  const groups = useMemo<Group[]>(() => {
    if (!speller) return [];
    const byWord = new Map<string, Hit[]>();
    for (const item of items) {
      for (const field of ['title', 'body'] as const) {
        for (const m of findMisspellings(item[field], speller)) {
          const key = m.word.replace(/’/g, "'").toLowerCase();
          if (ignored.has(key)) continue;
          const list = byWord.get(key) ?? [];
          list.push({ item, field, start: m.start, end: m.end, text: m.word });
          byWord.set(key, list);
        }
      }
    }
    return [...byWord].map(([key, hits]) => ({ key, hits }));
  }, [items, speller, ignored]);

  if (!lib || !settings || pack === undefined) return <Spinner />;

  const replaceAll = async (g: Group, to: string) => {
    const before: { id: string; title: string; body: string }[] = [];
    const byItem = new Map<string, Hit[]>();
    for (const h of g.hits) byItem.set(h.item.id, [...(byItem.get(h.item.id) ?? []), h]);
    let n = 0;
    for (const [id, hits] of byItem) {
      const item = lib.contentById.get(id);
      if (!item) continue;
      const patch = { title: item.title, body: item.body };
      for (const h of [...hits].sort((a, b) => b.start - a.start)) {
        const text = patch[h.field];
        if (text.slice(h.start, h.end) !== h.text) continue;
        patch[h.field] = text.slice(0, h.start) + matchCase(h.text, to) + text.slice(h.end);
        n++;
      }
      before.push({ id, title: item.title, body: item.body });
      await snapshotRevision(id);
      await updateContent(id, patch);
    }
    toast(`${g.hits[0].text} → ${to}${n > 1 ? ` (${n})` : ''}`, {
      undo: async () => {
        for (const b of before) await updateContent(b.id, { title: b.title, body: b.body });
      },
    });
  };

  const addWord = async (word: string) => {
    await setSetting('spellingWords', [...own, word]);
    toast(`Added “${word}”`, { undo: () => setSetting('spellingWords', own) });
  };

  const choose = (v: string) => {
    setShown(PAGE);
    setParams(v === 'all' ? {} : { in: v }, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-12">
      <h1 className="page-title">Spelling</h1>
      <label className="label mt-6" htmlFor="spell-in">
        Check
      </label>
      <select id="spell-in" className="input" value={scope} onChange={(e) => choose(e.target.value)}>
        <option value="all">All pieces</option>
        {scope.startsWith('piece:') && <option value={scope}>{items[0] ? displayTitle(items[0]) : 'This piece'}</option>}
        {lib.books.length > 0 && (
          <optgroup label="Projects">
            {lib.books.map((b) => (
              <option key={b.id} value={`book:${b.id}`}>
                {b.title}
              </option>
            ))}
          </optgroup>
        )}
        {lib.collections.length > 0 && (
          <optgroup label="Collections">
            {lib.collections.map((c) => (
              <option key={c.id} value={`collection:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {!pack ? (
        <EmptyState title="No spelling pack yet" action={<Link to="/settings" className="btn-primary">Download one in Settings</Link>}>
          US or UK English, under half a megabyte, works offline.
        </EmptyState>
      ) : speller === undefined ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <p className="mt-8 text-[15px] text-polished">No spelling mistakes found.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {groups.length} to check · {pack.id === 'en-gb-spelling' ? 'UK' : 'US'} spelling
          </p>
          <ul className="mt-3 space-y-3 pb-10">
            {groups.slice(0, shown).map((g) => (
              <GroupCard
                key={g.key}
                g={g}
                speller={speller!}
                named={items.length > 1}
                onReplace={(to) => void replaceAll(g, to)}
                onIgnore={() => setIgnored((s) => new Set(s).add(g.key))}
                onAdd={() => void addWord(g.hits[0].text)}
              />
            ))}
          </ul>
          {groups.length > shown && (
            <button type="button" className="btn mb-10" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({groups.length - shown})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function GroupCard({
  g,
  speller,
  named,
  onReplace,
  onIgnore,
  onAdd,
}: {
  g: Group;
  speller: Speller;
  named: boolean;
  onReplace: (to: string) => void;
  onIgnore: () => void;
  onAdd: () => void;
}) {
  const suggestions = useMemo(() => speller.suggest(g.key), [speller, g.key]);
  const pieces = new Set(g.hits.map((h) => h.item.id)).size;
  return (
    <li className="panel p-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-serif text-xl text-ink underline decoration-seed decoration-wavy underline-offset-4">{g.hits[0].text}</span>
        <span className="text-xs text-muted">
          {g.hits.length > 1 ? `${g.hits.length} times` : 'once'}
          {pieces > 1 ? ` in ${pieces} pieces` : ''}
        </span>
      </p>
      <ul className="mt-2 space-y-1">
        {g.hits.slice(0, 3).map((h, i) => {
          const text = h.item[h.field];
          const a = Math.max(0, h.start - 40);
          const b = Math.min(text.length, h.end + 40);
          return (
            <li key={i} className="text-sm leading-relaxed text-ink-2">
              <Link to={`/item/${h.item.id}${h.field === 'body' ? `?sel=${h.start}-${h.end}` : ''}`} className="hover:text-ink">
                {named && <span className="text-muted">{short(displayTitle(h.item))}: </span>}
                {a > 0 && '…'}
                {text.slice(a, h.start)}
                <mark className="rounded bg-seed-bg px-0.5 text-ink">{text.slice(h.start, h.end)}</mark>
                {text.slice(h.end, b)}
                {b < text.length && '…'}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {suggestions.length ? (
          suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-line px-2.5 py-0.5 text-sm text-ink hover:border-accent hover:bg-paper-2"
              onClick={() => onReplace(s)}
              title={g.hits.length > 1 ? `Change all ${g.hits.length}` : undefined}
            >
              {s}
            </button>
          ))
        ) : (
          <span className="text-sm text-muted">No suggestions</span>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn-ghost text-xs" onClick={onIgnore}>
            Ignore
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={onAdd}>
            Add to dictionary
          </button>
        </span>
      </div>
    </li>
  );
}

const short = (t: string) => (t.length > 32 ? t.slice(0, 30).trimEnd() + '…' : t);
