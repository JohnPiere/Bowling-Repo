/**
 * One member against one other, bowled apart.
 *
 * Everything else the crew does is a comparison of seasons: the board ranks
 * whoever happens to be in it, a challenge is a target everybody chases from
 * wherever they are. A battle is smaller and more pointed — two people, one
 * game each, and a winner. What makes it work at all is that the two games do
 * not have to be the same evening: somebody bowls Tuesday, somebody else bowls
 * Friday, and the deadline is what closes it.
 *
 * **This is the one place in the social layer that stores a score.** A
 * challenge stores no progress on purpose — progress *is* the games already in
 * `shared_games`, and a second copy would be a second definition of what a
 * strike is. That reasoning does not reach here, because a battle score is not
 * a summary of anything: it is a declaration, "this is the game I am putting
 * up", which is the same category as `Game.note` — somebody's own statement
 * rather than a computation. Nothing can derive which of a bowler's games they
 * meant, so nothing tries.
 *
 * **A win only counts once the deadline has passed.** Both sides may put up a
 * better game while the battle runs, which is the whole reason it has a week
 * rather than an instant, and a lead held on Tuesday is not a result. So
 * `battleRecord` — the number that ends up on somebody's profile — counts only
 * battles that are `final`. A profile figure that could go down again is worse
 * than no figure.
 */

import { backend } from './backend';
import { scoreGame } from './scoring';

export interface Battle {
  id: string;
  groupId: string;
  /** Who put it up. */
  challengerId: string;
  /** Who it was aimed at. */
  opponentId: string;
  name: string;
  /** When entering closes, after which the result is settled. */
  endsAt: number;
  createdAt: number;
}

export interface BattleEntry {
  battleId: string;
  memberId: string;
  score: number;
  /** The frames behind it, empty where the score was typed rather than picked. */
  rolls: number[];
  /** When they bowled it — the part that lets the two sides be days apart. */
  playedAt: number;
}

export type BattleOutcome =
  /** Somebody still has to bowl, and there is time. */
  | 'waiting'
  /** Both put a game up. `winnerId` is whose. */
  | 'won'
  /** Both put a game up and they are the same score. */
  | 'tied'
  /** The deadline passed with one side never entering. The other takes it. */
  | 'walkover'
  /** The deadline passed and neither entered. Nothing happened. */
  | 'void';

export interface BattleResult {
  battle: Battle;
  challenger: BattleEntry | null;
  opponent: BattleEntry | null;
  outcome: BattleOutcome;
  winnerId: string | null;
  /** Past the deadline: nothing can change, so this is the answer. */
  final: boolean;
  /** Who has still to put a game up. Empty once both have. */
  waitingOn: string[];
}

/**
 * The score to read off an entry.
 *
 * Rescored from the rolls where there are any, rather than trusting the number
 * beside them — the same call `useCrewAlerts` makes on a shared game, and for
 * the same reason: two records of one fact, and only one of them is derived
 * from what was actually thrown.
 */
export function entryScore(entry: BattleEntry): number {
  return entry.rolls.length > 0 ? scoreGame(entry.rolls).total : entry.score;
}

/** Whole days until entering closes, rounded up, never below zero. */
export function daysLeftIn(battle: Battle, now = Date.now()): number {
  return Math.max(0, Math.ceil((battle.endsAt - now) / 86_400_000));
}

/**
 * Where a battle stands.
 *
 * The four endings are worth having as separate answers rather than a winner
 * and a null. "Nobody bowled" and "you won because they never showed" are both
 * results, they are different results, and a screen that draws them the same
 * way is telling somebody they beat a person who was never there.
 */
export function battleResult(
  battle: Battle,
  entries: BattleEntry[],
  now = Date.now(),
): BattleResult {
  const mine = entries.filter((entry) => entry.battleId === battle.id);
  const challenger = mine.find((entry) => entry.memberId === battle.challengerId) ?? null;
  const opponent = mine.find((entry) => entry.memberId === battle.opponentId) ?? null;
  const final = now >= battle.endsAt;

  const waitingOn = [
    ...(challenger ? [] : [battle.challengerId]),
    ...(opponent ? [] : [battle.opponentId]),
  ];

  if (challenger && opponent) {
    const a = entryScore(challenger);
    const b = entryScore(opponent);
    if (a === b) return { battle, challenger, opponent, outcome: 'tied', winnerId: null, final, waitingOn };
    return {
      battle,
      challenger,
      opponent,
      outcome: 'won',
      winnerId: a > b ? battle.challengerId : battle.opponentId,
      final,
      waitingOn,
    };
  }

  // Before the deadline, one entry is simply half a battle.
  if (!final) {
    return { battle, challenger, opponent, outcome: 'waiting', winnerId: null, final, waitingOn };
  }

  const only = challenger ?? opponent;
  if (!only) return { battle, challenger, opponent, outcome: 'void', winnerId: null, final, waitingOn };

  return {
    battle,
    challenger,
    opponent,
    outcome: 'walkover',
    winnerId: only.memberId,
    final,
    waitingOn,
  };
}

