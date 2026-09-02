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
  /**
   * How much of the grid was actually found on the paper, 0..1 — the share of
   * the eleven rules the fitted comb landed on. Low means a doubtful grid, and
   * a doubtful grid should not produce a confident-looking read.
   */
  certainty: number;
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
 * How much of a band's height each column is inked over.
 *
 * Counting a column's ink outright — which is what this used to do — cannot
 * tell a frame rule from the border of a mark box printed inside the frame. The
 * border is half the height and twice the thickness, so it carries just as many
 * dark pixels, and on a house sheet there are twice as many of them as there
 * are frame rules. A grid fitted to a plain ink count locks on to those and
 * cuts every frame in half; that is measured, not imagined.
 *
 * Coverage separates them, because only the rules dividing one frame from the
 * next reach from the top of the row's box to the bottom of it. Coverage rather
 * than the longest unbroken run, because a printed rule under alley lighting
 * comes through the threshold in pieces — a third of them, measured on real
 * sheets, survive as less than half their length in one go.
 *
 * Given the row's bands rather than its outline, each column is scored by the
 * *weakest* band it crosses. That matters on a bent sheet, where the rules at
 * the ends of the row drift out from under a column and the shorter mark boxes
 * do not: measured over the whole box the boxes then win, and the grid lands
 * half a frame out. No mark box reaches the strip that numbers the frames, so
 * the weakest band settles it.
 *
 * A pixel of drift either side is allowed: a rule that has been through
 * straightening and scaling is rarely exactly vertical.
 */
export function ruleCoverage(binary: Binary, width: number, bands: Band | Band[]): number[] {
  const all = Array.isArray(bands) ? bands : [bands];
  const height = bandsHeight(all);
  const coverage = new Array<number>(width).fill(height);

  for (const band of all) {
    const top = Math.max(0, band.top);
    const span = band.bottom - top + 1;
    if (span <= 1) continue;

    for (let x = 0; x < width; x++) {
      if (coverage[x] === 0) continue;

      let inked = 0;
      for (let y = top; y <= band.bottom; y++) {
        const row = y * width;
        const drifted =
          binary[row + x] || (x > 0 && binary[row + x - 1]) || (x + 1 < width && binary[row + x + 1]);
        if (drifted) inked += 1;
      }

      // The weakest band a column crosses is the one that decides it. A rule
      // dividing two frames is in every band of the row; the border of a mark
      // box printed inside a frame is in one of them, and the strip that
      // numbers the frames above it is untouched — which is the difference a
      // photograph of a bent sheet leaves standing when nothing else is.
      coverage[x] = Math.min(coverage[x], (inked / span) * height);
    }
  }

  return coverage;
}

/** A tooth counts as having found its rule at this share of the band's height. */
const RULE_SHARE = 0.3;

/** Ten frames must reach across at least this much of the crop. */
const MIN_SPAN = 0.5;

/** …and more than half the eleven rules have to be there at all. */
const MIN_RULES_FOUND = 6;

/** Below this much ink per column, whatever is outside the row is not diagrams. */
const RACK_INK = 2;

interface Comb {
  step: number;
  first: number;
}

/**
 * The best comb of eleven teeth under a given score, or null.
 *
 * The spacing is bounded below by ten frames having to span half the crop. A
 * comb at half the true spacing fits the mark boxes inside each frame just as
 * well as the real one fits the frames — that is the answer this gives without
 * the bound, and every mark then lands on a boundary.
 */
function bestComb(width: number, score: (step: number, first: number) => number): Comb | null {
  const smallest = (width * MIN_SPAN) / FRAMES_PER_GAME;
  const largest = width / FRAMES_PER_GAME;

  let best: Comb | null = null;
  let bestScore = 0;

  // Widest first, and strictly better to displace it: where two spacings fit
  // equally well the wider one is the answer, because a sheet's totals column
  // beyond the tenth frame offers a grid one frame to the right that lands on
  // exactly as many rules.
  for (let step = largest; step >= smallest; step -= 0.5) {
    const span = step * FRAMES_PER_GAME;
    for (let first = 0; first + span < width; first++) {
      const value = score(step, first);
      if (value > bestScore) {
        bestScore = value;
        best = { step, first };
      }
    }
  }

  return best;
}

/**
 * Fit ten evenly spaced frames across a row.
 *
 * Not "find the rules and divide between them": that needs every rule to
 * survive thresholding, and on a photograph about half of them do not. A frame
 * grid is a comb of eleven teeth, and the only questions are how far apart they
 * are and where the first one falls.
 *
 * Given `racks` — the ink above and below the row's ruled box — those two
 * questions are answered by the pin diagrams instead of by the rules, and that
 * is much the better evidence. A Japanese house sheet draws a rack of ten
 * circles under every frame, centred in it, with a lane of white paper between
 * one rack and the next: bold, printed solid, and lying exactly where the frame
 * boundaries are. The rules have a rival that the racks do not — the sheet
 * numbers each frame in its middle and prints the second ball's box there too,
 * so the *centre* of a frame carries ink in every band the same way its edge
 * does, and on a bent sheet it carries more. That ambiguity put the grid half a
 * frame out on real photographs; the racks settle it, because a comb half a
 * frame out cuts every one of them in two.
 *
 * The rules still place the teeth exactly: the racks find the grid, and then
 * each tooth moves to the printed rule nearest it.
 */
