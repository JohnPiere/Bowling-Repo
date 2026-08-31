/**
 * Finding one game's row on a score sheet, live, while the camera is open.
 *
 * A house sheet stacks a row per game — often three, sometimes six — and
 * reading the whole sheet at once means the frame grid of every row has to
 * survive being projected together with all the others. It does not: the rules
 * of one row land in the gaps of the next and the projection flattens into
 * noise.
 *
 * One row at a time is both easier to read and closer to what someone actually
 * wants, which is the game they just bowled. So the camera looks for row-shaped
 * boxes in the preview and marks them, and the bowler taps the one they mean.
 *
 * Everything here is pure and works on a small grey buffer, because it runs on
 * every preview frame and has to be cheap enough not to stall the video.
 */

import { findSheetBox, hasDarkSurround, insetBox, otsuThreshold, type SheetBox } from './sheet';
import { FRAMES_PER_GAME } from '../scoring';

/** 8-bit greyscale, row-major. */
export type Gray = Uint8Array | Uint8ClampedArray;

export interface RowBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** How many vertical dividers were found inside it. */
  dividers: number;
  /** The row's tilt in the frame, as rise over run. */
  slope: number;
  /** 0..1. Higher means it looks more like a row of ten frames. */
  confidence: number;
}

export interface DetectOptions {
  /** A row must be at least this many times wider than it is tall. */
  minAspect?: number;
  /** …and no more than this, or it is a rule mistaken for a box. */
  maxAspect?: number;
  /** Fewest vertical dividers a row of frames can plausibly show. */
  minDividers?: number;
  /** Skip the tilt search and read at this slope. */
  slope?: number;
}

const DEFAULTS = {
  // A ten-frame row is long and shallow. Six is loose enough for a sheet held
  // at an angle, where perspective shortens the far end.
  minAspect: 4,
  maxAspect: 40,
  // Ten frames need eleven rules. Half of them, found through a phone preview
  // at a glancing angle, is still unmistakably a grid.
  minDividers: 5,
};

/** The grey level that separates ink from paper in this frame. */
export function inkThreshold(gray: Gray, width: number, height: number): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < width * height; i++) histogram[gray[i]] += 1;
  return otsuThreshold(histogram);
}

/** Ink mask from a grey buffer, split at Otsu's threshold. */
export function toInk(gray: Gray, width: number, height: number): Uint8Array {
  const threshold = inkThreshold(gray, width, height);
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = gray[i] < threshold ? 1 : 0;
  return ink;
}

/**
 * Where the paper is in the frame, or null when the frame is all paper.
 *
 * Worth the second pass, because without it nothing else works: a sheet on a
 * table is a bright rectangle on something darker, and thresholded, that
 * darker something is ink across the whole width of every row it occupies.
 * Every printed rule on the sheet is fainter than that, so the strongest
 * "rules" in the frame are the table, and the real ones never clear the bar.
 */
export function findPaper(gray: Gray, width: number, height: number): SheetBox | null {
  const threshold = inkThreshold(gray, width, height);

  // Only crop when there is something around the paper to crop away.
  if (!hasDarkSurround(gray, width, height, threshold)) return null;

  const bright = new Uint8Array(width * height);
  for (let i = 0; i < bright.length; i++) bright[i] = gray[i] >= threshold ? 1 : 0;

  const box = findSheetBox(bright, width, height);
  return box ? insetBox(box, 0.01) : null;
}

export interface Span {
  start: number;
  end: number;
}

/**
 * How to read a band that is not level.
 *
 * A sheet is never photographed square, and even a couple of degrees is enough
 * to smear a printed rule across several rows until it stops looking like a
 * rule at all. `slope` is rise over run: each column is read offset vertically
 * in proportion to its distance from the middle, which reads along the paper's
 * own lines rather than the image's. `frameHeight` bounds that offset so a
 * tilted read cannot walk off the top or bottom of the buffer.
 */
export interface TiltedOptions {
  minShare?: number;
  slope?: number;
  frameHeight?: number;
}

/**
 * How far the ink in a band reaches left and right.
 *
 * Trimmed at both ends by a column or two of tolerance, so a speck of dirt
 * beside the sheet does not stretch the box across the whole preview.
 */
