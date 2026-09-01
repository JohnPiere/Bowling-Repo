/**
 * Deriving season statistics from stored games.
 *
 * Pure functions over a game list: the analytics screen renders what these
 * return and computes nothing itself, so every number on it is testable
 * without a browser.
 */

import type { Game } from './db';
import { describeLeave, isSplit, leavesFromPinfalls } from './pins';
import { FRAMES_PER_GAME, scoreGame } from './scoring';

export type RangeKey = 'g5' | 'd30' | 'd90' | 'd180' | 'all';

export const RANGES: { key: RangeKey; label: string; games?: number; days?: number }[] = [
  { key: 'g5', label: 'Last 5', games: 5 },
  { key: 'd30', label: '30 days', days: 30 },
  { key: 'd90', label: '90 days', days: 90 },
  { key: 'd180', label: '6 months', days: 180 },
  { key: 'all', label: 'Lifetime' },
];

/**
 * Narrow a game list to a range.
 *
 * `games` arrives newest-first (the order `listGames` returns), which is what
 * the "last N games" ranges depend on.
 */
export function applyRange(games: Game[], key: RangeKey, now = Date.now()): Game[] {
  const range = RANGES.find((r) => r.key === key);
  if (!range || key === 'all') return games;
  if (range.games !== undefined) return games.slice(0, range.games);
  if (range.days !== undefined) {
    const cutoff = now - range.days * 24 * 60 * 60 * 1000;
    return games.filter((game) => game.playedAt >= cutoff);
  }
  return games;
}

export interface Summary {
  games: number;
  average: number | null;
  high: number | null;
  low: number | null;
  totalPins: number;
  /** Share of frames opened with a strike, 0..100. */
  strikeRate: number | null;
}

export function summarise(games: Game[]): Summary {
  const finished = games.filter((game) => game.isComplete);

  if (finished.length === 0) {
    return { games: 0, average: null, high: null, low: null, totalPins: 0, strikeRate: null };
  }

  const scores = finished.map((game) => game.total);
  const totalPins = scores.reduce((a, b) => a + b, 0);
  const outcomes = ballOutcomes(finished);
  const frames = outcomes.strikes + outcomes.spares + outcomes.opens;

  return {
    games: finished.length,
    average: Math.round(totalPins / finished.length),
    high: Math.max(...scores),
    low: Math.min(...scores),
    totalPins,
    strikeRate: frames === 0 ? null : Math.round((outcomes.strikes / frames) * 100),
  };
}

export interface TrendPoint {
  playedAt: number;
  score: number;
  /** Mean of this game and the ones before it, up to the window. */
  rolling: number;
}

/**
 * Score per game with a trailing rolling average, oldest first.
 *
 * The rolling mean expands until it has a full window, so an early season
 * shows a real average rather than a gap.
 */
export function scoreTrend(games: Game[], window = 10): TrendPoint[] {
  const finished = games
    .filter((game) => game.isComplete)
    .slice()
    .sort((a, b) => a.playedAt - b.playedAt);

  return finished.map((game, index) => {
    const from = Math.max(0, index - window + 1);
    const slice = finished.slice(from, index + 1);
    const rolling = slice.reduce((sum, g) => sum + g.total, 0) / slice.length;

    return {
      playedAt: game.playedAt,
      score: game.total,
      rolling: Math.round(rolling),
    };
  });
}

export interface BallOutcomes {
  strikes: number;
  spares: number;
  opens: number;
}

/**
 * How each frame finished, across every game.
 *
 * One count per frame — the tenth contributes once, classified by how it
 * opened, so a game always contributes ten frames and the shares add to 1.
 */
export function ballOutcomes(games: Game[]): BallOutcomes {
  const outcomes: BallOutcomes = { strikes: 0, spares: 0, opens: 0 };

  for (const game of games) {
    for (const frame of scoreGame(game.rolls).frames) {
      if (frame.rolls.length === 0) continue;
      if (frame.isStrike) outcomes.strikes += 1;
      else if (frame.isSpare) outcomes.spares += 1;
      else if (frame.isComplete) outcomes.opens += 1;
    }
  }

  return outcomes;
}