export function fitFrameGrid(
  coverage: number[],
  width: number,
  bandHeight: number,
  racks?: number[],
): Grid | null {
  if (coverage.length !== width || bandHeight < 8) return null;

  const teeth = FRAMES_PER_GAME + 1;
  const best = combFromRacks(racks, width) ?? combFromRules(coverage, width);
  if (!best) return null;

  const wanted = bandHeight * RULE_SHARE;
  let found = 0;
  for (let i = 0; i < teeth; i++) {
    if ((coverage[Math.round(best.first + i * best.step)] ?? 0) >= wanted) found += 1;
  }

  // Half the grid missing is not a grid — unless the diagrams found it, which
  // is evidence of its own and better than the rules. A sheet with neither
  // lands here, and the caller falls back to reading it whole rather than
  // cutting it into ten cells picked out of nowhere.
  if (found < MIN_RULES_FOUND && !racksUsable(racks, width)) return null;

  // The comb is even and a photographed row is not: hold a phone over a sheet
  // and the far end of the row is a few per cent narrower than the near one.
  // So each tooth is now allowed to move to the rule it is nearest, and only
  // the teeth that find nothing stay where the comb put them. The window is a
  // quarter of a frame, which cannot reach the mark box printed at the half.
  const window = best.step * 0.25;
  const rules: { at: number; half: number }[] = [];
  for (let i = 0; i < teeth; i++) {
    rules.push(nearestRule(coverage, best.first + i * best.step, window, wanted));
  }

  // Clear of the rule and no further. Measured off the rules themselves rather
  // than taken as a share of the frame: what has to be left out is the printed
  // line, and that is a few pixels wide however wide the frame is. Everything
  // else between two rules is a mark worth reading.
  const thickness = rules.map((rule) => rule.half).sort((a, b) => a - b)[Math.floor(teeth / 2)];
  const inset = Math.max(2, Math.ceil(thickness) + 1);

  const cells: Cell[] = [];
  for (let frame = 0; frame < FRAMES_PER_GAME; frame++) {
    cells.push({
      x0: Math.round(rules[frame].at + inset),
      x1: Math.round(rules[frame + 1].at - inset),
    });
  }

  return { cells, certainty: found / teeth };
}

/** Whether what lies outside the row's box holds enough ink to be diagrams. */
function racksUsable(racks: number[] | undefined, width: number): boolean {
  if (!racks || racks.length !== width) return false;
  return racks.reduce((sum, value) => sum + value, 0) >= width * RACK_INK;
}

/**
 * The comb the pin diagrams describe: a rack in every cell, a lane at every
 * tooth.
 *
 * Scored as the ink at the ten cell centres less the ink at the eleven teeth,
 * so a comb is rewarded for landing between the racks and punished for landing
 * on them. Smoothed by a couple of columns either way, because a lane one pixel
 * wide is a gap between two circles rather than the gap between two frames.
 */
function combFromRacks(racks: number[] | undefined, width: number): Comb | null {
  if (!racksUsable(racks, width)) return null;
  const ink = racks as number[];

  const smoothed = ink.map(
    (_, x) =>
      (ink[x - 2] ?? 0) + (ink[x - 1] ?? 0) + ink[x] + (ink[x + 1] ?? 0) + (ink[x + 2] ?? 0),
  );

  return bestComb(width, (step, first) => {
    let score = 0;
    for (let i = 0; i < FRAMES_PER_GAME; i++) score += smoothed[Math.round(first + (i + 0.5) * step)] ?? 0;
    for (let i = 0; i <= FRAMES_PER_GAME; i++) score -= smoothed[Math.round(first + i * step)] ?? 0;
    return score;
  });
}

/**
 * The comb the printed rules describe, for a sheet with no diagrams on it.
 *
 * Squared, so one column that is unmistakably a rule outweighs two that are
 * merely dark: on a bent sheet the rules at the ends of a row drift out from
 * under any straight comb, and what is left to decide it is the few in the
 * middle that came through whole.
 */
function combFromRules(coverage: number[], width: number): Comb | null {
  const scored = coverage.map((value) => value * value);

  return bestComb(width, (step, first) => {
    let score = 0;
    for (let i = 0; i <= FRAMES_PER_GAME; i++) score += scored[Math.round(first + i * step)] ?? 0;
    return score;
  });
}

/** How many rows a set of bands covers between them. */
export function bandsHeight(bands: Band[]): number {
  return bands.reduce((sum, band) => sum + (band.bottom - band.top + 1), 0);
}

