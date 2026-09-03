/**
 * Deriving season statistics from stored games.
 *
 * Pure functions over a game list: the analytics screen renders what these
 * return and computes nothing itself, so every number on it is testable
 * without a browser.
 */

import type { Game } from './db';
import { groupByDay } from './history';
import { describeLeave, isSplit, leavesFromPinfalls } from './pins';
import { FRAMES_PER_GAME, frameMarks, scoreGame, type Frame } from './scoring';

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


/**
 * Anything that has been bowled, whoever bowled it.
 *
 * A structural type rather than `Game`, because the same counting has to work
 * on a crew member's *shared* games — which is all anybody else can see of
 * them — and those are rows from the server, not records from this phone.
 */
export interface Bowled {
  rolls: number[];
  playedAt: number;
  isComplete?: boolean;
}

/**
 * The running totals of a bowling life.
 *
 * Every field here is a count of something that happened, which is what makes
 * them worth keeping: an average moves up and down and says how you are
 * bowling, while "eleven thousand balls" only ever goes up and says how much
 * you have bowled. They answer different questions and the second one has no
 * other home in the app.
 */
export interface Tally {
  /** Games started, finished or not. */
  games: number;
  /** Games with a tenth frame in them. Averages are over these. */
  finished: number;
  /** Frames with at least one ball in them. */
  frames: number;
  /** Every ball thrown, the tenth's bonus balls included. */
  balls: number;
  /**
   * Pins knocked down — pinfall, not score.
   *
   * A perfect game is 300 points and *120 pins*, and the difference is the
   * bonuses. `Summary.totalPins` next door is a sum of scores despite its
   * name, so anything drawing both has to say which it means or the two look
   * like a bug.
   */
  pins: number;
  /**
   * Strikes *thrown*, not frames opened with one.
   *
   * A perfect game is twelve strikes, and anybody counting their own will say
   * twelve — the tenth is three of them. `ballOutcomes` next door counts the
   * same game as ten, on purpose, because it is working out percentages and
   * its shares have to add to one. Both are right for their own question and
   * they must never be drawn beside each other unlabelled.
   */
  strikes: number;
  /** Spares thrown, the tenth's included, on the same basis. */
  spares: number;
  /** Frames that finished with pins still up. */
  opens: number;
  /**
   * Balls that took nothing down.
   *
   * Not "gutters" exactly, and deliberately not called that: a ball in the
   * channel and a spare attempt that missed everything are the same 0 in a
   * score line, and nothing recorded here can separate them.
   */
  zeroBalls: number;
  high: number | null;
  average: number | null;
}

const EMPTY_TALLY: Tally = {
  games: 0,
  finished: 0,
  frames: 0,
  balls: 0,
  pins: 0,
  strikes: 0,
  spares: 0,
  opens: 0,
  zeroBalls: 0,
  high: null,
  average: null,
};

/** Add up everything that was bowled. */
export function tally(bowled: Bowled[]): Tally {
  const out: Tally = { ...EMPTY_TALLY };
  const finishedScores: number[] = [];

  for (const one of bowled) {
    out.games += 1;
    out.balls += one.rolls.length;

    for (const pins of one.rolls) {
      out.pins += pins;
      if (pins === 0) out.zeroBalls += 1;
    }

    const card = scoreGame(one.rolls);
    for (const frame of card.frames) {
      if (frame.rolls.length === 0) continue;
      out.frames += 1;

      // Counted off the marks the sheet would show, which is what makes the
      // tenth come out as three strikes rather than one. `frameMarks` already
      // knows when a ten is a strike and when it is a spare.
      for (const mark of frameMarks(frame)) {
        if (mark === 'X') out.strikes += 1;
        else if (mark === '/') out.spares += 1;
      }

      if (frame.isComplete && !frame.isStrike && !frame.isSpare) out.opens += 1;
    }

    // The scorer decides what finished means, not the stored flag: a game
    // restored or synced from elsewhere has been rescored from its rolls
    // anyway, and a flag that disagreed with them would put a half-game into
    // an average.
    if (card.isComplete) {
      out.finished += 1;
      finishedScores.push(card.total);
    }
  }

  if (finishedScores.length > 0) {
    out.high = Math.max(...finishedScores);
    out.average = Math.round(finishedScores.reduce((a, b) => a + b, 0) / finishedScores.length);
  }

  return out;
}

export interface MonthTally extends Tally {
  /** `YYYY-MM`, for keying and sorting. */
  month: string;
  /** Midnight on the first, for formatting the month's name. */
  at: number;
}

