/**
 * Local game storage.
 *
 * Everything lives in IndexedDB so the app works with no network at all — a
 * bowling alley is a reliably terrible place to have signal. Records carry an
 * `updatedAt` and a `syncedAt` so a future server sync can find what changed
 * without re-uploading the archive.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type GameSource = 'manual' | 'scan';

export interface Game {
  id: string;
  /** Who bowled it. Free text until there are real accounts. */
  bowler: string;
  /** Where it was bowled, if the bowler said. */
  house?: string;
  /** Pin counts in the order they were thrown. */
  rolls: number[];
  /** Final score, denormalised so the list does not rescore every game. */
  total: number;
  isComplete: boolean;
  source: GameSource;
  /** Photo the game was imported from, kept for re-checking a scan. */
  sheetImage?: Blob;
  playedAt: number;
  updatedAt: number;
  /** Set once the record has been pushed to a server. */
  syncedAt?: number;
  /** Ids of the groups this game has been shared into. */
  sharedTo?: string[];
  /** Whether the scanned sheet photo went with it. */
  sharedWithSheet?: boolean;
}

export interface PushRecord {
  /** Always 'current' — one subscription per device. */
  id: string;
  endpoint: string;
  subscription: unknown;
  createdAt: number;
}

interface LaneLogDB extends DBSchema {
  games: {
    key: string;
    value: Game;
    indexes: { 'by-playedAt': number; 'by-bowler': string };
  };
  push: {
    key: string;
    value: PushRecord;
  };
}

const DB_NAME = 'lane-log';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LaneLogDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LaneLogDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const games = database.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('by-playedAt', 'playedAt');
        games.createIndex('by-bowler', 'bowler');
        database.createObjectStore('push', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

function newId() {
  // randomUUID needs a secure context, which a PWA always has, but a plain-http
  // dev host on a phone does not.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listGames(): Promise<Game[]> {
  const all = await (await db()).getAllFromIndex('games', 'by-playedAt');
  return all.reverse();
}

export async function getGame(id: string): Promise<Game | undefined> {
  return (await db()).get('games', id);
}

export async function saveGame(
  game: Omit<Game, 'id' | 'updatedAt'> & { id?: string },
): Promise<Game> {
  const record: Game = {
    ...game,
    id: game.id ?? newId(),
    updatedAt: Date.now(),
  };
  await (await db()).put('games', record);
  return record;
}

export async function deleteGame(id: string): Promise<void> {
  await (await db()).delete('games', id);
}

/** Games that have never been pushed to a server, oldest first. */
export async function unsyncedGames(): Promise<Game[]> {
  const all = await (await db()).getAllFromIndex('games', 'by-playedAt');
  return all.filter((game) => game.syncedAt === undefined);
}

/**
 * Share a game into a group, or update what was shared.
 *
 * Sharing copies nothing: the game stays the bowler's, and the group holds a
 * reference. Unsharing therefore only has to drop the id — the game itself is
 * never at risk.
 */
export async function shareGame(
  id: string,
  groupId: string,
  options: { withSheet?: boolean } = {},
): Promise<Game | undefined> {
  const game = await getGame(id);
  if (!game) return undefined;

  const sharedTo = game.sharedTo ?? [];
  const updated: Game = {
    ...game,
    sharedTo: sharedTo.includes(groupId) ? sharedTo : [...sharedTo, groupId],
    sharedWithSheet: options.withSheet ?? game.sharedWithSheet,
    updatedAt: Date.now(),
  };

  await (await db()).put('games', updated);
  return updated;
}

/** Retract a game from a group. It stays in the bowler's own history. */
export async function unshareGame(id: string, groupId: string): Promise<Game | undefined> {
  const game = await getGame(id);
  if (!game) return undefined;

  const updated: Game = {
    ...game,
    sharedTo: (game.sharedTo ?? []).filter((entry) => entry !== groupId),
    updatedAt: Date.now(),
  };

  await (await db()).put('games', updated);
  return updated;
}

/** Games this bowler has shared into a given group, newest first. */
export async function gamesSharedWith(groupId: string): Promise<Game[]> {
  const all = await listGames();
  return all.filter((game) => game.sharedTo?.includes(groupId));
}

export async function rememberPushSubscription(subscription: PushSubscription): Promise<void> {
  await (await db()).put('push', {
    id: 'current',
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    createdAt: Date.now(),
  });
}

export async function forgetPushSubscription(): Promise<void> {
  await (await db()).delete('push', 'current');
}

export async function storedPushSubscription(): Promise<PushRecord | undefined> {
  return (await db()).get('push', 'current');
}