export function inkSpan(
  ink: Uint8Array,
  width: number,
  band: { top: number; bottom: number },
  { minShare = 0.25, slope = 0, frameHeight = 0 }: TiltedOptions = {},
): Span | null {
  const height = band.bottom - band.top + 1;
  if (height <= 0) return null;

  const columns = new Array(width).fill(0);
  const centre = width / 2;
  for (let x = 0; x < width; x++) {
    const shift = Math.round(slope * (x - centre));
    for (let y = band.top; y <= band.bottom; y++) {
      const row = y + shift;
      if (frameHeight && (row < 0 || row >= frameHeight)) continue;
      columns[x] += ink[row * width + x];
    }
  }

  const threshold = Math.max(1, height * minShare);
  let start = -1;
  let end = -1;
  for (let x = 0; x < width; x++) {
    if (columns[x] >= threshold) {
      if (start < 0) start = x;
      end = x;
    }
  }

  return start < 0 ? null : { start, end };
}

/**
 * Vertical dividers inside a band: the rules that separate one frame from the
 * next.
 *
 * Measured against the band's own height rather than a fixed count of pixels,
 * for the same reason the horizontal rules are — how many pixels tall a row is
 * depends entirely on how close the phone was held.
 */
export function countDividers(
  ink: Uint8Array,
  width: number,
  band: { top: number; bottom: number; left: number; right: number },
  { minShare = 0.55, slope = 0, frameHeight = 0 }: TiltedOptions = {},
): number {
  // Skip the band's own borders; they are ink on every column and would make
  // the whole width look like one continuous divider.
  const top = band.top + 1;
  const bottom = band.bottom - 1;
  const height = bottom - top + 1;
  if (height < 3) return 0;

  const threshold = Math.max(2, height * minShare);
  const centre = width / 2;
  let count = 0;
  let inside = false;

  for (let x = band.left; x <= band.right; x++) {
    const shift = Math.round(slope * (x - centre));
    let ran = 0;
    for (let y = top; y <= bottom; y++) {
      const row = y + shift;
      if (frameHeight && (row < 0 || row >= frameHeight)) continue;
      ran += ink[row * width + x];
    }

    const isDivider = ran >= threshold;
    if (isDivider && !inside) count += 1;
    inside = isDivider;
  }

  return count;
}

/**
 * How close a divider count is to a row of ten frames.
 *
 * Ten frames are eleven rules, and most house sheets add a column or two for
 * the handicap or the running total, so twelve and thirteen are just as good a
 * sign. Fewer is a partial read of a real row; many more is something that is
 * not a row at all.
 */
export function gridScore(dividers: number): number {
  const ideal = FRAMES_PER_GAME + 1;
  if (dividers < DEFAULTS.minDividers) return 0;
  if (dividers >= ideal && dividers <= ideal + 3) return 1;

  const distance = dividers < ideal ? ideal - dividers : dividers - (ideal + 3);
  return Math.max(0, 1 - distance / ideal);
}

/**
 * The row-shaped boxes in a frame, best first.
 *
 * Returns boxes in the coordinates of the buffer it was given. The caller
 * scales them — to the preview for drawing, or to the full-resolution capture
 * for cropping.
 */
export function detectGameRows(
  gray: Gray,
  width: number,
  height: number,
  options: DetectOptions = {},
): RowBox[] {
  if (width < 32 || height < 16) return [];

  const paper = findPaper(gray, width, height);
  if (!paper) return rowsWithin(gray, width, height, options);

  // Thresholding the crop again is the point of cropping, not an extra cost:
  // over the whole frame Otsu separates paper from table, and inside the paper
  // it separates print from paper, which is the split that finds rules.
  const cropped = cropGray(gray, width, paper);
  return rowsWithin(cropped, paper.width, paper.height, options).map((box) => ({
    ...box,
    x: box.x + paper.x,
    y: box.y + paper.y,
  }));
}

function cropGray(gray: Gray, width: number, box: SheetBox): Uint8Array {
  const out = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    const from = (box.y + y) * width + box.x;
    out.set(gray.subarray(from, from + box.width), y * box.width);
  }
  return out;
}

