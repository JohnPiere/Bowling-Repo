/**
 * The two marks on a Japanese house sheet that are not characters.
 *
 * A Korona sheet does not write "X" and "/". A strike is a small square filled
 * corner to corner both ways — two solid triangles meeting in the middle, white
 * above and below them. A spare is a square with one triangular half filled,
 * the diagonal running from the bottom-left corner to the top-right. Handed to
 * an OCR engine constrained to `X0123456789/-`, both come back as whichever of
 * those thirteen characters a solid black shape most resembles, which is
 * nothing in particular and differs every time.
 *
 * The third is the miss, a long bar in the second ball's box. That one *is* a
 * character — an em dash — but it is not one the engine is allowed to return,
 * so it comes back as a 1, a 5, a slash, or nothing, and each of those is a
 * ball that was never thrown. A bar is trivial to recognise by its shape and
 * impossible to mistake for a digit, so it is measured here with the others.
 *
 * So they are classified rather than recognised, the same way the pin diagrams
 * are: find the solid shapes in a frame, and ask which of two things each one
 * looks like. There are only two, they are printed by a machine, and they are
 * the same on every sheet — this is the easiest thing on the page to read, once
 * you stop trying to read it as text.
 *
 * What is left in the frame beside them is digits, and those do go to OCR.
 */

import { findBlobs, type Blob } from './pindiagram';
import type { Band, Binary, Cell } from './segment';

export type MarkGlyph = 'strike' | 'spare' | 'miss' | 'count';

export interface FoundGlyph {
  glyph: MarkGlyph;
  /** Where the shape sits, in the columns of the buffer it was found in. */
  left: number;
  right: number;
}

/** A shape is at least this much of the frame wide. Digits are half of it. */
const MIN_WIDTH = 0.18;

/** …and roughly square, which no digit is. */
const MIN_ASPECT = 0.7;
const MAX_ASPECT = 1.45;

/** …and solid. A printed digit fills a third of its box; these fill half. */
const MIN_FILL = 0.42;

/** A bar is at least this much wider than it is tall. */
const BAR_ASPECT = 2.5;

/** …and this solid, which rules out a stray scratch of the same shape. */
const BAR_FILL = 0.45;

/**
 * …and no wider than this much of the frame, because the other long thin thing
 * in a frame is a printed rule. A miss is a dash inside the second ball's box
 * and reaches about half the frame; the box's own top edge, and the border of
 * the band above and below, reach all of it.
 */
const MAX_BAR_WIDTH = 0.6;

/** …and lies across the middle of the row, where a ball is written. */
const BAR_MARGIN = 0.2;

/** How much of a corner has to be inked to count as filled. */
const CORNER_INKED = 0.4;

/** …and how little for it to count as empty. */
const CORNER_CLEAR = 0.34;

/**
 * The strike and spare glyphs in one frame, left to right.
 *
 * `cell` and `band` are in the coordinates of `binary`, which is the whole
 * prepared sheet: the frame is copied out rather than scanned in place, because
 * the flood fill that finds shapes has to stop at the frame's own edges. A
 * shape that ran into the next frame would be the two of them joined by a rule.
 */
export function findGlyphs(
  binary: Binary,
  width: number,
  cell: Cell,
  band: Band,
): FoundGlyph[] {
  const w = cell.x1 - cell.x0;
  const h = band.bottom - band.top;
  if (w < 8 || h < 8) return [];

  const frame = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const from = (band.top + y) * width + cell.x0;
    for (let x = 0; x < w; x++) frame[y * w + x] = binary[from + x];
  }

  const blobs = findBlobs(frame, w, h, 24);
  const found: FoundGlyph[] = [];

  for (const blob of blobs) {
    const glyph = classifyGlyph(blob, frame, w, h) ?? ringAround(blob, blobs, frame, w);
    if (!glyph) continue;

    // Take the printed box around the shape with it, where there is one. The
    // sheet draws the second ball inside a box and the shape does not always
    // touch it, so the box is a shape of its own — and a border left just
    // outside the exclusion is a vertical line beside a digit, which reads as
    // a 1 and turns 9 into 91 on every spare on the sheet.
    const around = boxAround(blob, blobs);
    found.push({
      glyph,
      left: cell.x0 + around.left,
      right: cell.x0 + around.left + around.width,
    });
  }

  return found.sort((a, b) => a.left - b.left);
}

