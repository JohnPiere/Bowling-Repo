/**
 * Preparing a photo for OCR.
 *
 * A phone photo of a score sheet is a hard input: uneven overhead lighting,
 * the shadow of whoever is holding the phone, and pencil marks that are far
 * lighter than print. Converting to high-contrast black and white before
 * recognition matters more to the final accuracy than any OCR setting does.
 *
 * The binary mask is returned alongside the image because segmentation needs
 * it to find the sheet's rules, and thresholding twice would be wasteful.
 */

import {
  orientationTransform,
  readExifOrientation,
  swapsAxes,
  type Orientation,
} from './orientation';
import { estimateTilt } from './rows';
import { findSheetBox, hasDarkSurround, insetBox, otsuThreshold, type SheetBox } from './sheet';

/** Long edge to scale to. Bigger is slower with little accuracy to show for it. */
const TARGET_LONG_EDGE = 1600;

export interface Prepared {
  /** The thresholded image, ready to hand to a recogniser. */
  blob: Blob;
  /** 1 where there is ink, 0 where there is paper. */
  binary: Uint8Array;
  width: number;
  height: number;
  /** Kept so individual cells can be cropped out of it. */
  canvas: HTMLCanvasElement;
}

/**
 * Threshold a photo, then straighten it.
 *
 * The straightening matters more than it looks. Segmentation finds the sheet's
 * rules by projecting along the estimated tilt, but the cells it produces are
 * then cropped out of the canvas — so unless the canvas is straightened by the
 * same amount, the crops come from the wrong place and the whole per-frame
 * read collapses into noise. Correcting the image itself keeps rules, bands
 * and crops in one coordinate space.
 */
export async function preprocessForOcr(image: Blob): Promise<Prepared> {
  // Decoded without the browser's own orientation handling, because browsers
  // disagree about whether they do any — Chromium ignores the tag here even
  // when asked to honour it. Reading it and turning the image ourselves is the
  // only way to get one behaviour everywhere.
  const bitmap = await uprightBitmap(image);

  try {
    // Then crop to the paper. A sheet lying on a dark surface otherwise
    // contributes a solid block of ink whose edges look far more like rules
    // than any printed line does.
    const crop = findPaper(bitmap);

    const upright = rasterise(bitmap, 0, crop);
    // Every other column would be enough on a preview frame; on a 1600-pixel
    // photograph the tilt is just as findable from a quarter of them.
    const step = Math.max(2, Math.round(upright.width / 400));
    const tilt = estimateTilt(upright.binary, upright.width, upright.height, step);

    // Under about a quarter of a degree, redrawing costs more than it buys.
    const prepared = Math.abs(tilt) < 0.004 ? upright : rasterise(bitmap, tilt, crop);

    const blob = await new Promise<Blob | null>((resolve) =>
      prepared.canvas.toBlob(resolve, 'image/png'),
    );

    return { ...prepared, blob: blob ?? image };
  } finally {
    bitmap.close();
  }
}

/**
 * Decode an image with its EXIF orientation already applied.
 *
 * Exported because anything that shows a picked photo has to agree with what
 * the reader sees: a box drawn on a preview that is the right way up would
 * crop the wrong part of an image that is not.
 */
export async function uprightBitmap(image: Blob): Promise<ImageBitmap> {
  const orientation = await readOrientation(image);
  const raw = await createImageBitmap(image, { imageOrientation: 'none' });
  if (orientation === 1) return raw;

  const turned = await turnUpright(raw, orientation);
  if (turned !== raw) raw.close();
  return turned;
}

async function readOrientation(image: Blob): Promise<Orientation> {
  try {
    // The tag lives in the first few kilobytes; there is no need for the rest.
    const head = await image.slice(0, 128 * 1024).arrayBuffer();
    return readExifOrientation(head);
  } catch {
    return 1;
  }
}

/** Redraw a bitmap with its orientation tag applied. */
async function turnUpright(bitmap: ImageBitmap, orientation: Orientation): Promise<ImageBitmap> {
  const turned = swapsAxes(orientation);
  const width = turned ? bitmap.height : bitmap.width;
  const height = turned ? bitmap.width : bitmap.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return bitmap;

  context.setTransform(...orientationTransform(orientation, bitmap.width, bitmap.height));
  context.drawImage(bitmap, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);

  return createImageBitmap(canvas);
}

