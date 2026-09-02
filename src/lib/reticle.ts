/**
 * The bar the bowler lines a row up inside.
 *
 * A barcode reader gives you a shape and asks you to fill it, and that turns
 * out to be the right interaction here too: a score sheet's row is a long thin
 * strip, the bowler knows which game they want, and pointing at it is faster
 * and more certain than any amount of guessing on our side.
 */

import type { RowBox } from './ocr/rows';
import type { Rect, Size } from './cover';

/**
 * A game's row is long and shallow; the bar should be the same shape.
 *
 * Seven is measured off a real house sheet, and off the whole *game* rather
 * than off its ruled grid. A Korona row prints ten frames of marks over their
 * running totals in a box about fourteen times as wide as it is tall, and then
 * draws that frame's pin diagram underneath it, unruled — together about six.
 * A bar cut to the grid alone would be a third of the height, impossible to
 * aim at on a phone, and would crop the leaves off every scan.
 */
const ROW_ASPECT = 7;

/** Share of a candidate that has to lie in the bar before it counts as aimed at. */
const MIN_INSIDE = 0.6;

/** …and how much of the bar's width it has to reach across. */
const MIN_REACH = 0.6;

/** Where the bar sits inside a preview of the given size. */
export function reticleFor(box: Size): Rect {
  const width = box.width * 0.9;
  // Tall enough for a thumb-sized target and for two sub-rows of writing, but
  // never so tall that it swallows the rows above and below the one meant.
  const height = Math.min(Math.max(width / ROW_ASPECT, 56), box.height * 0.4);

  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * The detected row lying in the bar, if there is one.
 *
 * Lock-on rather than selection: what it changes is only where the capture is
 * centred, from where the bowler's hand was to where the paper's own rules are.
 *
 * Which candidate, when several qualify, is **the one nearest the middle of the
 * bar** — because the middle is what the bowler pointed at. It used to be the
 * one most completely inside, which sounds like the same thing and is not: a
 * band a tenth of the bar's height is inside it perfectly, and a real row that
 * fills the bar is not. That rule chose the smallest thing in view every time.
 */
export function rowInReticle<T extends RowBox>(rows: T[], reticle: Rect): T | null {
  const middle = reticle.y + reticle.height / 2;

  let best: T | null = null;
  let bestDistance = Infinity;

  for (const row of rows) {
    const top = Math.max(row.y, reticle.y);
    const bottom = Math.min(row.y + row.height, reticle.y + reticle.height);
    const shared = bottom - top;
    if (shared <= 0) continue;

    // Most of the row has to be in the bar, or it is the neighbour half caught
    // at the edge rather than the game meant.
    if (shared / row.height < MIN_INSIDE) continue;

    const left = Math.max(row.x, reticle.x);
    const right = Math.min(row.x + row.width, reticle.x + reticle.width);
    if (right - left < reticle.width * MIN_REACH) continue;

    const distance = Math.abs(row.y + row.height / 2 - middle);
    // On a tie the taller one: the sheet rules a row into a strip of frame
    // numbers over a strip of marks, and the pair is the row.
    if (distance < bestDistance || (distance === bestDistance && row.height > (best?.height ?? 0))) {
      bestDistance = distance;
      best = row;
    }
  }

  return best;
}

/**
 * The bar, moved onto the row it locked on to.
 *
 * The lock says *where* the row is; the bar still says *how much* to take.
 *
 * That split is the fix for a scanner that used to crop to whatever it had
 * found. Detection on a preview frame finds bands between horizontal rules, and
 * on a real sheet the bands it is surest of are the ruling *inside* a row —
 * above all the strip of frame numbers, which is a tenth of the height of the
 * game it belongs to and carries the full set of vertical rules that makes a
 * band look like a grid. Locking on to one of those photographed
 * "1 2 3 4 5 6 7 8 9 10" and nothing else, and the bar visibly shrank to a
 * sliver on the way to doing it.
 *
 * So a lock re-centres the bar and never resizes it: the crop stays the size
 * the bowler was shown, and lands squarely on the row instead of wherever the
 * hand was. The width is left alone for a related reason — a band's ink span
 * can stop short of the outermost vertical rule, and a crop that clips that
 * rule shifts every frame along by a tenth.
 */
export function snapReticle(reticle: Rect, row: RowBox | null): Rect {
  if (!row) return reticle;
  return { ...reticle, y: row.y + row.height / 2 - reticle.height / 2 };
}
