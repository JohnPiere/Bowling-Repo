/**
 * Getting a new version onto the phone.
 *
 * The worker is registered with `prompt` rather than `autoUpdate`, and that is
 * still right: rolls live in component state until a game is saved, so a reload
 * that arrived mid-frame would cost somebody the game they were bowling. What
 * was wrong was everything around it.
 *
 * The prompt was a `confirm()`. A browser dialog is dismissed with a stray tap,
 * it never comes back for that worker, and on a Home Screen PWA it may not
 * appear at all — so the new worker sat waiting while the old one kept serving
 * the old app, indefinitely. A deploy that reaches nobody is not a deploy.
 *
 * So: apply it immediately when nothing is being bowled, which is almost always,
 * and hold it behind a banner that does not go away when something is. And ask
 * the browser to look — it checks for a new worker on navigation and about once
 * a day, which for an app opened from the Home Screen can mean never.
 */

type Listener = (ready: boolean) => void;

const listeners = new Set<Listener>();

/** Set once a new worker is installed and waiting. */
let waiting = false;

/** How to hand over to it. Provided by `registerSW` in `main.tsx`. */
let apply: (() => void) | null = null;

/**
 * Whether a game is being entered right now.
 *
 * The one thing a reload would destroy: rolls are component state until the
 * game is saved. Everything else on any screen is either in IndexedDB or a
 * scroll position.
 */
let bowling = false;

/** Set once the handover has been asked for, so it is asked for once. */
let applying = false;

/**
 * Whether the update being applied is one the bowler tapped for.
 *
 * The banner is shown *while* a game is in progress, so "Update now" is a
 * deliberate choice to lose the game on screen, and it has to work. An update
 * the app decided to take on its own is the opposite: nobody agreed to it, and
 * it must not land on a game that started after it was set going.
 */
let requested = false;

/**
 * How long to give the worker handover before reloading anyway.
 *
 * Long enough that the ordinary path — skip waiting, `controllerchange`,
 * reload — always wins the race, short enough that a button that did nothing
 * is not what the bowler is left looking at.
 */
const HANDOVER_MS = 1500;

/** Marks a tab that has already spent its one fallback reload. */
const RELOADED = 'lane-log.update-reloaded';

function notify() {
  for (const listener of listeners) listener(waiting);
}

/** Subscribe to "an update is waiting". Returns its own unsubscribe. */
export function onUpdateWaiting(listener: Listener): () => void {
  listeners.add(listener);
  listener(waiting);
  return () => listeners.delete(listener);
}

export function isUpdateWaiting(): boolean {
  return waiting;
}

/**
 * A new worker has installed and is waiting to take over.
 *
 * Applied on the spot unless a game is in progress — the reload costs a scroll
 * position and nothing else, and a version that waits for permission is a
 * version that never arrives.
 */
export function updateArrived(handOver: () => void): void {
  apply = handOver;
  // A new worker is a fresh chance to hand over, whatever became of the last.
  applying = false;
  requested = false;

  if (!bowling) {
    // Through `applyUpdate` rather than straight to `handOver`, so this path
    // gets the same fallback: an update nobody was offered is exactly as stuck
    // as one somebody tapped.
    applyUpdate();
    return;
  }

  waiting = true;
  notify();
}

/**
 * Take the update now. The page reloads.
 *
 * The handover is a message to a *waiting* worker, and there is not always one
 * to message. A page loaded before any worker controlled it — the first visit
 * of a session — is uncontrolled, so the next worker activates without ever
 * passing through `waiting`: there is nothing to skip, no `controllerchange`
 * fires, and the reload that hangs off it never happens. Measured in the
 * browser, that made "Update now" a button that did nothing whatsoever, which
 * is the worst of the answers available.
 *
 * A reload is what the handover was going to do anyway, so do it when the
 * handover does not.
 *
 * `asked` is true only for the banner's own button. An update somebody chose
 * is taken whatever is on the screen; one the app started by itself is not, and
 * `reloadOnce` is where that difference is spent.
 */
export function applyUpdate(asked = false): void {
  if (applying) return;
  applying = true;
  requested = asked;

  apply?.();
  setTimeout(reloadOnce, HANDOVER_MS);
}

