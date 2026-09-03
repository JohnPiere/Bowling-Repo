/**
 * What you are trying to do, as opposed to what the crew is.
 *
 * A challenge belongs to a crew, counts only shared games, and is a target
 * everybody chases. A goal is none of those things: it is private, it counts
 * every game on this phone whether or not anybody else ever sees it, and it is
 * nobody's business but yours. That is why this is a separate file rather than
 * a flag on `Challenge` — the two look alike and share nothing.
 *
 * **Two shapes, and conflating them would be the bug.** `lib/challenges.ts`
 * restricted itself to sums on purpose, because "62% of the way to an average
 * of 180" is not a sentence. A personal goal cannot afford that restriction —
 * "average 160" is the goal most bowlers actually have — so both shapes are
 * here and told apart explicitly:
 *
 * - **reach**: a total that only goes up. 50 strikes, 20 games, 5000 pins.
 *   Progress is a fraction of the target and means what it looks like.
 * - **hold**: a level you are at or you are not. Average 160, a 200 game, a
 *   spread under 20. There is no "62% of the way" — there is where you are and
 *   where you said you wanted to be.
 *
 * Stored in their own `localStorage` key rather than in `Preferences`, which is
 * written whole: a growing list of goals sharing one write with the profile
 * picture is the avatar quota bug waiting to happen again.
 */

import type { Game } from './db';
import { consistency, summarise, tally } from './stats';

export type GoalMetric =
  | 'games'
  | 'strikes'
  | 'spares'
  | 'pins'
  | 'average'
  | 'high'
  | 'spread';

export type GoalKind = 'reach' | 'hold';

export type GoalWindow = 'month' | 'year' | 'all';

export interface GoalMetricSpec {
  key: GoalMetric;
  label: string;
  kind: GoalKind;
  /** For a `hold` goal: is a smaller number the better one? */
  lowerIsBetter?: boolean;
  /** A sensible starting target, so the form is not an empty box. */
  suggested: number;
}

export const GOAL_METRICS: GoalMetricSpec[] = [
  { key: 'games', label: 'Games bowled', kind: 'reach', suggested: 20 },
  { key: 'strikes', label: 'Strikes', kind: 'reach', suggested: 50 },
  { key: 'spares', label: 'Spares', kind: 'reach', suggested: 50 },
  { key: 'pins', label: 'Pins knocked down', kind: 'reach', suggested: 5000 },
  { key: 'average', label: 'Average', kind: 'hold', suggested: 160 },
  { key: 'high', label: 'A game of', kind: 'hold', suggested: 200 },
  { key: 'spread', label: 'Spread under', kind: 'hold', lowerIsBetter: true, suggested: 20 },
];

export function specFor(metric: GoalMetric): GoalMetricSpec {
  return GOAL_METRICS.find((one) => one.key === metric) ?? GOAL_METRICS[0];
}

export interface Goal {
  id: string;
  /** What the bowler called it, or empty to let the metric speak. */
  name: string;
  metric: GoalMetric;
  target: number;
  window: GoalWindow;
  createdAt: number;
}

export interface GoalProgress {
  goal: Goal;
  kind: GoalKind;
  /** Where you are now, in the metric's own units. */
  value: number;
  /** 0..100, capped. For a `hold` goal this is a distance, not an accumulation. */
  percent: number;
  met: boolean;
  /** Games inside the window. Zero is worth saying rather than showing 0%. */
  games: number;
}

/** Games inside a goal's window. */
export function gamesInWindow(goal: Goal, games: Game[], now = Date.now()): Game[] {
  if (goal.window === 'all') return games;

  const date = new Date(now);
  const from =
    goal.window === 'month'
      ? new Date(date.getFullYear(), date.getMonth(), 1).getTime()
      : new Date(date.getFullYear(), 0, 1).getTime();

  return games.filter((game) => game.playedAt >= from);
}

/**
 * Where a goal stands.
 *
 * Every number comes from the same functions the analytics screen draws, so a
 * goal can never disagree with the card above it about what a strike is.
 */
export function goalProgress(goal: Goal, games: Game[], now = Date.now()): GoalProgress {
  const inWindow = gamesInWindow(goal, games, now);
  const spec = specFor(goal.metric);
  const counted = tally(inWindow);

  const value = (() => {
    switch (goal.metric) {
      case 'games':
        // Finished games, matching what every average in the app counts.
        return counted.finished;
      case 'strikes':
        return counted.strikes;
      case 'spares':
        return counted.spares;
      case 'pins':
        return counted.pins;
      case 'average':
        return summarise(inWindow).average ?? 0;
      case 'high':
        return summarise(inWindow).high ?? 0;
      case 'spread':
        return consistency(inWindow)?.spread ?? 0;
    }
  })();

  const met = spec.lowerIsBetter
    ? // A spread of 0 with no games is not a goal met; it is no games.
      value > 0 && value <= goal.target
    : value >= goal.target;

  const percent = (() => {
    if (goal.target <= 0) return 0;
    if (met) return 100;
    if (!spec.lowerIsBetter) return Math.min(100, Math.round((value / goal.target) * 100));
    // Lower-is-better runs the other way: at twice the target you are at zero,
    // and there is no sensible reading below that.
    if (value <= 0) return 0;
    return Math.max(0, Math.round((2 - value / goal.target) * 100));
  })();

  return { goal, kind: spec.kind, value, percent, met, games: inWindow.length };
}

/** Why a goal is not one yet, or null when it is. */
export function problemWithGoal(goal: Pick<Goal, 'metric' | 'target'>): string | null {
  if (!Number.isFinite(goal.target) || goal.target < 1) return 'The target has to be at least 1.';

  const spec = specFor(goal.metric);
  if (spec.kind === 'hold' && goal.metric !== 'spread' && goal.target > 300) {
    return 'Nothing scores over 300.';
  }
  if (goal.target > 1_000_000) return 'That target is too big to be a goal.';
  return null;
}

// ── Where they are kept ────────────────────────────────────────────────────

const KEY = 'lane-log.goals';

/**
 * Read them back, defensively.
 *
 * Anything unreadable is no goals rather than a broken screen — the same call
 * `loadPreferences` makes, and for the same reason: a private window throws on
 * access and a goal is never worth failing a screen over.
 */
export function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Goal[];
    if (!Array.isArray(parsed)) return [];
    // Anything that is not a goal is dropped rather than rendered: this is
    // outside data that ends up persisted and then drawn, same as a restore.
    return parsed.filter(
      (goal) =>
        goal &&
        typeof goal.id === 'string' &&
        typeof goal.target === 'number' &&
        GOAL_METRICS.some((spec) => spec.key === goal.metric),
    );
  } catch {
    return [];
  }
}

export function saveGoals(goals: Goal[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(goals));
    return true;
  } catch {
    return false;
  }
}

export function newGoalId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The name to draw, which is the bowler's own words where they gave any. */
export function describeGoal(goal: Goal): string {
  if (goal.name.trim()) return goal.name.trim();
  const spec = specFor(goal.metric);
  return `${spec.label} ${goal.target}`;
}