/**
 * The same totals, a month at a time, most recent first.
 *
 * Months with nothing bowled are absent rather than zero: a run of empty rows
 * for a winter nobody bowled says less than the gap between two dates does.
 */
export function monthlyTallies(bowled: Bowled[]): MonthTally[] {
  const byMonth = new Map<string, Bowled[]>();

  for (const one of bowled) {
    const date = new Date(one.playedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const list = byMonth.get(key);
    if (list) list.push(one);
    else byMonth.set(key, [one]);
  }

  return [...byMonth.entries()]
    .map(([month, games]) => {
      const [year, m] = month.split('-').map(Number);
      return { ...tally(games), month, at: new Date(year, m - 1, 1).getTime() };
    })
    .sort((a, b) => b.at - a.at);
}

/** This calendar month's totals, which is the counter people watch. */
export function thisMonth(bowled: Bowled[], now = Date.now()): Tally {
  const date = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return tally(bowled.filter((one) => one.playedAt >= start && one.playedAt < end));
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

    const leaves = leavesFromPinfalls(game.pinfalls, game.rolls);
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


export interface SplitRecord extends LeaveRecord {
  /** 0..100 — how often this split was picked up. */
  conversionRate: number;
  /**
   * 0..100 — the same number the other way round.
   *
   * Both, because they are not the same question. "I convert the 3-10 a third
   * of the time" is a thing to be pleased about; "the 3-10 costs me the frame
   * two times in three" is the one that decides what to practise, and a reader
   * should not have to do the subtraction to get it.
   */
  missRate: number;
}

/**
 * Which splits come up, most often first, and how each one goes.
 *
 * Ordered by how often it happens rather than by how badly it goes, because
 * the question this answers is "what keeps happening to me". A 7-10 converted
 * none of one time is a worse *rate* than anything else here and is not worth
 * a line above a 3-10 left twenty times.
 *
 * Only games scored on the rack carry the pin data this needs; the rest are
 * silently absent, which `splitSummary().framesWithPins` is there to say.
 */
export function splitRecords(games: Game[], limit?: number): SplitRecord[] {
  const splits = leaveRecords(games)
    .filter((record) => record.isSplit)
    .map((record) => ({
      ...record,
      conversionRate: Math.round((record.converted / record.times) * 100),
      missRate: Math.round(((record.times - record.converted) / record.times) * 100),
    }));

  return limit === undefined ? splits : splits.slice(0, limit);
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
  /**
   * The line that is actually drawn: the metric's *progression*, meaning its
   * average across every game up to and including this one.
   *
   * Cumulative rather than a trailing window, because that is what "average
   * progression" means and what a bowler is asking when they look at it — not
   * "how have I been lately" but "where has this settled". It also behaves:
   * one bad game moves a season average by a point, where a ten-game window
   * lurches, and a lurching line invites reading weather as climate.
   */
  rolling: number;
}

/**
 * One metric, game by game, oldest first.
 *
 * Spare conversion counts only frames where a spare was possible: a strike is
 * not a missed spare, and counting it as a converted one would let a good
 * striking night flatter a bad spare night.
 */
/**
 * How often the first ball at a full rack struck, 0..100.
 *
 * Over frames *bowled* rather than over ten, which for a finished game is the
 * same number and for an unfinished one is the honest one — a game abandoned
 * after four frames with two strikes bowled 50%, not 20%.
 */
export function strikePercent(frames: Frame[]): number {
  const bowled = frames.slice(0, FRAMES_PER_GAME).filter((frame) => frame.rolls.length > 0);
  if (bowled.length === 0) return 0;
  return round1((bowled.filter((frame) => frame.isStrike).length / bowled.length) * 100);
}

/**
 * How often a spare attempt was converted, 0..100.
 *
 * A struck frame is not an attempt, and neither is a frame still waiting on its
 * second ball. A game with no attempt in it is 100 rather than 0: nothing was
 * missed.
 */
export function sparePercent(frames: Frame[]): number {
  const attempts = frames
    .slice(0, FRAMES_PER_GAME)
    .filter((frame) => frame.rolls.length > 0 && frame.isComplete && !frame.isStrike);
  if (attempts.length === 0) return 100;
  return round1((attempts.filter((frame) => frame.isSpare).length / attempts.length) * 100);
}

export function metricSeries(games: Game[], metric: MetricKey): MetricPoint[] {
  const played = [...games]
    .filter((game) => game.isComplete)
    .sort((a, b) => a.playedAt - b.playedAt);

  const raw = played.map((game) => {
    const card = scoreGame(game.rolls);
    const frames = card.frames.slice(0, FRAMES_PER_GAME);

    switch (metric) {
      case 'strike':
        return { playedAt: game.playedAt, value: strikePercent(frames) };
      case 'spare':
        return { playedAt: game.playedAt, value: sparePercent(frames) };
      case 'pins':
        return { playedAt: game.playedAt, value: game.rolls.reduce((a, b) => a + b, 0) };
      default:
        return { playedAt: game.playedAt, value: game.total };
    }
  });

  let running = 0;
  return raw.map((point, i) => {
    running += point.value;
    return { ...point, rolling: round1(running / (i + 1)) };
  });
}

export interface DayStat {
  /** The calendar day, as `history.ts` keys them. */
  key: string;
  /** When the first game of that day was bowled. */
  at: number;
  games: number;
  average: number;
  high: number;
  low: number;
  /** Every game of the day added up — the number a league cares about. */
  series: number;
}

/**
 * A season by the day rather than by the game, oldest first.
 *
 * Bowling happens in sessions: three games on a Tuesday are one outing, and a
 * bowler asking "how did that night go" is asking about the night. Averaged by
 * day, a good night and a bad night are one reading each — where a game-by-game
 * line gives a six-game Saturday six times the say of a single Wednesday.
 *
 * Built on `groupByDay`, which is also what the history screen lists, so a day
 * has one definition and a night's average is the same number on both screens.
 */
export function dailyStats(games: Game[]): DayStat[] {
  return groupByDay(games, 'old').map((day) => {
    const scores = day.games.map((game) => game.total);

    return {
      key: day.key,
      at: day.at,
      games: day.games.length,
      average: day.average,
      high: day.high,
      low: Math.min(...scores),
      series: day.series,
    };
  });
}

/**
 * The daily averages as a chart's points: one dot a day, and the line the
 * average of every day so far.
 *
 * The same shape `metricSeries` returns, so the same chart draws it — and the
 * same reading applies, that the dots are what happened and the line is where
 * it has settled.
 */
export function dailySeries(days: DayStat[]): MetricPoint[] {
  let running = 0;

  return days.map((day, i) => {
    running += day.average;
    return { playedAt: day.at, value: day.average, rolling: round1(running / (i + 1)) };
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
    const leaves = leavesFromPinfalls(game.pinfalls, game.rolls);

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


/**
 * How long the strike runs were, counted by length.
 *
 * `runs[3]` is how many times three strikes came in a row. A run of four
 * counts once as a four, not as two threes — the question is "how often did I
 * string four", and counting overlaps would answer a different one.
 */
export function strikeRuns(games: Game[], longest = 7): number[] {
  const runs = new Array(longest + 1).fill(0);

  for (const game of games) {
    const card = scoreGame(game.rolls);
    let run = 0;

    for (const frame of card.frames) {
      if (frame.isStrike) {
        run += 1;
      } else {
        if (run > 0) runs[Math.min(run, longest)] += 1;
        run = 0;
      }
    }
    if (run > 0) runs[Math.min(run, longest)] += 1;
  }

  return runs;
}

export interface ConversionByType {
  /** Frames where exactly one pin was left, and how many were picked up. */
  single: { attempts: number; converted: number };
  /** …and where two or more were. */
  multi: { attempts: number; converted: number };
}

/**
 * Spare conversion split by what was left standing.
 *
 * The number worth knowing: a single pin should go almost every time, and the
 * gap between that rate and the multi-pin one is where practice pays. Needs
 * pin data, so it counts only frames scored on the rack.
 */
export function conversionByType(games: Game[]): ConversionByType {
  const result: ConversionByType = {
    single: { attempts: 0, converted: 0 },
    multi: { attempts: 0, converted: 0 },
  };

  for (const game of games) {
    if (!game.pinfalls) continue;
    const card = scoreGame(game.rolls);
    const leaves = leavesFromPinfalls(game.pinfalls, game.rolls);

    card.frames.slice(0, FRAMES_PER_GAME).forEach((frame, i) => {
      // A strike leaves nothing, so it was never a spare attempt.
      if (frame.isStrike) return;
      const left = leaves[i];
      if (!left || left.length === 0) return;

      const bucket = left.length === 1 ? result.single : result.multi;
      bucket.attempts += 1;
      if (frame.isSpare) bucket.converted += 1;
    });
  }

  return result;
}

export interface PracticeTarget extends LeaveRecord {
  /** Times the next ball did not clear it. */
  missed: number;
  /** How many pins stayed standing because of it, across the range. */
  pinsLost: number;
  /** 0..100. */
  rate: number;
}

/**
 * What to work on, in the order it is costing pins.
 *
 * `leaveRecords` is sorted by how often a leave comes up, which puts the head
 * pin miss you convert every time above the 10-pin you never do. That ordering
 * answers "what do I leave", and the question a bowler actually wants answered
 * is "what is it costing me" — so this multiplies the misses by the pins left
 * standing and sorts on that.
 *
 * The number is deliberately **pins on the deck, not points**: a missed spare
 * also costs the bonus ball, which depends on what came next and therefore
 * differs every time the same leave is missed. Pins left standing is the part
 * that is the same on every occurrence and the part practice moves, so it is
 * the honest thing to rank on. The 4-pin missed twelve times has cost 48 pins
 * whatever followed it.
 *
 * Leaves that are always converted score zero and are dropped: a list of things
 * to work on should not contain things that are working.
 */
export function practiceTargets(games: Game[], limit = 5): PracticeTarget[] {
  return leaveRecords(games)
    .map((leave) => {
      const missed = leave.times - leave.converted;
      return {
        ...leave,
        missed,
        pinsLost: missed * leave.pins.length,
        rate: Math.round((leave.converted / leave.times) * 100),
      };
    })
    .filter((target) => target.pinsLost > 0)
    .sort(
      (a, b) =>
        b.pinsLost - a.pinsLost ||
        b.missed - a.missed ||
        // On a tie the easier one first: it is the one to fix.
        a.pins.length - b.pins.length,
    )
    .slice(0, limit);
}

export interface HouseStat {
  house: string;
  games: number;
  average: number;
  high: number;
  /** When this bowler was last there. */
  lastAt: number;
}

/**
 * How the season looks house by house.
 *
 * `house` is stored on every game and until now was only ever printed as a
 * label. It is worth more than that: lanes differ, and a bowler averaging 20
 * pins better at one house than another is looking at the oil pattern rather
 * than at themselves.
 *
 * Ordered by average rather than by how often each was visited, because the
 * comparison is the whole point of the list. The game count rides along beside
 * it so a house visited once is visibly that, rather than a claim.
 *
 * Games with no house are left out entirely rather than pooled into an
 * "unknown" row — a bucket holding the games from six different alleys has an
 * average that describes nowhere.
 */
export function houseStats(games: Game[]): HouseStat[] {
  const byHouse = new Map<string, Game[]>();

  for (const game of games) {
    const house = game.house?.trim();
    if (!house) continue;

    // Keyed case-insensitively so "Rose Bowl" and "rose bowl" are one alley,
    // and displayed as it was first written.
    const key = house.toLowerCase();
    const seen = byHouse.get(key);
    if (seen) seen.push(game);
    else byHouse.set(key, [game]);
  }

  const stats: HouseStat[] = [...byHouse.values()].map((played) => {
    const total = played.reduce((sum, game) => sum + game.total, 0);

    return {
      house: played[0].house!.trim(),
      games: played.length,
      average: Math.round(total / played.length),
      high: Math.max(...played.map((game) => game.total)),
      lastAt: Math.max(...played.map((game) => game.playedAt)),
    };
  });

  return stats.sort((a, b) => b.average - a.average || b.games - a.games);
}

/**
 * The alleys this season was bowled at, the most-played first.
 *
 * For offering rather than for reading: `houseStats` ranks by average, which
 * is the right order for a table and the wrong one for a list of suggestions —
 * there, the alley somebody is most likely to mean is the one they go to most,
 * not the one they happen to bowl best at.
 */
export function housesPlayed(games: Game[]): string[] {
  return houseStats(games)
    .slice()
    .sort((a, b) => b.games - a.games || b.lastAt - a.lastAt)
    .map((house) => house.house);
}

export interface PositionStat {
  /** Which game of the night: 1 for the first, 2 for the second. */
  position: number;
  /** Nights that got this far. */
  sessions: number;
  average: number;
  high: number;
}

/**
 * How a night goes: the average of the first game, the second, the third.
 *
 * The question underneath it is whether a bowler warms up or fades, and it is
 * one the game-by-game chart cannot answer — there, a night's three games are
 * three points on one line and the shape of the night is lost in the shape of
 * the season.
 *
 * Two things about the reading, both of which the screen has to say out loud:
 *
 * - It is **not** a fair comparison past the point where the nights stop being
 *   the same nights. Game 5 is averaged over the nights that reached a fifth
 *   game, and those are league nights and good nights, not a random sample of
 *   evenings. So positions reached by fewer than `minSessions` nights are
 *   dropped rather than drawn as though they carried the same weight.
 * - Games are in the order they were bowled within a day, which is what
 *   `groupByDay` guarantees.
 */
export function positionStats(games: Game[], minSessions = 2): PositionStat[] {
  const byPosition = new Map<number, number[]>();

  for (const day of groupByDay(games, 'old')) {
    day.games.forEach((game, index) => {
      const seen = byPosition.get(index + 1);
      if (seen) seen.push(game.total);
      else byPosition.set(index + 1, [game.total]);
    });
  }

  return [...byPosition.entries()]
    .filter(([, scores]) => scores.length >= minSessions)
    .map(([position, scores]) => ({
      position,
      sessions: scores.length,
      average: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      high: Math.max(...scores),
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Whether the night went up or down, from its first game to its last.
 *
 * The one number a session screen can add to a list of scores: three games of
 * 150, 160, 170 and three of 170, 160, 150 have the same series and the same
 * average, and are not the same evening.
 *
 * Null for a single game, which has no shape.
 */
export function sessionSwing(scores: number[]): number | null {
  if (scores.length < 2) return null;
  return scores[scores.length - 1] - scores[0];
}

export interface GameSummary {
  /** Frames with a ball in them. Ten for a finished game. */
  framesBowled: number;
  strikes: number;
  spares: number;
  opens: number;
  /** Frames that ended on a mark — the count a "clean game" is measured by. */
  clean: number;
  /** Both over frames bowled and spare attempts; see the two above. */
  strikePercent: number;
  sparePercent: number;
  spareAttempts: number;
  /** Average pins on a ball thrown at a full rack, to one decimal. */
  firstBallAverage: number;
  /** The most a single frame added to the running total. */
  bestFrame: number;
  longestStrikeRun: number;
  /** Every pin knocked down, bonus balls included. */
  pinsDown: number;
  /**
   * Splits faced and picked up, or null when the game was not scored on the
   * rack — a game entered by count knows how many pins fell and not which.
   */
  splits: { faced: number; converted: number } | null;
}

/**
 * One game, read the way the analytics screen reads a season.
 *
 * The game record used to show three counts — strikes, spares, opens — which
 * say what happened and not how it went. These are the same figures the season
 * is judged on, applied to the one game, so a bowler can put a night against
 * their own average without doing the arithmetic.
 *
 * Composed out of the functions the season screen already uses rather than
 * recomputed: `strikePercent` here and `strikePercent` on the trend chart have
 * to be the same number, or the record will quietly disagree with the line it
 * is a point on.
 */
export function gameSummary(game: Game): GameSummary {
  const frames = scoreGame(game.rolls).frames.slice(0, FRAMES_PER_GAME);
  const bowled = frames.filter((frame) => frame.rolls.length > 0);
  const outcomes = ballOutcomes([game]);

  const firstBalls = firstBallDistribution([game]);
  const thrown = firstBalls.reduce((sum, count) => sum + count, 0);
  const pins = firstBalls.reduce((sum, count, value) => sum + count * value, 0);

  // What each frame added, which needs the frame before it — and only where
  // both scores are known, so a tenth still waiting on a bonus adds nothing
  // rather than adding its whole total.
  let bestFrame = 0;
  for (let i = 0; i < frames.length; i++) {
    const score = frames[i].score;
    const before = i === 0 ? 0 : frames[i - 1].score;
    if (score === null || before === null) continue;
    bestFrame = Math.max(bestFrame, score - before);
  }

  const splits = splitSummary([game]);

  return {
    framesBowled: bowled.length,
    strikes: outcomes.strikes,
    spares: outcomes.spares,
    opens: outcomes.opens,
    clean: outcomes.strikes + outcomes.spares,
    strikePercent: strikePercent(frames),
    sparePercent: sparePercent(frames),
    spareAttempts: bowled.filter((frame) => frame.isComplete && !frame.isStrike).length,
    firstBallAverage: thrown === 0 ? 0 : round1(pins / thrown),
    bestFrame,
    longestStrikeRun: bestStrikeRun([game]),
    pinsDown: game.rolls.reduce((sum, roll) => sum + roll, 0),
    // `framesWithPins` is zero for a game entered by count, and a zero split
    // count would read as "no splits" rather than "not recorded".
    splits:
      splits.framesWithPins === 0
        ? null
        : { faced: splits.faced, converted: splits.converted },
  };
}
