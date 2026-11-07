import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useLibrary } from '../hooks/useLibrary';
import { buildSnapshot, snapshotHash, type ItemProblem, type Portfolio, type PortfolioSnapshot, type PortfolioSources } from './model';
import type { ImageResolver } from './PortfolioView';

export interface BuiltPortfolio {
  sources: PortfolioSources;
  snapshot: PortfolioSnapshot;
  problems: ItemProblem[];
  hash: string;
  /** Shows this device's own copy of each picture (the preview). */
  resolveImage: ImageResolver;
}

export function usePortfolioSources(): PortfolioSources | undefined {
  const lib = useLibrary();
  return useMemo(
    () =>
      lib && {
        projects: new Map(lib.projects.map((p) => [p.id, p])),
        works: new Map(lib.books.map((b) => [b.id, b])),
        content: lib.contentById,
        sections: lib.sections,
        entries: lib.entries,
      },
    [lib],
  );
}

/** The snapshot a visitor would see right now, with this device's pictures for the preview. */
export function usePortfolioSnapshot(p: Portfolio | null | undefined): BuiltPortfolio | undefined {
  const sources = usePortfolioSources();
  const built = useMemo(() => (p && sources ? buildSnapshot(p, sources) : undefined), [p, sources]);
  const refs = useMemo(
    () => [...new Set(built?.snapshot.sections.flatMap((s) => s.items.map((i) => i.image?.ref)).filter((r): r is string => !!r) ?? [])],
    [built],
  );
  const urls = useLiveQuery(async () => {
    const assets = await db.assets.bulkGet(refs);
    return new Map(assets.filter((a) => !!a).map((a) => [a!.id, a!.dataUrl]));
  }, [refs.join('|')]);
  const resolveImage = useCallback<ImageResolver>((ref) => urls?.get(ref), [urls]);
  return useMemo(
    () => (built && sources ? { sources, ...built, hash: snapshotHash(built.snapshot), resolveImage } : undefined),
    [built, sources, resolveImage],
  );
}
