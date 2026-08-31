/**
 * Finding the frames on a score sheet.
 *
 * Reading a whole sheet in one pass throws away the thing that makes it
 * readable: it is a grid, and the vertical rules say exactly where one frame
 * ends and the next begins. Without them the parser has to infer frame
 * boundaries from whitespace, which fails the moment two marks sit close
 * together or a frame is blank.
 *
 * So: find the rules, cut the sheet into cells, and recognise each cell on its
 * own. Every function here is pure and works on a binary buffer, which keeps
 * the fiddly part testable without a camera.
 */

import { FRAMES_PER_GAME } from '../scoring';

/** Ink mask: 1 where the pixel is dark, 0 where it is paper. */
export type Binary = Uint8Array;

export interface Cell {
  x0: number;
  x1: number;
}

export interface Grid {
  cells: Cell[];
  /** How evenly spaced the rules were, 0..1. Low means a doubtful grid. */
  regularity: number;
}

/**
 * Dark pixels per column — a vertical rule shows up as a tall spike.
 *
 * `shear` slides each row sideways in proportion to its distance from the
 * middle, which projects along a tilted line instead of a vertical one. A
 * photo is never held square, and even a degree or two smears a rule across
 * several columns until it stops looking like a spike at all.
 */
export function projectColumns(
  binary: Binary,
  width: number,
  height: number,
  shear = 0,
): number[] {
  const projection = new Array<number>(width).fill(0);
  const midY = height / 2;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    const offset = Math.round((y - midY) * shear);

    for (let x = 0; x < width; x++) {
      if (!binary[row + x]) continue;
      const target = x + offset;
      if (target >= 0 && target < width) projection[target] += 1;
    }
  }

  return projection;
}

/** How concentrated a projection is — a well-aligned sheet gives sharp spikes. */
function peakiness(projection: number[]): number {
  const mean = projection.reduce((a, b) => a + b, 0) / projection.length;
  if (mean <= 0) return 0;
  return projection.reduce((sum, v) => sum + (v - mean) ** 2, 0) / projection.length;
}

/**
 * The shear that makes the rules line up best.
 *
 * Tries a small fan of angles and keeps the one whose projection is most
 * concentrated. Roughly ±3°, which covers holding a phone by hand; past that
 * the bowler is better served by retaking the photo than by the app guessing.
 */
export function estimateShear(binary: Binary, width: number, height: number): number {
  const candidates: number[] = [];
  for (let i = -6; i <= 6; i++) candidates.push((i * 0.5 * Math.PI) / 180);

  let best = 0;
  let bestScore = -1;

  for (const angle of candidates) {
    const shear = Math.tan(angle);
    const score = peakiness(projectColumns(binary, width, height, shear));
    if (score > bestScore) {
      bestScore = score;
      best = shear;
    }
  }

  return best;
}

/**
 * Dark pixels per row, for locating the band the marks are written in.
 *
 * `from`/`to` restrict the count to the sheet's own columns. A photo has
 * margin either side, and counting the whole image width makes the sheet's
 * horizontal rules look weaker than they are.
 */
export function projectRows(
  binary: Binary,
  width: number,
  height: number,
  from = 0,
  to = width,
): number[] {
  const x0 = Math.max(0, Math.min(width, from));
  const x1 = Math.max(x0, Math.min(width, to));
  const projection = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = x0; x < x1; x++) {
      if (binary[row + x]) count += 1;
    }
    projection[y] = count;
  }

  return projection;
}

/**
 * The sheet's top and bottom, found from its own horizontal borders.
 *
 * Everything above and below is table, hand, or floor, and reading it costs
 * accuracy for nothing.
 */
export function findSheetBounds(
  rows: number[],
  sheetWidth: number,
  minShare = 0.6,
): { top: number; bottom: number } | null {
  const threshold = sheetWidth * minShare;

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < rows.length; y++) {
    if (rows[y] < threshold) continue;
    if (top < 0) top = y;
    bottom = y;
  }

  // Needs two distinct borders with room between them to be a sheet.
  if (top < 0 || bottom - top < 12) return null;
  return { top, bottom };
}

/**
 * Columns that look like a printed rule.
 *
 * The threshold is taken from the tallest column actually found rather than
 * from the image height: a photographed sheet occupies only part of the frame,
 * so anchoring to the image would demand rules taller than the sheet itself
 * and find nothing. An absolute floor still applies, so noise on a blank page
 * cannot promote itself into a grid.
 *
 * Runs of adjacent qualifying columns are one rule a few pixels thick, and
 * collapse to their centre.
 */
export function findRules(projection: number[], height: number, minShare = 0.55): number[] {
  const peak = Math.max(...projection, 0);
  const threshold = Math.max(peak * minShare, height * 0.1);
  const rules: number[] = [];

  let runStart = -1;
  for (let x = 0; x <= projection.length; x++) {
    const isRule = x < projection.length && projection[x] >= threshold;

    if (isRule && runStart < 0) runStart = x;
    else if (!isRule && runStart >= 0) {
      rules.push(Math.round((runStart + x - 1) / 2));
      runStart = -1;
    }
  }

  return rules;
}

/**
 * How uniform a set of gaps is, as 1 - (spread / mean), clamped to 0..1.
 *
 * A photographed sheet is never perfectly even — perspective alone stretches
 * one end — so this measures "close enough to a grid", not "perfect".
 */
export function regularity(positions: number[]): number {
  if (positions.length < 3) return 0;

  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1]);

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return 0;

  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / mean));
}

