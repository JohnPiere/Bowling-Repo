import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reset that comes out of nowhere.
 *
 * An update arriving while nothing is being bowled — the app has just opened,
 * or a game has just been saved — is applied straight away, which arms a
 * fallback reload 1500ms later. Throw a ball inside that window and the reload
 * lands on top of the game. Nothing on screen explains it, and it only happens
 * when a deploy has just gone out, which is exactly what makes it look random.
 */
describe('an update never reloads on top of a game', () => {
  let reloaded = 0;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    reloaded = 0;

    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('location', { reload: () => { reloaded += 1; } });
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  });

  it('reloads when nothing is being bowled', async () => {
    const { updateArrived } = await import('../src/lib/updates');
    updateArrived(() => {});
    vi.advanceTimersByTime(2000);
    expect(reloaded).toBe(1);
  });

  it('does not reload if a ball goes down before the fallback fires', async () => {
    const { setBowling, updateArrived, isUpdateWaiting } = await import('../src/lib/updates');

    // The update lands while the screen is empty, so it applies at once.
    updateArrived(() => {});
    // …and the bowler throws inside the handover window.
    setBowling(true);
    vi.advanceTimersByTime(2000);

    expect(reloaded).toBe(0);
    // Not dropped — it goes back to the banner, where a held update belongs.
    expect(isUpdateWaiting()).toBe(true);
  });

  it('takes it the moment the game ends', async () => {
    const { setBowling, updateArrived } = await import('../src/lib/updates');

    updateArrived(() => {});
    setBowling(true);
    vi.advanceTimersByTime(2000);
    expect(reloaded).toBe(0);

    setBowling(false);
    vi.advanceTimersByTime(2000);
    expect(reloaded).toBe(1);
  });

  it('holds an update that arrives mid-game in the first place', async () => {
    const { setBowling, updateArrived, isUpdateWaiting } = await import('../src/lib/updates');

    setBowling(true);
    updateArrived(() => {});
    vi.advanceTimersByTime(2000);

    expect(reloaded).toBe(0);
    expect(isUpdateWaiting()).toBe(true);
  });

  it('takes it mid-game anyway when the bowler taps Update now', async () => {
    // The other half of the same rule, and the reason the guard is not simply
    // "never while bowling". The banner is drawn *during* a game and says the
    // update can be taken now if you would rather; a button that then refused
    // would be the dead button this file exists to have fixed.
    const { applyUpdate, setBowling, updateArrived } = await import('../src/lib/updates');

    setBowling(true);
    updateArrived(() => {});
    applyUpdate(true);
    vi.advanceTimersByTime(2000);

    expect(reloaded).toBe(1);
  });
});