function rowsWithin(gray: Gray, width: number, height: number, options: DetectOptions): RowBox[] {
  const { minAspect, maxAspect, minDividers } = { ...DEFAULTS, ...options };
  const ink = toInk(gray, width, height);

  const slope = options.slope ?? estimateTilt(ink, width, height);
  const rows = projectRowsAt(ink, width, height, slope);

  const rules = findRules(rows);
  const boxes: RowBox[] = [];
  const tilted = { slope, frameHeight: height };

  // Every adjacent pair of rules is a candidate band. Only pairs: a row's top
  // and bottom borders are adjacent by definition, and allowing wider pairs
  // would offer the whole sheet as one enormous "row".
  for (let i = 1; i < rules.length; i++) {
    const top = rules[i - 1];
    const bottom = rules[i];
    const bandHeight = bottom - top + 1;
    if (bandHeight < 8) continue;

    const span = inkSpan(ink, width, { top, bottom }, tilted);
    if (!span) continue;

    const bandWidth = span.end - span.start + 1;
    const aspect = bandWidth / bandHeight;
    if (aspect < minAspect || aspect > maxAspect) continue;

    const dividers = countDividers(
      ink,
      width,
      { top, bottom, left: span.start, right: span.end },
      tilted,
    );
    if (dividers < minDividers) continue;

    const grid = gridScore(dividers);
    // A row should reach across most of the sheet; a box a quarter of the
    // paper wide is more likely part of something else printed on it.
    const reach = Math.min(1, bandWidth / (width * 0.6));

    // The band was measured along the tilt, so on the image itself it is a
    // parallelogram. The box reported is the upright rectangle around it: what
    // a crop has to take to keep the whole row, and what a tap has to hit.
    const centre = width / 2;
    const lift = slope * (span.start - centre);
    const drop = slope * (span.end - centre);

    boxes.push({
      x: span.start,
      y: top + Math.min(lift, drop),
      width: bandWidth,
      height: bandHeight + Math.abs(drop - lift),
      dividers,
      slope,
      confidence: grid * 0.7 + reach * 0.3,
    });
  }

  return boxes.sort((a, b) => b.confidence - a.confidence);
}

/** Dark pixels per row, read along a tilt rather than straight across. */
export function projectRowsAt(
  ink: Uint8Array,
  width: number,
  height: number,
  slope: number,
  columnStep = 1,
): number[] {
  const rows = new Array(height).fill(0);
  const centre = width / 2;

  for (let x = 0; x < width; x += columnStep) {
    const shift = Math.round(slope * (x - centre));
    const from = Math.max(0, -shift);
    const to = Math.min(height, height - shift);
    for (let y = from; y < to; y++) rows[y] += ink[(y + shift) * width + x];
  }

  return rows;
}

/**
 * The tilt at which the sheet's horizontal rules line up.
 *
 * Searched rather than derived, because there is nothing to derive it from
 * until the rules are found and the rules cannot be found until it is known.
 * The measure is how *peaky* the profile comes out: at the right tilt a rule's
 * ink lands in one row and the profile spikes, and at the wrong one it spreads
 * over several and flattens. Coarse pass then fine, and every other column,
 * because this runs on every preview frame.
 */
export function estimateTilt(ink: Uint8Array, width: number, height: number): number {
  const peakiness = (slope: number) => {
    const rows = projectRowsAt(ink, width, height, slope, 2);
    let sum = 0;
    let squares = 0;
    for (const value of rows) {
      sum += value;
      squares += value * value;
    }
    const mean = sum / rows.length;
    return squares / rows.length - mean * mean;
  };

  const search = (from: number, to: number, step: number, start: number) => {
    let best = start;
    let bestScore = -1;
    for (let slope = from; slope <= to + 1e-9; slope += step) {
      const score = peakiness(slope);
      if (score > bestScore) {
        bestScore = score;
        best = slope;
      }
    }
    return best;
  };

  // ±0.14 is about eight degrees. Past that a photo is tilted enough that the
  // bowler will straighten it themselves once the marks stop appearing.
  const coarse = search(-0.14, 0.14, 0.02, 0);
  return search(coarse - 0.02, coarse + 0.02, 0.005, coarse);
}

/**
 * Horizontal rules from a row projection.
 *
 * Deliberately more forgiving than the one the still-image pipeline uses: a
 * preview frame is small, dim and motion-blurred, and a rule that is only half
 * as dark as the darkest thing in view is still a rule. A candidate that is not
 * really a row gets thrown out later by its shape and its divider count.
 */
