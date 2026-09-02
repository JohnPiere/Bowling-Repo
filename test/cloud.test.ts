import { describe, expect, it } from 'vitest';
import {
  chunk,
  fromBackupRow,
  pending,
  planPull,
  toBackupRow,
  type BackupRow,
} from '../src/lib/cloud';
import type { Game } from '../src/lib/db';

const OPEN = Array<number>(20).fill(4);
const AT = Date.UTC(2026, 7, 14, 19, 30);

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    bowler: 'You',
    rolls: OPEN,
    total: 80,
    isComplete: true,
    source: 'manual',
    playedAt: AT,
    updatedAt: AT,
    ...over,
  };
}

const row = (over: Partial<BackupRow> = {}): BackupRow => ({
  ...toBackupRow(game(), 'me'),
  ...over,
});

describe('toBackupRow', () => {
  it('carries everything a game needs to come back', () => {
    const sent = toBackupRow(
      game({ house: 'Korona', note: 'Lane 7', pinfalls: [[1, 2], [3]] }),
      'me',
    );
    expect(sent.owner_id).toBe('me');
    expect(sent.local_id).toBe('g1');
    expect(sent.house).toBe('Korona');
    expect(sent.note).toBe('Lane 7');
    expect(sent.pinfalls).toEqual([[1, 2], [3]]);
    expect(sent.played_at).toBe(new Date(AT).toISOString());
  });

  it('sends the device’s own updatedAt, which is what settles a conflict', () => {
    const edited = game({ updatedAt: AT + 5000 });
    expect(toBackupRow(edited, 'me').updated_at).toBe(new Date(AT + 5000).toISOString());
  });

  it('sends nothing where the game said nothing', () => {
    const sent = toBackupRow(game(), 'me');
    expect(sent.house).toBeNull();
    expect(sent.note).toBeNull();
    expect(sent.pinfalls).toBeNull();
  });
});

describe('fromBackupRow', () => {
  it('round-trips a game', () => {
    const original = game({ house: 'Korona', note: 'Lane 7', pinfalls: [[1, 2], [3]] });
    const back = fromBackupRow(toBackupRow(original, 'me'));
    expect(back).toMatchObject({
      id: 'g1',
      house: 'Korona',
      note: 'Lane 7',
      playedAt: AT,
      updatedAt: AT,
    });
    expect(back?.pinfalls).toEqual([[1, 2], [3]]);
  });

  it('does not claim a photo it cannot have', () => {
    // A restored game that says it has a sheet shows "Loading the photo…" for
    // ever, since no photo was ever uploaded.
    expect(fromBackupRow(row())?.hasSheet).toBeUndefined();
  });

  it('comes back already synced, so it is not sent straight back up', () => {
    const back = fromBackupRow(row());
    expect(back?.syncedAt).toBe(back?.updatedAt);
  });

  it('rescores rather than trusting the total it was given', () => {
    expect(fromBackupRow(row({ total: 299 }))?.total).toBe(80);
  });

  it('refuses a row whose rolls are not a game', () => {
    expect(fromBackupRow(row({ rolls: [11, 4] }))).toBeNull();
  });

  it('refuses a row whose pin data is the wrong shape', () => {
    // It is iterated by the leave statistics, and a number where an array
    // belongs throws mid-render — long after the sync that carried it.
    expect(fromBackupRow(row({ pinfalls: [4] as unknown as number[][] }))).toBeNull();
  });

  it('refuses a row with an unreadable date', () => {
    expect(fromBackupRow(row({ played_at: 'sometime' }))).toBeNull();
  });
});

describe('pending', () => {
  it('offers a game that has never been sent', () => {
    expect(pending([game()])).toHaveLength(1);
  });

  it('leaves alone a game the server already has at this version', () => {
    expect(pending([game({ syncedAt: AT })])).toHaveLength(0);
  });

  it('offers a game again once it has been corrected', () => {
    // reviseGame clears syncedAt; this covers the other way round too, where a
    // sync landed and an edit followed.
    expect(pending([game({ syncedAt: AT, updatedAt: AT + 1000 })])).toHaveLength(1);
  });
});

describe('planPull', () => {
  it('writes a game this device has never seen', () => {
    const plan = planPull([], [row()]);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.alreadyHere).toBe(0);
  });

  it('leaves a game this device already has at the same version', () => {
    const plan = planPull([game({ syncedAt: AT })], [row()]);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.alreadyHere).toBe(1);
  });

  it('takes the server’s copy when it is the newer one', () => {
    const newer = row({ updated_at: new Date(AT + 60_000).toISOString(), house: 'Korona' });
    const plan = planPull([game()], [newer]);
    expect(plan.toWrite[0].house).toBe('Korona');
  });

  it('keeps this device’s copy when it is the newer one', () => {
    // An edit made offline must survive the sync that follows it.
    const mine = game({ updatedAt: AT + 60_000, house: 'Rose Bowl' });
    const plan = planPull([mine], [row()]);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.alreadyHere).toBe(1);
  });

  it('counts an unusable row rather than writing it', () => {
    const plan = planPull([], [row({ rolls: [11, 4] })]);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.rejected).toBe(1);
  });

  it('does not put back a game this device deleted', () => {
    // The server still holds the row and the phone no longer has the game, so
    // "missing here" would otherwise look exactly like "bowled on the other
    // phone" — and a sync that undeletes is worse than no sync.
    const plan = planPull([], [row()], ['g1']);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.rejected).toBe(0);
  });

  it('has nothing to do against an empty account', () => {
    expect(planPull([game()], [])).toEqual({ toWrite: [], alreadyHere: 0, rejected: 0 });
  });
});

describe('chunk', () => {
  it('splits into request-sized pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('makes no request out of nothing', () => {
    expect(chunk([], 2)).toEqual([]);
  });
});
