/**
 * The rack, and what a leave means.
 *
 * Counting pins tells you a frame scored 9; knowing *which* pin stood tells
 * you it was a 10-pin, which is the difference between a score and something
 * a bowler can work on. The handoff asks for pin selection rather than a
 * number pad for exactly this reason.
 *
 * Pins are numbered as they are on paper, front to back:
 *
 *        7  8  9  10
 *         4  5  6
 *          2  3
 *            1
 */

import { nextRollCursor, pinsAvailable, scoreGame } from './scoring';

export const PIN_COUNT = 10;

/** All ten, standing. */
export const FULL_RACK: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Where each pin sits, for drawing the rack.
 *
 * `x` is in pin-widths from the left of the back row; `row` counts from the
 * headpin. The rack is a triangular grid, so alternate rows are offset by half
 * a pin.
 */
export const PIN_POSITIONS: Record<number, { x: number; row: number }> = {
  7: { x: 0, row: 3 },
  8: { x: 1, row: 3 },
  9: { x: 2, row: 3 },
  10: { x: 3, row: 3 },
  4: { x: 0.5, row: 2 },
  5: { x: 1.5, row: 2 },
  6: { x: 2.5, row: 2 },
  2: { x: 1, row: 1 },
  3: { x: 2, row: 1 },
  1: { x: 1.5, row: 0 },
};

/**
 * Pins that stand next to each other on the deck — one pin-width apart, so a
 * ball can take both. Everything else has a gap between it.
 */
const NEIGHBOURS: Record<number, number[]> = {
  1: [2, 3],
  2: [1, 3, 4, 5],
  3: [1, 2, 5, 6],
  4: [2, 5, 7, 8],
  5: [2, 3, 4, 6, 8, 9],
  6: [3, 5, 9, 10],
  7: [4, 8],
  8: [4, 5, 7, 9],
  9: [5, 6, 8, 10],
  10: [6, 9],
};

export function areAdjacent(a: number, b: number): boolean {
  return NEIGHBOURS[a]?.includes(b) ?? false;
}

/** Pins left standing after knocking some down. */
export function standingAfter(standing: number[], knockedDown: number[]): number[] {
  const down = new Set(knockedDown);
  return standing.filter((pin) => !down.has(pin));
}

/**
 * Whether a leave is a split.
 *
 * The common definition: the headpin is down, two or more pins remain, and at
 * least two of them are not adjacent — so no single ball can take both. A
 * 7-10 qualifies; a 2-3 does not, because those two touch.
 *
 * Only meaningful after the first ball of a frame; a leave on the second ball
 * is just what is left.
 */
export function isSplit(standing: number[]): boolean {
  if (standing.includes(1)) return false;
  if (standing.length < 2) return false;

  return standing.some((pin, i) =>
    standing.slice(i + 1).some((other) => !areAdjacent(pin, other)),
  );
}

/**
 * The name a bowler would use for a leave, where there is one.
 *
 * Only the leaves common enough to have earned a name; everything else is
 * described by its pins.
 */
export function describeLeave(standing: number[]): string {
  if (standing.length === 0) return 'Strike';
  if (standing.length === PIN_COUNT) return 'Gutter';

  const sorted = [...standing].sort((a, b) => a - b);
  const key = sorted.join('-');

  const NAMED: Record<string, string> = {
    '7-10': '7-10 split',
    '4-6': '4-6 split',
    '4-6-7-10': 'Big four',
    '4-7-10': 'Big four (partial)',
    '5-7': '5-7 split',
    '5-10': '5-10 split',
    '8-10': '8-10 split',
    '4-10': '4-10 split',
    '6-7': '6-7 split',
    '2-7': 'Baby split',
    '3-10': 'Baby split',
    '2-4-5-8': 'Bucket',
    '3-5-6-9': 'Bucket',
  };

  if (NAMED[key]) return NAMED[key];
  if (isSplit(sorted)) return `${key} split`;
  return sorted.length === 1 ? `${key} pin` : `${key}`;
}

/**
 * Rebuild what stood before each ball, from a game's pinfalls.
 *
 * `pinfalls` holds the pins taken by each ball in order. The rack resets after
 * a strike or a spare, and in the tenth after any mark.
 */
export function leavesFromPinfalls(pinfalls: number[][]): number[][] {
  const leaves: number[][] = [];
  let standing = [...FULL_RACK];

  for (const ball of pinfalls) {
    standing = standingAfter(standing, ball);
    leaves.push([...standing]);
    // A cleared deck is re-racked for the next ball.
    if (standing.length === 0) standing = [...FULL_RACK];
  }

  return leaves;
}

/**
 * The pins on the deck for the next ball.
 *
 * Derived from what has been thrown rather than tracked separately, so a
 * re-rack falls out of the scoring rules instead of being special-cased.
 *
 * **Only this frame's balls are replayed, and that is the whole of it.** An
 * earlier version walked every ball of the game from a single rack, re-racking
 * only when the deck happened to empty — so a frame that ended *open* carried
 * its survivors into the next one. Bowl 5 then 1, and the second frame's ball
 * is scored against a deck that still thinks four pins from the first frame are
 * lying down: knock eight and the screen offers one pin for the spare attempt
 * where two are standing. The count was always right, because the fallback on
 * the last line forced the deck to the size the scorer asked for — which is why
 * this survived: it showed the wrong *pins* at the right *number*, and the
 * score was never wrong, only the leave.
 *
 * The tenth still re-racks inside the frame, which is what the empty-deck reset
 * below is for: three balls, and a mark on any of them stands them all up again.
 */
export function deckFor(rolls: number[], pinfalls: number[][]): number[] {
  const available = pinsAvailable(rolls);
  if (available === FULL_RACK.length) return [...FULL_RACK];

  const cursor = nextRollCursor(rolls);
  if (!cursor) return [];

  // Where this frame's balls begin in the flat roll list. `frame.rolls` is a
  // contiguous slice of it, so the offset is the lengths of the frames before.
  const frames = scoreGame(rolls).frames;
  let start = 0;
  for (let i = 0; i < cursor.frame; i++) start += frames[i]?.rolls.length ?? 0;

  let standing = [...FULL_RACK];
  for (const ball of pinfalls.slice(start)) {
    standing = standingAfter(standing, ball);
    if (standing.length === 0) standing = [...FULL_RACK];
  }

  // If the two still disagree — a game part-entered on the pad, say — trust the
  // scorer and show a plausible deck of the right size.
  return standing.length === available ? standing : standing.slice(0, available);
}
