import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Getting a new version onto the phone.
 *
 * This is a state machine with two inputs — a worker arrived, a game is or is
 * not being bowled — and one irreversible output, a reload. Both mistakes it
 * can make are expensive and neither is visible in testing by hand: an update
 * taken mid-game costs somebody the game they were bowling, and an update
 * never taken means a deploy that reaches nobody, which is what was happening.
 *
 * The handover itself is a service worker, so it is not tested here — that is
 * what the browser simulation is for. What is here is when it is asked for.
 */

/** Module state is the thing under test, so each case gets its own copy. */
async function load() {
  vi.resetModules();
  return import('../src/lib/updates');
}

beforeEach(() => {
  vi.useFakeTimers();
});

// A case that takes an update leaves the fallback reload pending on the clock.
// Kept, it fires inside the next case that advances time — which reads as that
// case reloading twice.
afterEach(() => {
  vi.useRealTimers();
});

describe('an update arriving', () => {
  it('is taken at once when nothing is being bowled', async () => {
    const { updateArrived } = await load();
    const handOver = vi.fn();

    updateArrived(handOver);

    expect(handOver).toHaveBeenCalledOnce();
  });

  it('is held, and announced, when a game is in progress', async () => {
    const { isUpdateWaiting, setBowling, updateArrived } = await load();
    const handOver = vi.fn();

    setBowling(true);
    updateArrived(handOver);

    expect(handOver).not.toHaveBeenCalled();
    expect(isUpdateWaiting()).toBe(true);
  });

  it('is taken the moment the game is over', async () => {
    // Saving a game empties the rolls, which is the one instant where a reload
    // costs nothing at all.
    const { setBowling, updateArrived } = await load();
    const handOver = vi.fn();

    setBowling(true);
    updateArrived(handOver);
    setBowling(false);

    expect(handOver).toHaveBeenCalledOnce();
  });

  it('is not taken by a ball, only by the end of the game', async () => {
    // `setBowling(true)` runs on every ball. If a repeat of what is already
    // true were treated as a change, the update would land between two frames.
    const { setBowling, updateArrived } = await load();
    const handOver = vi.fn();

    setBowling(true);
    updateArrived(handOver);
    for (let ball = 0; ball < 12; ball++) setBowling(true);

    expect(handOver).not.toHaveBeenCalled();
  });
});

describe('subscribers', () => {
  it('are told the state they are joining', async () => {
    const { onUpdateWaiting } = await load();
    const listener = vi.fn();

    onUpdateWaiting(listener);

    expect(listener).toHaveBeenCalledWith(false);
  });

  it('hear about an update that had to be held', async () => {
    const { onUpdateWaiting, setBowling, updateArrived } = await load();
    const listener = vi.fn();
    onUpdateWaiting(listener);

    setBowling(true);
    updateArrived(vi.fn());

    expect(listener).toHaveBeenLastCalledWith(true);
  });

  it('stop hearing once they unsubscribe', async () => {
    const { onUpdateWaiting, setBowling, updateArrived } = await load();
    const listener = vi.fn();
    const stop = onUpdateWaiting(listener);
    stop();

    setBowling(true);
    updateArrived(vi.fn());

    expect(listener).toHaveBeenCalledTimes(1); // the initial state, nothing since
  });
});

describe('taking the update', () => {
  it('reloads when the handover does not happen', async () => {
    // The bug this exists for: a page loaded before any worker controlled it
    // is uncontrolled, so a new worker activates without ever passing through
    // `waiting` — nothing to skip, no `controllerchange`, no reload. Measured
    // in the browser: tapping Update did nothing whatsoever.
    const { applyUpdate, setBowling, updateArrived } = await load();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    setBowling(true);
    updateArrived(() => undefined); // a handover that cannot land
    applyUpdate(true);

    expect(reload).not.toHaveBeenCalled(); // give the real path its chance first
    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('reloads once per tab, not once per attempt', async () => {
    // A reload that lands back in the same state would reload again. A page
    // that reloads forever is worse than a page one version behind.
    const { applyUpdate, setBowling, updateArrived } = await load();
    const reload = vi.fn();
    const store = new Map<string, string>();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });

    setBowling(true);
    updateArrived(() => undefined);
    applyUpdate(true);
    vi.advanceTimersByTime(2000);

    // A second worker arrives, is held, and is asked for again.
    updateArrived(() => undefined);
    applyUpdate(true);
    vi.advanceTimersByTime(2000);

    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('lets the bowler ask again when a reload was refused', async () => {
    // Nothing else is left to offer, so a dead button is not the answer.
    const { applyUpdate, setBowling, updateArrived } = await load();
    vi.stubGlobal('location', { reload: vi.fn() });
    vi.stubGlobal('sessionStorage', {
      getItem: () => '1', // this tab has already spent its reload
      setItem: () => undefined,
    });

    setBowling(true);
    updateArrived(() => undefined);
    applyUpdate(true); // spends nothing: the reload is refused
    vi.advanceTimersByTime(2000);

    const second = vi.fn();
    updateArrived(second); // a later worker, still held by the game
    expect(second).not.toHaveBeenCalled();

    applyUpdate(true);
    expect(second).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('asks once however many times it is tapped', async () => {
    const { applyUpdate, setBowling, updateArrived } = await load();
    const handOver = vi.fn();

    setBowling(true);
    updateArrived(handOver);
    applyUpdate(true);
    applyUpdate(true);
    applyUpdate(true);

    expect(handOver).toHaveBeenCalledOnce();
  });
});
