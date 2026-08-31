/**
 * EXIF orientation.
 *
 * A phone camera almost never stores pixels the way up you held it. It stores
 * them the way the sensor is mounted and writes a tag saying how to turn them.
 * Browsers disagree about whether decoding applies that tag — Chromium ignores
 * it for `createImageBitmap` even when asked to honour it — so the only way to
 * get one behaviour everywhere is to decode without it and apply the turn
 * ourselves.
 *
 * It matters more here than it looks: every stage after this assumes the sheet
 * is the right way up. A photo taken upside down is read upside down, and the
 * failure is silent.
 */

/** The eight ways a camera can have stored an image. 1 is "as it looks". */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const SOI = 0xffd8;
const APP1 = 0xffe1;
const ORIENTATION_TAG = 0x0112;

/**
 * Read the orientation tag out of a JPEG, or 1 if there is not one.
 *
 * Deliberately forgiving: a malformed or absent header is not an error, it
 * just means the image is already the right way up as far as we can tell.
 */
export function readExifOrientation(buffer: ArrayBuffer): Orientation {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return 1;

  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);

    // Markers all start 0xFF; anything else means the walk has lost its place.
    if ((marker & 0xff00) !== 0xff00) return 1;

    const length = view.getUint16(offset + 2);
    if (length < 2) return 1;

    if (marker === APP1 && offset + 10 <= view.byteLength) {
      // "Exif\0\0"
      if (view.getUint32(offset + 4) === 0x45786966) {
        return readTiffOrientation(view, offset + 10) ?? 1;
      }
    }

    offset += 2 + length;
  }

  return 1;
}

/** The tag lives in the first IFD of a little- or big-endian TIFF header. */
function readTiffOrientation(view: DataView, tiff: number): Orientation | null {
  if (tiff + 8 > view.byteLength) return null;

  const endian = view.getUint16(tiff);
  // 'II' is little-endian, 'MM' big-endian; anything else is not a TIFF header.
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return null;

  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > view.byteLength) return null;

  const count = view.getUint16(ifd, little);

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;

    if (view.getUint16(entry, little) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? (value as Orientation) : null;
    }
  }

  return null;
}

/** Whether a turn swaps the image's width and height. */
export function swapsAxes(orientation: Orientation): boolean {
  return orientation >= 5;
}

/**
 * The canvas transform that puts an image the right way up.
 *
 * Returned as the six numbers `setTransform` takes, so the caller can apply it
 * without this module needing a canvas.
 */
export function orientationTransform(
  orientation: Orientation,
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2: // mirrored
      return [-1, 0, 0, 1, width, 0];
    case 3: // upside down
      return [-1, 0, 0, -1, width, height];
    case 4: // mirrored top to bottom
      return [1, 0, 0, -1, 0, height];
    case 5: // mirrored, then turned
      return [0, 1, 1, 0, 0, 0];
    case 6: // a quarter turn clockwise
      return [0, 1, -1, 0, height, 0];
    case 7: // mirrored, then turned the other way
      return [0, -1, -1, 0, height, width];
    case 8: // a quarter turn anticlockwise
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}
