/**
 * The crew as a league: nights, not games.
 *
 * The leaderboard answers "who is bowling well", and it answers it in averages
 * because an average is the fair way to compare people who have bowled
 * different numbers of games. A league asks a different question — "who won on
 * Tuesday" — and the unit of that answer is the **series**: every game somebody
 * bowled on one night, added up.
 *
 * Two things follow, and they are the whole of this file:
 *
 * **A series is a night, and a night is a day.** `history.ts` already decides
 * where one session ends and the next begins for the bowler's own history, and
 * a league night has to be the same boundary or the two screens will disagree
 * about which games were "that Tuesday". So the day key comes from there.
 *
 * **Handicap is per game, not per series.** A three-game night earns three
 * allowances. Adding one allowance to a series would quietly halve the handicap
 * of anyone who bowls more than one game, which is the opposite of what a
 * handicap is for — it exists so a 150 bowler and a 200 bowler can be on the
 * same sheet, and the gap between them is per game.
 *
 * As everywhere else in the social layer, only *shared* games count. The board
 * is what the crew has been shown.
 */

import { backend } from './backend';
import { dayKey, sessionKey, splitSessions } from './history';
import {
  handicap,
  initialsOf,
  loadAvatars,
  type MembershipRow,
  type ProfileRow,
  type SharedGameRow,
} from './social';

/** One bowler's night. */
export interface Series {
  /** The day it was bowled, keyed as `history.ts` keys a session. */
  key: string;
  /** When the first game of the night was bowled. */
  at: number;
  games: number;
  /** Every game of the night added up, as bowled. */
  scratch: number;
  /** Scratch plus one allowance for each game — see the note above. */
  withHandicap: number;
}

/** A bowler's line in the league table. */
export interface LeagueLine {
  id: string;
  name: string;
  initials: string;
  /** Their profile picture, when they have set one. */
  photo?: string | null;
  isMe?: boolean;
  /** Their average over the games they have shared here. */
  average: number;
  /** Pins added to every game they bowl, from that average. */
  allowance: number;
  /** Every night, newest first. */
  series: Series[];
  /** The best night they have had, by handicap series. Null before the first. */
  best: Series | null;
  /** The most recent night. */
  latest: Series | null;
}

/**
 * The pins a bowler is given per game.
 *
 * `handicap()` in `social.ts` returns the *handicapped average* — what somebody
 * is worth once the allowance is included — because that is what the board
 * ranks on. A series needs the allowance itself, which is the difference, so
 * there is still exactly one definition of the formula and this is arithmetic
 * on top of it rather than a second copy.
 */
export function allowanceFor(average: number): number {
  return handicap(average) - average;
}

/**
 * A bowler's shared games as nights, newest first.
 *
 * A single game is a series of one. That is not a special case worth removing —
 * plenty of bowling is one game after work, and a league table that silently
 * dropped those would be missing the nights somebody actually turned up for.
 */
export function seriesFrom(games: SharedGameRow[], allowance: number): Series[] {
  const days = new Map<string, SharedGameRow[]>();

  for (const game of games) {
    const key = dayKey(Date.parse(game.played_at));
    const seen = days.get(key);
    if (seen) seen.push(game);
    else days.set(key, [game]);
  }

  // The same boundary the history screen uses, from the same function. If they
  // disagreed about where a night ends they would disagree about which games
  // were "that Tuesday" — and the handicap is per game, so a day wrongly read
  // as one six-game series pays six allowances against one scratch total.
  const nights = [...days.values()].flatMap((list) =>
    splitSessions(
      [...list].sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at)),
      (game) => Date.parse(game.played_at),
    ),
  );

  const out: Series[] = nights.map((played) => {
    const key = sessionKey(Date.parse(played[0].played_at));
    const scratch = played.reduce((sum, game) => sum + game.total, 0);

    return {
      key,
      at: Math.min(...played.map((game) => Date.parse(game.played_at))),
      games: played.length,
      scratch,
      withHandicap: scratch + allowance * played.length,
    };
  });

  return out.sort((a, b) => b.at - a.at);
}

