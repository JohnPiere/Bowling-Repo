/**
 * A copy of your games on the server.
 *
 * The app is local-first and stays that way — scoring, scanning, history and
 * analytics never touch the network, and a guest gets all of it. What this adds
 * is the one thing local-first cannot do on its own: survive the phone.
 *
 * Until this existed, the honest sentence in Settings was that a lost phone is
 * a lost season unless you had exported a file. People do not export a file.
 *
 * ## The rules it works to
 *
 * **Nobody but you can read it.** `game_backups` has no crew clause in any of
 * its policies. Sharing a game with a crew is a separate, deliberate act that
 * writes a different table; this one is a safe, not a board.
 *
 * **Newest wins, by the client's own clock.** Each row carries the `updatedAt`
 * the device stamped on it, not the moment it reached Postgres — otherwise a
 * phone that has been offline for a week would lose to one that synced first
 * with older edits. Two devices editing the same game is the only case this
 * cannot get exactly right for both, and it is rare enough to be worth a simple
 * rule stated out loud rather than a merge nobody can predict.
 *
 * **A row from the server is outside data.** It goes through the same check as
 * a restored file (`problemWith`), because both end up persisted and then
 * rendered, and a malformed one breaks a screen long after the sync that
 * carried it.
 *
 * **No photos.** A season of scanned sheets is tens of megabytes on a free
 * tier meant for kilobytes, and the scores are the part that cannot be got
 * back. Same call the export file makes.
 */

import { backend } from './backend';
import { problemWith } from './backup';
import type { Game, GameSource } from './db';
import { scoreGame } from './scoring';

/** A row of `game_backups`, as Postgres has it. */
export interface BackupRow {
  owner_id: string;
  local_id: string;
  bowler: string;
  rolls: number[];
  pinfalls: number[][] | null;
  total: number;
  is_complete: boolean;
  source: GameSource;
  house: string | null;
  note: string | null;
  played_at: string;
  updated_at: string;
}

/**
 * How many rows go up in one request.
 *
 * A season is a few hundred games of a few hundred bytes each, so this is about
 * keeping one failed request from costing the whole sync rather than about size.
 */
export const CHUNK = 200;

// ── The pure half ──────────────────────────────────────────────────────────

export function toBackupRow(game: Game, ownerId: string): BackupRow {
  return {
    owner_id: ownerId,
    local_id: game.id,
    bowler: game.bowler,
    rolls: game.rolls,
    pinfalls: game.pinfalls ?? null,
    total: game.total,
    is_complete: game.isComplete,
    source: game.source,
    house: game.house ?? null,
    note: game.note ?? null,
    played_at: new Date(game.playedAt).toISOString(),
    updated_at: new Date(game.updatedAt).toISOString(),
  };
}

/**
 * A row as a game, or null when it is not one.
 *
 * `hasSheet` is deliberately absent rather than false-y by accident: a restored
 * game that claimed a photo would show "Loading the photo…" for ever, which is
 * the bug the file restore already had once.
 *
 * `syncedAt` is set to the row's own `updated_at`, so a game that came down
 * from the server is not immediately queued to go back up.
 */
export function fromBackupRow(row: BackupRow): Game | null {
  const playedAt = Date.parse(row.played_at);
  const updatedAt = Date.parse(row.updated_at);
  if (!Number.isFinite(playedAt) || !Number.isFinite(updatedAt)) return null;

  const card = scoreGame(row.rolls ?? []);
  const game: Game = {
    id: row.local_id,
    bowler: row.bowler || 'You',
    rolls: row.rolls ?? [],
    // Rescored rather than trusted, for the same reason a restored file is: a
    // stored total that disagrees with its own rolls is a total that was wrong
    // when it went up.
    total: card.total,
    isComplete: card.isComplete,
    source: row.source === 'scan' ? 'scan' : 'manual',
    house: row.house ?? undefined,
    note: row.note ?? undefined,
    pinfalls: Array.isArray(row.pinfalls) ? row.pinfalls : undefined,
    playedAt,
    updatedAt,
    syncedAt: updatedAt,
  };

  return problemWith(game) === null ? game : null;
}

/**
 * The games this device owes the server.
 *
 * A game qualifies when it has never been sent, or when it has been edited
 * since it was — `reviseGame` clears `syncedAt` for exactly this reason.
 */
export function pending(games: Game[]): Game[] {
  return games.filter((game) => game.syncedAt === undefined || game.syncedAt < game.updatedAt);
}

export interface PullPlan {
  /** Rows to write into the local store: new here, or newer than what is here. */
  toWrite: Game[];
  /** Rows this device already has at the same version or better. */
  alreadyHere: number;
  /** Rows that came back unusable, and were left where they were. */
  rejected: number;
}

