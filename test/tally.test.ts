import { describe, expect, it } from 'vitest';
import { monthlyTallies, splitRecords, tally, thisMonth } from '../src/lib/stats';
import type { Game } from '../src/lib/db';

/**
 * The numbers that only ever go up.
 *
 * An average says how you are bowling; a count says how much you have bowled,
 * and nothing else in the app answers that. They are also the easiest numbers
 * in here to get quietly wrong — a perfect game is 300 points and 120 pins,
 * and a counter that mixed those up would be believed for years.
 */

function game(rolls: number[], playedAt: number, id = String(playedAt)): Game {
  return {
    id,
    bowler: 'You',
    rolls,
    total: 0,
    isComplete: true,
    source: 'manual',
    playedAt,
    updatedAt: playedAt,
  };
}

const PERFECT = Array<number>(12).fill(10);
/** Nine and a miss, ten times over: 90 points, 90 pins, 20 balls. */
const NINETY = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 9 : 0));

describe('tally', () => {
  it('counts a perfect game as 12 balls and 120 pins, not 300', () => {
    // The distinction the whole card rests on. `Summary.totalPins` next door
    // is a sum of *scores* despite its name, so these two must not be confused.
    const t = tally([game(PERFECT, 1)]);
    expect(t.balls).toBe(12);
    expect(t.pins).toBe(120);
    expect(t.high).toBe(300);
    expect(t.frames).toBe(10);
    // Twelve, not ten: the tenth is three strikes and anybody counting their
    // own says twelve. `ballOutcomes` counts the same game as ten frames, on
    // purpose, because its shares have to add to one.
    expect(t.strikes).toBe(12);
  });

  it('counts a spare in the tenth', () => {
    // 9- nine times, then 9 / X.
    const rolls = [...Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 9 : 0)), 9, 1, 10];
    const t = tally([{ rolls, playedAt: 1 }]);
    expect(t.spares).toBe(1);
    expect(t.strikes).toBe(1);
    expect(t.balls).toBe(21);
  });

  it('counts every ball, including the tenth frame bonus', () => {
    // 9- nine times is 18 balls, then X X X in the tenth is three more.
    const rolls = [...NINETY.slice(0, 18), 10, 10, 10];
    expect(tally([game(rolls, 1)]).balls).toBe(21);
  });

  it('counts frames, not games times ten, for a game left unfinished', () => {
    const t = tally([{ rolls: [9, 0, 9, 0, 7], playedAt: 1 }]);
    expect(t.frames).toBe(3);
    expect(t.games).toBe(1);
    expect(t.finished).toBe(0);
    expect(t.average).toBeNull();
  });

  it('averages over finished games only', () => {
    const t = tally([game(PERFECT, 1), game(NINETY, 2), { rolls: [9, 0], playedAt: 3 }]);
    expect(t.games).toBe(3);
    expect(t.finished).toBe(2);
    expect(t.average).toBe(195); // (300 + 90) / 2
  });

  it('believes the rolls rather than the stored flag', () => {
    // A game synced from another device is rescored from its rolls anyway; a
    // flag that disagreed with them would put half a game into an average.
    const lying = { ...game([9, 0], 1), isComplete: true };
    expect(tally([lying]).finished).toBe(0);
  });

  it('counts strikes, spares and opens as ten frames a game', () => {
    // 9/ five times then 9- five times.
    const rolls = [...Array.from({ length: 5 }, () => [9, 1]).flat(), ...NINETY.slice(0, 10)];
    const t = tally([{ rolls, playedAt: 1 }]);
    expect(t.spares).toBe(5);
    expect(t.opens).toBe(5);
    expect(t.strikes + t.spares + t.opens).toBe(10);
  });

  it('counts balls that took nothing down', () => {
    expect(tally([game(NINETY, 1)]).zeroBalls).toBe(10);
    expect(tally([game(PERFECT, 1)]).zeroBalls).toBe(0);
  });

  it('says nothing rather than zero when nothing has been bowled', () => {
    const t = tally([]);
    expect(t.average).toBeNull();
    expect(t.high).toBeNull();
    expect(t.games).toBe(0);
  });
});

describe('monthlyTallies', () => {
  const jan = new Date(2026, 0, 10).getTime();
  const jan2 = new Date(2026, 0, 20).getTime();
  const mar = new Date(2026, 2, 3).getTime();

  it('groups by calendar month, most recent first', () => {
    const months = monthlyTallies([game(PERFECT, jan), game(NINETY, jan2), game(PERFECT, mar)]);
    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-01']);
    expect(months[1].games).toBe(2);
    expect(months[1].pins).toBe(210); // 120 + 90
  });

  it('leaves out months with nothing in them', () => {
    // February is not a row of zeroes; the gap between two dates says it.
    const months = monthlyTallies([game(PERFECT, jan), game(PERFECT, mar)]);
    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-01']);
  });
});

describe('thisMonth', () => {
  it('counts only the calendar month it is asked about', () => {
    const now = new Date(2026, 2, 15).getTime();
    const games = [
      game(PERFECT, new Date(2026, 2, 1).getTime()),
      game(PERFECT, new Date(2026, 2, 31, 23, 0).getTime()),
      game(PERFECT, new Date(2026, 1, 28).getTime()),
      game(PERFECT, new Date(2026, 3, 1).getTime()),
    ];
    expect(thisMonth(games, now).games).toBe(2);
  });
});

describe('splitRecords', () => {
  /** A frame that leaves the given pins and then does or does not clear them. */
  function frameLeaving(standing: number[], convert: boolean) {
    const first = 10 - standing.length;
    const knocked = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((p) => !standing.includes(p));
    return {
      rolls: [first, convert ? standing.length : 0],
      pinfalls: [knocked, convert ? standing : []],
    };
  }

  function gameOf(frames: { rolls: number[]; pinfalls: number[][] }[]): Game {
    return {
      ...game(frames.flatMap((f) => f.rolls), 1),
      pinfalls: frames.flatMap((f) => f.pinfalls),
    };
  }

  it('ranks by how often a split happens, not by how badly it goes', () => {
    // The question is "what keeps happening to me". A 7-10 missed once is a
    // worse rate than anything and is not the answer.
    const sevenTen = frameLeaving([7, 10], false);
    const threeTen = frameLeaving([3, 10], false);
    const record = gameOf([
      threeTen, threeTen, threeTen,
      sevenTen,
      frameLeaving([3, 10], true),
      ...Array.from({ length: 5 }, () => frameLeaving([2, 3], true)),
    ]);

    const splits = splitRecords([record]);
    expect(splits[0].pins).toEqual([3, 10]);
    expect(splits[0].times).toBe(4);
    expect(splits[1].pins).toEqual([7, 10]);
  });

  it('gives both sides of the same number', () => {
    const record = gameOf([
      frameLeaving([3, 10], true),
      ...Array.from({ length: 3 }, () => frameLeaving([3, 10], false)),
      ...Array.from({ length: 6 }, () => frameLeaving([2, 3], true)),
    ]);

    const [threeTen] = splitRecords([record]);
    expect(threeTen.times).toBe(4);
    expect(threeTen.converted).toBe(1);
    expect(threeTen.conversionRate).toBe(25);
    expect(threeTen.missRate).toBe(75);
  });

  it('says nothing about games with no pin data', () => {
    expect(splitRecords([game(NINETY, 1)])).toEqual([]);
  });
});
