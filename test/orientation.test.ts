import { describe, expect, it } from 'vitest';
import {
  orientationTransform,
  readExifOrientation,
  swapsAxes,
  type Orientation,
} from '../src/lib/ocr/orientation';

/** A minimal JPEG carrying nothing but an EXIF orientation tag. */
function jpegWithOrientation(value: number, { little = false } = {}): ArrayBuffer {
  const tiffLength = 8 + 2 + 12 + 4;
  const app1Length = 2 + 6 + tiffLength;
  const bytes = new Uint8Array(2 + 2 + app1Length);
  const view = new DataView(bytes.buffer);

  let o = 0;
  view.setUint16(o, 0xffd8); o += 2;          // SOI
  view.setUint16(o, 0xffe1); o += 2;          // APP1
  view.setUint16(o, app1Length); o += 2;
  view.setUint32(o, 0x45786966); o += 4;      // "Exif"
  view.setUint16(o, 0); o += 2;               // two NULs

  const tiff = o;
  view.setUint16(o, little ? 0x4949 : 0x4d4d); o += 2;
  view.setUint16(o, 42, little); o += 2;
  view.setUint32(o, 8, little); o += 4;       // first IFD, 8 bytes in

  view.setUint16(o, 1, little); o += 2;       // one entry
  view.setUint16(o, 0x0112, little); o += 2;  // Orientation
  view.setUint16(o, 3, little); o += 2;       // SHORT
  view.setUint32(o, 1, little); o += 4;       // one value
  view.setUint16(o, value, little); o += 2;
  view.setUint16(o, 0, little); o += 2;       // padding to four bytes
  view.setUint32(o, 0, little);               // no next IFD

  expect(tiff).toBe(12);
  return bytes.buffer;
}

describe('readExifOrientation', () => {
  it('reads every orientation, big-endian', () => {
    for (let value = 1; value <= 8; value++) {
      expect(readExifOrientation(jpegWithOrientation(value))).toBe(value);
    }
  });

  it('reads little-endian too', () => {
    // Both byte orders occur in the wild; a phone may use either.
    expect(readExifOrientation(jpegWithOrientation(6, { little: true }))).toBe(6);
  });

  it('assumes upright when there is no tag', () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02]);
    expect(readExifOrientation(plain.buffer)).toBe(1);
  });

  it('assumes upright rather than throwing on rubbish', () => {
    expect(readExifOrientation(new Uint8Array([1, 2, 3]).buffer)).toBe(1);
    expect(readExifOrientation(new ArrayBuffer(0))).toBe(1);
    // A JPEG whose segment length is nonsense.
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00]);
    expect(readExifOrientation(broken.buffer)).toBe(1);
  });

  it('ignores an out-of-range value', () => {
    expect(readExifOrientation(jpegWithOrientation(99))).toBe(1);
  });
});

describe('swapsAxes', () => {
  it('is true only for the quarter turns', () => {
    expect([1, 2, 3, 4].map((o) => swapsAxes(o as Orientation))).toEqual([
      false, false, false, false,
    ]);
    expect([5, 6, 7, 8].map((o) => swapsAxes(o as Orientation))).toEqual([true, true, true, true]);
  });
});

describe('orientationTransform', () => {
  /** Where a transform sends a point. */
  const apply = (
    [a, b, c, d, e, f]: [number, number, number, number, number, number],
    x: number,
    y: number,
  ) => [a * x + c * y + e, b * x + d * y + f];

  it('leaves an upright image alone', () => {
    expect(apply(orientationTransform(1, 100, 60), 0, 0)).toEqual([0, 0]);
    expect(apply(orientationTransform(1, 100, 60), 100, 60)).toEqual([100, 60]);
  });

  it('turns an upside-down image the right way up', () => {
    // The stored top-left belongs at the bottom-right.
    const t = orientationTransform(3, 100, 60);
    expect(apply(t, 0, 0)).toEqual([100, 60]);
    expect(apply(t, 100, 60)).toEqual([0, 0]);
  });

  it('mirrors without turning', () => {
    const t = orientationTransform(2, 100, 60);
    expect(apply(t, 0, 0)).toEqual([100, 0]);
    expect(apply(t, 100, 0)).toEqual([0, 0]);
  });

  it('maps a quarter turn into the swapped frame', () => {
    // Orientation 6 is a quarter turn clockwise, so a landscape sensor image
    // becomes a portrait one; every corner must land inside it.
    const width = 100;
    const height = 60;
    const t = orientationTransform(6, width, height);

    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ]) {
      const [nx, ny] = apply(t, x, y);
      expect(nx).toBeGreaterThanOrEqual(0);
      expect(nx).toBeLessThanOrEqual(height);
      expect(ny).toBeGreaterThanOrEqual(0);
      expect(ny).toBeLessThanOrEqual(width);
    }
  });
});
