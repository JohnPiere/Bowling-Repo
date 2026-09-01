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
 * Games matching a search.
 *
 * Matches the house and the date as it is written on screen, which is what
 * someone typing "rose" or "aug" is looking at. Empty query matches everything
 * rather than nothing — a cleared box should not empty the screen.
 */
export function searchGames(games: Game[], query: string): Game[] {
  const q = query.trim().toLowerCase();
  if (!q) return games;

  return games.filter((game) => {
    const house = (game.house ?? '').toLowerCase();
    const date = new Date(game.playedAt).toLocaleDateString(dateLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return house.includes(q) || date.toLowerCase().includes(q) || String(game.total) === q;
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

  const groups: DayGroup[] = [...days.entries()].map(([key, list]) => {
    const played = [...list].sort((a, b) => a.playedAt - b.playedAt);
    const series = played.reduce((sum, game) => sum + game.total, 0);

    return {
      key,
      at: played[0].playedAt,
      house: played.find((game) => game.house)?.house,
      games: played,
      series,
      high: Math.max(...played.map((game) => game.total)),
      average: Math.round(series / played.length),
    };
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
