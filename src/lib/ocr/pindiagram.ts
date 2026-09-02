/**
 * Reading the pin diagram a Japanese house sheet prints under every frame.
 *
 * The sheet draws each frame's rack as a triangle of ten small circles, and
 * uses the shape of each circle to say what happened to that pin. Its own
 * legend, printed at the top:
 *
 *     ●は1投目の残ピン    a filled ball is a pin left standing after ball one
 *     ８は2投目の残ピン    a stacked pair is a pin left standing after ball two
 *
 * An ordinary open ring is a pin that went down. So one diagram carries *both*
 * leaves, which is more than the marks alone can say: `9 /` tells you nine
 * fell and the spare was taken, and the diagram tells you it was the 10-pin.
 *
 * That is exactly the `pinfalls` the app stores for its own games, so a scanned
 * sheet can feed the leave statistics rather than only the scores. It is the
 * one thing a photograph gives that typing a mark string never could.
 *
 * ## Why this is worth reading rather than guessing
 *
 * The alternative is inferring a leave from the count — "9 down" could be any
 * of ten pins — which would put a 10-pin in somebody's history that they never
 * left. The scanner refuses to guess pins elsewhere for the same reason; here
 * it does not have to.
 */

import { FULL_RACK } from '../pins';
import type { Binary } from './segment';

/** The rack as the sheet draws it: back row first, headpin last. */
const DIAGRAM_ROWS: number[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

export type Glyph = 'down' | 'first' | 'second';

export interface Blob {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Dark pixels inside the bounding box, over its area. */
  fill: number;
}

export interface Leave {
  /** Pins still standing after the first ball. */
  afterFirst: number[];
  /** Pins still standing after the second ball. */
  afterSecond: number[];
  /**
   * False when the diagram did not resolve into a rack — a fold across it, a
   * frame the printer left blank, or a crop that caught two frames. The caller
   * shows the frame without pin data rather than with invented pin data.
   */
  readable: boolean;
}

/**
 * Which of the three shapes a blob is.
 *
 * The stacked pair is caught by proportion before anything else: two rings one
 * above the other is half as wide as it is tall, and no single circle on this
 * sheet ever is. Only then does fill decide solid from hollow, because a
 * printed ring at this size is mostly white inside and a ball is not.
 */
export function classify(blob: Blob): Glyph {
  if (blob.width > 0 && blob.height / blob.width >= 1.55) return 'second';
  return blob.fill >= 0.55 ? 'first' : 'down';
}

/**
 * Find the dark shapes in a thresholded region.
 *
 * An iterative flood fill rather than a recursive one: a fold or a smudge can
 * connect most of a row into a single component, and a call stack one pixel
 * deep per cell is not something to hand a phone.
 */
export function findBlobs(binary: Binary, width: number, height: number, minPixels = 6): Blob[] {
  const seen = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < binary.length; start++) {
    if (!binary[start] || seen[start]) continue;

    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;
    let count = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const at = stack.pop() as number;
      const x = at % width;
      const y = (at - x) / width;

      count += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;

      // Eight-connected: a printed ring at this size is a single pixel thick
      // in places, and four-connectivity breaks it into arcs.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (binary[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }

    if (count < minPixels) continue;

    const w = right - left + 1;
    const h = bottom - top + 1;
    blobs.push({ left, top, width: w, height: h, fill: count / (w * h) });
  }

  return blobs;
}

/**
 * Group blobs into the diagram's four rows.
 *
 * By vertical position rather than by count, because a row is only complete
 * when every pin in it printed: the 7-pin and the 10-pin sit at the ends of the
 * back row and are the first to fall off a crop. Rows are cut where the gap
 * between successive centres exceeds half the tallest blob, which separates
 * rows without assuming how many are in each.
 */
