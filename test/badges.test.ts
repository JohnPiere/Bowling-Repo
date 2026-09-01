import { describe, expect, it } from 'vitest';
import { badgeStatuses, busiestMonth, leadingStrikes, longestStrikeRun } from '../src/lib/badges';
import type { Game } from '../src/lib/db';

const game = (rolls: number[], playedAt: number, total = 0): Game => ({
  id: `g${playedAt}`,
  bowler: 'You',
  rolls,
  total,
  isComplete: true,
  source: 'manual',
  playedAt,
  updatedAt: playedAt,
});

const STRIKES = new Array(12).fill(10);
const OPENS = new Array(10).fill([4, 3]).flat();
/** Ten spares, then a fill ball: no open frames, no strikes. */
const ALL_SPARES = [...new Array(10).fill([7, 3]).flat(), 7];

const at = (day: number) => new Date(2026, 0, day).getTime();
const status = (games: Game[], key: string) =>
  badgeStatuses(games).find((b) => b.key === key)!;

describe('longestStrikeRun', () => {
  it('finds the longest run, not the first', () => {
    expect(longestStrikeRun([true, false, true, true, true, false])).toBe(3);
  });

  it('is zero when nothing was struck', () => {
    expect(longestStrikeRun([false, false])).toBe(0);
  });
});

describe('leadingStrikes', () => {
  it('counts only the run from the very start', () => {
    expect(leadingStrikes([true, true, false, true, true, true])).toBe(2);
  });

  it('counts them all when nothing breaks the run', () => {
    expect(leadingStrikes([true, true, true])).toBe(3);
  });
});

describe('busiestMonth', () => {
  it('counts per calendar month, not per thirty days', () => {
    // Four games spanning a month boundary: three in January, one in February.
    const games = [
      game([], new Date(2026, 0, 20).getTime()),
      game([], new Date(2026, 0, 28).getTime()),
      game([], new Date(2026, 0, 31).getTime()),
      game([], new Date(2026, 1, 2).getTime()),
    ];
    expect(busiestMonth(games).count).toBe(3);
  });

  it('has nothing to report for no games', () => {
    expect(busiestMonth([]).count).toBe(0);
  });
});

describe('badgeStatuses', () => {
  it('earns the 200 badge on the game that did it, not the latest one', () => {
    const games = [game(STRIKES, at(1), 300), game(OPENS, at(9), 70)];
    const hundo = status(games, 'hundo');
    expect(hundo.earned).toBe(true);
    expect(hundo.earnedAt).toBe(at(1));
  });

  it('keeps a badge earned after a bad night', () => {
    // The whole point: a later 70 does not take back the 300.
    expect(status([game(STRIKES, at(1), 300), game(OPENS, at(9), 70)], 'hundo').earned).toBe(true);
  });

  it('does not award what has not happened, and shows how close it is', () => {
    const century = status([game(OPENS, at(1), 70)], 'century');
    expect(century.earned).toBe(false);
    expect(century.progress).toBeCloseTo(0.01);
  });

  it('reads a clean game off the frames, not the score', () => {
    // No strikes at all, but nothing left open either.
    expect(status([game(ALL_SPARES, at(1), 130)], 'clean').earned).toBe(true);
    expect(status([game(OPENS, at(1), 70)], 'clean').earned).toBe(false);
  });

  it('awards the front nine only for the first nine frames', () => {
    expect(status([game(STRIKES, at(1), 300)], 'front9').earned).toBe(true);

    // Nine strikes, but the run starts in the second frame.
    const late = [4, 3, ...new Array(11).fill(10)];
    expect(status([game(late, at(1), 200)], 'front9').earned).toBe(false);
  });

  it('does not count strikes as converted spares', () => {
    // A perfect game has no spare attempts at all, so conversion is undefined
    // rather than 100% — awarding Spare Surgeon here would be a lie.
    expect(status([game(STRIKES, at(1), 300)], 'surgeon').earned).toBe(false);
  });

  it('awards spare conversion when the spares were actually taken', () => {
    expect(status([game(ALL_SPARES, at(1), 130)], 'surgeon').earned).toBe(true);
  });

  it('reports every badge, earned or not', () => {
    expect(badgeStatuses([])).toHaveLength(8);
    expect(badgeStatuses([]).every((b) => !b.earned)).toBe(true);
  });
});
