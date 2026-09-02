/**
 * Local game storage.
 *
 * Everything lives in IndexedDB so the app works with no network at all — a
 * bowling alley is a reliably terrible place to have signal. Records carry an
 * `updatedAt` and a `syncedAt` so a future server sync can find what changed
 * without re-uploading the archive.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { scoreGame } from './scoring';

export type GameSource = 'manual' | 'scan';

export interface Game {
  id: string;
  /** Who bowled it. Free text until there are real accounts. */
  bowler: string;
  /** Where it was bowled, if the bowler said. */
  house?: string;
  /**
   * Whatever the numbers cannot say: the lane, the oil, a ball changed at the
   * fifth. Months later this is the only part of a game that explains it, and
   * it is why `searchGames` looks here as well as at the house.
   */
  note?: string;
  /** Pin counts in the order they were thrown. */
  rolls: number[];
  /**
   * Which pins each ball took, when the game was scored on the rack rather
   * than the number pad. Optional: a game entered by count, or imported from
   * a sheet, has counts and nothing more.
   */
  pinfalls?: number[][];
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

/**
 * A game this device deleted.
 *
 * Kept because a backup that cannot be told about a deletion is a backup that
 * undoes one: the next sync would find a row the phone no longer has and
 * helpfully put it back. Deleting offline is normal — it happens on the walk
 * to the car — so the fact has to survive until there is a network to say it
 * on, and that means a record rather than a request.
 *
 * Dropped as soon as the server has been told, and dropped early if a game
 * with the same id is written again.
 */
export interface Tombstone {
  id: string;
  deletedAt: number;
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
  tombstones: {
    key: string;
    value: Tombstone;
  };
}

const DB_NAME = 'lane-log';
const DB_VERSION = 3;

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

        if (oldVersion < 3) {
          // Nothing to backfill: a device upgrading has never synced, so it has
          // no server rows for its past deletions to be about.
          database.createObjectStore('tombstones', { keyPath: 'id' });
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
  const tx = database.transaction(['games', 'sheets', 'tombstones'], 'readwrite');
  await tx.objectStore('games').put(record);
  if (sheetImage) {
    await tx.objectStore('sheets').put({ gameId: id, image: sheetImage, storedAt: record.updatedAt });
  }
  // Writing a game with this id is un-deleting it, and the pending deletion
  // must not follow it to the server.
  await tx.objectStore('tombstones').delete(id);
  await tx.done;

  return record;
}

/**
 * Correct a game that was saved wrong.
 *
 * Rewrites the rolls and rescores from them, so the stored total can never
 * disagree with the frames it came from. The photo, if there is one, is left
 * where it is — the paper did not change, only what we read off it.
 */
export async function reviseGame(
  id: string,
  changes: { rolls?: number[]; house?: string; note?: string; playedAt?: number },
): Promise<Game | undefined> {
  const game = await getGame(id);
  if (!game) return undefined;

  const rolls = changes.rolls ?? game.rolls;
  const card = scoreGame(rolls);

  const updated: Game = {
    ...game,
    rolls,
    total: card.total,
    isComplete: card.isComplete,
    house: changes.house === undefined ? game.house : changes.house || undefined,
    note: changes.note === undefined ? game.note : changes.note.trim() || undefined,
    playedAt: changes.playedAt ?? game.playedAt,
    updatedAt: Date.now(),
    // A corrected game has to be re-synced.
    syncedAt: undefined,
  };

  await (await db()).put('games', updated);
  return updated;
}

/**
 * Write several games at once.
 *
 * Restoring a season one save at a time would be hundreds of transactions;
 * this is one, so a restore either lands or does not.
 */
export async function putGames(games: Game[]): Promise<number> {
  if (games.length === 0) return 0;

  const database = await db();
  const tx = database.transaction(['games', 'tombstones'], 'readwrite');
  const store = tx.objectStore('games');
  const graves = tx.objectStore('tombstones');

  for (const game of games) {
    await store.put(game);
    // Same rule as a single save: a game written back is a game not deleted.
    await graves.delete(game.id);
  }
  await tx.done;

  return games.length;
}

/**
 * Record that these games reached the server.
 *
 * Takes the versions that were actually sent, and skips any the device has
 * edited since: a game corrected between building the upload and this call is
 * still owed, and marking it synced would lose the correction until the next
 * edit. That window is small and a season is not worth it.
 */
export async function markSynced(
  sent: { id: string; updatedAt: number }[],
  at = Date.now(),
): Promise<number> {
  if (sent.length === 0) return 0;

  const database = await db();
  const tx = database.transaction('games', 'readwrite');
  const store = tx.objectStore('games');
  let marked = 0;

  for (const { id, updatedAt } of sent) {
    const game = await store.get(id);
    if (!game || game.updatedAt !== updatedAt) continue;
    await store.put({ ...game, syncedAt: at });
    marked += 1;
  }

  await tx.done;
  return marked;
}

/** The scanned photo a game came from, loaded only when something needs it. */
export async function getSheetImage(gameId: string): Promise<Blob | undefined> {
  return (await (await db()).get('sheets', gameId))?.image;
}

export async function deleteGame(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['games', 'sheets', 'tombstones'], 'readwrite');
  await tx.objectStore('games').delete(id);
  // Deleting the game must not leave its photo occupying storage forever.
  await tx.objectStore('sheets').delete(id);
  // …nor let the next sync put it back.
  await tx.objectStore('tombstones').put({ id, deletedAt: Date.now() });
  await tx.done;
}

/** Deletions this device has not yet been able to tell the server about. */
export async function listTombstones(): Promise<Tombstone[]> {
  return (await db()).getAll('tombstones');
}

/** Forget the deletions the server has now been told about. */
export async function clearTombstones(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const database = await db();
  const tx = database.transaction('tombstones', 'readwrite');
  for (const id of ids) await tx.objectStore('tombstones').delete(id);
  await tx.done;
}

/** Games that have never been pushed to a server, oldest first. */
/**
 * Remove every game and every stored sheet photo.
 *
 * One transaction over both stores, so it cannot half-succeed and leave photos
 * orphaned from games that no longer exist. The push subscription is left
 * alone: it belongs to the device's relationship with the browser, not to the
 * season, and clearing it would silently unsubscribe someone who only meant to
 * start their scores again.
 *
 * Returns how many games went, so the screen can say what it did rather than
 * claiming success in the abstract.
 */
export async function clearAllGames(): Promise<number> {
  const database = await db();
  const tx = database.transaction(['games', 'sheets', 'tombstones'], 'readwrite');

  const games = tx.objectStore('games');
  const ids = await games.getAllKeys();
  const graves = tx.objectStore('tombstones');
  const at = Date.now();

  // One tombstone each, so "delete everything" means it on the server too the
  // next time there is one to talk to.
  for (const id of ids) await graves.put({ id, deletedAt: at });

  await games.clear();
  await tx.objectStore('sheets').clear();
  await tx.done;

  return ids.length;
}

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
