import { describe, expect, it } from 'vitest';
import {
  ballStats,
  conditionStats,
  consistency,
  houseStats,
  laneStats,
  statsBy,
  valuesUsed,
} from '../src/lib/stats';
import type { Game } from '../src/lib/db';

/**
 * The season cut four ways, and how wide it is.
 *
 * `statsBy` replaced four plausible copy-pastes of the same average. The risk
 * of that is a subtle change to what `houseStats` meant, so the house cases
 * here are the ones that were already passing, kept.
 */

function game(over: Partial<Game> & { total: number }): Game {
  return {
    id: `g${over.total}-${over.house ?? over.ball ?? ''}-${over.playedAt ?? 0}`,
    bowler: 'You',
    rolls: [],
    isComplete: true,
    source: 'manual',
    playedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('statsBy', () => {
  it('averages each value separately', () => {
    const stats = statsBy(
      [
        game({ house: 'Rose Bowl', total: 180 }),
        game({ house: 'Rose Bowl', total: 160, playedAt: 1 }),
        game({ house: 'Korona', total: 120 }),
      ],
      (g) => g.house,
    );

    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({ name: 'Rose Bowl', games: 2, average: 170, high: 180 });
    expect(stats[1]).toMatchObject({ name: 'Korona', games: 1, average: 120 });
  });

  it('treats one value written two ways as one thing', () => {
    const stats = statsBy(
      [game({ house: 'Rose Bowl', total: 180 }), game({ house: 'rose bowl', total: 160, playedAt: 1 })],
      (g) => g.house,
    );
    expect(stats).toHaveLength(1);
    expect(stats[0].name).toBe('Rose Bowl');
  });

  it('leaves out games with nothing written rather than pooling them', () => {
    // A bucket holding six different alleys has an average that describes
    // nowhere.
    expect(statsBy([game({ total: 200 }), game({ house: 'Korona', total: 120 })], (g) => g.house))
      .toHaveLength(1);
  });

  it('counts only finished games', () => {
    // The fix. `summarise` has always filtered them, so a season average and a
    // per-house average disagreed about what a game is: a two-frame
    // abandonment carried a total of about 24 into one and not the other.
    const stats = statsBy(
      [
        game({ house: 'Korona', total: 180 }),
        game({ house: 'Korona', total: 24, isComplete: false, playedAt: 1 }),
      ],
      (g) => g.house,
    );

    expect(stats[0]).toMatchObject({ games: 1, average: 180 });
  });

  it('says nothing when nothing qualifies', () => {
    expect(statsBy([game({ total: 150 })], (g) => g.ball)).toEqual([]);
  });
});

describe('houseStats still means what it meant', () => {
  it('keys its rows by house, not by name', () => {
    const stats = houseStats([game({ house: 'Korona', total: 120 })]);
    expect(stats[0].house).toBe('Korona');
    expect(stats[0]).toMatchObject({ games: 1, average: 120, high: 120 });
  });
});

describe('the three new cuts', () => {
  const season = [
    game({ ball: 'Storm Phaze II', lane: '7', condition: 'Fresh', total: 180 }),
    game({ ball: 'Storm Phaze II', lane: '7', condition: 'Fresh', total: 160, playedAt: 1 }),
    game({ ball: 'Spare ball', lane: '8', condition: 'Burnt', total: 120, playedAt: 2 }),
  ];

  it('averages by ball', () => {
    const stats = ballStats(season);
    expect(stats[0]).toMatchObject({ name: 'Storm Phaze II', games: 2, average: 170 });
    expect(stats[1]).toMatchObject({ name: 'Spare ball', games: 1, average: 120 });
  });

  it('averages by lane', () => {
    expect(laneStats(season).map((s) => s.name)).toEqual(['7', '8']);
  });

  it('averages by condition', () => {
    expect(conditionStats(season).map((s) => s.name)).toEqual(['Fresh', 'Burnt']);
  });
});

describe('valuesUsed', () => {
  it('offers what you reach for, not what you bowl best with', () => {
    // The one you are most likely to mean is the one you use most, even if a
    // ball you threw once happens to hold the better average.
    const season = [
      game({ ball: 'Lucky', total: 250 }),
      game({ ball: 'Everyday', total: 140, playedAt: 1 }),
      game({ ball: 'Everyday', total: 150, playedAt: 2 }),
    ];
    expect(valuesUsed(season, (g) => g.ball)).toEqual(['Everyday', 'Lucky']);
  });
});

describe('consistency', () => {
  const scores = (values: number[]) =>
    values.map((total, i) => game({ total, playedAt: i }));

  it('says nothing under five games', () => {
    // A spread over three games is noise wearing a number's clothes, and a
    // number on a screen is believed.
    expect(consistency(scores([150, 160, 140, 155]))).toBeNull();
  });

  it('is zero spread for somebody who bowls the same score every time', () => {
    const same = consistency(scores([150, 150, 150, 150, 150]));
    expect(same).toMatchObject({ games: 5, average: 150, spread: 0, score: 100 });
  });

  it('separates two bowlers with the same average', () => {
    // The whole point: 150 either way, and only one of them can be relied on.
    const steady = consistency(scores([145, 150, 155, 150, 150]))!;
    const wild = consistency(scores([90, 210, 120, 180, 150]))!;

    expect(steady.average).toBe(wild.average);
    expect(steady.spread).toBeLessThan(wild.spread);
    expect(steady.score).toBeGreaterThan(wild.score);
  });

  it('reports the middle half of the games', () => {
    const spread = consistency(scores([100, 120, 140, 160, 180, 200, 220, 240]))!;
    expect(spread.low).toBeLessThan(spread.average);
    expect(spread.high).toBeGreaterThan(spread.average);
  });

  it('ignores unfinished games', () => {
    const withPartial = [...scores([150, 150, 150, 150, 150]), game({ total: 20, isComplete: false, playedAt: 9 })];
    expect(consistency(withPartial)).toMatchObject({ games: 5, average: 150 });
  });

  it('never goes below zero however scattered', () => {
    const chaos = consistency(scores([0, 300, 0, 300, 0, 300]))!;
    expect(chaos.score).toBe(0);
    expect(chaos.spread).toBeGreaterThan(100);
  });
});
