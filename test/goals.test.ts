import { describe, expect, it } from 'vitest';
import {
  gamesInWindow,
  goalProgress,
  loadGoals,
  problemWithGoal,
  specFor,
  type Goal,
} from '../src/lib/goals';
import type { Game } from '../src/lib/db';

/**
 * What you are trying to do, as opposed to what the crew is.
 *
 * The interesting half is that a goal has two shapes and conflating them is the
 * bug `lib/challenges.ts` avoided by refusing to have the second one. "62% of
 * the way to an average of 180" is not a sentence; "50 of 100 strikes" is.
 */

const PERFECT = Array<number>(12).fill(10);
/** Nine and a miss, ten frames: 90 points, 90 pins, no marks. */
const NINETY = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 9 : 0));

function game(rolls: number[], playedAt: number, total: number): Game {
  return {
    id: `g${playedAt}`,
    bowler: 'You',
    rolls,
    total,
    isComplete: true,
    source: 'manual',
    playedAt,
    updatedAt: playedAt,
  };
}

const NOW = new Date(2026, 5, 15).getTime();
const thisMonth = (day: number, rolls = PERFECT, total = 300) =>
  game(rolls, new Date(2026, 5, day).getTime(), total);
const lastMonth = (day: number, rolls = PERFECT, total = 300) =>
  game(rolls, new Date(2026, 4, day).getTime(), total);
const lastYear = (rolls = PERFECT, total = 300) => game(rolls, new Date(2025, 5, 1).getTime(), total);

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    name: '',
    metric: 'strikes',
    target: 100,
    window: 'month',
    createdAt: 0,
    ...over,
  };
}

describe('gamesInWindow', () => {
  const season = [thisMonth(1), lastMonth(20), lastYear()];

  it('takes this calendar month', () => {
    expect(gamesInWindow(goal({ window: 'month' }), season, NOW)).toHaveLength(1);
  });

  it('takes this calendar year', () => {
    expect(gamesInWindow(goal({ window: 'year' }), season, NOW)).toHaveLength(2);
  });

  it('takes everything', () => {
    expect(gamesInWindow(goal({ window: 'all' }), season, NOW)).toHaveLength(3);
  });
});

describe('a reach goal', () => {
  it('is a fraction of the target and means what it looks like', () => {
    // Four perfect games is 48 strikes of 100.
    const games = [1, 2, 3, 4].map((d) => thisMonth(d));
    const progress = goalProgress(goal({ target: 100 }), games, NOW);

    expect(progress.kind).toBe('reach');
    expect(progress.value).toBe(48);
    expect(progress.percent).toBe(48);
    expect(progress.met).toBe(false);
  });

  it('is met on the target, not past it', () => {
    const games = [1, 2].map((d) => thisMonth(d));
    expect(goalProgress(goal({ target: 24 }), games, NOW).met).toBe(true);
    expect(goalProgress(goal({ target: 25 }), games, NOW).met).toBe(false);
  });

  it('caps at 100 rather than running off its bar', () => {
    const games = [1, 2, 3, 4].map((d) => thisMonth(d));
    expect(goalProgress(goal({ target: 10 }), games, NOW).percent).toBe(100);
  });

  it('counts games as finished games', () => {
    const partial = { ...thisMonth(5, [9, 0], 9), isComplete: false };
    const progress = goalProgress(goal({ metric: 'games', target: 5 }), [thisMonth(1), partial], NOW);
    expect(progress.value).toBe(1);
  });
});

describe('a hold goal', () => {
  it('is where you are, not how far along you are', () => {
    const games = [thisMonth(1, NINETY, 90), thisMonth(2, NINETY, 90)];
    const progress = goalProgress(goal({ metric: 'average', target: 180 }), games, NOW);

    expect(progress.kind).toBe('hold');
    expect(progress.value).toBe(90);
    expect(progress.met).toBe(false);
  });

  it('is met once you are there', () => {
    const games = [thisMonth(1), thisMonth(2)];
    expect(goalProgress(goal({ metric: 'average', target: 180 }), games, NOW).met).toBe(true);
  });

  it('reads a high game as the best one, not the latest', () => {
    const games = [thisMonth(1), thisMonth(2, NINETY, 90)];
    const progress = goalProgress(goal({ metric: 'high', target: 200 }), games, NOW);
    expect(progress.value).toBe(300);
    expect(progress.met).toBe(true);
  });
});

describe('a goal where lower is better', () => {
  const steady = [140, 150, 160, 150, 150].map((total, i) => thisMonth(i + 1, NINETY, total));

  it('is met when the spread is under the target', () => {
    const progress = goalProgress(goal({ metric: 'spread', target: 20 }), steady, NOW);
    expect(progress.value).toBeLessThanOrEqual(20);
    expect(progress.met).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it('is not met by having no games at all', () => {
    // A spread of zero with nothing bowled is not a goal met, it is no games —
    // and it would otherwise be the easiest goal in the app to achieve.
    const progress = goalProgress(goal({ metric: 'spread', target: 20 }), [], NOW);
    expect(progress.value).toBe(0);
    expect(progress.met).toBe(false);
    expect(progress.games).toBe(0);
  });

  it('runs the percentage the other way', () => {
    const wild = [90, 210, 120, 200, 150].map((total, i) => thisMonth(i + 1, NINETY, total));
    const tight = goalProgress(goal({ metric: 'spread', target: 20 }), steady, NOW);
    const loose = goalProgress(goal({ metric: 'spread', target: 20 }), wild, NOW);
    expect(tight.percent).toBeGreaterThan(loose.percent);
  });

  it('never goes below zero however far off', () => {
    const chaos = [0, 300, 0, 300, 0].map((total, i) => thisMonth(i + 1, NINETY, total));
    expect(goalProgress(goal({ metric: 'spread', target: 5 }), chaos, NOW).percent).toBe(0);
  });
});

describe('problemWithGoal', () => {
  it('accepts a reasonable one', () => {
    expect(problemWithGoal({ metric: 'strikes', target: 100 })).toBeNull();
  });

  it('refuses a target of nothing', () => {
    expect(problemWithGoal({ metric: 'strikes', target: 0 })).toMatch(/at least 1/);
  });

  it('refuses a score nothing can reach', () => {
    // "Average 400" is not ambition, it is a typo.
    expect(problemWithGoal({ metric: 'average', target: 400 })).toMatch(/over 300/);
    expect(problemWithGoal({ metric: 'high', target: 301 })).toMatch(/over 300/);
  });

  it('lets a spread target past 300 alone, since it is not a score', () => {
    expect(problemWithGoal({ metric: 'spread', target: 40 })).toBeNull();
  });
});

describe('specFor', () => {
  it('knows which shape each metric is', () => {
    expect(specFor('strikes').kind).toBe('reach');
    expect(specFor('average').kind).toBe('hold');
    expect(specFor('spread').lowerIsBetter).toBe(true);
  });
});

describe('loadGoals', () => {
  it('is no goals rather than a broken screen when storage is unreadable', () => {
    // No localStorage in this environment at all, which is the point.
    expect(loadGoals()).toEqual([]);
  });
});
