import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTransport } from './supabase';
import type { RemoteRow } from './engine';

/**
 * A stand-in for Supabase's records table that, like the real database, cancels
 * a query asking for too much content at once.
 */
function fakeServer(rows: RemoteRow[], maxCharsPerQuery: number) {
  const queries: { cols: string; rows: number; timedOut: boolean }[] = [];
  const client = {
    from: () => {
      let cols = '';
      const filters: ((r: RemoteRow) => boolean)[] = [];
      let limit = Infinity;
      const q = {
        select(c: string) {
          cols = c;
          return q;
        },
        gt(col: 'rev', v: number) {
          filters.push((r) => r[col] > v);
          return q;
        },
        gte(col: 'rev', v: number) {
          filters.push((r) => r[col] >= v);
          return q;
        },
        lte(col: 'rev', v: number) {
          filters.push((r) => r[col] <= v);
          return q;
        },
        order() {
          return q;
        },
        limit(n: number) {
          limit = n;
          return q;
        },
        then(resolve: (v: { data: unknown; error: unknown }) => void) {
          const found = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => a.rev - b.rev).slice(0, limit);
          const picked = found.map((r) => Object.fromEntries(cols.split(',').map((k) => [k, r[k as keyof RemoteRow]])));
          const chars = cols.includes('payload') ? found.reduce((n, r) => n + (r.payload?.length ?? 0), 0) : 0;
          const timedOut = chars > maxCharsPerQuery;
          queries.push({ cols, rows: found.length, timedOut });
          resolve(timedOut ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: picked, error: null });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, queries };
}

const row = (rev: number, tbl: string, size: number, deleted = false): RemoteRow => ({
  tbl,
  id: `${tbl}-${rev}`,
  updated_at: rev,
  deleted,
  payload: deleted ? null : 'x'.repeat(size),
  iv: deleted ? null : 'iv',
  rev,
});

describe('pulling without timing out', () => {
  // 30 pictures of ~1.3 MB each, between small records and a deletion.
  const rows: RemoteRow[] = [];
  let rev = 0;
  for (let i = 0; i < 30; i++) {
    rows.push(row(++rev, 'assets', 1_300_000));
    rows.push(row(++rev, 'content', 2_000));
  }
  rows.push(row(rev + 1, 'posts', 0, true));

  it('asks for the list without content, then content in groups small enough for the database', async () => {
    const { client, queries } = fakeServer(rows, 8_000_000);
    const page = await new SupabaseTransport(client).pull(0, 500);
    expect(queries[0].cols).not.toContain('payload');
    expect(queries.filter((q) => q.timedOut)).toEqual([]);
    expect(queries.slice(1).every((q) => q.cols === 'rev,payload')).toBe(true);
    // the old single query would have asked for ~39 MB at once and been cancelled
    expect(page.map((r) => r.rev)).toEqual(rows.slice(0, page.length).map((r) => r.rev));
    expect(page.every((r) => r.deleted || r.payload?.length)).toBe(true);
  });

  it('asks for at most two pictures at a time', async () => {
    const { client, queries } = fakeServer(rows, 2_700_000);
    const page = await new SupabaseTransport(client).pull(0, 500);
    expect(queries.filter((q) => q.timedOut)).toEqual([]);
    expect(page.filter((r) => r.tbl === 'assets').length).toBeGreaterThan(2);
  });

  it('halves a group that still times out', async () => {
    // pictures back to back, so two share a request, which this database can't manage in time
    const pictures = Array.from({ length: 6 }, (_, i) => row(i + 1, 'assets', 1_300_000));
    const { client, queries } = fakeServer(pictures, 2_000_000);
    const page = await new SupabaseTransport(client).pull(0, 500);
    expect(queries.some((q) => q.timedOut)).toBe(true);
    expect(page).toHaveLength(6);
    expect(page.length).toBeGreaterThan(0);
    expect(page.filter((r) => r.tbl === 'assets').every((r) => r.payload?.length === 1_300_000)).toBe(true);
  });

  it('keeps a page light, and the next page carries on from where it stopped', async () => {
    const { client } = fakeServer(rows, 8_000_000);
    const t = new SupabaseTransport(client);
    const seen: RemoteRow[] = [];
    let after = 0;
    for (;;) {
      const page = await t.pull(after, 500);
      if (!page.length) break;
      expect(page.reduce((n, r) => n + (r.payload?.length ?? 0), 0)).toBeLessThan(30_000_000);
      seen.push(...page);
      after = page[page.length - 1].rev;
    }
    expect(seen.map((r) => r.rev)).toEqual(rows.map((r) => r.rev));
    expect(seen.at(-1)).toMatchObject({ deleted: true, payload: null });
  });

  it('a record changed between the two steps is left for a later page', async () => {
    const live = [row(1, 'content', 10), row(2, 'content', 10)];
    const { client } = fakeServer(live, 1_000);
    const t = new SupabaseTransport(client);
    const realFrom = (client as unknown as { from: () => unknown }).from;
    let calls = 0;
    (client as unknown as { from: () => unknown }).from = () => {
      // after the list is read, record 2 is edited again and moves to revision 3
      if (calls++ === 1) live[1] = { ...live[1], rev: 3 };
      return realFrom();
    };
    expect((await t.pull(0, 500)).map((r) => r.rev)).toEqual([1]);
    expect((await t.pull(1, 500)).map((r) => r.rev)).toEqual([3]);
  });
});
