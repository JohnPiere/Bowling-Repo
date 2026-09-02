/**
 * On-device recognition with Tesseract.js.
 *
 * Runs entirely in the browser: no server, no API key, no per-scan cost, and
 * the photo never leaves the phone. The trade-off is accuracy on handwriting,
 * which is why every scan lands on a review screen before it is imported.
 *
 * Two strategies, in order of preference:
 *
 *  1. Cell by cell. If the sheet's rules can be found, each frame is cropped
 *     and read on its own, so frame boundaries come from the paper rather than
 *     from guessing where the whitespace falls.
 *  2. Whole sheet, when no grid is found — a hand-drawn sheet, a bad angle, or
 *     a crop that cut the rules off.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { findGlyphs, type FoundGlyph } from './markglyphs';
import { cropRegion, preprocessForOcr, type Prepared } from './preprocess';
import {
  fitFrameGrid,
  findHorizontalRules,
  findSheetBounds,
  bandsHeight,
  looksLikeFrameNumbers,
  looksLikeMarks,
  marksWithin,
  projectRows,
  rackColumns,
  ruleCoverage,
  toBands,
  type Band,
  type Cell,
} from './segment';
import { FRAMES_PER_GAME } from '../scoring';
import type { RecognitionResult, ScoreSheetRecogniser } from './types';

/**
 * A score sheet only ever holds these characters. Constraining the alphabet is
 * the single biggest accuracy win available — it stops "X" being read as "K"
 * and "0" as "O", which the mark parser would then have to guess at.
 */
const SHEET_ALPHABET = 'XG0123456789/-';

/**
 * How much to believe a mark read as a shape rather than as a character.
 *
 * High, and it should be: the two printed glyphs are machine-drawn, identical
 * on every sheet, and told apart by which corners of a square are inked. That
 * is a measurement. It is not 1, because the shape still had to be found in the
 * right frame.
 */
const GLYPH_CONFIDENCE = 0.95;

/**
 * The strip with any ink that runs off its ends trimmed away.
 *
 * What runs off the end of a strip cut between two frames is the printed rule
 * that divides them, and a rule beside a digit reads as a 1 — which is a ball
 * nobody threw, on whichever frames the crop happens to clip.
 */
function trimToPaper(
  prepared: Prepared,
  from: number,
  to: number,
  top: number,
  bottom: number,
): { x0: number; x1: number } {
  const { binary, width } = prepared;

  // A rule runs the height of the strip; a digit that happens to reach the edge
  // does not. Trimming on any ink at all takes the edge off the digit too, and
  // a digit read from a crop that clips it is a different digit.
  const span = Math.max(1, bottom - top + 1);
  const isRule = (x: number) => {
    let inked = 0;
    for (let y = top; y <= bottom; y++) if (binary[y * width + x]) inked += 1;
    return inked >= span * 0.6;
  };

  let x0 = Math.max(0, from);
  let x1 = Math.min(width, to);
  // A quarter of the strip at most: past that it is not a rule being trimmed.
  const limit = Math.max(1, Math.round((x1 - x0) * 0.25));

  for (let i = 0; i < limit && x0 < x1 && isRule(x0); i++) x0 += 1;
  for (let i = 0; i < limit && x1 - 1 > x0 && isRule(x1 - 1); i++) x1 -= 1;

  return { x0, x1 };
}

/** The mark a printed shape stands for. A count is a digit and read separately. */
function symbolFor(glyph: FoundGlyph['glyph']): string {
  if (glyph === 'strike') return 'X';
  return glyph === 'spare' ? '/' : '-';
}

/** Tesseract page segmentation modes, by name rather than magic number. */
const PSM_SINGLE_LINE = '7';
const PSM_SPARSE = '11';

/** What the build managed to vendor locally. Cached: it never changes at runtime. */
interface LocalAssets {
  core: boolean;
  worker: boolean;
  lang: boolean;
}

/**
 * Where the vendored engine sits. Built from the app's own base rather than
 * assumed to be the root: served from a subpath, `/tesseract/` is somebody
 * else's directory, and the fetch quietly 404s into the CDN fallback.
 */
const TESSERACT = `${import.meta.env.BASE_URL}tesseract`;

let assetsPromise: Promise<LocalAssets> | null = null;