export interface BattleRecord {
  won: number;
  lost: number;
  /** Tied, which is not a loss and should not be counted as one. */
  drawn: number;
  /** Battles that ended without either side bowling. */
  void: number;
  /** Everything above except the void ones — what "played" honestly means. */
  played: number;
}

/**
 * Somebody's battle record, for the profile the crew can see.
 *
 * Settled battles only, per the note at the top: a lead in a battle with four
 * days left is not a win, and a "won" figure that can go back down is worse
 * than no figure. A `void` battle is counted separately and kept out of
 * `played`, because "0 from 3" reads as three defeats when what happened is
 * that nobody turned up.
 */
export function battleRecord(
  battles: Battle[],
  entries: BattleEntry[],
  memberId: string,
  now = Date.now(),
): BattleRecord {
  const record: BattleRecord = { won: 0, lost: 0, drawn: 0, void: 0, played: 0 };

  for (const battle of battles) {
    if (battle.challengerId !== memberId && battle.opponentId !== memberId) continue;

    const result = battleResult(battle, entries, now);
    if (!result.final) continue;

    if (result.outcome === 'void') {
      record.void += 1;
      continue;
    }

    record.played += 1;
    if (result.outcome === 'tied') record.drawn += 1;
    else if (result.winnerId === memberId) record.won += 1;
    else record.lost += 1;
  }

  return record;
}

/**
 * The other one.
 *
 * A battle has exactly two sides and every screen wants "them" rather than
 * "challenger or opponent depending which I am".
 */
export function opponentOf(battle: Battle, memberId: string): string {
  return battle.challengerId === memberId ? battle.opponentId : battle.challengerId;
}

export function isIn(battle: Battle, memberId: string): boolean {
  return battle.challengerId === memberId || battle.opponentId === memberId;
}

/**
 * Sorted the way somebody reads them: what needs you, then what is running,
 * then what is over.
 *
 * A finished battle is a scoreboard and a running one is a thing to do, so the
 * things to do go first — and among those, the ones waiting on *you* before the
 * ones waiting on somebody else, because that is the difference between a
 * screen that asks something of you and one that reports.
 */
export function battleOrder(
  battles: Battle[],
  entries: BattleEntry[],
  me: string,
  now = Date.now(),
): Battle[] {
  const rank = (battle: Battle): number => {
    const result = battleResult(battle, entries, now);
    if (result.final) return 3;
    return result.waitingOn.includes(me) ? 0 : result.waitingOn.length > 0 ? 1 : 2;
  };

  return [...battles].sort((a, b) => rank(a) - rank(b) || a.endsAt - b.endsAt);
}

// ── Putting one up ─────────────────────────────────────────────────────────

export interface BattleDraft {
  name: string;
  opponentId: string;
  endsAt: number;
}

/** Why a draft is not a battle yet, or null when it is. */
export function problemWithBattle(
  draft: BattleDraft,
  me: string,
  now = Date.now(),
): string | null {
  if (!draft.name.trim()) return 'Give it a name.';
  if (draft.name.trim().length > 80) return 'That name is too long.';
  if (!draft.opponentId) return 'Pick who you are bowling against.';
  if (draft.opponentId === me) return 'Pick somebody other than yourself.';
  if (!Number.isFinite(draft.endsAt)) return 'That date does not work.';
  // An hour is the floor rather than "now", because the whole point is that
  // the two games can be days apart and a battle that closes this minute
  // cannot have two entries in it.
  if (draft.endsAt <= now + 3_600_000) return 'Give it until at least an hour from now.';
  if (draft.endsAt - now > 366 * 86_400_000) return 'Keep it under a year.';
  return null;
}

