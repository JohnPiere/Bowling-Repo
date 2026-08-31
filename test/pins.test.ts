import { describe, expect, it } from 'vitest';
import {
  areAdjacent,
  describeLeave,
  FULL_RACK,
  isSplit,
  leavesFromPinfalls,
  PIN_POSITIONS,
  standingAfter,
} from '../src/lib/pins';

describe('the rack', () => {
  it('has ten pins, each with a position', () => {
    expect(FULL_RACK).toHaveLength(10);
    for (const pin of FULL_RACK) expect(PIN_POSITIONS[pin]).toBeDefined();
  });

  it('puts the headpin in front and the corners at the back', () => {
    expect(PIN_POSITIONS[1].row).toBe(0);
    expect(PIN_POSITIONS[7].row).toBe(3);
    expect(PIN_POSITIONS[10].row).toBe(3);
  });
});

describe('areAdjacent', () => {
  it('is symmetric', () => {
    for (const a of FULL_RACK) {
      for (const b of FULL_RACK) {
        expect(areAdjacent(a, b)).toBe(areAdjacent(b, a));
      }
    }
  });

  it('knows the corners are nowhere near each other', () => {
    expect(areAdjacent(7, 10)).toBe(false);
    expect(areAdjacent(4, 6)).toBe(false);
  });

  it('knows which pins touch', () => {
    expect(areAdjacent(1, 2)).toBe(true);
    expect(areAdjacent(2, 3)).toBe(true);
    expect(areAdjacent(9, 10)).toBe(true);
  });
});

describe('standingAfter', () => {
  it('removes the pins that fell', () => {
    expect(standingAfter(FULL_RACK, [1, 2, 3, 5])).toEqual([4, 6, 7, 8, 9, 10]);
  });

  it('leaves the rack alone when nothing fell', () => {
    expect(standingAfter(FULL_RACK, [])).toEqual(FULL_RACK);
  });

  it('ignores pins that were already down', () => {
    expect(standingAfter([7, 10], [1, 7])).toEqual([10]);
  });
});

describe('isSplit', () => {
  it('recognises the classic splits', () => {
    expect(isSplit([7, 10])).toBe(true);
    expect(isSplit([4, 6])).toBe(true);
    expect(isSplit([5, 7])).toBe(true);
    expect(isSplit([8, 10])).toBe(true);
    expect(isSplit([4, 6, 7, 10])).toBe(true);
  });

  it('is not a split while the headpin stands', () => {
    // The defining condition: a leave with the 1 still up is not a split.
    expect(isSplit([1, 7, 10])).toBe(false);
    expect(isSplit(FULL_RACK)).toBe(false);
  });

  it('is not a split when the pins touch', () => {
    expect(isSplit([2, 3])).toBe(false);
    expect(isSplit([9, 10])).toBe(false);
    expect(isSplit([2, 4, 5])).toBe(false);
  });

  it('needs two pins to be a split', () => {
    expect(isSplit([10])).toBe(false);
    expect(isSplit([])).toBe(false);
  });
});

describe('describeLeave', () => {
  it('names a clean deck', () => {
    expect(describeLeave([])).toBe('Strike');
    expect(describeLeave(FULL_RACK)).toBe('Gutter');
  });

  it('names the leaves bowlers name', () => {
    expect(describeLeave([4, 6, 7, 10])).toBe('Big four');
    expect(describeLeave([2, 7])).toBe('Baby split');
  });

  it('describes a single pin by its number', () => {
    expect(describeLeave([10])).toBe('10 pin');
  });

  it('calls an unnamed split a split', () => {
    expect(describeLeave([3, 7])).toMatch(/split/);
  });

  it('describes a non-split leave by its pins', () => {
    expect(describeLeave([2, 3])).toBe('2-3');
  });
});

describe('leavesFromPinfalls', () => {
  it('tracks the deck across a frame', () => {
    // First ball takes the head and left side, second clears the rest.
    const leaves = leavesFromPinfalls([[1, 2, 4, 5, 7, 8], [3, 6, 9, 10]]);
    expect(leaves[0]).toEqual([3, 6, 9, 10]);
    expect(leaves[1]).toEqual([]);
  });

  it('re-racks after a strike', () => {
    const leaves = leavesFromPinfalls([FULL_RACK, [1, 3, 6, 10]]);
    expect(leaves[0]).toEqual([]);
    expect(leaves[1]).toEqual([2, 4, 5, 7, 8, 9]);
  });

  it('re-racks after a spare', () => {
    const leaves = leavesFromPinfalls([[1, 2, 3], [4, 5, 6, 7, 8, 9, 10], [1]]);
    expect(leaves[1]).toEqual([]);
    expect(leaves[2]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