export function toRows(blobs: Blob[]): Blob[][] {
  if (blobs.length === 0) return [];

  const byTop = [...blobs].sort((a, b) => centreY(a) - centreY(b));
  const tallest = Math.max(...blobs.map((blob) => blob.height));
  const gap = Math.max(2, tallest * 0.5);

  const rows: Blob[][] = [[byTop[0]]];
  for (let i = 1; i < byTop.length; i++) {
    const previous = rows[rows.length - 1];
    if (centreY(byTop[i]) - centreY(previous[previous.length - 1]) > gap) rows.push([byTop[i]]);
    else previous.push(byTop[i]);
  }

  return rows.map((row) => row.sort((a, b) => a.left - b.left));
}

const centreY = (blob: Blob) => blob.top + blob.height / 2;

/**
 * One frame's diagram, as two leaves.
 *
 * The rack is read by *position*, not by counting what was found: a diagram
 * missing its 7-pin still has three more in the back row, and sliding them left
 * would report a 4-6-7 leave for a 8-9-10. So each row's blobs are matched to
 * the pins of the row that is the right length, and a row that does not match
 * any of them makes the whole diagram unreadable.
 */
export function readDiagram(binary: Binary, width: number, height: number): Leave {
  const rows = toRows(findBlobs(binary, width, height));
  const unreadable: Leave = { afterFirst: [], afterSecond: [], readable: false };

  if (rows.length !== DIAGRAM_ROWS.length) return unreadable;

  const first = new Set<number>();
  const second = new Set<number>();

  for (let r = 0; r < rows.length; r++) {
    const pins = DIAGRAM_ROWS[r];
    if (rows[r].length !== pins.length) return unreadable;

    rows[r].forEach((blob, i) => {
      const glyph = classify(blob);
      if (glyph === 'first') first.add(pins[i]);
      // A pin still up after the second ball was necessarily up after the
      // first. The sheet only draws the later mark, so this restores what it
      // leaves implied rather than reporting a pin that fell and stood again.
      if (glyph === 'second') {
        first.add(pins[i]);
        second.add(pins[i]);
      }
    });
  }

  return {
    afterFirst: FULL_RACK.filter((pin) => first.has(pin)),
    afterSecond: FULL_RACK.filter((pin) => second.has(pin)),
    readable: true,
  };
}

/**
 * What the diagram says the two balls took down.
 *
 * Returned in the app's own `pinfalls` shape — one array per ball, of the pins
 * that ball felled — so a scanned game feeds the same leave statistics as one
 * scored on the rack.
 *
 * A frame the diagram says was a strike gets one ball, not two: an empty second
 * array would read as a gutter that was never thrown.
 */
export function toPinfalls(leave: Leave): number[][] | null {
  if (!leave.readable) return null;

  const standingAfterFirst = new Set(leave.afterFirst);
  const ballOne = FULL_RACK.filter((pin) => !standingAfterFirst.has(pin));
  if (ballOne.length === FULL_RACK.length) return [ballOne];

  const standingAfterSecond = new Set(leave.afterSecond);
  const ballTwo = leave.afterFirst.filter((pin) => !standingAfterSecond.has(pin));
  return [ballOne, ballTwo];
}

/**
 * Whether a diagram agrees with the marks printed above it.
 *
 * The sheet carries its own check: the marks say how many fell and the diagram
 * says which, and the two are written by the same machine from the same throw.
 * Where they disagree, something was misread — and a leave that contradicts the
 * score is worse than no leave at all, because it looks like data.
 */
export function agreesWith(leave: Leave, rolls: number[]): boolean {
  if (!leave.readable) return false;

  const falls = toPinfalls(leave);
  if (!falls) return false;
  // The tenth frame re-racks and throws up to three balls, which one diagram
  // cannot describe; those are checked on the first two and left there.
  const compare = Math.min(falls.length, rolls.length);
  if (compare === 0) return false;

  for (let i = 0; i < compare; i++) {
    if (falls[i].length !== rolls[i]) return false;
  }
  return true;
}