/**
 * The league table.
 *
 * Ranked on the **best handicap series**, which is what a league prints on a
 * wall: a season's honours are the nights people had, and an average is already
 * on the board next door. A bowler with no shared games still gets a line —
 * being in the crew is being in the league, and an empty row says "has not
 * bowled here yet" where leaving them out says nothing at all.
 */
export function leagueTable(
  memberships: MembershipRow[],
  games: SharedGameRow[],
  me: string,
): LeagueLine[] {
  const byProfile = new Map<string, SharedGameRow[]>();
  for (const game of games) {
    const list = byProfile.get(game.profile_id);
    if (list) list.push(game);
    else byProfile.set(game.profile_id, [game]);
  }

  const lines: LeagueLine[] = memberships
    .filter((membership) => membership.profiles)
    .map((membership) => {
      const profile = membership.profiles as ProfileRow;
      const played = byProfile.get(profile.id) ?? [];

      const average =
        played.length === 0
          ? 0
          : Math.round(played.reduce((sum, game) => sum + game.total, 0) / played.length);
      const allowance = played.length === 0 ? 0 : allowanceFor(average);
      const series = seriesFrom(played, allowance);

      return {
        id: profile.id,
        name: profile.name,
        initials: profile.initials || initialsOf(profile.name),
        photo: profile.avatar ?? null,
        isMe: profile.id === me || undefined,
        average,
        allowance,
        series,
        best:
          series.length === 0
            ? null
            : series.reduce((best, night) => (night.withHandicap > best.withHandicap ? night : best)),
        latest: series[0] ?? null,
      };
    });

  return lines.sort(
    (a, b) =>
      (b.best?.withHandicap ?? -1) - (a.best?.withHandicap ?? -1) ||
      (b.best?.scratch ?? -1) - (a.best?.scratch ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

/** One night of the league: everybody who bowled on the same day. */
export interface LeagueNight {
  key: string;
  at: number;
  /** Best handicap series first. */
  results: { line: LeagueLine; series: Series }[];
}

/**
 * The league week by week, newest night first.
 *
 * A night only appears when somebody bowled it, and a bowler only appears in
 * the nights they were there for — an absence is an absence, not a zero. A zero
 * would sit in the table looking like a catastrophic series.
 */
export function leagueNights(lines: LeagueLine[], limit = 8): LeagueNight[] {
  const nights = new Map<string, LeagueNight>();

  for (const line of lines) {
    for (const series of line.series) {
      const night = nights.get(series.key) ?? { key: series.key, at: series.at, results: [] };
      night.at = Math.min(night.at, series.at);
      night.results.push({ line, series });
      nights.set(series.key, night);
    }
  }

  return [...nights.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((night) => ({
      ...night,
      results: [...night.results].sort(
        (a, b) => b.series.withHandicap - a.series.withHandicap || b.series.scratch - a.series.scratch,
      ),
    }));
}

/**
 * The league table for a crew, read straight from the rows.
 *
 * `loadGroup` already reads both of these tables, and this deliberately reads
 * them again rather than taking its data from the `Group` it produces: that
 * shape is a leaderboard's — averages and highs per member — and a series is
 * made of the games themselves, which it has already thrown away. Two queries
 * on one screen open is cheaper than keeping every raw row alive across the app
 * on the chance a second screen wants them.
 */
export async function loadLeague(groupId: string, me: string): Promise<LeagueLine[]> {
  const db = await backend();
  const [roster, games] = await Promise.all([
    db
      .from('memberships')
      .select('group_id, profile_id, role, joined_at, profiles(id, name, initials)')
      .eq('group_id', groupId),
    db.from('shared_games').select('*').eq('group_id', groupId),
  ]);
  if (roster.error) throw roster.error;
  if (games.error) throw games.error;

  const roles = (roster.data ?? []) as unknown as MembershipRow[];
  const avatars = await loadAvatars(roles.map((row) => row.profile_id));
  for (const row of roles) {
    const avatar = row.profiles && avatars.get(row.profiles.id);
    if (avatar) row.profiles = { ...row.profiles!, avatar };
  }

  return leagueTable(
    roles,
    (games.data ?? []) as unknown as SharedGameRow[],
    me,
  );
}
