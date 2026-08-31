/**
 * Exporting and restoring the archive.
 *
 * There is no account and no server, so a file is the only backup a bowler
 * has. That makes the restore side of it load-bearing rather than a nicety:
 * an export nobody can put back is not a backup.
 *
 * Photos are not included. They are tens of megabytes of base64 in a format
 * meant for a few kilobytes of numbers, and a season of scores is the part
 * that cannot be reconstructed.
 */

import type { Game } from './db';
import { isValidRolls, scoreGame } from './scoring';

export const BACKUP_FORMAT = 'lane-log/backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  games: Game[];
}

export interface RestorePlan {
  /** Games in the file that this device does not have. */
  toAdd: Game[];
  /** Games already here, matched by id. Left alone. */
  alreadyHere: number;
  /** Entries that were not usable, with the reason. */
  rejected: { index: number; reason: string }[];
}

export class BackupError extends Error {}

export function buildBackup(games: Game[]): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    // Photos live in another store and are deliberately not carried.
    games: games.map(({ hasSheet: _hasSheet, ...game }) => game as Game),
  };
}

/**
 * Read a backup file and work out what restoring it would do.
 *
 * Nothing is written here. The caller shows the plan and asks first, because
 * a restore that silently doubled a season would be worse than one that
 * failed.
 */
export function planRestore(raw: string, existing: Game[]): RestorePlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError('That file is not readable as JSON.');
  }

  const games = gamesFrom(parsed);
  const known = new Set(existing.map((game) => game.id));

  const toAdd: Game[] = [];
  const rejected: RestorePlan['rejected'] = [];
  let alreadyHere = 0;
  // A file can carry the same id twice; the first wins.
  const seen = new Set<string>();

  games.forEach((entry, index) => {
    const problem = describeProblem(entry);
    if (problem) {
      rejected.push({ index, reason: problem });
      return;
    }

    const game = entry as Game;
    if (known.has(game.id) || seen.has(game.id)) {
      alreadyHere += 1;
      return;
    }

    seen.add(game.id);
    // Rescore rather than trusting the file: a total that disagrees with its
    // own rolls is the kind of thing a hand-edited export carries.
    const card = scoreGame(game.rolls);
    toAdd.push({ ...game, total: card.total, isComplete: card.isComplete });
  });

  return { toAdd, alreadyHere, rejected };
}

/** Accept either a whole backup or a bare array of games. */
function gamesFrom(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === 'object') {
    const backup = parsed as Partial<Backup>;
    if (Array.isArray(backup.games)) {
      if (backup.format && backup.format !== BACKUP_FORMAT) {
        throw new BackupError('That file is not a Lane Log backup.');
      }
      if (backup.version !== undefined && backup.version > BACKUP_VERSION) {
        throw new BackupError(
          'That backup came from a newer version of Lane Log than this one.',
        );
      }
      return backup.games;
    }
  }

  throw new BackupError('That file does not contain any games.');
}

/** Why an entry cannot be restored, or null if it can. */
function describeProblem(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return 'not a game';

  const game = entry as Partial<Game>;
  if (typeof game.id !== 'string' || !game.id) return 'no id';
  if (!Array.isArray(game.rolls)) return 'no rolls';
  if (!isValidRolls(game.rolls)) return 'the rolls do not describe a real game';
  if (typeof game.playedAt !== 'number' || !Number.isFinite(game.playedAt)) {
    return 'no date';
  }

  return null;
}
