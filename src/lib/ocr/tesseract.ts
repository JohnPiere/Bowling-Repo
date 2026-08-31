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
import { cropRegion, preprocessForOcr, type Prepared } from './preprocess';
import {
  findHorizontalRules,
  findMarkBand,
  findRules,
  findSheetBounds,
  looksLikeMarks,
  projectColumns,
  projectRows,
  toBands,
  toFrameCells,
  type Band,
  type Cell,
} from './segment';
import type { RecognitionResult, ScoreSheetRecogniser } from './types';

/**
 * A score sheet only ever holds these characters. Constraining the alphabet is
 * the single biggest accuracy win available — it stops "X" being read as "K"
 * and "0" as "O", which the mark parser would then have to guess at.
 */
const SHEET_ALPHABET = 'X0123456789/-';

/** Tesseract page segmentation modes, by name rather than magic number. */
const PSM_SINGLE_LINE = '7';
const PSM_SPARSE = '11';

/** What the build managed to vendor locally. Cached: it never changes at runtime. */
interface LocalAssets {
  core: boolean;
  worker: boolean;
  lang: boolean;
}

let assetsPromise: Promise<LocalAssets> | null = null;

function localAssets(): Promise<LocalAssets> {
  if (!assetsPromise) {
    assetsPromise = fetch('/tesseract/manifest.json')
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
        ...(local.core ? { corePath: '/tesseract/' } : {}),
        ...(local.worker ? { workerPath: '/tesseract/worker.min.js' } : {}),
        ...(local.lang ? { langPath: '/tesseract', gzip: true } : {}),
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
    const { binary, width, height, canvas } = prepared;

    // The image was straightened during preprocessing, so a plain vertical
    // projection is now the right one.
    const rules = findRules(projectColumns(binary, width, height), height);
    const grid = toFrameCells(rules, width);
    if (!grid) return null;

    // Measure rows across the sheet's own columns, then cut off the running
    // totals below the marks.
    const sheetLeft = rules[0];
    const sheetRight = rules[rules.length - 1];
    const rows = projectRows(binary, width, height, sheetLeft, sheetRight);

    const bounds = findSheetBounds(rows, sheetRight - sheetLeft);
    if (!bounds) return null;

    const sheetWidth = sheetRight - sheetLeft;

    // A league sheet stacks bowlers, so look for every band the rules make
    // rather than assuming one marks row over one row of totals.
    const horizontals = findHorizontalRules(rows, sheetWidth, bounds);
    let bands = toBands(horizontals);

    if (bands.length === 0) {
      // Only the borders: fall back to the single-row reading.
      const band = findMarkBand(rows, sheetWidth, bounds);
      if (!band) return null;
      bands = [band];
    }

    await this.useMode(worker, PSM_SINGLE_LINE);

    const readRows: { text: string; confidence: number; frames: number }[] = [];
    let done = 0;
    const totalCells = bands.length * grid.cells.length;

    for (const band of bands) {
      const row = await this.readBand(worker, canvas, grid.cells, band, () => {
        done += 1;
        onProgress?.(0.15 + (0.8 * done) / totalCells);
      });

      // Skip the running totals under each bowler, and any band of ruling
      // that carried nothing.
      if (row && row.frames >= 3 && looksLikeMarks(row.text)) readRows.push(row);
    }

    if (readRows.length === 0) return null;

    const [first, ...rest] = readRows;

    return {
      // Frames are space-separated, which is exactly what the mark parser
      // expects — and here the separation is the paper's, not a guess.
      text: first.text,
      // Discount by how regular the grid was: a doubtful grid should not
      // produce a confident-looking read.
      confidence: first.confidence * (0.7 + 0.3 * grid.regularity),
      strategy: 'per-frame',
      framesRead: first.frames,
      otherRows: rest.map((row) => row.text),
    };
  }

  /** Read one horizontal band, cell by cell. */
  private async readBand(
    worker: Worker,
    canvas: HTMLCanvasElement,
    cells: Cell[],
    band: Band,
    onCell: () => void,
  ): Promise<{ text: string; confidence: number; frames: number } | null> {
    // Inset past the rules themselves, which read as stray marks.
    const top = band.top + 2;
    const bottom = band.bottom - 2;
    if (bottom - top < 8) return null;

    const frames: string[] = [];
    const confidences: number[] = [];

    for (const cell of cells) {
      const crop = await cropRegion(canvas, {
        x: cell.x0,
        y: top,
        width: cell.x1 - cell.x0,
        height: bottom - top,
      });
      onCell();
      if (!crop) continue;

      const { data } = await worker.recognize(crop);
      const marks = (data.text ?? '').replace(/[^X0-9/-]/gi, '').toUpperCase();

      // A blank frame is a real answer on a partly played sheet; keep the slot
      // so later frames do not shift left.
      frames.push(marks);
      if (marks) confidences.push(Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)));
    }

    const read = frames.filter(Boolean);
    const mean =
      confidences.length === 0 ? 0 : confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return { text: frames.join(' ').trim(), confidence: mean, frames: read.length };
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.mode = null;
    await worker?.terminate();
  }
}