/** Why a score cannot be entered, or null when it can. */
export function problemWithEntry(score: number, playedAt: number, now = Date.now()): string | null {
  if (!Number.isFinite(score)) return 'That is not a score.';
  if (!Number.isInteger(score) || score < 0) return 'A score is a whole number, 0 or more.';
  if (score > 300) return 'Nothing scores over 300.';
  if (!Number.isFinite(playedAt)) return 'That date does not work.';
  // A day either side of now, so a phone with a slow clock is not refused.
  if (playedAt > now + 86_400_000) return 'That game has not been bowled yet.';
  return null;
}

// ── The database half ──────────────────────────────────────────────────────
//
// Thin on purpose, like `challenges.ts` and `events.ts`: everything above this
// line is pure and tested, and everything below is a query and a shape change,
// which is the only part that cannot be tested from a machine with no route to
// the database.

interface BattleRow {
  id: string;
  group_id: string;
  challenger_id: string;
  opponent_id: string;
  name: string;
  ends_at: string;
  created_at: string;
}

interface EntryRow {
  battle_id: string;
  profile_id: string;
  score: number;
  rolls: number[] | null;
  played_at: string;
}

function toBattle(row: BattleRow): Battle {
  return {
    id: row.id,
    groupId: row.group_id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    name: row.name,
    endsAt: Date.parse(row.ends_at),
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * A crew's battles and everything put up in them.
 *
 * Empty on any failure rather than throwing, for the reason 0005's loaders
 * give and 0006 inherits: the migration lands after crews already exist, and a
 * database still on 0005 must lose the battles and nothing else — not the
 * boards, not the chat, not the calendar.
 */
export async function loadBattles(
  groupId: string,
): Promise<{ battles: Battle[]; entries: BattleEntry[] }> {
  try {
    const db = await backend();
    const { data, error } = await db
      .from('battles')
      .select('*')
      .eq('group_id', groupId)
      .order('ends_at', { ascending: false });

    if (error) return { battles: [], entries: [] };
    const battles = (data as BattleRow[]).map(toBattle);
    if (battles.length === 0) return { battles, entries: [] };

    // Allowed to fail on its own: a list of battles with no scores against
    // them still says who is bowling whom. Same trade the board makes for
    // hearts and the calendar makes for replies.
    const { data: rows } = await db
      .from('battle_entries')
      .select('battle_id, profile_id, score, rolls, played_at')
      .in(
        'battle_id',
        battles.map((battle) => battle.id),
      );

    const entries = ((rows ?? []) as EntryRow[]).map((row) => ({
      battleId: row.battle_id,
      memberId: row.profile_id,
      score: row.score,
      rolls: row.rolls ?? [],
      playedAt: Date.parse(row.played_at),
    }));

    return { battles, entries };
  } catch {
    return { battles: [], entries: [] };
  }
}

export async function createBattle(
  groupId: string,
  me: string,
  draft: BattleDraft,
): Promise<Battle> {
  const problem = problemWithBattle(draft, me);
  if (problem) throw new Error(problem);

  const db = await backend();
  const { data, error } = await db
    .from('battles')
    .insert({
      group_id: groupId,
      challenger_id: me,
      opponent_id: draft.opponentId,
      name: draft.name.trim(),
      ends_at: new Date(draft.endsAt).toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return toBattle(data as BattleRow);
}

/**
 * Put a game up, or swap the one you put up before.
 *
 * An upsert, because the primary key is (battle, person): bowling a better one
 * on Thursday is not a second entry, it is changing which game you are
 * standing on.
 */
export async function enterScore(
  battleId: string,
  me: string,
  entry: { score: number; rolls: number[]; playedAt: number },
): Promise<void> {
  const problem = problemWithEntry(entry.score, entry.playedAt);
  if (problem) throw new Error(problem);

  const db = await backend();
  const { error } = await db.from('battle_entries').upsert(
    {
      battle_id: battleId,
      profile_id: me,
      score: Math.round(entry.score),
      rolls: entry.rolls,
      played_at: new Date(entry.playedAt).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'battle_id,profile_id' },
  );
  if (error) throw error;
}

/** Take your game back out, which leaves the battle waiting on you again. */
export async function withdrawEntry(battleId: string, me: string): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('battle_entries')
    .delete()
    .eq('battle_id', battleId)
    .eq('profile_id', me);
  if (error) throw error;
}

/** Call it off, or turn one down — the policy allows either side and the owner. */
export async function deleteBattle(id: string): Promise<void> {
  const db = await backend();
  const { error } = await db.from('battles').delete().eq('id', id);
  if (error) throw error;
}
