/**
 * What the home screen shows.
 *
 * The dashboard answers four questions in one glance — what is the best you
 * have done, how are you doing on average, what did you bowl last, and what is
 * your crew up to — so everything it needs is derived here and the screen only
 * lays it out.
 */

import type { Game } from './db';
import type { Group } from '../lib/social';
import { rankRoster } from './leaderboard';
import { scoreGame } from './scoring';
import { ballOutcomes } from './stats';

export interface GameShape {
  strikes: number;
  spares: number;
  /** Pins actually felled. Not the score — that carries the bonus balls twice. */
  pins: number;
}

/** The three facts a recent-games row shows beside the score. */
export function gameShape(game: Game): GameShape {
  const card = scoreGame(game.rolls);
  return {
    strikes: card.frames.filter((frame) => frame.isStrike).length,
    spares: card.frames.filter((frame) => frame.isSpare).length,
    pins: game.rolls.reduce((sum, roll) => sum + roll, 0),
  };
}

export interface Dashboard {
  /** Finished games, newest first. */
  played: Game[];
  /** The highest-scoring finished game, for the hero card. */
  best: Game | null;
  average: number | null;
  /** Share of frames opened with a strike, 0..100. */
  strikeRate: number | null;
  /** The five most recent finished games. */
  recent: Game[];
}

/**
 * A game in progress is deliberately excluded from all of it.
 *
 * A half-bowled 60 is not a 60, and letting one into the average would drag it
 * down every time somebody opened the app mid-game.
 */
export function dashboard(games: Game[], recentCount = 5): Dashboard {
  const played = games.filter((game) => game.isComplete);

  if (played.length === 0) {
    return { played, best: null, average: null, strikeRate: null, recent: [] };
  }

  const outcomes = ballOutcomes(played);
  const frames = outcomes.strikes + outcomes.spares + outcomes.opens;
  const total = played.reduce((sum, game) => sum + game.total, 0);

  return {
    played,
    // `>=` rather than `>`: `played` is newest-first, so keeping the *later*
    // element of a tie keeps the older game — the one that actually set the
    // record, rather than the one that most recently matched it.
    best: played.reduce((top, game) => (game.total >= top.total ? game : top), played[0]),
    average: Math.round(total / played.length),
    strikeRate: frames === 0 ? null : Math.round((outcomes.strikes / frames) * 100),
    recent: played.slice(0, recentCount),
  };
}

export interface CrewGlance {
  group: Group;
  /** Your position on the group's default board. */
  rank: number;
  size: number;
  unread: number;
}

/**
 * The one group the dashboard links to, and where you stand in it.
 *
 * The first group is the primary one: the list is ordered by the app, and a
 * dashboard that picked a different crew each time it recalculated something
 * would be a worse shortcut than no shortcut. Returns null when there are no
 * groups, in which case the card is not drawn at all rather than drawn empty.
 */
export function crewGlance(groups: Group[]): CrewGlance | null {
  const group = groups[0];
  if (!group || group.members.length === 0) return null;

  const standings = rankRoster(group.members, 'avg');
  const mine = standings.find((standing) => standing.member.isMe) ?? standings[0];

  return { group, rank: mine.rank, size: group.members.length, unread: group.unread };
}
