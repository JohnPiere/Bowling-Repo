/**
 * Finding the sheet inside the photograph.
 *
 * Every other stage assumes the image *is* the sheet. A real photo is a sheet
 * lying on something — a table, a bag, a lane approach — and that something is
 * usually darker than paper. Thresholded, the surround becomes a solid block
 * of ink whose edges look far more like rules than any printed line does, so
 * the grid search finds the paper's border and nothing else.
 *
 * So: separate paper from surround first, crop to the paper, and let the rest
 * of the pipeline work on a sheet that fills its own image.
 */

/** Bright pixels per row or column, as a fraction of the line's length. */
export type Coverage = number[];

/**
 * Otsu's threshold: the grey level that best separates a histogram into two
 * groups. Chosen over a fixed value because "bright" depends entirely on the
 * exposure, and alley lighting is not kind.
 */
export function otsuThreshold(histogram: number[]): number {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return 128;

  let sum = 0;
  for (let i = 0; i < histogram.length; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let firstBest = 0;
  let lastBest = 0;

  for (let t = 0; t < histogram.length; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;

    // Between-class variance; the threshold that maximises it is the split.
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      firstBest = t;
      lastBest = t;
    } else if (variance === bestVariance) {
      lastBest = t;
    }
  }

  // Two well-separated groups leave a plateau of equally good thresholds —
  // every level in the gap between them. Taking the middle puts the split in
  // the empty space rather than hard against one of the groups, which is what
  // gives a noisy photo somewhere to fall.
  return Math.round((firstBest + lastBest) / 2);
}

export interface Extent {
  start: number;
  end: number;
}

/**
 * The longest stretch where coverage stays above a share of its own maximum.
 *
 * Relative to the maximum rather than absolute, because how much of a photo
 * the sheet fills is exactly what is unknown. The longest run rather than the
 * first, so a bright reflection off the table beside the sheet does not
 * capture the answer.
 */
export function widestRun(coverage: Coverage, minShare = 0.5): Extent | null {
  const peak = Math.max(...coverage, 0);
  if (peak <= 0) return null;

  const threshold = peak * minShare;
  let best: Extent | null = null;
  let start = -1;

  for (let i = 0; i <= coverage.length; i++) {
    const inside = i < coverage.length && coverage[i] >= threshold;

    if (inside && start < 0) start = i;
    else if (!inside && start >= 0) {
      const run = { start, end: i - 1 };
      if (!best || run.end - run.start > best.end - best.start) best = run;
      start = -1;
    }
  }

  return best;
}

export interface SheetBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the paper is, from a mask of everything bright.
 *
 * Returns null when the mask says nothing useful — an all-dark photo, or one
 * where paper fills the frame and there is no surround to find. The caller
 * then works on the whole image, which for a flat scan is the right answer
 * anyway.
 */
export function findSheetBox(
  bright: Uint8Array,
  width: number,
  height: number,
  minShare = 0.5,
): SheetBox | null {
  const rows: Coverage = new Array(height).fill(0);
  const columns: Coverage = new Array(width).fill(0);

  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      if (bright[offset + x]) {
        rows[y] += 1;
        columns[x] += 1;
      }
    }
  }

  const vertical = widestRun(rows, minShare);
  const horizontal = widestRun(columns, minShare);
  if (!vertical || !horizontal) return null;

  const box = {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.end - horizontal.start + 1,
    height: vertical.end - vertical.start + 1,
  };

  // A crop that keeps almost everything is not worth the second pass, and one
  // that keeps almost nothing means the mask found something that is not a
  // sheet.
  const area = (box.width * box.height) / (width * height);
  if (area > 0.95 || area < 0.05) return null;

  return box;
}

/**
 * True when the frame's outer edge is mostly darker than paper.
 *
 * The guard on every crop-to-the-paper. Held at arm's length a sheet is a
 * bright rectangle on a darker table and cropping to it is the only way the
 * printed rules ever clear the threshold. Held close — or handed a crop of one
 * row — the sheet *is* the frame, Otsu's split now falls between print and
 * paper rather than paper and table, and the brightest connected stretch is the
 * inside of a cell. Cropping to that throws away everything worth reading, so
 * the edge is checked for a surround before anything is cropped to.
 */
export function hasDarkSurround(
  grey: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  band = 0.04,
): boolean {
  const depth = Math.max(2, Math.round(Math.min(width, height) * band));
  let dark = 0;
  let total = 0;

  for (let y = 0; y < height; y++) {
    const edgeRow = y < depth || y >= height - depth;
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      if (!edgeRow && x >= depth && x < width - depth) continue;
      total += 1;
      if (grey[offset + x] < threshold) dark += 1;
    }
  }

  return total > 0 && dark / total > 0.5;
}

/** Inset a box, so the paper's own edge is not carried into the crop. */
export function insetBox(box: SheetBox, fraction = 0.005): SheetBox {
  const inset = Math.round(Math.min(box.width, box.height) * fraction);
  return {
    x: box.x + inset,
    y: box.y + inset,
    width: Math.max(1, box.width - inset * 2),
    height: Math.max(1, box.height - inset * 2),
  };
}
