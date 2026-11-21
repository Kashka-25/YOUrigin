import { describe, expect, it } from 'vitest';
import { ancestorsOf, canMoveInto, childrenOf, descendantsOf, parentOf, pathLabel, topLevel, treeOrder } from './creations';

const p = (id: string, title: string, parentId?: string) => ({ id, title, parentId });
const world = [
  p('music', 'Lyrics & Music'),
  p('songs', 'Songs', 'music'),
  p('writing', 'Writing', 'songs'),
  p('finished', 'Finished', 'songs'),
  p('books', 'Books'),
  p('b1', 'Book 1', 'books'),
  p('orphan', 'Lost branch', 'deleted-elsewhere'),
];

describe('nested Creations', () => {
  it('finds the top level, including branches whose parent is gone', () => {
    expect(topLevel(world).map((x) => x.id)).toEqual(['music', 'books', 'orphan']);
  });

  it('finds children, descendants and the path', () => {
    expect(childrenOf(world, 'songs').map((x) => x.id)).toEqual(['writing', 'finished']);
    expect(descendantsOf(world, 'music').map((x) => x.id)).toEqual(['songs', 'writing', 'finished']);
    expect(ancestorsOf(world, 'writing').map((x) => x.id)).toEqual(['music', 'songs']);
    expect(parentOf(world, 'writing')?.id).toBe('songs');
    expect(pathLabel(world, 'writing')).toBe('Lyrics & Music › Songs › Writing');
  });

  it('never lets a Creation move inside itself or its own branches', () => {
    expect(canMoveInto(world, 'music', 'writing')).toBe(false);
    expect(canMoveInto(world, 'music', 'music')).toBe(false);
    expect(canMoveInto(world, 'b1', 'songs')).toBe(true);
    expect(canMoveInto(world, 'songs', null)).toBe(true);
    expect(canMoveInto(world, 'songs', 'nope')).toBe(false);
  });

  it('survives a loop (as sync could produce) without losing anything', () => {
    const loop = [p('a', 'A', 'b'), p('b', 'B', 'a'), p('c', 'C', 'a')];
    expect(topLevel(loop).map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(childrenOf(loop, 'a')).toEqual([]);
    expect(treeOrder(loop)).toHaveLength(3);
  });

  it('lists every Creation once, in tree order with depth', () => {
    expect(treeOrder(world).map((x) => `${x.depth}:${x.project.id}`)).toEqual([
      '0:books', '1:b1', '0:orphan', '0:music', '1:songs', '2:finished', '2:writing',
    ]);
  });
});
