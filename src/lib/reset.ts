/**
 * Putting the account back to nothing.
 *
 * "Clear all data" removes the games on this phone. This removes the person:
 * the games, the copy on the server, the crews, the name and picture other
 * bowlers see, the notification subscription, and every preference — ending at
 * the first-run screen with a guest session, which is where a new install
 * starts.
 *
 * Three rules hold it together, and all three are about what happens when part
 * of it fails.
 *
 * **The server goes first.** Every remote step needs the session, and signing
 * out is a step. Doing it in the other order would leave a season on a server
 * the app can no longer reach to delete.
 *
 * **Nothing stops the local wipe.** Somebody resetting an account on alley wifi
 * must not end up with their games still on the phone because a crew would not
 * delete. Each step is caught on its own and reported; the run continues.
 *
 * **It says what it could not do.** A step that failed comes back as a step
 * that failed, and the screen prints it. A reset that quietly left a board up
 * would be the worst kind of wrong.
 *
 * What it cannot do at all is delete the account with the identity provider.
 * That needs a key this app does not have and should not have — the publishable
 * key grants nothing — so the screen points at Google's own settings instead of
 * pretending.
 */

export type ResetStep =
  | 'backup'
  | 'crews'
  | 'profile'
  | 'signOut'
  | 'games'
  | 'push'
  | 'preferences';

export interface ResetOutcome {
  step: ResetStep;
  ok: boolean;
  /** What went, for the steps that can say. */
  detail?: string;
}

/**
 * The work, injected.
 *
 * Passed in rather than imported so the order and the keep-going behaviour can
 * be tested without a database, a service worker or an IndexedDB — which is the
 * only part of this worth testing, and the part that would otherwise only ever
 * be exercised by somebody deleting their real account.
 *
 * The remote four are optional: a guest has no server side to reset.
 */
export interface ResetTasks {
  backup?: () => Promise<void>;
  crews?: () => Promise<{ left: number; deleted: number }>;
  profile?: () => Promise<void>;
  signOut?: () => Promise<void>;
  games: () => Promise<number>;
  push: () => Promise<void>;
  preferences: () => Promise<void>;
}

/** The order every reset runs in. Remote first, sign-out last of the remote. */
const ORDER: ResetStep[] = ['backup', 'crews', 'profile', 'signOut', 'games', 'push', 'preferences'];

export async function runReset(tasks: ResetTasks): Promise<ResetOutcome[]> {
  const outcomes: ResetOutcome[] = [];

  for (const step of ORDER) {
    const work = tasks[step];
    // A guest skips the remote steps entirely rather than reporting four
    // things that were never going to happen.
    if (!work) continue;

    try {
      const result = await work();
      outcomes.push({ step, ...describe(step, result) });
    } catch {
      outcomes.push({ step, ok: false });
    }
  }

  return outcomes;
}

function describe(step: ResetStep, result: unknown): { ok: true; detail?: string } {
  if (step === 'games' && typeof result === 'number') {
    return { ok: true, detail: `${result}` };
  }
  if (step === 'crews' && result && typeof result === 'object') {
    const { left, deleted } = result as { left: number; deleted: number };
    return { ok: true, detail: `${left + deleted}` };
  }
  return { ok: true };
}

/** Whether anything at all failed, which is the only thing the screen branches on. */
export function anyFailed(outcomes: ResetOutcome[]): boolean {
  return outcomes.some((outcome) => !outcome.ok);
}

/** The steps that failed, in the order they were tried. */
export function failedSteps(outcomes: ResetOutcome[]): ResetStep[] {
  return outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.step);
}