/**
 * How many pins the first ball of a frame takes down, bucketed 0..10.
 *
 * Only the ball thrown at a full rack counts, so the tenth frame's bonus
 * balls are excluded — mixing them in would flatter the distribution.
 */
export function firstBallDistribution(games: Game[]): number[] {
  const counts = new Array<number>(11).fill(0);

  for (const game of games) {
    const frames = scoreGame(game.rolls).frames;
    for (let index = 0; index < FRAMES_PER_GAME; index++) {
      const first = frames[index].rolls[0];
      if (first !== undefined) counts[first] += 1;
    }
  }

  return counts;
}

/** Longest run of consecutive strikes across a single game. */
export function bestStrikeRun(games: Game[]): number {
  let best = 0;

  for (const game of games) {
    let run = 0;
    for (const roll of game.rolls) {
      if (roll === 10) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
  }

  return best;
}


export interface LeaveRecord {
  /** The pins that stood, sorted. */
  pins: number[];
  label: string;
  /** How often this leave came up. */
  times: number;
  /** How often the next ball cleared it. */
  converted: number;
  isSplit: boolean;
}

/**
 * What gets left standing, and how often it gets picked up.
 *
 * Only games scored on the rack carry pin data, so this is silent about the
 * rest rather than guessing. A leave counts only when there was a ball after
 * it to convert with — the last ball of a game leaves something standing that
 * was never a spare attempt.
 */
export function leaveRecords(games: Game[]): LeaveRecord[] {
  const byKey = new Map<string, LeaveRecord>();

  for (const game of games) {
    if (!game.pinfalls?.length) continue;

    const leaves = leavesFromPinfalls(game.pinfalls);
    const frames = scoreGame(game.rolls).frames;

    // Which ball index starts each frame, so a leave can be tied to the frame
    // it belongs to and the last ball of one is not read as a spare attempt.
    let ball = 0;
    for (const frame of frames) {
      const first = ball;
      ball += frame.rolls.length;

      // A strike leaves nothing; the tenth is skipped because its bonus balls
      // are not spare attempts at the leave before them.
      if (frame.isStrike || frame.index === FRAMES_PER_GAME - 1) continue;
      if (frame.rolls.length < 2) continue;

      const standing = leaves[first];
      if (!standing || standing.length === 0) continue;

      const key = standing.join('-');
      const record = byKey.get(key) ?? {
        pins: standing,
        label: describeLeave(standing),
        times: 0,
        converted: 0,
        isSplit: isSplit(standing),
      };

      record.times += 1;
      // Converted when the frame ended as a spare.
      if (frame.isSpare) record.converted += 1;
      byKey.set(key, record);
    }
  }

  return [...byKey.values()].sort((a, b) => b.times - a.times || a.pins.length - b.pins.length);
}

export interface SplitSummary {
  faced: number;
  converted: number;
  /** 0..100, or null when no split has come up. */
  rate: number | null;
  /** Frames with pin data behind these numbers. */
  framesWithPins: number;
}

export function splitSummary(games: Game[]): SplitSummary {
  const records = leaveRecords(games);
  const splits = records.filter((record) => record.isSplit);

  const faced = splits.reduce((sum, record) => sum + record.times, 0);
  const converted = splits.reduce((sum, record) => sum + record.converted, 0);
  const framesWithPins = records.reduce((sum, record) => sum + record.times, 0);

  return {
    faced,
    converted,
    rate: faced === 0 ? null : Math.round((converted / faced) * 100),
    framesWithPins,
  };
}


/* ── The metric the trend chart plots ─────────────────────────────────────
 *
 * One chart, four readings of it. The handoff puts these in a tab row above
 * the plot rather than drawing four charts: they share an x-axis and a range,
 * and only one of them is the question being asked at any moment.
 */

export type MetricKey = 'avg' | 'strike' | 'spare' | 'pins';

export const METRICS: { key: MetricKey; label: string; short: string; unit: string }[] = [
  { key: 'avg', label: 'Average progression', short: 'Average', unit: '' },
  { key: 'strike', label: 'Strike %', short: 'Strike %', unit: '%' },
  { key: 'spare', label: 'Spare conversion', short: 'Spare %', unit: '%' },
  { key: 'pins', label: 'Total pins per game', short: 'Pins', unit: '' },
];

export interface MetricPoint {
  playedAt: number;
  /** The game's own reading of the metric. */
  value: number;
  /** …and the ten-game rolling average of it, which is the line drawn. */
  rolling: number;
}

/**
 * One metric, game by game, oldest first.
 *
 * Spare conversion counts only frames where a spare was possible: a strike is
 * not a missed spare, and counting it as a converted one would let a good
 * striking night flatter a bad spare night.
 */
export function metricSeries(games: Game[], metric: MetricKey, window = 10): MetricPoint[] {
  const played = [...games]
    .filter((game) => game.isComplete)
    .sort((a, b) => a.playedAt - b.playedAt);

  const raw = played.map((game) => {
    const card = scoreGame(game.rolls);
    const frames = card.frames.slice(0, FRAMES_PER_GAME);

    switch (metric) {
      case 'strike': {
        const strikes = frames.filter((f) => f.isStrike).length;
        return { playedAt: game.playedAt, value: round1((strikes / FRAMES_PER_GAME) * 100) };
      }
      case 'spare': {
        const attempts = frames.filter((f) => !f.isStrike).length;
        const spares = frames.filter((f) => f.isSpare).length;
        return {
          playedAt: game.playedAt,
          value: attempts === 0 ? 100 : round1((spares / attempts) * 100),
        };
      }
      case 'pins':
        return { playedAt: game.playedAt, value: game.rolls.reduce((a, b) => a + b, 0) };
      default:
        return { playedAt: game.playedAt, value: game.total };
    }
  });

  return raw.map((point, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = raw.slice(from, i + 1);
    return {
      ...point,
      rolling: round1(slice.reduce((sum, p) => sum + p.value, 0) / slice.length),
    };
  });
}

/** Where a metric stands now, and how far it has come across the range. */
export function metricChange(series: MetricPoint[]): { now: number; delta: number } | null {
  if (series.length === 0) return null;
  const now = series[series.length - 1].rolling;
  return { now, delta: round1(now - series[0].rolling) };
}

export interface PersonalRecords {
  high: number;
  /** Average of the ten most recent games — the number most people mean. */
  recentAverage: number;
  longestStrikeRun: number;
  sparePercent: number;
}

export function personalRecords(games: Game[]): PersonalRecords {
  const played = games.filter((game) => game.isComplete);
  if (played.length === 0) {
    return { high: 0, recentAverage: 0, longestStrikeRun: 0, sparePercent: 0 };
  }

  // `games` arrives newest-first, so the ten most recent are the first ten.
  const recent = played.slice(0, 10);
  const outcomes = ballOutcomes(played);
  const attempts = outcomes.spares + outcomes.opens;

  return {
    high: Math.max(...played.map((game) => game.total)),
    recentAverage: round1(recent.reduce((sum, g) => sum + g.total, 0) / recent.length),
    longestStrikeRun: bestStrikeRun(played),
    sparePercent: attempts === 0 ? 0 : Math.round((outcomes.spares / attempts) * 100),
  };
}

export interface SpareBreakdown {
  /** Spares taken from a single pin — the ones that should always go. */
  single: number;
  /** …and from two or more, which is where the skill is. */
  multi: number;
  total: number;
}

/**
 * How the spares were made, split by what was left standing.
 *
 * Needs pin data, so it only counts frames scored on the rack. A game entered
 * by count knows a spare happened but not what it was taken from, and guessing
 * would put a number on the screen that nothing measured.
 */
export function spareBreakdown(games: Game[]): SpareBreakdown {
  let single = 0;
  let multi = 0;

  for (const game of games) {
    if (!game.pinfalls) continue;
    const card = scoreGame(game.rolls);
    const leaves = leavesFromPinfalls(game.pinfalls);

    card.frames.slice(0, FRAMES_PER_GAME).forEach((frame, i) => {
      if (!frame.isSpare) return;
      const left = leaves[i];
      if (!left || left.length === 0) return;
      if (left.length === 1) single += 1;
      else multi += 1;
    });
  }

  return { single, multi, total: single + multi };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