function localAssets(): Promise<LocalAssets> {
  if (!assetsPromise) {
    assetsPromise = fetch(`${TESSERACT}/manifest.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest) => ({
        core: Boolean(manifest?.core?.length),
        worker: Boolean(manifest?.worker),
        lang: Boolean(manifest?.lang?.includes('eng')),
      }))
      .catch(() => ({ core: false, worker: false, lang: false }));
  }
  return assetsPromise;
}

export class TesseractRecogniser implements ScoreSheetRecogniser {
  readonly name = 'On-device (Tesseract)';

  private worker: Worker | null = null;
  /** Held so concurrent scans share one warm-up rather than racing. */
  private starting: Promise<Worker> | null = null;
  private mode: string | null = null;

  private async ready(): Promise<Worker> {
    if (this.worker) return this.worker;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      // Same-origin engine and language data, vendored by scripts/vendor-ocr.mjs.
      // If they are absent the options are simply omitted and tesseract.js
      // falls back to its CDN, so a build without them still scans.
      const local = await localAssets();
      const worker = await createWorker('eng', undefined, {
        ...(local.core ? { corePath: `${TESSERACT}/` } : {}),
        ...(local.worker ? { workerPath: `${TESSERACT}/worker.min.js` } : {}),
        ...(local.lang ? { langPath: TESSERACT, gzip: true } : {}),
      });
      this.worker = worker;
      this.mode = null;
      return worker;
    })();

    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  /** Reconfigure only when the mode actually changes — it is not free. */
  private async useMode(worker: Worker, psm: string): Promise<void> {
    if (this.mode === psm) return;
    await worker.setParameters({
      tessedit_char_whitelist: SHEET_ALPHABET,
      tessedit_pageseg_mode: psm as never,
      preserve_interword_spaces: '1',
    });
    this.mode = psm;
  }

  async recognise(
    image: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<RecognitionResult> {
    onProgress?.(0.04);
    const prepared = await preprocessForOcr(image);

    onProgress?.(0.15);
    const worker = await this.ready();

    const byCell = await this.readByCell(worker, prepared, onProgress);
    if (byCell) {
      onProgress?.(1);
      return byCell;
    }

    onProgress?.(0.4);
    await this.useMode(worker, PSM_SPARSE);
    const { data } = await worker.recognize(prepared.blob);

    onProgress?.(1);
    return {
      text: data.text ?? '',
      // Tesseract reports 0..100; the interface is 0..1.
      confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
      strategy: 'whole-sheet',
    };
  }

  /**
   * Read each frame separately, if the sheet's grid can be found.
   *
   * Returns null when there is no usable grid, so the caller falls back rather
   * than trusting ten crops taken from the wrong places.
   */
  private async readByCell(
    worker: Worker,
    prepared: Prepared,
    onProgress?: (fraction: number) => void,
  ): Promise<RecognitionResult | null> {
    const { binary, width, height } = prepared;

    // Horizontal first, and this order matters. The frame rules only run the
    // height of the row's own box, so looking for them across the whole crop
    // measures them against everything else in it — and a crop from the camera
    // holds the pin diagrams above and below the row as well, which are taller
    // than the rules are. Finding the box first gives the rules somewhere to be
    // the tallest thing.
    const rows = projectRows(binary, width, height);

    // The strongest row is a border, so how much ink it holds is how wide the
    // ruled part of this crop is. Measured, rather than assumed to be the whole
    // image: a crop is rarely the sheet exactly.
    const ruled = Math.max(...rows, 0);
    if (ruled <= 0) return null;

    const rough = findSheetBounds(rows, ruled);
    if (!rough) return null;

    // The bands the row is ruled into, so a column can be scored by the weakest
    // of them rather than over the box as a whole — see `ruleCoverage`.
    const roughBands = toBands(findHorizontalRules(rows, ruled, rough));
    if (roughBands.length === 0) roughBands.push(rough);

    const grid = fitFrameGrid(
      ruleCoverage(binary, width, roughBands),
      width,
      bandsHeight(roughBands),
      rackColumns(binary, width, height, rough),
    );
    if (!grid) return null;

    // Now the grid says which columns are the sheet's, measure the rows again
    // across those alone. A crop has margin either side, and counting it in
    // holds every border below full strength — which moves the band a few
    // pixels, and a few pixels is the top of a 9.
    const left = grid.cells[0].x0;
    const right = grid.cells[grid.cells.length - 1].x1;
    const inside = projectRows(binary, width, height, left, right);
    const sheetWidth = right - left;

    const bounds = findSheetBounds(inside, sheetWidth) ?? rough;

    // A league sheet stacks bowlers, so look for every band the rules make
    // rather than assuming one marks row over one row of totals.
    const bands = toBands(findHorizontalRules(inside, sheetWidth, bounds));

    // Only the borders: the whole box is one band, marks over totals.
    if (bands.length === 0) bands.push(bounds);

    await this.useMode(worker, PSM_SINGLE_LINE);

    const readRows: {
      text: string;
      perFrame: string[];
      confidence: number;
      frames: number;
      middle: number;
      /** Where the totals for this row sit, under its marks. */
      under: Band;
    }[] = [];
    let done = 0;
    const totalCells = bands.length * grid.cells.length;

    for (const band of bands) {
      // Marks sit over the total they make, and a cell read whole turns "9/"
      // into "9/135".
      const marks = marksWithin(inside, band);
      const row = await this.readBand(worker, prepared, grid.cells, marks, () => {
        done += 1;
        onProgress?.(0.15 + (0.8 * done) / totalCells);
      });

      // Skip the strip that numbers the frames, the running totals under each
      // bowler, and any band of ruling that carried nothing.
      if (row && row.frames >= 3 && !looksLikeFrameNumbers(row.perFrame) && looksLikeMarks(row.text)) {
        readRows.push({
          ...row,
          middle: (band.top + band.bottom) / 2,
          under: { top: marks.bottom, bottom: band.bottom },
        });
      }
    }

    if (readRows.length === 0) return null;

    // Nearest the middle first, not topmost. Every crop that reaches here was
    // drawn *around* one row — the camera's bar, or the box on a picked photo —
    // so when a crop catches the neighbour above as well, the row in the middle
    // is the one that was aimed at. Reading the topmost quietly imported
    // somebody else's game, and it looked entirely plausible.
    const middle = height / 2;
    const [first, ...rest] = [...readRows].sort(
      (a, b) => Math.abs(a.middle - middle) - Math.abs(b.middle - middle),
    );

    // The row's own running totals, which are the sheet's check on the marks.
    const totals = await this.readTotals(worker, prepared, grid.cells, first.under);

    return {
      // Frames are space-separated, which is exactly what the mark parser
      // expects — and here the separation is the paper's, not a guess.
      text: first.text,
      totals,
      // Discount by how much of the grid was actually on the paper: a grid
      // half of which was placed rather than found should not produce a
      // confident-looking read.
      confidence: first.confidence * (0.7 + 0.3 * grid.certainty),
      strategy: 'per-frame',
      framesRead: first.frames,
      otherRows: rest.map((row) => row.text),
    };
  }

  /** Read one horizontal band, cell by cell. */
  private async readBand(
    worker: Worker,
    prepared: Prepared,
    cells: Cell[],
    band: Band,
    onCell: () => void,
  ): Promise<{ text: string; perFrame: string[]; confidence: number; frames: number } | null> {
    // Inset past the rules themselves, which read as stray marks.
    const top = band.top + 2;
    const bottom = band.bottom - 2;
    if (bottom - top < 8) return null;

    const frames: string[] = [];
    const confidences: number[] = [];

    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      const glyphs = findGlyphs(prepared.binary, prepared.width, cell, { top, bottom });
      const tenth = index === FRAMES_PER_GAME - 1;

      const read = await this.readCell(worker, prepared, cell, top, bottom, glyphs, tenth);
      onCell();

      // A blank frame is a real answer on a partly played sheet; keep the slot
      // so later frames do not shift left.
      frames.push(read.marks);
      if (read.marks) confidences.push(read.confidence);
    }

    const marked = frames.filter(Boolean);
    const mean =
      confidences.length === 0 ? 0 : confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return {
      text: frames.join(' ').trim(),
      perFrame: frames,
      confidence: mean,
      frames: marked.length,
    };
  }

  /**
   * The running totals printed under a row, one per frame.
   *
   * Read on their own and separately from the marks, because they are a
   * different kind of thing: a number rather than a mark, and the one part of
   * the sheet that says what the game came to. Where the band under the marks
   * is empty — a sheet that does not print them, or a crop that lost them —
   * every frame comes back null and the caller is no worse off than before.
   */
  private async readTotals(
    worker: Worker,
    prepared: Prepared,
    cells: Cell[],
    band: Band,
  ): Promise<(number | null)[]> {
    const top = band.top + 2;
    const bottom = band.bottom - 2;
    if (bottom - top < 8) return cells.map(() => null);

    const totals: (number | null)[] = [];
    for (const cell of cells) {
      const read = await this.readText(worker, prepared, cell.x0, cell.x1, top, bottom, 8);
      const digits = read.marks.replace(/[^0-9]/g, '');
      totals.push(digits.length > 0 && digits.length <= 3 ? Number(digits) : null);
    }

    return totals;
  }

  /**
   * One frame, as a mark string.
   *
   * A printed strike or spare settles the frame without any recognition at all,
   * and settles it better: those two are shapes rather than characters (see
   * `markglyphs.ts`), so what OCR makes of them is a coin toss. A strike is the
   * whole frame; a spare is its second ball, so only what lies to the left of it
   * is a number worth reading. Neither leaves anything to the right that is not
   * an empty printed box, and reading one of those produces a mark nobody wrote.
   *
   * The tenth is the exception, because it re-racks: three balls, up to three
   * shapes, and every gap between them can hold a count.
   */
  private async readCell(
    worker: Worker,
    prepared: Prepared,
    cell: Cell,
    top: number,
    bottom: number,
    glyphs: FoundGlyph[],
    tenth: boolean,
  ): Promise<{ marks: string; confidence: number }> {
    const frame = cell.x1 - cell.x0;
    // Keep the recogniser off the shape's own box: its border reads as a 1.
    const clear = Math.max(2, Math.round(frame * 0.03));
    const enough = Math.max(10, Math.round(frame * 0.12));

    if (glyphs.length === 0) {
      return this.readText(worker, prepared, cell.x0, cell.x1, top, bottom, enough);
    }

    if (!tenth) {
      const [shape] = glyphs;
      if (shape.glyph === 'strike') return { marks: 'X', confidence: GLYPH_CONFIDENCE };

      // A ringed count is the first ball, so the rest of the frame still has to
      // be read: fall through to the walk below, which handles both.
      if (shape.glyph === 'count') return this.walkCell(worker, prepared, cell, top, bottom, glyphs);

      const before = await this.readText(
        worker,
        prepared,
        cell.x0,
        shape.left - clear,
        top,
        bottom,
        enough,
      );
      // One character, because the first ball of a frame is one throw. What
      // else comes back is the edge of the shape's own box read as a 1, and it
      // would turn a 9 into a 91 on every spare on the sheet.
      return {
        marks: before.marks.slice(0, 1) + symbolFor(shape.glyph),
        confidence: (before.confidence + GLYPH_CONFIDENCE) / 2,
      };
    }

    return this.walkCell(worker, prepared, cell, top, bottom, glyphs);
  }

  /**
   * A frame read left to right: what is written, then a shape, then what is
   * written after it.
   *
   * Used for the tenth, which throws up to three balls and can hold three
   * shapes, and for any frame carrying a ringed count — that one is a number
   * rather than a mark, so the frame is not settled by having found it.
   */
  private async walkCell(
    worker: Worker,
    prepared: Prepared,
    cell: Cell,
    top: number,
    bottom: number,
    glyphs: FoundGlyph[],
  ): Promise<{ marks: string; confidence: number }> {
    const frame = cell.x1 - cell.x0;
    const clear = Math.max(2, Math.round(frame * 0.03));
    const enough = Math.max(10, Math.round(frame * 0.12));

    let marks = '';
    let confidence = GLYPH_CONFIDENCE;
    let at = cell.x0;

    for (const shape of glyphs) {
      const before = await this.readText(worker, prepared, at, shape.left - clear, top, bottom, enough);
      marks += before.marks;
      if (before.marks) confidence = (confidence + before.confidence) / 2;

      if (shape.glyph === 'count') {
        // The digit lives inside the ring; the ring itself is what OCR cannot
        // read, so it is cropped away.
        const inset = Math.round((shape.right - shape.left) * 0.22);
        const inside = await this.readText(
          worker,
          prepared,
          shape.left + inset,
          shape.right - inset,
          top,
          bottom,
          8,
        );
        marks += inside.marks.slice(0, 1);
        if (inside.marks) confidence = (confidence + inside.confidence) / 2;
      } else {
        marks += symbolFor(shape.glyph);
      }

      at = shape.right + clear;
    }

    const after = await this.readText(worker, prepared, at, cell.x1, top, bottom, enough);
    marks += after.marks;
    if (after.marks) confidence = (confidence + after.confidence) / 2;

    return { marks, confidence };
  }

  /** Recognise one strip of a frame as marks. */
  private async readText(
    worker: Worker,
    prepared: Prepared,
    from: number,
    to: number,
    top: number,
    bottom: number,
    enough: number,
  ): Promise<{ marks: string; confidence: number }> {
    // Any ink running to the edge of the strip is the frame's own rule, or the
    // border of the box beside it, and reads as a 1 in front of every count on
    // the sheet. The strip starts and ends at paper.
    const { x0, x1 } = trimToPaper(prepared, from, to, top, bottom);

    // Narrower than a digit is the gap beside a shape, not a number. Reading it
    // anyway returns a stray mark, and a stray mark is a ball nobody threw.
    if (x1 - x0 < enough) return { marks: '', confidence: 0 };

    const crop = await cropRegion(prepared.canvas, {
      x: x0,
      y: top,
      width: x1 - x0,
      height: bottom - top,
    });
    if (!crop) return { marks: '', confidence: 0 };

    const { data } = await worker.recognize(crop);
    const marks = (data.text ?? '').replace(/[^XG0-9/-]/gi, '').toUpperCase();

    return { marks, confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) };
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.mode = null;
    await worker?.terminate();
  }
}
