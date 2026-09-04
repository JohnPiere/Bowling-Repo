/**
 * Ordering, searching and grouping a season.
 *
 * The history screen shows days, not games: bowling happens in sessions, and a
 * three-game night is one outing rather than three unrelated entries. So the
 * list is grouped by the day it was bowled, each day carries its series total,
 * and the games sit under it in the order they were played.
 */

import type { Game } from './db';
import { dateLocale, formatTime } from './datetime';

export type SortKey = 'new' | 'old' | 'high' | 'low';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'new', label: 'Newest' },
  { key: 'old', label: 'Oldest' },
  { key: 'high', label: 'Highest' },
  { key: 'low', label: 'Lowest' },
];

/** The calendar day a timestamp falls on, in the bowler's own timezone. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * The longest a session can pause and still be one session.
 *
 * A three-game series takes about two hours and the gaps inside it are the
 * length of a lane change or a cigarette. Four hours is longer than any hole
 * inside one outing and shorter than the gap between two — somebody who bowls
 * before work and again that evening has been to the alley twice, and filing
 * both under one date made a 6-game series out of two 3-game ones, with an
 * average across a morning and a night that describes neither.
 *
 * A day was the boundary because it is the one people name — "that Tuesday" —
 * and it still is. This only splits a day that plainly holds two.
 */
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

/**
 * Split games that already share a day into the sessions they were bowled in.
 *
 * Generic over the timestamp so the league can use the same boundary on rows
 * from the server. It has to: the league's unit is the series and the history
 * screen's is the night, and if they disagreed about where a night ends they
 * would disagree about which games were "that Tuesday".
 *
 * The input must be in the order they were bowled; the caller sorts, because
 * both callers already have.
 */
export function splitSessions<T>(played: T[], at: (one: T) => number): T[][] {
  const sessions: T[][] = [];

  for (const one of played) {
    const current = sessions[sessions.length - 1];
    const last = current?.[current.length - 1];
    if (current && last !== undefined && at(one) - at(last) < SESSION_GAP_MS) current.push(one);
    else sessions.push([one]);
  }

  return sessions;
}

/** A session's own key: the day it fell on, plus when it started. */
export function sessionKey(at: number): string {
  return `${dayKey(at)}@${at}`;
}

/**
 * Games matching a search.
 *
 * Matches the house and the date as it is written on screen, which is what
 * someone typing "rose" or "aug" is looking at. Empty query matches everything
 * rather than nothing — a cleared box should not empty the screen.
 *
 * Notes are searched too, and they are the reason the box is worth having: a
 * house name narrows a season to a few dozen games, but "left the ten" or "new
 * ball" finds the four nights someone is actually looking for.
 */
export function searchGames(games: Game[], query: string): Game[] {
  const q = query.trim().toLowerCase();
  if (!q) return games;

  return games.filter((game) => {
    const house = (game.house ?? '').toLowerCase();
    const note = (game.note ?? '').toLowerCase();
    const date = new Date(game.playedAt).toLocaleDateString(dateLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return (
      house.includes(q) ||
      note.includes(q) ||
      date.toLowerCase().includes(q) ||
      String(game.total) === q
    );
  });
}

export interface DayGroup {
  key: string;
  /** When the session started. */
  at: number;
  /** Where, if any game in it says. */
  house?: string;
  games: Game[];
  /** Every game added up — the number a league cares about. */
  series: number;
  high: number;
  average: number;
  /**
   * True when another session fell on the same calendar day.
   *
   * The list writes the date, so two outings on one day come out as two rows
   * reading "Sep 2, 2026 · Wed" with nothing between them. Only then is the
   * start time worth the width.
   */
  sharesItsDay: boolean;
}

/**
 * Group into sessions, ordered by the chosen sort.
 *
 * Within a day the games stay in the order they were bowled whatever the sort
 * is: "game 3" means the third one of the night, and reordering them would
 * make the numbering a lie.
 */
export function groupByDay(games: Game[], sort: SortKey = 'new'): DayGroup[] {
  const days = new Map<string, Game[]>();

  for (const game of games) {
    const key = dayKey(game.playedAt);
    const seen = days.get(key);
    if (seen) seen.push(game);
    else days.set(key, [game]);
  }

  const groups: DayGroup[] = [...days.values()].flatMap((list) => {
    const order = [...list].sort((a, b) => a.playedAt - b.playedAt);

    // A day can hold two outings. Bowling in the morning and again that night
    // is not a six-game series, and an average across both describes neither.
    const sessions = splitSessions(order, (game) => game.playedAt);

    return sessions.map((played) => {
      const series = played.reduce((sum, game) => sum + game.total, 0);

      return {
        // Keyed by when it started rather than by the date, so the two
        // sessions of one day are two rows the screens can tell apart.
        key: sessionKey(played[0].playedAt),
        at: played[0].playedAt,
        house: played.find((game) => game.house)?.house,
        games: played,
        series,
        high: Math.max(...played.map((game) => game.total)),
        average: Math.round(series / played.length),
        sharesItsDay: sessions.length > 1,
      };
    });
  });

  // Sorting by score sorts the *days* by their best game, not by their series:
  // "my highest" means the night I bowled my best game, not the longest night.
  return groups.sort((a, b) => {
    switch (sort) {
      case 'old':
        return a.at - b.at;
      case 'high':
        return b.high - a.high;
      case 'low':
        return a.high - b.high;
      default:
        return b.at - a.at;
    }
  });
}

/** How long a session ran, as "19:30 – 21:05". */
export function sessionSpan(group: DayGroup): string {
  const time = formatTime;

  const last = group.games[group.games.length - 1];
  const from = time(group.at);
  const to = time(last.playedAt);
  return from === to ? from : `${from} – ${to}`;
}