function findRules(rows: number[], minShare = 0.4): number[] {
  const peak = Math.max(...rows, 0);
  if (peak <= 0) return [];

  const threshold = peak * minShare;
  const rules: number[] = [];
  let start = -1;

  for (let y = 0; y <= rows.length; y++) {
    const isRule = y < rows.length && rows[y] >= threshold;
    if (isRule && start < 0) start = y;
    else if (!isRule && start >= 0) {
      rules.push(Math.round((start + y - 1) / 2));
      start = -1;
    }
  }

  return rules;
}

/**
 * The tilted strip inside a row's upright box.
 *
 * `RowBox` reports the upright rectangle *around* the row, because that is what
 * a crop has to take and what a tap has to hit. Drawing that rectangle rotated
 * would be wrong twice over: it is taller than the row by however far the tilt
 * carries it, so rotating it overshoots the paper on both counts. This gives
 * back the strip itself — same centre, the row's own height, and the angle to
 * turn it through.
 */
export function rowStrip(row: RowBox): { height: number; angle: number } {
  return {
    height: Math.max(1, row.height - Math.abs(row.slope * row.width)),
    angle: Math.atan(row.slope),
  };
}

/* ── Holding the boxes still ──────────────────────────────────────────────
 *
 * Detection runs afresh on every frame and its answers wobble by a pixel or
 * two even on a sheet lying flat, because a hand is never quite still. Drawn
 * straight, the marks shiver and read as broken. So each box is matched to the
 * one it was last frame and eased towards its new position, and a box has to
 * be seen a few frames running before it is drawn — which also throws out the
 * one-frame false positives that motion blur produces.
 */

export interface TrackedRow extends RowBox {
  id: number;
  /** Frames in a row this box has been found in. */
  hits: number;
  /** Frames since it was last found. */
  misses: number;
}

export interface TrackOptions {
  /**
   * Share of vertical overlap for two boxes to be the same row. Loose, because
   * a hand moves further between two preview frames than it feels like it
   * does, and a row that loses its identity has to settle all over again
   * before it can be drawn.
   */
  minOverlap?: number;
  /** How far to move towards a new reading each frame, 0..1. */
  ease?: number;
  /** Frames a box survives after it stops being found. */
  patience?: number;
}

export function trackRows(
  previous: TrackedRow[],
  detected: RowBox[],
  options: TrackOptions = {},
): TrackedRow[] {
  const { minOverlap = 0.35, ease = 0.45, patience = 3 } = options;

  const taken = new Set<number>();
  const next: TrackedRow[] = [];
  let id = previous.reduce((max, row) => Math.max(max, row.id), 0);

  for (const box of detected) {
    let best = -1;
    let bestOverlap = minOverlap;

    for (let i = 0; i < previous.length; i++) {
      if (taken.has(i)) continue;
      const overlap = verticalOverlap(previous[i], box);
      if (overlap >= bestOverlap) {
        bestOverlap = overlap;
        best = i;
      }
    }

    if (best < 0) {
      next.push({ ...box, id: ++id, hits: 1, misses: 0 });
      continue;
    }

    taken.add(best);
    const was = previous[best];
    next.push({
      ...box,
      x: mix(was.x, box.x, ease),
      y: mix(was.y, box.y, ease),
      width: mix(was.width, box.width, ease),
      height: mix(was.height, box.height, ease),
      slope: mix(was.slope, box.slope, ease),
      confidence: mix(was.confidence, box.confidence, ease),
      id: was.id,
      hits: was.hits + 1,
      misses: 0,
    });
  }

  // Boxes that were not found this frame fade rather than vanish, so a blink
  // of blur does not make the whole overlay flash off and on.
  previous.forEach((row, i) => {
    if (taken.has(i)) return;
    if (row.misses + 1 > patience) return;
    next.push({ ...row, misses: row.misses + 1 });
  });

  return next.sort((a, b) => a.y - b.y);
}

/** The boxes settled enough to draw. */
export function stableRows(rows: TrackedRow[], minHits = 3): TrackedRow[] {
  return rows.filter((row) => row.hits >= minHits);
}

function verticalOverlap(a: RowBox, b: RowBox): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const shared = bottom - top;
  if (shared <= 0) return 0;
  return shared / Math.min(a.height, b.height);
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