/**
 * What pulling the server's copy would change on this device.
 *
 * Nothing is written here, so a caller can say what it is about to do. The
 * comparison is on `updatedAt` and not on presence: a device restoring onto an
 * archive it already has should be a no-op, and a device that edited a game
 * offline should keep its edit until it has pushed it.
 *
 * `deleted` is the ids this device has deleted and not yet been able to say so
 * about. Without it a pull is an undelete: the server still holds the row, the
 * phone no longer has the game, and "missing here" would look exactly like
 * "bowled on the other phone".
 */
export function planPull(local: Game[], rows: BackupRow[], deleted: string[] = []): PullPlan {
  const here = new Map(local.map((game) => [game.id, game]));
  const graves = new Set(deleted);

  const toWrite: Game[] = [];
  let alreadyHere = 0;
  let rejected = 0;

  for (const row of rows) {
    if (graves.has(row.local_id)) continue;

    const game = fromBackupRow(row);
    if (!game) {
      rejected += 1;
      continue;
    }

    const mine = here.get(game.id);
    if (mine && mine.updatedAt >= game.updatedAt) {
      alreadyHere += 1;
      continue;
    }

    toWrite.push(game);
  }

  return { toWrite, alreadyHere, rejected };
}

/** Split a list into request-sized pieces. */
export function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

// ── Talking to the server ──────────────────────────────────────────────────

/**
 * Send everything this device owes, and say what went.
 *
 * Upserted on (owner, local game), so sending a game twice updates its row
 * rather than making a second one — and a game corrected on this phone
 * overwrites the version the server had.
 */
export async function pushGames(ownerId: string, games: Game[]): Promise<Game[]> {
  const owed = pending(games);
  if (owed.length === 0) return [];

  const db = await backend();
  for (const batch of chunk(owed)) {
    const { error } = await db
      .from('game_backups')
      .upsert(batch.map((game) => toBackupRow(game, ownerId)), { onConflict: 'owner_id,local_id' });
    if (error) throw error;
  }

  return owed;
}

/**
 * Tell the server about games this device deleted.
 *
 * Returns the ids it managed to say, so the caller can drop exactly those
 * tombstones: one that was never sent has to survive to the next sync, or the
 * game comes back.
 */
export async function pushDeletes(ownerId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];

  const db = await backend();
  const said: string[] = [];

  for (const batch of chunk(ids)) {
    const { error } = await db
      .from('game_backups')
      .delete()
      .eq('owner_id', ownerId)
      .in('local_id', batch);
    if (error) throw error;
    said.push(...batch);
  }

  return said;
}

/** Every game the server is holding for this account. */
export async function fetchGames(ownerId: string): Promise<BackupRow[]> {
  const db = await backend();
  const { data, error } = await db
    .from('game_backups')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BackupRow[];
}

/**
 * Take the account's copy off the server.
 *
 * Not part of syncing — it is what "stop backing up" has to mean if it is to
 * mean anything. The games stay on the phone.
 */
export async function forgetGames(ownerId: string): Promise<void> {
  const db = await backend();
  const { error } = await db.from('game_backups').delete().eq('owner_id', ownerId);
  if (error) throw error;
}

export interface SyncResult {
  /** Deletions the server has now been told about, and can be forgotten. */
  deleted: string[];
  /**
   * The games that went up, in the versions that went.
   *
   * The list rather than a count, because the caller has to mark exactly these
   * as synced — and only these, at the version sent.
   */
  sent: Game[];
  /** Games to write down, because they were missing here or newer there. */
  toWrite: Game[];
  /** Rows the server had that this device was already holding. */
  alreadyHere: number;
  /** Rows that came back unusable. */
  rejected: number;
}

/**
 * Push, then pull.
 *
 * Deletions go first, then games, then the pull.
 *
 * That order matters on the device that has been away: pushing first means its
 * offline edits are on the server before it asks what the server thinks, so
 * "newest wins" resolves against the same set of facts on both sides. Pulling
 * first would compare local edits against a server that had not yet heard about
 * them, and then push them anyway a moment later — the same answer, one round
 * trip later, and a screen that flickers through the wrong one on the way.
 *
 * The writing is the caller's: this returns the games to store and does not
 * touch IndexedDB, so the whole of it stays testable without a database.
 */
export async function syncGames(
  ownerId: string,
  local: Game[],
  deleted: string[] = [],
): Promise<SyncResult> {
  // Deletions first, so a game deleted here and then pushed by nothing does not
  // survive its own removal for one more round trip.
  const said = await pushDeletes(ownerId, deleted);
  const sent = await pushGames(ownerId, local);
  const plan = planPull(local, await fetchGames(ownerId), deleted);

  return {
    deleted: said,
    sent,
    toWrite: plan.toWrite,
    alreadyHere: plan.alreadyHere,
    rejected: plan.rejected,
  };
}