/**
 * The fallback reload, at most once per tab.
 *
 * A reload that lands back in the same state would reload again, and a page
 * that reloads forever is worse than a page one version behind — so the second
 * one is refused rather than trusted. It does not cost anything real: the
 * first reload leaves the page controlled by the new worker, which is the
 * condition the ordinary handover needs.
 *
 * `index.html` guards its own recovery the same way and for the same reason.
 */
function reloadOnce(): void {
  // Checked here and not only when the reload was scheduled, because between
  // those two moments a bowler can have thrown a ball.
  //
  // This is the race that resets the screen out of nowhere. An update arriving
  // while nothing is being bowled — the app just opened, or a game was just
  // saved — applies straight away and arms this for 1500ms. Start a game
  // inside that window and the reload lands on top of it. Nothing on the
  // screen explains it, and it only happens when a deploy has just gone out,
  // which is what makes it look random.
  //
  // Not for an update the bowler tapped: the banner is drawn *during* a game,
  // so "Update now" means "yes, now, I know what is on the screen", and a
  // button that refused would be the dead button this file was written to fix.
  //
  // The draft in `lib/draft.ts` means such a reload no longer costs the game;
  // this means the app stops causing one.
  if (bowling && !requested) {
    // Back to the banner. The update is still installed and still wanted — it
    // goes in the same place a held update goes, and is taken when the game
    // ends.
    applying = false;
    waiting = true;
    notify();
    return;
  }

  try {
    if (sessionStorage.getItem(RELOADED)) {
      // Let the bowler ask again; there is nothing else left to offer them.
      applying = false;
      return;
    }
    sessionStorage.setItem(RELOADED, '1');
  } catch {
    // No session storage — private mode, or storage blocked outright. One
    // reload beats none; what is given up is the loop guard, not the reload.
  }

  if (typeof location !== 'undefined') location.reload();
}

/**
 * Stand in front of a reload while there is a game on the screen.
 *
 * Rolls are component state until the game is saved, so a reload mid-frame is
 * the one place in the app that loses something — everywhere else it costs a
 * scroll position. The service-worker update already waits for `bowling` to go
 * false, but that only covers the update *we* trigger. Pull-to-refresh, the
 * reload button, closing the tab and following a link are all the same loss and
 * none of them ask.
 *
 * `beforeunload` is the only thing that can ask. The browser writes the words
 * — every one of them has ignored a custom string for years — so this is not a
 * message, it is a speed bump, and it is only armed while a game is actually in
 * progress. A dialogue on the way out of an empty play screen would be the kind
 * of prompt people learn to dismiss without reading.
 */
let guarded = false;

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Ancient browsers want this set; none of them show what it is set to.
  event.returnValue = '';
}

function guardReload(active: boolean): void {
  if (typeof window === 'undefined' || active === guarded) return;
  guarded = active;
  if (active) window.addEventListener('beforeunload', warnBeforeUnload);
  else window.removeEventListener('beforeunload', warnBeforeUnload);
}

/**
 * Say whether a game is being bowled.
 *
 * When it stops being true and an update was held back, it is taken then — the
 * moment after a game is saved is exactly when a reload costs nothing.
 */
export function setBowling(active: boolean): void {
  bowling = active;
  // Before `applyUpdate`, always: that path reloads on purpose, and it must
  // not be stopped by the guard it has just finished needing.
  guardReload(active);
  if (!active && waiting) applyUpdate();
}

/**
 * Ask the browser to look for a new worker.
 *
 * On its own it checks on navigation and roughly daily, and a PWA opened from
 * the Home Screen may not navigate for weeks. Checking when the app comes back
 * to the front is what turns "eventually" into "next time you open it".
 */
export function watchForUpdates(registration: ServiceWorkerRegistration): () => void {
  const check = () => {
    if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
  };

  document.addEventListener('visibilitychange', check);
  const timer = window.setInterval(check, 60 * 60 * 1000);
  check();

  return () => {
    document.removeEventListener('visibilitychange', check);
    window.clearInterval(timer);
  };
}
