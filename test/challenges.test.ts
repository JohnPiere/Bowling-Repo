import { describe, expect, it } from 'vitest';
import {
  canDelete,
  challengeStandings,
  challengeState,
  challengeTotal,
  daysLeft,
  problemWithDraft,
  type Challenge,
  type CountedGame,
} from '../src/lib/challenges';

/**
 * A crew chasing a number.
 *
 * Nothing records progress — it is the games bowled inside the window, counted
 * by the same `tally` everything else uses. That is the point and it is also
 * the risk: get the window wrong and a challenge quietly counts games from
 * before it started, which nobody would notice until somebody won one.
 */

const MARCH: Challenge = {
  id: 'c1',
  groupId: 'g1',
  creatorId: 'kenji',
  name: '100 strikes in March',
  metric: 'strikes',
  target: 100,
  startsAt: new Date(2026, 2, 1).getTime(),
  endsAt: new Date(2026, 3, 1).getTime(),
  createdAt: 0,
};

const PERFECT = Array<number>(12).fill(10);
/** Nine and a miss, ten frames: no marks at all. */
const NINETY = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 9 : 0));

function game(authorId: string, rolls: number[], playedAt: number): CountedGame {
  return { authorId, rolls, playedAt };
}

describe('challengeState', () => {
  it('is upcoming before it starts', () => {
    expect(challengeState(MARCH, new Date(2026, 1, 20).getTime())).toBe('upcoming');
  });

  it('is running on the first instant of the window', () => {
    expect(challengeState(MARCH, MARCH.startsAt)).toBe('running');
  });

  it('is finished on the last instant of it', () => {
    // The window is half-open, so the end is the first instant of April.
    expect(challengeState(MARCH, MARCH.endsAt)).toBe('finished');
    expect(challengeState(MARCH, MARCH.endsAt - 1)).toBe('running');
  });
});

describe('daysLeft', () => {
  it('rounds a part-day up', () => {
    // "0 days left" on a challenge with six hours to run reads as over.
    const sixHoursBefore = MARCH.endsAt - 6 * 3600 * 1000;
    expect(daysLeft(MARCH, sixHoursBefore)).toBe(1);
  });

  it('never goes negative once it is over', () => {
    expect(daysLeft(MARCH, MARCH.endsAt + 10 * 86_400_000)).toBe(0);
  });
});

describe('challengeStandings', () => {
  const inside = new Date(2026, 2, 10).getTime();
  const before = new Date(2026, 1, 27).getTime();
  const after = new Date(2026, 3, 2).getTime();

  it('counts only games inside the window', () => {
    // The failure that would go unnoticed until somebody won.
    const games = [
      game('kenji', PERFECT, before),
      game('kenji', PERFECT, inside),
      game('kenji', PERFECT, after),
    ];
    const [kenji] = challengeStandings(MARCH, ['kenji'], games);
    expect(kenji.value).toBe(12);
    expect(kenji.games).toBe(1);
  });

  it('counts the first instant in and the last instant out', () => {
    const games = [
      game('kenji', PERFECT, MARCH.startsAt),
      game('kenji', PERFECT, MARCH.endsAt),
    ];
    expect(challengeStandings(MARCH, ['kenji'], games)[0].value).toBe(12);
  });

  it('gives everybody a row, including whoever has bowled nothing', () => {
    // Four in the crew and two rows looks like the other two left it.
    const rows = challengeStandings(MARCH, ['kenji', 'aya', 'sam'], [game('kenji', PERFECT, inside)]);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.value === 0)).toHaveLength(2);
  });

  it('orders by how far along, and is stable when nobody has scored', () => {
    const rows = challengeStandings(MARCH, ['kenji', 'aya', 'sam'], [game('aya', PERFECT, inside)]);
    expect(rows[0].memberId).toBe('aya');
    // The two on nothing keep the order they were given.
    expect(rows.slice(1).map((r) => r.memberId)).toEqual(['kenji', 'sam']);
  });

  it('caps the bar at 100 but keeps the real number', () => {
    // Nine perfect games is 108 strikes against a target of 100.
    const games = Array.from({ length: 9 }, (_, i) => game('kenji', PERFECT, inside + i));
    const [kenji] = challengeStandings(MARCH, ['kenji'], games);
    expect(kenji.value).toBe(108);
    expect(kenji.percent).toBe(100);
    expect(kenji.done).toBe(true);
  });

  it('is not done one short of the target', () => {
    const target99: Challenge = { ...MARCH, target: 13 };
    const [row] = challengeStandings(target99, ['kenji'], [game('kenji', PERFECT, inside)]);
    expect(row.value).toBe(12);
    expect(row.done).toBe(false);
    expect(row.percent).toBe(92);
  });

  it('counts a metric that is not marks', () => {
    const pins: Challenge = { ...MARCH, metric: 'pins', target: 1000 };
    const [row] = challengeStandings(pins, ['kenji'], [game('kenji', PERFECT, inside)]);
    expect(row.value).toBe(120); // pinfall, not the 300 it scored
  });

  it('counts a game with no marks in it as games bowled', () => {
    const games: Challenge = { ...MARCH, metric: 'games', target: 5 };
    const [row] = challengeStandings(games, ['kenji'], [game('kenji', NINETY, inside)]);
    expect(row.value).toBe(1);
  });
});

describe('challengeTotal', () => {
  const inside = new Date(2026, 2, 10).getTime();

  it('adds the real values, not the capped percentages', () => {
    // Two people at 100% each would be 200% of a shared target otherwise.
    const rows = challengeStandings(
      { ...MARCH, target: 12 },
      ['kenji', 'aya'],
      [game('kenji', PERFECT, inside), game('aya', PERFECT, inside)],
    );
    const total = challengeTotal({ ...MARCH, target: 12 }, rows);
    expect(total.value).toBe(24);
    expect(total.percent).toBe(100);
  });
});

describe('canDelete', () => {
  it('lets the person who made it take it down', () => {
    expect(canDelete(MARCH, 'kenji', 'aya')).toBe(true);
  });

  it("lets the crew's owner take it down", () => {
    expect(canDelete(MARCH, 'aya', 'aya')).toBe(true);
  });

  it('does not let anybody else', () => {
    // A moderator may not: moderating is taking down what somebody posted, and
    // a challenge with a week left is not a post. Migration 0004, again.
    expect(canDelete(MARCH, 'sam', 'aya')).toBe(false);
  });
});

describe('problemWithDraft', () => {
  const ok = {
    name: '100 strikes',
    metric: 'strikes' as const,
    target: 100,
    startsAt: MARCH.startsAt,
    endsAt: MARCH.endsAt,
  };

  it('accepts a reasonable one', () => {
    expect(problemWithDraft(ok)).toBeNull();
  });

  it('wants a name', () => {
    expect(problemWithDraft({ ...ok, name: '   ' })).toBe('Give it a name.');
  });

  it('refuses a target of nothing', () => {
    expect(problemWithDraft({ ...ok, target: 0 })).toMatch(/at least 1/);
    expect(problemWithDraft({ ...ok, target: Number.NaN })).toMatch(/at least 1/);
  });

  it('refuses a window that ends before it starts', () => {
    expect(problemWithDraft({ ...ok, endsAt: ok.startsAt })).toMatch(/end after it starts/);
  });

  it('refuses a window longer than a year', () => {
    // A mistyped year should not become a permanent fixture on the crew screen.
    expect(problemWithDraft({ ...ok, endsAt: ok.startsAt + 400 * 86_400_000 })).toMatch(/under a year/);
  });
});
