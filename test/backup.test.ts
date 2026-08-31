import { describe, expect, it } from 'vitest';
import { BackupError, buildBackup, planRestore } from '../src/lib/backup';
import type { Game } from '../src/lib/db';

const NOW = Date.UTC(2026, 7, 31);

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    bowler: 'You',
    rolls: Array<number>(20).fill(4),
    total: 80,
    isComplete: true,
    source: 'manual',
    playedAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('buildBackup', () => {
  it('carries the games and says what it is', () => {
    const backup = buildBackup([game()]);
    expect(backup.format).toBe('lane-log/backup');
    expect(backup.games).toHaveLength(1);
    expect(backup.exportedAt).toMatch(/^\d{4}-/);
  });

  it('does not carry the photo flag, since photos are not in the file', () => {
    const backup = buildBackup([game({ hasSheet: true })]);
    expect(backup.games[0]).not.toHaveProperty('hasSheet');
  });
});

describe('planRestore', () => {
  it('plans to add a game this device does not have', () => {
    const file = JSON.stringify(buildBackup([game({ id: 'new' })]));
    const plan = planRestore(file, []);
    expect(plan.toAdd.map((g) => g.id)).toEqual(['new']);
    expect(plan.alreadyHere).toBe(0);
  });

  it('leaves games already here alone', () => {
    const file = JSON.stringify(buildBackup([game({ id: 'have' })]));
    const plan = planRestore(file, [game({ id: 'have' })]);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.alreadyHere).toBe(1);
  });

  it('does not add the same game twice from one file', () => {
    const file = JSON.stringify(buildBackup([game({ id: 'dup' }), game({ id: 'dup' })]));
    const plan = planRestore(file, []);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.alreadyHere).toBe(1);
  });

  it('rescores rather than trusting a total in the file', () => {
    // A hand-edited export claiming a 300 it did not bowl.
    const file = JSON.stringify(buildBackup([game({ id: 'liar', total: 300 })]));
    expect(planRestore(file, []).toAdd[0].total).toBe(80);
  });

  it('accepts a bare array of games', () => {
    const plan = planRestore(JSON.stringify([game({ id: 'bare' })]), []);
    expect(plan.toAdd.map((g) => g.id)).toEqual(['bare']);
  });

  it('rejects entries that are not games, and says why', () => {
    const file = JSON.stringify([
      game({ id: 'ok' }),
      { id: 'no-rolls', playedAt: NOW },
      { rolls: [1, 2], playedAt: NOW },
      { id: 'impossible', rolls: [7, 5], playedAt: NOW },
      { id: 'undated', rolls: [4, 4] },
      'not an object',
    ]);
    const plan = planRestore(file, []);

    expect(plan.toAdd.map((g) => g.id)).toEqual(['ok']);
    expect(plan.rejected.map((r) => r.reason)).toEqual([
      'no rolls',
      'no id',
      'the rolls do not describe a real game',
      'no date',
      'not a game',
    ]);
  });

  it('refuses a file that is not JSON', () => {
    expect(() => planRestore('<html>', [])).toThrow(BackupError);
  });

  it('refuses a file with no games in it', () => {
    expect(() => planRestore('{"hello":"world"}', [])).toThrow(/does not contain any games/);
  });

  it('refuses a backup from another app', () => {
    expect(() => planRestore('{"format":"something/else","games":[]}', [])).toThrow(
      /not a Lane Log backup/,
    );
  });

  it('refuses a backup from a newer version than it understands', () => {
    expect(() =>
      planRestore('{"format":"lane-log/backup","version":99,"games":[]}', []),
    ).toThrow(/newer version/);
  });
});
