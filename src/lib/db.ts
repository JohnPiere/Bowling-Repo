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
  /**
   * Whether a scanned sheet photo is stored for this game.
   *
   * The photo itself lives in the `sheets` store, not here: a season of
   * scans is tens of megabytes, and reading the game list would otherwise
   * materialise every one of them just to show a column of scores.
   */
  hasSheet?: boolean;
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

/** A scanned sheet photo, kept apart from the game it belongs to. */
export interface SheetRecord {
  gameId: string;
  image: Blob;
  storedAt: number;
}

interface LaneLogDB extends DBSchema {
  games: {
    key: string;
    value: Game;
    indexes: { 'by-playedAt': number; 'by-bowler': string };
  };
  sheets: {
    key: string;
    value: SheetRecord;
  };
  push: {
    key: string;
    value: PushRecord;
  };
}

const DB_NAME = 'lane-log';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<LaneLogDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<LaneLogDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const games = database.createObjectStore('games', { keyPath: 'id' });
          games.createIndex('by-playedAt', 'playedAt');
          games.createIndex('by-bowler', 'bowler');
          database.createObjectStore('push', { keyPath: 'id' });
        }

        if (oldVersion < 2) {
          database.createObjectStore('sheets', { keyPath: 'gameId' });

          // Move photos already stored inline out to their own store, so an
          // existing install gets the benefit without losing its scans.
          const games = transaction.objectStore('games');
          const sheets = transaction.objectStore('sheets');

          void games.openCursor().then(async function migrate(cursor) {
            if (!cursor) return;
            const legacy = cursor.value as Game & { sheetImage?: Blob };

            if (legacy.sheetImage) {
              await sheets.put({
                gameId: legacy.id,
                image: legacy.sheetImage,
                storedAt: legacy.updatedAt,
              });
              delete legacy.sheetImage;
              legacy.hasSheet = true;
              await cursor.update(legacy);
            }

            return migrate(await cursor.continue());
          });
        }
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

/**
 * Store a game, and its sheet photo if it has one.
 *
 * The photo goes to its own store in the same transaction, so a game never
 * ends up claiming a photo that was not written.
 */
export async function saveGame(
  game: Omit<Game, 'id' | 'updatedAt' | 'hasSheet'> & { id?: string; sheetImage?: Blob },
): Promise<Game> {
  const { sheetImage, ...rest } = game;
  const id = game.id ?? newId();

  const record: Game = {
    ...rest,
    id,
    hasSheet: Boolean(sheetImage),
    updatedAt: Date.now(),
  };

  const database = await db();
  const tx = database.transaction(['games', 'sheets'], 'readwrite');
  await tx.objectStore('games').put(record);
  if (sheetImage) {
    await tx.objectStore('sheets').put({ gameId: id, image: sheetImage, storedAt: record.updatedAt });
  }
  await tx.done;

  return record;
}

/** The scanned photo a game came from, loaded only when something needs it. */
export async function getSheetImage(gameId: string): Promise<Blob | undefined> {
  return (await (await db()).get('sheets', gameId))?.image;
}

export async function deleteGame(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['games', 'sheets'], 'readwrite');
  await tx.objectStore('games').delete(id);
  // Deleting the game must not leave its photo occupying storage forever.
  await tx.objectStore('sheets').delete(id);
  await tx.done;
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