/** Small enough to find paper on, big enough for the shape to survive. */
const PAPER_SCAN_EDGE = 400;

/**
 * The part of the photo that is the sheet, or null if the whole thing is.
 *
 * Paper is the bright thing; whatever it is lying on is generally not. Otsu
 * picks the split rather than a fixed level, because how bright "bright" is
 * depends entirely on the exposure.
 */
function findPaper(bitmap: ImageBitmap): SheetBox | null {
  const scale = Math.min(1, PAPER_SCAN_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const histogram = new Array<number>(256).fill(0);
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    const value = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    grey[i] = value;
    histogram[Math.round(value)] += 1;
  }

  const threshold = otsuThreshold(histogram);
  const bright = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) bright[i] = grey[i] > threshold ? 1 : 0;

  // A crop of a single row is all paper: there is no table around it, and
  // cropping to the "brightest region" would land inside one frame's cell.
  if (!hasDarkSurround(grey, width, height, threshold)) return null;

  const box = findSheetBox(bright, width, height);
  if (!box) return null;

  // Back to the bitmap's own scale, inset so the paper's edge is left behind.
  const inset = insetBox(box, 0.01);
  return {
    x: Math.round(inset.x / scale),
    y: Math.round(inset.y / scale),
    width: Math.round(inset.width / scale),
    height: Math.round(inset.height / scale),
  };
}

/**
 * Draw the photo at working size, straightened, and threshold it.
 *
 * A true rotation rather than a horizontal shear. A shear straightens vertical
 * rules but leaves horizontal ones tilted, and the sheet's top and bottom
 * borders are horizontal — tilted, they smear across thirty rows and never form
 * the peak that locates the sheet. Rotating fixes both directions at once.
 *
 * `tilt` is the sheet's own rise over run, as `estimateTilt` measures it off
 * the horizontal rules.
 */
function rasterise(
  bitmap: ImageBitmap,
  tilt: number,
  crop: SheetBox | null,
): Omit<Prepared, 'blob'> {
  const source = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };

  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser would not provide a drawing canvas.');

  // Paper, so the corners the shear exposes are not read as ink.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  if (tilt !== 0) {
    // Positive tilt is a line falling to the right, so the image turns the
    // other way to bring it level.
    context.translate(width / 2, height / 2);
    context.rotate(-Math.atan(tilt));
    context.translate(-width / 2, -height / 2);
  }
  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    width,
    height,
  );
  context.setTransform(1, 0, 0, 1, 0, 0);

  const frame = context.getImageData(0, 0, width, height);
  const binary = toBlackAndWhite(frame.data, width, height);
  context.putImageData(frame, 0, 0);

  return { binary, width, height, canvas };
}

/** Crop a region out of a prepared sheet, for recognising one cell at a time. */
export async function cropRegion(
  source: HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
): Promise<Blob | null> {
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));

  const canvas = document.createElement('canvas');
  // A margin of white around a small crop measurably helps Tesseract, which
  // expects glyphs to sit in a page rather than run to the edge.
  const pad = Math.round(Math.max(width, height) * 0.12);
  canvas.width = width + pad * 2;
  canvas.height = height + pad * 2;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, region.x, region.y, width, height, pad, pad, width, height);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Adaptive threshold: compare each pixel to the average of the block around it
 * rather than to one value for the whole image. A single global threshold loses
 * an entire corner of the sheet as soon as the lighting is uneven, which for a
 * photo taken under alley lighting is essentially always.
 *
 * Returns the ink mask as well as painting the pixels.
 */
function toBlackAndWhite(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    // Rec. 601 luma — closer to perceived brightness than a flat mean.
    grey[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }

  // Summed-area table, so each block average is four lookups regardless of the
  // block size.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += grey[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(8, Math.floor(Math.min(width, height) / 40));
  // Marks are darker than the paper around them; requiring a margin below the
  // local average stops flat paper from turning into speckle.
  const margin = 0.86;

  const binary = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      const index = y * width + x;
      const isInk = grey[index] < (sum / area) * margin;
      binary[index] = isInk ? 1 : 0;

      const p = index * 4;
      const value = isInk ? 0 : 255;
      data[p] = value;
      data[p + 1] = value;
      data[p + 2] = value;
      data[p + 3] = 255;
    }
  }

  return binary;
}

