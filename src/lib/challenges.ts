/**
 * Something for a crew to chase, for a while.
 *
 * A challenge is a name, a window, and a number to reach: "100 strikes by the
 * end of March". Everything else about it is derived — nobody records progress,
 * because progress is just the games that were bowled inside the window, counted
 * the same way `tally` counts them everywhere else. A `challenge_progress` table
 * would be a second definition of what a strike is, free to drift from the first
 * one, and the leaderboard already learned that lesson.
 *
 * **Only shared games count, and the screen has to say so.** A crew can see what
 * its members posted to it and nothing else — that is the rule the whole social
 * layer is built on, and a challenge is not a reason to break it. The honest
 * consequence is that a challenge measures what you *showed* the crew, so the
 * screens say "from the games shared here" wherever a number appears.
 */

import { backend } from './backend';
import { tally, type Bowled } from './stats';

/**
 * What is being counted.
 *
 * All sums, deliberately. A target like "average 180" is a different shape —
 * it can go down, it is not reached so much as held, and "62% of the way to an
 * average of 180" is not a sentence that means anything. Those want their own
 * kind of challenge rather than a wrong reading of this one.
 */
export type ChallengeMetric = 'strikes' | 'spares' | 'games' | 'pins' | 'frames' | 'balls';

export const CHALLENGE_METRICS: { key: ChallengeMetric; label: string; unit: string }[] = [
  { key: 'strikes', label: 'Strikes', unit: 'strikes' },
  { key: 'spares', label: 'Spares', unit: 'spares' },
  { key: 'games', label: 'Games', unit: 'games' },
  { key: 'pins', label: 'Pins knocked down', unit: 'pins' },
  { key: 'frames', label: 'Frames', unit: 'frames' },
  { key: 'balls', label: 'Balls thrown', unit: 'balls' },
];

export interface Challenge {
  id: string;
  groupId: string;
  creatorId: string;
  name: string;
  metric: ChallengeMetric;
  /** How many of `metric` to reach. */
  target: number;
  startsAt: number;
  endsAt: number;
  createdAt: number;
}

/** A game somebody in the crew posted, which is all a challenge can see. */
export interface CountedGame {
  authorId: string;
  rolls: number[];
  playedAt: number;
}

export type ChallengeState = 'upcoming' | 'running' | 'finished';

export function challengeState(challenge: Challenge, now = Date.now()): ChallengeState {
  if (now < challenge.startsAt) return 'upcoming';
  return now < challenge.endsAt ? 'running' : 'finished';
}

/**
 * Whole days from now until it ends, rounded up, and never below zero.
 *
 * Rounded up because "0 days left" on a challenge with six hours to run is
 * wrong in the way that matters: it reads as over.
 */
export function daysLeft(challenge: Challenge, now = Date.now()): number {
  return Math.max(0, Math.ceil((challenge.endsAt - now) / 86_400_000));
}

export interface ChallengeStanding {
  memberId: string;
  /** How many of the metric they have, inside the window. */
  value: number;
  /** 0..100, capped — 140% of a target is still a finished challenge. */
  percent: number;
  /** True once they have reached it, which is what earns the badge. */
  done: boolean;
  /** Games of theirs that counted. Zero is worth saying out loud. */
  games: number;
}

/** The metric out of a set of games, using the one definition there is. */
function measure(metric: ChallengeMetric, games: Bowled[]): number {
  const counted = tally(games);
  return counted[metric];
}

/**
 * Where everybody stands.
 *
 * Every member gets a row, including the ones who have bowled nothing: a
 * challenge with four people in it and two rows looks like the other two are
 * not in the crew. Ordered by how far along they are, then by name order as
 * given, so the board is stable while nobody is scoring.
 */
export function challengeStandings(
  challenge: Challenge,
  memberIds: string[],
  games: CountedGame[],
): ChallengeStanding[] {
  const inWindow = games.filter(
    (game) => game.playedAt >= challenge.startsAt && game.playedAt < challenge.endsAt,
  );

  const byMember = new Map<string, CountedGame[]>();
  for (const game of inWindow) {
    const list = byMember.get(game.authorId);
    if (list) list.push(game);
    else byMember.set(game.authorId, [game]);
  }

  return memberIds
    .map((memberId) => {
      const theirs = byMember.get(memberId) ?? [];
      const value = measure(challenge.metric, theirs);

      return {
        memberId,
        value,
        // Capped at 100 so a bar cannot run off its track, while `value` keeps
        // the real number for the row to print.
        percent: challenge.target === 0 ? 0 : Math.min(100, Math.round((value / challenge.target) * 100)),
        done: value >= challenge.target,
        games: theirs.length,
      };
    })
    .sort((a, b) => b.value - a.value || memberIds.indexOf(a.memberId) - memberIds.indexOf(b.memberId));
}

