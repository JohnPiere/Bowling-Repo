import { describe, expect, it } from 'vitest';
import type { Game } from '../src/lib/db';
import {
  applyRange,
  ballOutcomes,
  bestStrikeRun,
  dailySeries,
  dailyStats,
  firstBallDistribution,
  leaveRecords,
  metricChange,
  metricSeries,
  scoreTrend,
  splitSummary,
  summarise,
} from '../src/lib/stats';
import { scoreGame } from '../src/lib/scoring';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 31);

function game(rolls: number[], daysAgo = 0, over: Partial<Game> = {}): Game {
  const card = scoreGame(rolls);
  return {
    id: `g${daysAgo}-${rolls.join('')}`,
    bowler: 'You',
    rolls,
    total: card.total,
    isComplete: card.isComplete,
    source: 'manual',
    playedAt: NOW - daysAgo * DAY,
    updatedAt: NOW,
    ...over,
  };
}

const strikes = Array<number>(12).fill(10);
const open4s = Array<number>(20).fill(4);
const spares = Array<number>(21).fill(5);

describe('applyRange', () => {
  // Games arrive newest-first, as listGames returns them.
  const games = [game(open4s, 0), game(open4s, 20), game(open4s, 60), game(open4s, 200)];

  it('keeps everything for "all"', () => {
    expect(applyRange(games, 'all', NOW)).toHaveLength(4);
  });

  it('takes the newest N for a game-count range', () => {
    const recent = applyRange(games, 'g5', NOW);
    expect(recent).toHaveLength(4);
    expect(applyRange([...games, game(open4s, 300), game(open4s, 400)], 'g5', NOW)).toHaveLength(5);
  });

  it('filters by age for a day range', () => {
    expect(applyRange(games, 'd30', NOW)).toHaveLength(2);
    expect(applyRange(games, 'd90', NOW)).toHaveLength(3);
    expect(applyRange(games, 'd180', NOW)).toHaveLength(3);
  });
});

describe('summarise', () => {
  it('reports nothing for an empty list', () => {
    expect(summarise([])).toEqual({
      games: 0, average: null, high: null, low: null, totalPins: 0, strikeRate: null,
    });
  });

  it('ignores unfinished games', () => {
    expect(summarise([game([10, 10])]).games).toBe(0);
  });

  it('averages finished games', () => {
    const summary = summarise([game(strikes), game(open4s)]);
    expect(summary.games).toBe(2);
    expect(summary.high).toBe(300);
    expect(summary.low).toBe(80);
    expect(summary.average).toBe(190);
    expect(summary.totalPins).toBe(380);
  });

  it('computes strike rate over frames', () => {
    expect(summarise([game(strikes)]).strikeRate).toBe(100);
    expect(summarise([game(open4s)]).strikeRate).toBe(0);
    // One perfect game and one open game: 10 of 20 frames opened with a strike.
    expect(summarise([game(strikes), game(open4s)]).strikeRate).toBe(50);
  });
});

describe('scoreTrend', () => {
  it('returns points oldest first', () => {
    const points = scoreTrend([game(open4s, 0), game(strikes, 5)]);
    expect(points.map((p) => p.score)).toEqual([300, 80]);
  });

  it('expands the mean until the window is full', () => {
    const points = scoreTrend([game(open4s, 0), game(strikes, 1)], 10);
    // Oldest first: 300, then the mean of 300 and 80.
    expect(points.map((p) => p.rolling)).toEqual([300, 190]);
  });

  it('drops games outside the window', () => {
    const games = [game(strikes, 3), game(open4s, 2), game(open4s, 1), game(open4s, 0)];
    const points = scoreTrend(games, 2);
    // Last point averages the final two games only, both 80.
    expect(points.at(-1)?.rolling).toBe(80);
  });

  it('excludes unfinished games', () => {
    expect(scoreTrend([game([10, 10])])).toHaveLength(0);
  });
});

describe('ballOutcomes', () => {
  it('counts a perfect game as ten strikes', () => {
    expect(ballOutcomes([game(strikes)])).toEqual({ strikes: 10, spares: 0, opens: 0 });
  });

  it('counts an all-spare game as ten spares', () => {
    expect(ballOutcomes([game(spares)])).toEqual({ strikes: 0, spares: 10, opens: 0 });
  });

  it('counts an all-open game as ten opens', () => {
    expect(ballOutcomes([game(open4s)])).toEqual({ strikes: 0, spares: 0, opens: 10 });
  });

  it('always totals ten frames per finished game', () => {
    const counts = ballOutcomes([game(strikes), game(spares), game(open4s)]);
    expect(counts.strikes + counts.spares + counts.opens).toBe(30);
  });
});