/**
 * Turn detected rules into ten frame cells.
 *
 * Rather than trusting the rules one by one — a faint one goes missing, a
 * pencil line gets found that is not there — an evenly spaced grid is fitted
 * to the span they cover. That survives a missing rule, which the direct
 * reading does not.
 */
export function toFrameCells(rules: number[], width: number): Grid | null {
  // Ten frames want eleven rules. Accept a couple missing or spurious, since
  // one bad rule should not cost the whole sheet.
  if (rules.length < 8 || rules.length > 15) return null;

  const first = rules[0];
  const last = rules[rules.length - 1];
  const span = last - first;

  // The rules must cover a real part of the sheet; a cluster of marks in one
  // corner can otherwise masquerade as a grid.
  if (span < width * 0.5) return null;

  const evenness = regularity(rules);
  if (evenness < 0.55) return null;

  const step = span / FRAMES_PER_GAME;
  const cells: Cell[] = [];

  for (let frame = 0; frame < FRAMES_PER_GAME; frame++) {
    // Inset a little so the rule itself is not fed to the recogniser, where it
    // reads as a 1 or a /.
    const inset = Math.max(1, step * 0.06);
    cells.push({
      x0: Math.round(first + frame * step + inset),
      x1: Math.round(first + (frame + 1) * step - inset),
    });
  }

  return { cells, regularity: evenness };
}

/**
 * Every horizontal rule inside the sheet.
 *
 * A league sheet stacks bowlers, so the rules between the top and bottom
 * borders divide it into bands rather than into one marks row and one totals
 * row. Runs of adjacent rows collapse to their centre, the same way vertical
 * rules do.
 */
export function findHorizontalRules(
  rows: number[],
  sheetWidth: number,
  bounds: { top: number; bottom: number },
  minShare = 0.5,
): number[] {
  // Relative to the strongest row inside the sheet, not to the sheet's width.
  // Straightening a photo resamples it, which spreads each rule over two rows
  // and halves what any single row holds; a fixed share of the width then
  // finds the borders of a flat scan and nothing on a photograph. The floor
  // keeps a page of noise from inventing rules.
  let peak = 0;
  for (let y = bounds.top; y <= bounds.bottom; y++) peak = Math.max(peak, rows[y] ?? 0);

  const threshold = Math.max(peak * minShare, sheetWidth * 0.2);
  const rules: number[] = [];

  let runStart = -1;
  for (let y = bounds.top; y <= bounds.bottom + 1; y++) {
    const isRule = y <= bounds.bottom && rows[y] >= threshold;

    if (isRule && runStart < 0) runStart = y;
    else if (!isRule && runStart >= 0) {
      rules.push(Math.round((runStart + y - 1) / 2));
      runStart = -1;
    }
  }

  return rules;
}

export interface Band {
  top: number;
  bottom: number;
}

/**
 * The gaps between horizontal rules — one per row of content.
 *
 * Bands thinner than `minHeight` are the rules themselves touching, or the
 * ruling of a header, and carry nothing worth recognising.
 */
export function toBands(rules: number[], minHeight = 14): Band[] {
  const bands: Band[] = [];

  for (let i = 1; i < rules.length; i++) {
    const top = rules[i - 1];
    const bottom = rules[i];
    if (bottom - top >= minHeight) bands.push({ top, bottom });
  }

  return bands;
}

/**
 * Whether a band holds a bowler's marks or a row of running totals.
 *
 * A marks row almost always carries an X or a slash, and a totals row is
 * digits that only ever climb. Both signals are needed: an all-open game has
 * no marks to find, and a bad scan can lose the ones it had.
 */
export function looksLikeMarks(text: string): boolean {
  const cleaned = text.toUpperCase();
  if (/[X/]/.test(cleaned)) return true;

  // No marks: fall back to shape. Running totals never decrease and end high.
  const numbers = cleaned.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length < 3) return true;

  const climbs = numbers.every((n, i) => i === 0 || n >= numbers[i - 1]);
  const endsHigh = numbers[numbers.length - 1] > 30;
  return !(climbs && endsHigh);
}

/**
 * The horizontal band holding the marks.
 *
 * A sheet stacks marks over a running total. Recognising a whole cell reads
 * both and turns "9/" into "9/135", so the band is cut at the interior rule
 * dividing them — the strongest row between the sheet's own borders.
 *
 * Bounds are the sheet's, not the image's: searching a fixed fraction of a
 * photo lands in the margin and finds nothing.
 */
export function findMarkBand(
  projection: number[],
  sheetWidth: number,
  bounds: { top: number; bottom: number },
): { top: number; bottom: number } | null {
  const span = bounds.bottom - bounds.top;
  if (span < 12) return null;

  // Stay clear of the borders themselves, which are stronger than the divider.
  const margin = Math.max(3, Math.round(span * 0.15));
  const from = bounds.top + margin;
  const to = bounds.bottom - margin;
  if (to <= from) return null;

  let divider = -1;
  let strongest = sheetWidth * 0.4;
  for (let y = from; y < to; y++) {
    if (projection[y] > strongest) {
      strongest = projection[y];
      divider = y;
    }
  }

  // No interior rule: the marks occupy the whole sheet, which is a legitimate
  // sheet design rather than a failure.
  if (divider < 0) return { top: bounds.top, bottom: bounds.bottom };
  return { top: bounds.top, bottom: divider };
}

/** Rules positions for a synthetic evenly-ruled sheet. Used by the tests. */
export function idealRules(width: number, count = FRAMES_PER_GAME + 1): number[] {
  const step = width / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
