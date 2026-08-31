/**
 * Preparing a photo for OCR.
 *
 * A phone photo of a score sheet is a hard input: uneven overhead lighting,
 * the shadow of whoever is holding the phone, and pencil marks that are far
 * lighter than print. Converting to high-contrast black and white before
 * recognition matters more to the final accuracy than any OCR setting does.
 */

/** Long edge to scale to. Bigger is slower with little accuracy to show for it. */
const TARGET_LONG_EDGE = 1600;

export async function preprocessForOcr(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);

  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return image;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const frame = context.getImageData(0, 0, width, height);
  toBlackAndWhite(frame.data, width, height);
  context.putImageData(frame, 0, 0);

  const processed = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  return processed ?? image;
}

/**
 * Adaptive threshold: compare each pixel to the average of the block around it
 * rather than to one value for the whole image. A single global threshold loses
 * an entire corner of the sheet as soon as the lighting is uneven, which for a
 * photo taken under alley lighting is essentially always.
 */
function toBlackAndWhite(data: Uint8ClampedArray, width: number, height: number): void {
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

      const value = grey[y * width + x] < (sum / area) * margin ? 0 : 255;
      const p = (y * width + x) * 4;
      data[p] = value;
      data[p + 1] = value;
      data[p + 2] = value;
      data[p + 3] = 255;
    }
  }
}