/**
 * Which glyph a shape is, or null when it is a digit or a smudge.
 *
 * The two are told apart by their corners, which is the whole trick:
 *
 * - A **strike** is filled at all four, and empty at the top and bottom of the
 *   middle — that is what two triangles meeting point to point leaves.
 * - A **spare** is filled at one corner and empty at the corner opposite it,
 *   because a triangle has a hypotenuse and a square does not.
 * - A **miss** is not square at all: a bar several times wider than it is tall.
 *
 * A fourth shape is handled beside this one rather than in it: see `ringAround`.
 *
 * Nothing here depends on which way round the sheet draws the spare, and it
 * should not: both diagonals are tested, so a sheet that fills the other half
 * reads the same.
 */
export function classifyGlyph(
  blob: Blob,
  frame: Binary,
  width: number,
  height: number,
): MarkGlyph | null {
  // `frame` is one cell, so its width is the frame's width on the paper.
  if (blob.width < width * MIN_WIDTH) return null;

  const aspect = blob.height / blob.width;

  // The bar first, because it is the one shape that is not square — and the
  // one that has to be told from a printed rule, which is the same shape drawn
  // right across the frame and along its edge.
  if (aspect <= 1 / BAR_ASPECT) {
    const middle = blob.top + blob.height / 2;
    const central =
      middle > height * BAR_MARGIN && middle < height * (1 - BAR_MARGIN);
    const short = blob.width <= width * MAX_BAR_WIDTH;
    return blob.fill >= BAR_FILL && central && short ? 'miss' : null;
  }

  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;
  if (blob.fill < MIN_FILL) return null;

  const at = (fx: number, fy: number) => corner(blob, frame, width, fx, fy);
  const [tl, tr, bl, br] = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)];
  const [top, bottom] = [at(0.5, 0), at(0.5, 1)];

  const corners = Math.min(tl, tr, bl, br);
  if (corners >= CORNER_INKED && top < CORNER_INKED && bottom < CORNER_INKED) return 'strike';

  // A hypotenuse: one corner in and the opposite one out, either way round.
  const diagonal = Math.max(Math.abs(tl - br), Math.abs(tr - bl));
  if (diagonal >= CORNER_INKED - CORNER_CLEAR + 0.2) return 'spare';

  return null;
}

/**
 * Whether a shape is a digit with a ring drawn round it — the sheet's mark for
 * the count thrown at a split.
 *
 * Hollow is the whole signal. A ring is as big as a strike and as square, and
 * fills a fifth of its box where a strike fills half; what is inside it is a
 * digit, which the flood fill finds as a blob of its own. Together those two
 * facts are the ring, and neither is true of anything else on the sheet.
 *
 * It is only located here. The digit is read by the caller, from inside it —
 * which is the point, because a digit with a circle round it is exactly what an
 * OCR engine returns nothing for.
 */
function ringAround(blob: Blob, blobs: Blob[], frame: Binary, width: number): MarkGlyph | null {
  if (blob.width < width * MIN_WIDTH) return null;
  if (blob.fill >= MIN_FILL) return null;

  const aspect = blob.height / blob.width;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;

  // Round, not square. The other hollow thing this size is the printed box a
  // second ball is written in, and a box has corners where a circle has none —
  // which matters, because a spare sits inside one of those boxes and would
  // otherwise be read as a count with a triangle in it.
  const at = (fx: number, fy: number) => corner(blob, frame, width, fx, fy);
  if (Math.max(at(0, 0), at(1, 0), at(0, 1), at(1, 1)) >= CORNER_CLEAR) return null;

  const inside = blobs.some(
    (other) =>
      other !== blob &&
      other.left > blob.left &&
      other.top > blob.top &&
      other.left + other.width < blob.left + blob.width &&
      other.top + other.height < blob.top + blob.height,
  );

  return inside ? 'count' : null;
}

/** The smallest blob that encloses this one, or the blob itself. */
function boxAround(blob: Blob, blobs: Blob[]): Blob {
  let best = blob;

  for (const other of blobs) {
    if (other === blob) continue;
    const holds =
      other.left <= blob.left &&
      other.top <= blob.top &&
      other.left + other.width >= blob.left + blob.width &&
      other.top + other.height >= blob.top + blob.height;
    if (!holds) continue;
    if (other.width * other.height < best.width * best.height || best === blob) best = other;
  }

  return best;
}

/** How much of one 30% corner of a blob is inked. */
function corner(blob: Blob, frame: Binary, width: number, fx: number, fy: number): number {
  const w = Math.max(1, Math.round(blob.width * 0.3));
  const h = Math.max(1, Math.round(blob.height * 0.3));
  const x0 = Math.round(blob.left + fx * (blob.width - w));
  const y0 = Math.round(blob.top + fy * (blob.height - h));

  let inked = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) if (frame[y * width + x]) inked += 1;
  }

  return inked / (w * h);
}
