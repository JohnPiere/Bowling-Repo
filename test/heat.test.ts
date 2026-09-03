import { describe, expect, it } from 'vitest';
import { pinHeat } from '../src/lib/stats';
import type { Game } from '../src/lib/db';

/**
 * The rack, tinted.
 *
 * `weight` is what the diagram is drawn from, and it is relative to the worst
 * pin rather than to the frame count. An absolute scale would make every rack
 * look nearly blank — a given pin survives a small share of frames even for a
 * bad bowler — and the shape is what is being read, not the level.
 */

/** A game of frames that each leave `standing` and then do or do not clear it. */
function gameLeaving(frames: { standing: number[]; convert: boolean }[]): Game {
  const rolls: number[] = [];
  const pinfalls: number[][] = [];

  for (const { standing, convert } of frames) {
    const knocked = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((p) => !standing.includes(p));
    rolls.push(knocked.length, convert ? standing.length : 0);
    pinfalls.push(knocked, convert ? [...standing] : []);
  }

  return {
    id: 'g1',
    bowler: 'You',
    rolls,
    pinfalls,
    total: 0,
    isComplete: true,
    source: 'manual',
    playedAt: 0,
    updatedAt: 0,
  };
}

const TEN = { standing: [10], convert: false };
const SEVEN = { standing: [7], convert: true };
const FILLER = { standing: [2], convert: true };

describe('pinHeat', () => {
  it('has a row for every pin, even ones that never stand', () => {
    // A pin that never survives is still a pin, not a hole in the rack.
    const heat = pinHeat([gameLeaving(Array.from({ length: 10 }, () => TEN))]);
    expect(heat.map((one) => one.pin)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(heat.find((one) => one.pin === 5)).toMatchObject({ times: 0, weight: 0 });
  });

  it('counts how often each pin was left', () => {
    const heat = pinHeat([
      gameLeaving([TEN, TEN, TEN, SEVEN, FILLER, FILLER, FILLER, FILLER, FILLER, FILLER]),
    ]);
    // The tenth frame is not a spare attempt, so it never counts as a leave.
    expect(heat.find((one) => one.pin === 10)!.times).toBe(3);
    expect(heat.find((one) => one.pin === 7)!.times).toBe(1);
  });

  it('scales the tint against the worst pin, so one is always fully lit', () => {
    const heat = pinHeat([
      gameLeaving([TEN, TEN, TEN, TEN, SEVEN, FILLER, FILLER, FILLER, FILLER, FILLER]),
    ]);
    expect(heat.find((one) => one.pin === 10)!.weight).toBe(1);
    expect(heat.find((one) => one.pin === 7)!.weight).toBeCloseTo(0.25);
  });

  it('counts a pin once per frame it stood in, not once per leave name', () => {
    // The 3-10 and the 6-10 are different leaves and the same 10 pin.
    const heat = pinHeat([
      gameLeaving([
        { standing: [3, 10], convert: false },
        { standing: [6, 10], convert: false },
        FILLER, FILLER, FILLER, FILLER, FILLER, FILLER, FILLER, FILLER,
      ]),
    ]);
    expect(heat.find((one) => one.pin === 10)!.times).toBe(2);
    expect(heat.find((one) => one.pin === 3)!.times).toBe(1);
  });

  it('reports how often a pin was then picked up', () => {
    const heat = pinHeat([
      gameLeaving([
        { standing: [7], convert: true },
        { standing: [7], convert: true },
        { standing: [7], convert: false },
        { standing: [7], convert: false },
        FILLER, FILLER, FILLER, FILLER, FILLER, FILLER,
      ]),
    ]);
    const seven = heat.find((one) => one.pin === 7)!;
    expect(seven).toMatchObject({ times: 4, cleared: 2, conversionRate: 50 });
  });

  it('says nothing rather than zero for a pin that never stood', () => {
    // 0% would read as "you never pick it up", which is a different claim.
    const heat = pinHeat([gameLeaving(Array.from({ length: 10 }, () => TEN))]);
    expect(heat.find((one) => one.pin === 5)!.conversionRate).toBeNull();
  });

  it('is all zeroes for a season with no pin data', () => {
    const noPins: Game = { ...gameLeaving([FILLER]), pinfalls: undefined };
    expect(pinHeat([noPins]).every((one) => one.times === 0 && one.weight === 0)).toBe(true);
  });
});
