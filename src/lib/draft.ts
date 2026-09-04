/**
 * The game on the screen, kept somewhere it survives.
 *
 * Rolls are component state while a game is being bowled, which is the one
 * thing in the app that is not already in IndexedDB — and it turns out there
 * are two doors out of it, not one. A reload is the obvious one and
 * `setBowling` now stands a `beforeunload` in front of it. The other is
 * quieter and has no dialogue available at all: tapping Home to glance at your
 * average unmounts the play screen, and three strikes go with it. Measured.
 *
 * So the draft lives here instead. Switching tabs costs nothing, and a reload
 * that happens anyway — a crash, a deploy that trips the boot guard, a phone
 * reclaiming the tab — comes back to the game rather than to an empty rack.
 *
 * `localStorage` rather than IndexedDB on purpose: it is synchronous, so the
 * draft is written before an unload can interrupt it, and an async write on
 * every ball is a race with exactly the event this exists to survive. It is a
 * handful of small integers.
 */

export interface Draft {
  rolls: number[];
  /** Empty while scoring on the pad, which records counts and nothing more. */
  pinfalls: number[][];
  /** Which way the game is being entered, so resuming does not change it. */
  entry: 'rack' | 'pad';
  /** When the first ball went down, for the staleness check below. */
  startedAt: number;
}

const KEY = 'lane-log.draft';

/**
 * How long a half-bowled game is worth offering back.
 *
 * Long enough to cover a night out and the walk home; short enough that a game
 * abandoned last month does not reappear over somebody's next one. Coming back
 * to a stale rack is worse than coming back to an empty one, because the empty
 * one is obviously a fresh start.
 */
export const DRAFT_LIFE_MS = 12 * 60 * 60 * 1000;

export function saveDraft(draft: Draft): void {
  try {
    // Nothing thrown is not a game in progress; it is the screen as it opens.
    if (draft.rolls.length === 0) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked or full. The game stays on screen either way; what is
    // given up is surviving a reload, which is what it was before this existed.
  }
}

/**
 * The draft to resume, or null.
 *
 * Defensive in the way `loadGoals` and `problemWith` are: this is outside data
 * that ends up rendered *and scored*, so a shape that is not a game is dropped
 * rather than handed to the scorer.
 */
export function loadDraft(now = Date.now()): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || !Array.isArray(parsed.rolls) || parsed.rolls.length === 0) return null;
    if (!parsed.rolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll <= 10)) return null;
    if (!Array.isArray(parsed.pinfalls)) return null;
    // Pin data is per ball or it is nothing: a ragged list would put every
    // later ball's pins against the wrong ball, which is the failure
    // `leavesFromPinfalls` had and which nothing downstream can detect.
    if (parsed.pinfalls.length !== 0 && parsed.pinfalls.length !== parsed.rolls.length) return null;
    if (typeof parsed.startedAt !== 'number') return null;
    if (now - parsed.startedAt > DRAFT_LIFE_MS) return null;

    return {
      rolls: parsed.rolls,
      pinfalls: parsed.pinfalls,
      entry: parsed.entry === 'pad' ? 'pad' : 'rack',
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing worth failing a save over.
  }
}