/**
 * The crew's total against the target, for a challenge read as a team effort.
 *
 * Both readings are drawn: "have *we* done it" and "who did what". The team
 * total is not the sum of the capped percentages, which is why it is computed
 * from the values.
 */
export function challengeTotal(
  challenge: Challenge,
  standings: ChallengeStanding[],
): { value: number; percent: number; done: boolean } {
  const value = standings.reduce((sum, row) => sum + row.value, 0);
  return {
    value,
    percent: challenge.target === 0 ? 0 : Math.min(100, Math.round((value / challenge.target) * 100)),
    done: value >= challenge.target,
  };
}

/**
 * Who may take it down.
 *
 * The person who made it, or the crew's owner. A moderator may not: the same
 * reasoning as migration 0004 — moderating is taking down what somebody
 * *posted*, and a challenge with a week left is not a post.
 */
export function canDelete(challenge: Challenge, viewerId: string, ownerId: string | null): boolean {
  return viewerId === challenge.creatorId || viewerId === ownerId;
}

/** What a new challenge needs before it can be saved. */
export interface ChallengeDraft {
  name: string;
  metric: ChallengeMetric;
  target: number;
  startsAt: number;
  endsAt: number;
}

/**
 * Why a draft is not a challenge yet, or null when it is.
 *
 * Returned as one message rather than a set: the form shows one line under the
 * button, and the first thing wrong with it is the thing to fix.
 */
export function problemWithDraft(draft: ChallengeDraft): string | null {
  if (!draft.name.trim()) return 'Give it a name.';
  if (draft.name.trim().length > 80) return 'That name is too long.';
  if (!Number.isFinite(draft.target) || draft.target < 1) return 'The target has to be at least 1.';
  if (draft.target > 1_000_000) return 'That target is too big to be a challenge.';
  if (!Number.isFinite(draft.startsAt) || !Number.isFinite(draft.endsAt)) return 'Those dates do not work.';
  if (draft.endsAt <= draft.startsAt) return 'It has to end after it starts.';
  // A year is not a challenge, it is a season, and the app already has one of
  // those. The cap keeps a mistyped year from making a permanent fixture.
  if (draft.endsAt - draft.startsAt > 366 * 86_400_000) return 'Keep it under a year.';
  return null;
}

// ── The database half ──────────────────────────────────────────────────────
//
// Thin on purpose. Everything above this line is pure and tested; everything
// below is a query and a shape change, because that is the only part that
// cannot be tested from a machine with no route to the database.

interface ChallengeRow {
  id: string;
  group_id: string;
  creator_id: string;
  name: string;
  metric: ChallengeMetric;
  target: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    groupId: row.group_id,
    creatorId: row.creator_id,
    name: row.name,
    metric: row.metric,
    target: row.target,
    startsAt: Date.parse(row.starts_at),
    endsAt: Date.parse(row.ends_at),
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * A crew's challenges, the one ending soonest first.
 *
 * Returns an empty list rather than throwing when the table is not there:
 * migration 0005 arrives after crews already exist, and a database still on
 * 0004 must lose the challenges and nothing else. Same trade as `loadAvatars`
 * makes for a missing `avatar` column.
 */
export async function loadChallenges(groupId: string): Promise<Challenge[]> {
  try {
    const db = await backend();
    const { data, error } = await db
      .from('challenges')
      .select('*')
      .eq('group_id', groupId)
      .order('ends_at', { ascending: false });

    if (error) return [];
    return (data as ChallengeRow[]).map(toChallenge);
  } catch {
    return [];
  }
}

export async function createChallenge(
  groupId: string,
  me: string,
  draft: ChallengeDraft,
): Promise<Challenge> {
  const problem = problemWithDraft(draft);
  if (problem) throw new Error(problem);

  const db = await backend();
  const { data, error } = await db
    .from('challenges')
    .insert({
      group_id: groupId,
      creator_id: me,
      name: draft.name.trim(),
      metric: draft.metric,
      target: Math.round(draft.target),
      starts_at: new Date(draft.startsAt).toISOString(),
      ends_at: new Date(draft.endsAt).toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return toChallenge(data as ChallengeRow);
}

export async function deleteChallenge(id: string): Promise<void> {
  const db = await backend();
  const { error } = await db.from('challenges').delete().eq('id', id);
  if (error) throw error;
}
