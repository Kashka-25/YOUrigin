import { describe, expect, it } from 'vitest';
import { nudgeTarget, type OutlineGroup } from './outline';

const groups: OutlineGroup[] = [
  { sectionId: 's1', entryIds: ['a', 'b', 'c'] },
  { sectionId: 's2', entryIds: [] },
  { sectionId: 's3', entryIds: ['d'] },
  { sectionId: null, entryIds: ['t'] },
];

describe('nudgeTarget', () => {
  it('swaps with a neighbour inside a section', () => {
    expect(nudgeTarget(groups, 'b', -1)).toEqual({ sectionId: 's1', index: 0 });
    expect(nudgeTarget(groups, 'b', 1)).toEqual({ sectionId: 's1', index: 2 });
  });

  it('crosses into the next section at its start, even an empty one', () => {
    expect(nudgeTarget(groups, 'c', 1)).toEqual({ sectionId: 's2', index: 0 });
  });

  it('crosses into the previous section at its end', () => {
    expect(nudgeTarget(groups, 'd', -1)).toEqual({ sectionId: 's2', index: 0 });
    expect(nudgeTarget(groups, 't', -1)).toEqual({ sectionId: 's3', index: 1 });
  });

  it('can move the last placed piece out to the tray', () => {
    expect(nudgeTarget(groups, 'd', 1)).toEqual({ sectionId: null, index: 0 });
  });

  it('stops at the very top and bottom', () => {
    expect(nudgeTarget(groups, 'a', -1)).toBeNull();
    expect(nudgeTarget(groups, 't', 1)).toBeNull();
    expect(nudgeTarget(groups, 'missing', 1)).toBeNull();
  });
});
