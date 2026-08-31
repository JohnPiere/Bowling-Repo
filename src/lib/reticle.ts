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

/** A game's row is long and shallow; the bar should be the same shape. */
const ROW_ASPECT = 7;

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
 * cut, from where the bowler aimed to where the paper's own rules are. So it
 * has to be sure — a row is accepted only when most of it is inside the bar and
 * it reaches across most of the bar's width. A wrong lock crops the wrong game.
 */
export function rowInReticle<T extends RowBox>(rows: T[], reticle: Rect): T | null {
  let best: T | null = null;
  let bestOverlap = 0.6;

  for (const row of rows) {
    const top = Math.max(row.y, reticle.y);
    const bottom = Math.min(row.y + row.height, reticle.y + reticle.height);
    const shared = bottom - top;
    if (shared <= 0) continue;

    const inside = shared / row.height;
    if (inside < bestOverlap) continue;

    const left = Math.max(row.x, reticle.x);
    const right = Math.min(row.x + row.width, reticle.x + reticle.width);
    if (right - left < reticle.width * 0.6) continue;

    bestOverlap = inside;
    best = row;
  }

  return best;
}
