/**
 * Achievements, and being honest about them.
 *
 * Every badge is judged from stored games, never from a stored flag. That
 * costs a pass over the season each time the screen opens and buys the thing
 * that matters: a badge cannot drift out of step with the games behind it, and
 * restoring a backup or correcting a misread scan re-earns or un-earns exactly
 * what it should.
 *
 * The ones already earned stay earned regardless of what comes later — a bad
 * night does not take back a 200 game. That is a property of the criteria
 * (each asks "has this ever happened"), not a rule applied on top.
 */

import type { Game } from './db';
import { FRAMES_PER_GAME, scoreGame } from './scoring';
import { ballOutcomes } from './stats';

export interface Badge {
  key: string;
  name: string;
  /** The mark shown in the tile — a score, a mark string, an initial. */
  glyph: string;
  /** What earns it, in one line. */
  criterion: string;
  /** How it is judged, for the bowler who wants to argue with it. */
  how: string;
}

export const BADGES: Badge[] = [
  {
    key: 'hundo',
    name: 'Two-Hundo',
    glyph: '200',
    criterion: 'Bowl a single game of 200 or more.',
    how: 'Checked against the game total the moment a game is saved. One is enough and it stays earned — later low games never take it back.',
  },
  {
    key: 'turkey',
    name: 'Turkey',
    glyph: 'XXX',
    criterion: 'Three strikes in a row inside one game.',
    how: 'Counted on consecutive frames, including a run that carries into the tenth — the tenth’s bonus balls count as their own strikes.',
  },
  {
    key: 'clean',
    name: 'Clean Game',
    glyph: '/',
    criterion: 'Ten frames with no open frame.',
    how: 'Every frame struck or spared. The tenth counts as closed if its first two balls did.',
  },
  {
    key: 'master',
    name: 'Strike Master',
    glyph: '7X',
    criterion: 'Seven or more strikes in one game.',
    how: 'Strikes in the ten scoring frames, plus any struck bonus balls in the tenth.',
  },
  {
    key: 'century',
    name: 'Century Club',
    glyph: 'C',
    criterion: 'Log 100 games.',
    how: 'Finished games only — an abandoned game does not count towards it.',
  },
  {
    key: 'iron',
    name: 'Iron Wrist',
    glyph: '25',
    criterion: 'Twenty-five games inside one calendar month.',
    how: 'Counted per calendar month in your own timezone, not per rolling thirty days.',
  },
  {
    key: 'surgeon',
    name: 'Spare Surgeon',
    glyph: '70',
    criterion: 'Lifetime spare conversion of 70%.',
    how: 'Spares taken as a share of the frames where a spare was possible. Strikes are not counted as converted spares.',
  },
  {
    key: 'front9',
    name: 'Front Nine',
    glyph: '9X',
    criterion: 'Strike in each of the first nine frames.',
    how: 'The first nine frames only — what happens in the tenth does not matter.',
  },
];

export interface BadgeStatus extends Badge {
  earned: boolean;
  /** When it was first earned, if it has been. */
  earnedAt: number | null;
  /** How far along, 0..1, for one not yet earned. */
  progress: number;
}

export function badgeStatuses(games: Game[]): BadgeStatus[] {
  // Oldest first, so the first game that satisfies a badge is the one that
  // earned it rather than the most recent one that happens to.
  const played = games
    .filter((game) => game.isComplete)
    .sort((a, b) => a.playedAt - b.playedAt);

  const cards = played.map((game) => ({ game, card: scoreGame(game.rolls) }));

  const firstWhere = (test: (entry: (typeof cards)[number]) => boolean) => {
    const hit = cards.find(test);
    return hit ? hit.game.playedAt : null;
  };

  const strikesIn = (entry: (typeof cards)[number]) =>
    entry.card.frames.filter((frame) => frame.isStrike).length;

  const outcomes = ballOutcomes(played);
  const attempts = outcomes.spares + outcomes.opens;
  const conversion = attempts === 0 ? 0 : outcomes.spares / attempts;

  const busiest = busiestMonth(played);

  const earnedAt: Record<string, number | null> = {
    hundo: firstWhere((e) => e.game.total >= 200),
    turkey: firstWhere((e) => longestStrikeRun(e.card.frames.map((f) => f.isStrike)) >= 3),
    clean: firstWhere((e) =>
      e.card.frames.slice(0, FRAMES_PER_GAME).every((f) => f.isStrike || f.isSpare),
    ),
    master: firstWhere((e) => strikesIn(e) >= 7),
    century: played.length >= 100 ? played[99].playedAt : null,
    iron: busiest.count >= 25 ? busiest.at : null,
    surgeon: conversion >= 0.7 && attempts > 0 ? played[played.length - 1]?.playedAt ?? null : null,
    front9: firstWhere((e) =>
      e.card.frames.slice(0, 9).every((f) => f.isStrike) && e.card.frames.length >= 9,
    ),
  };

  const progress: Record<string, number> = {
    hundo: share(Math.max(0, ...played.map((g) => g.total)), 200),
    turkey: share(Math.max(0, ...cards.map((e) => longestStrikeRun(e.card.frames.map((f) => f.isStrike)))), 3),
    clean: share(
      Math.max(
        0,
        ...cards.map((e) => e.card.frames.slice(0, FRAMES_PER_GAME).filter((f) => f.isStrike || f.isSpare).length),
      ),
      FRAMES_PER_GAME,
    ),
    master: share(Math.max(0, ...cards.map(strikesIn)), 7),
    century: share(played.length, 100),
    iron: share(busiest.count, 25),
    surgeon: share(conversion, 0.7),
    front9: share(
      Math.max(0, ...cards.map((e) => leadingStrikes(e.card.frames.map((f) => f.isStrike)))),
      9,
    ),
  };

  return BADGES.map((badge) => ({
    ...badge,
    earned: earnedAt[badge.key] !== null,
    earnedAt: earnedAt[badge.key],
    progress: earnedAt[badge.key] !== null ? 1 : progress[badge.key] ?? 0,
  }));
}

/** Longest run of trues. */
export function longestStrikeRun(flags: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** How many trues before the first false. */
export function leadingStrikes(flags: boolean[]): number {
  const stop = flags.indexOf(false);
  return stop === -1 ? flags.length : stop;
}

/** The calendar month holding the most games, and when it fell. */
export function busiestMonth(games: Game[]): { count: number; at: number } {
  const months = new Map<string, { count: number; at: number }>();

  for (const game of games) {
    const date = new Date(game.playedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const seen = months.get(key);
    if (seen) {
      seen.count += 1;
      seen.at = Math.max(seen.at, game.playedAt);
    } else {
      months.set(key, { count: 1, at: game.playedAt });
    }
  }

  let best = { count: 0, at: 0 };
  for (const month of months.values()) if (month.count > best.count) best = month;
  return best;
}

function share(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}