/**
 * Column ink from everything outside the row's own box.
 *
 * On a house sheet that is the pin diagrams — one rack per frame, above and
 * below — and they are the surest guide there is to where the frames divide.
 * On a sheet without them it comes back nearly empty, which is the signal to
 * fall back to the rules.
 */
export function rackColumns(
  binary: Binary,
  width: number,
  height: number,
  box: Band,
  clear = 6,
): number[] {
  const columns = new Array<number>(width).fill(0);

  for (let y = 0; y < height; y++) {
    if (y > box.top - clear && y < box.bottom + clear) continue;
    const row = y * width;
    for (let x = 0; x < width; x++) if (binary[row + x]) columns[x] += 1;
  }

  return columns;
}

/**
 * The middle of the rule nearest `at`, or `at` when there is no rule to find.
 *
 * The middle, not the first column of it: a printed rule is several pixels
 * thick and every column in it is covered alike, so taking the first puts half
 * the rule inside the frame to its right — where the recogniser reads it as a 1
 * or a slash, on all ten frames at once.
 */
function nearestRule(
  coverage: number[],
  at: number,
  window: number,
  wanted: number,
): { at: number; half: number } {
  const from = Math.max(0, Math.round(at - window));
  const to = Math.min(coverage.length - 1, Math.round(at + window));

  let best = -1;
  let bestCover = wanted;
  for (let x = from; x <= to; x++) {
    if (coverage[x] > bestCover) {
      bestCover = coverage[x];
      best = x;
    }
  }

  if (best < 0) return { at, half: 1 };

  // Widen across the rule's own thickness, staying inside the window so a
  // smudge cannot drag the middle off the rule.
  const plateau = bestCover * 0.9;
  let left = best;
  let right = best;
  while (left > from && coverage[left - 1] >= plateau) left -= 1;
  while (right < to && coverage[right + 1] >= plateau) right += 1;

  return { at: (left + right) / 2, half: (right - left) / 2 };
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
 * Whether a band is the strip that numbers the frames.
 *
 * A house sheet prints 1 to 10 along the top of every row, inside the same
 * ruling as the marks, so it is a band like any other and it reads perfectly.
 * Nothing else about it says "not a game": the numbers climb, but they do not
 * climb to a score, so the totals test lets it through — and a sheet read as
 * "1 2 3 4 5 6 7 8 9 10" is worse than a sheet read as nothing, because the
 * marks parser will make a game out of it.
 *
 * Judged by position rather than by the string, because that is the whole
 * point: a cell that reads as its own frame number is the giveaway, and enough
 * of them to be no coincidence settles it. Two thirds, because the last cell
 * reads "10" as often as "1" or "0", and the first is easily lost.
 */
export function looksLikeFrameNumbers(cells: string[]): boolean {
  const read = cells.filter(Boolean);
  if (read.length < 5) return false;

  let numbering = 0;
  cells.forEach((cell, index) => {
    if (cell && cell === String(index + 1)) numbering += 1;
  });

  return numbering / read.length >= 0.66;
}

/**
 * The part of a band holding the marks, with the running totals cut off.
 *
 * A sheet writes the marks over the total they make. Recognising a whole cell
 * reads both and turns "9/" into "9/135", so the band has to be cut between
 * them — and what separates them is not a rule but a lane of white paper. That
 * is what is looked for here: the quietest row inside the band, taken only when
 * it is markedly quieter than the writing around it.
 *
 * Looking for a line instead is what this did first, and it worked on the sheet
 * it was written for, where the boxes holding each second ball happen to draw
 * one. On a sheet whose boxes are open at the bottom there is no line to find,
 * the totals stay in the crop, and every frame comes back as a mark and a score
 * run together.
 *
 * Returns the band unchanged when nothing divides it, which is a legitimate
 * sheet design rather than a failure.
 */
export function marksWithin(rows: number[], band: Band): Band {
  const span = band.bottom - band.top;
  if (span < 24) return band;

  // Stay clear of the band's own borders, and of the top of the writing.
  const margin = Math.max(3, Math.round(span * 0.35));
  const from = band.top + margin;
  const to = band.bottom - Math.max(3, Math.round(span * 0.15));
  if (to <= from) return band;

  const inside = rows.slice(band.top, band.bottom).sort((a, b) => a - b);
  const typical = inside[Math.floor(inside.length / 2)] ?? 0;
  if (typical <= 0) return band;

  let quietest = -1;
  let least = Infinity;
  for (let y = from; y < to; y++) {
    if (rows[y] < least) {
      least = rows[y];
      quietest = y;
    }
  }

  // Quiet enough to be paper rather than a gap in the writing.
  if (quietest < 0 || least > typical * 0.35) return band;
  return { top: band.top, bottom: quietest };
}

/** Rules positions for a synthetic evenly-ruled sheet. Used by the tests. */
export function idealRules(width: number, count = FRAMES_PER_GAME + 1): number[] {
  const step = width / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}
