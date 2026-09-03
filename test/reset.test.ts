import { describe, expect, it } from 'vitest';
import { anyFailed, failedSteps, runReset, type ResetStep, type ResetTasks } from '../src/lib/reset';

/** A full set of tasks that all succeed, recording the order they ran in. */
function tasks(order: ResetStep[], failing: ResetStep[] = []): ResetTasks {
  const step = <T>(name: ResetStep, value: T) => async () => {
    order.push(name);
    if (failing.includes(name)) throw new Error(`${name} refused`);
    return value;
  };

  return {
    backup: step('backup', undefined),
    crews: step('crews', { left: 2, deleted: 1 }),
    profile: step('profile', undefined),
    signOut: step('signOut', undefined),
    games: step('games', 47),
    push: step('push', undefined),
    preferences: step('preferences', undefined),
  };
}

describe('runReset', () => {
  it('does the server first and signs out last of it', async () => {
    // Every remote step needs the session, and signing out is a step. The other
    // order leaves a season on a server the app can no longer reach.
    const order: ResetStep[] = [];
    await runReset(tasks(order));
    expect(order).toEqual([
      'backup',
      'crews',
      'profile',
      'signOut',
      'games',
      'push',
      'preferences',
    ]);
  });

  it('wipes the phone even when the server refuses', async () => {
    // Somebody resetting on alley wifi must not end up with their games still
    // here because a crew would not delete.
    const order: ResetStep[] = [];
    const outcomes = await runReset(tasks(order, ['backup', 'crews', 'profile']));

    expect(order).toContain('games');
    expect(order).toContain('preferences');
    expect(outcomes.find((o) => o.step === 'games')?.ok).toBe(true);
  });

  it('reports the steps that failed rather than swallowing them', async () => {
    const outcomes = await runReset(tasks([], ['crews']));
    expect(anyFailed(outcomes)).toBe(true);
    expect(failedSteps(outcomes)).toEqual(['crews']);
  });

  it('says nothing failed when nothing did', async () => {
    const outcomes = await runReset(tasks([]));
    expect(anyFailed(outcomes)).toBe(false);
    expect(failedSteps(outcomes)).toEqual([]);
  });

  it('counts what went, where a step can say', async () => {
    const outcomes = await runReset(tasks([]));
    expect(outcomes.find((o) => o.step === 'games')?.detail).toBe('47');
    // Two left plus one deleted is three crews that are no longer yours.
    expect(outcomes.find((o) => o.step === 'crews')?.detail).toBe('3');
  });

  it('skips the server entirely for a guest', async () => {
    // A guest has no server side. Reporting four steps that were never going to
    // happen would be four lines of noise on the one screen that has to be
    // read carefully.
    const order: ResetStep[] = [];
    const all = tasks(order);
    const outcomes = await runReset({
      games: all.games,
      push: all.push,
      preferences: all.preferences,
    });

    expect(order).toEqual(['games', 'push', 'preferences']);
    expect(outcomes.map((o) => o.step)).toEqual(['games', 'push', 'preferences']);
  });
});