describe('firstBallDistribution', () => {
  it('buckets first balls by pin count', () => {
    const counts = firstBallDistribution([game(strikes)]);
    expect(counts[10]).toBe(10);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('ignores the tenth frame bonus balls', () => {
    // A perfect game throws twelve balls but only ten open a frame.
    expect(firstBallDistribution([game(strikes)]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('counts a five-count game in the fives bucket', () => {
    expect(firstBallDistribution([game(spares)])[5]).toBe(10);
  });
});

describe('bestStrikeRun', () => {
  it('finds the longest consecutive run', () => {
    expect(bestStrikeRun([game(strikes)])).toBe(12);
    expect(bestStrikeRun([game(open4s)])).toBe(0);
    expect(bestStrikeRun([game([10, 10, 3, 4, 10, 0, 5])])).toBe(2);
  });
});

describe('leaveRecords', () => {
  const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** A game where every frame leaves `leave` and converts it or not. */
  function rackGame(leave: number[], convert: boolean, id = 'p'): Game {
    const firstBall = FULL.filter((p) => !leave.includes(p));
    const rolls: number[] = [];
    const pinfalls: number[][] = [];

    for (let f = 0; f < 10; f++) {
      rolls.push(firstBall.length);
      pinfalls.push(firstBall);
      rolls.push(convert ? leave.length : 0);
      pinfalls.push(convert ? leave : []);
    }
    // The tenth frame earns a bonus ball when it is spared.
    if (convert) {
      rolls.push(0);
      pinfalls.push([]);
    }

    const card = scoreGame(rolls);
    return {
      id, bowler: 'You', rolls, pinfalls, total: card.total,
      isComplete: card.isComplete, source: 'manual',
      playedAt: NOW, updatedAt: NOW,
    };
  }

  it('says nothing about games with no pin data', () => {
    expect(leaveRecords([game(open4s)])).toEqual([]);
  });

  it('counts a leave and whether it was picked up', () => {
    const records = leaveRecords([rackGame([10], true)]);
    expect(records).toHaveLength(1);
    // Nine frames, since the tenth is excluded as its bonus ball is not a
    // spare attempt at the leave before it.
    expect(records[0].times).toBe(9);
    expect(records[0].converted).toBe(9);
    expect(records[0].label).toBe('10 pin');
    expect(records[0].isSplit).toBe(false);
  });

  it('counts a missed leave as faced but not converted', () => {
    const records = leaveRecords([rackGame([10], false)]);
    expect(records[0].times).toBe(9);
    expect(records[0].converted).toBe(0);
  });

  it('marks a split leave as one', () => {
    const records = leaveRecords([rackGame([7, 10], false)]);
    expect(records[0].isSplit).toBe(true);
    expect(records[0].label).toBe('7-10 split');
  });

  it('ignores frames that struck, since they leave nothing', () => {
    expect(leaveRecords([game(strikes, 0, { pinfalls: Array(12).fill(FULL) })])).toEqual([]);
  });

  it('orders the most frequent leave first', () => {
    const records = leaveRecords([rackGame([10], true, 'a'), rackGame([10], true, 'b'), rackGame([7], false, 'c')]);
    expect(records[0].pins).toEqual([10]);
    expect(records[0].times).toBe(18);
    expect(records[1].pins).toEqual([7]);
  });
});

describe('splitSummary', () => {
  const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('reports nothing when no split has come up', () => {
    const summary = splitSummary([game(open4s)]);
    expect(summary.faced).toBe(0);
    expect(summary.rate).toBeNull();
  });

  it('counts splits faced and converted', () => {
    const leave = [7, 10];
    const first = FULL.filter((p) => !leave.includes(p));
    const rolls: number[] = [];
    const pinfalls: number[][] = [];
    for (let f = 0; f < 10; f++) {
      rolls.push(8); pinfalls.push(first);
      // Convert every other one.
      const got = f % 2 === 0;
      rolls.push(got ? 2 : 0);
      pinfalls.push(got ? leave : []);
    }
    const card = scoreGame(rolls);
    const g: Game = {
      id: 'sp', bowler: 'You', rolls, pinfalls, total: card.total,
      isComplete: card.isComplete, source: 'manual', playedAt: NOW, updatedAt: NOW,
    };

    const summary = splitSummary([g]);
    expect(summary.faced).toBe(9);
    expect(summary.converted).toBe(5);
    expect(summary.rate).toBe(56);
  });
});

describe('metricSeries', () => {
  const at = (day: number) => new Date(2026, 0, day).getTime();
  const g = (rolls: number[], total: number, day: number): Game => ({
    id: `m${day}`,
    bowler: 'You',
    rolls,
    total,
    isComplete: true,
    source: 'manual',
    playedAt: at(day),
    updatedAt: at(day),
  });

  const STRIKES = new Array(12).fill(10);
  const OPENS = new Array(10).fill([4, 3]).flat();
  const SPARES = [...new Array(10).fill([7, 3]).flat(), 7];

  it('reads oldest first, whatever order the games arrive in', () => {
    const series = metricSeries([g(OPENS, 70, 9), g(STRIKES, 300, 1)], 'avg');
    expect(series.map((p) => p.value)).toEqual([300, 70]);
  });

  it('scores a perfect game as every frame struck', () => {
    expect(metricSeries([g(STRIKES, 300, 1)], 'strike')[0].value).toBe(100);
  });

  it('does not count strikes as converted spares', () => {
    // No spare was ever attempted, so conversion is vacuously complete rather
    // than a reading of anything the bowler did.
    expect(metricSeries([g(STRIKES, 300, 1)], 'spare')[0].value).toBe(100);
    expect(metricSeries([g(SPARES, 130, 1)], 'spare')[0].value).toBe(100);
    expect(metricSeries([g(OPENS, 70, 1)], 'spare')[0].value).toBe(0);
  });

  it('counts pins felled, which is not the score', () => {
    // A perfect game fells 120 pins and scores 300.
    expect(metricSeries([g(STRIKES, 300, 1)], 'pins')[0].value).toBe(120);
  });

  it('averages across every game so far, not a trailing window', () => {
    const series = metricSeries([g(STRIKES, 300, 1), g(OPENS, 70, 2)], 'avg');
    expect(series[0].rolling).toBe(300);
    expect(series[1].rolling).toBe(185);
  });

  it('settles rather than lurching as games accumulate', () => {
    // A season average moves by a point when one game goes badly; a ten-game
    // window would drop off a cliff, and a lurching line invites reading
    // weather as climate.
    const games = Array.from({ length: 20 }, (_, i) => g(OPENS, 150, i + 1));
    const series = metricSeries([...games, g(OPENS, 60, 25)], 'avg');
    expect(series[series.length - 1].rolling).toBeCloseTo(145.7, 1);
  });

  it('ignores a game still in progress', () => {
    const partial = { ...g(OPENS, 40, 3), isComplete: false };
    expect(metricSeries([g(STRIKES, 300, 1), partial], 'avg')).toHaveLength(1);
  });
});

describe('metricChange', () => {
  it('reports where a metric stands and how far it moved', () => {
    const change = metricChange([
      { playedAt: 1, value: 100, rolling: 100 },
      { playedAt: 2, value: 160, rolling: 130 },
    ]);
    expect(change).toEqual({ now: 130, delta: 30 });
  });

  it('has nothing to say about an empty range', () => {
    expect(metricChange([])).toBeNull();
  });
});

describe('dailyStats', () => {
  // Two nights: a three-game Saturday and a single game two days later.
  const saturday = [
    game(open4s, 4, { id: 'sat-1' }),
    game(spares, 4, { id: 'sat-2', playedAt: NOW - 4 * DAY + 3600_000 }),
    game(strikes, 4, { id: 'sat-3', playedAt: NOW - 4 * DAY + 7200_000 }),
  ];
  const monday = [game(open4s, 2, { id: 'mon-1' })];
  const season = [...monday, ...saturday];

  it('gives one reading a night, oldest first', () => {
    const days = dailyStats(season);
    expect(days).toHaveLength(2);
    expect(days[0].games).toBe(3);
    expect(days[1].games).toBe(1);
    expect(days[0].at).toBeLessThan(days[1].at);
  });

  it('reads a night the way a bowler does: its average, its best, its series', () => {
    const [night] = dailyStats(saturday);
    expect(night.high).toBe(300);
    expect(night.low).toBe(80);
    expect(night.series).toBe(80 + 150 + 300);
    expect(night.average).toBe(Math.round((80 + 150 + 300) / 3));
  });

  it('agrees with the history screen about what a day is', () => {
    // Both screens group by `groupByDay`, so a night's average is one number
    // and not two that drift.
    const days = dailyStats(saturday);
    expect(days[0].key).toBe(dailyStats([saturday[2]])[0].key);
  });

  it('has nothing to say about an empty season', () => {
    expect(dailyStats([])).toEqual([]);
  });
});

describe('dailySeries', () => {
  it('plots the day and carries the average of the days so far', () => {
    const days = dailyStats([game(open4s, 4), game(strikes, 2)]);
    const series = dailySeries(days);

    expect(series.map((point) => point.value)).toEqual([80, 300]);
    // The line is the average of every *day*, so one big night counts once.
    expect(series[1].rolling).toBe(190);
  });

  it('has nothing to plot without days', () => {
    expect(dailySeries([])).toEqual([]);
  });
});
