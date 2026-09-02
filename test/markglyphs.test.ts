import { describe, expect, it } from 'vitest';
import { findGlyphs } from '../src/lib/ocr/markglyphs';

/**
 * One frame of a Japanese house sheet, drawn the way the sheet draws it.
 *
 * The marks are shapes rather than characters, and these are those shapes: a
 * strike is a square filled corner to corner both ways, a spare is a square
 * with one triangular half filled, a miss is a bar, and a count thrown at a
 * split is a digit with a ring round it. Everything is drawn at about the size
 * they come out on a photograph of a row that fills a phone's viewfinder.
 */
function frame(...marks: ('strike' | 'spare' | 'miss' | 'count' | 'digit' | 'box')[]) {
  const width = 130;
  const height = 60;
  const binary = new Uint8Array(width * height);

  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) binary[y * width + x] = 1;
  };
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y);
  };
  const outline = (x0: number, y0: number, w: number, h: number) => {
    for (let x = x0; x < x0 + w; x++) {
      set(x, y0);
      set(x, y0 + h - 1);
    }
    for (let y = y0; y < y0 + h; y++) {
      set(x0, y);
      set(x0 + w - 1, y);
    }
  };

  marks.forEach((mark, slot) => {
    const x0 = 8 + slot * 44;
    const y0 = 12;
    const size = 30;

    if (mark === 'strike') {
      // Two triangles, based on the left and right edges and meeting point to
      // point in the middle: ink at every corner, white above and below.
      const half = size / 2;
      for (let y = 0; y < size; y++) {
        const reach = half - Math.abs(half - y);
        for (let x = 0; x < size; x++) {
          if (x <= reach || x >= size - 1 - reach) set(x0 + x, y0 + y);
        }
      }
    } else if (mark === 'spare') {
      // A right triangle: the diagonal from bottom-left to top-right, filled
      // below it.
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) if (y >= size - 1 - x) set(x0 + x, y0 + y);
      }
    } else if (mark === 'miss') {
      fill(x0, y0 + size / 2 - 2, 28, 4);
    } else if (mark === 'count') {
      // A ring with a digit inside it.
      for (let a = 0; a < 360; a += 2) {
        const r = (a * Math.PI) / 180;
        set(Math.round(x0 + size / 2 + Math.cos(r) * 14), Math.round(y0 + size / 2 + Math.sin(r) * 14));
      }
      fill(x0 + 12, y0 + 9, 6, 13);
    } else if (mark === 'digit') {
      fill(x0 + 4, y0 + 5, 8, 20);
    } else {
      outline(x0 - 4, y0 - 5, 40, 40);
    }
  });

  return { binary, width, height };
}

const cell = { x0: 0, x1: 130 };
const band = { top: 0, bottom: 60 };

describe('findGlyphs', () => {
  it('reads the crossed square as a strike', () => {
    const { binary, width } = frame('strike');
    expect(findGlyphs(binary, width, cell, band).map((g) => g.glyph)).toEqual(['strike']);
  });

  it('reads the filled triangle as a spare', () => {
    const { binary, width } = frame('spare');
    expect(findGlyphs(binary, width, cell, band).map((g) => g.glyph)).toEqual(['spare']);
  });

  it('reads the bar as a miss', () => {
    const { binary, width } = frame('miss');
    expect(findGlyphs(binary, width, cell, band).map((g) => g.glyph)).toEqual(['miss']);
  });

  it('reads a ringed digit as a count, without reading the digit', () => {
    const { binary, width } = frame('count');
    expect(findGlyphs(binary, width, cell, band).map((g) => g.glyph)).toEqual(['count']);
  });

  it('leaves a plain digit alone', () => {
    // Digits are the recogniser's job. A classifier that claimed them would
    // turn every 8 into a mark nobody wrote.
    const { binary, width } = frame('digit');
    expect(findGlyphs(binary, width, cell, band)).toEqual([]);
  });

  it('does not mistake the printed box for a mark', () => {
    // Every second ball on the sheet sits inside one, filled or not.
    const { binary, width } = frame('box');
    expect(findGlyphs(binary, width, cell, band)).toEqual([]);
  });

  it('returns what it finds left to right', () => {
    const { binary, width } = frame('digit', 'spare');
    const found = findGlyphs(binary, width, cell, band);
    expect(found.map((g) => g.glyph)).toEqual(['spare']);
    expect(found[0].left).toBeGreaterThan(44);
  });

  it('finds all three balls of a tenth frame', () => {
    const { binary, width } = frame('strike', 'strike', 'strike');
    expect(findGlyphs(binary, width, cell, band).map((g) => g.glyph)).toEqual([
      'strike',
      'strike',
      'strike',
    ]);
  });

  it('takes the box around a shape with it', () => {
    // The mark's own box would otherwise be left just outside the shape, where
    // a border beside a digit reads as a 1 — 9 becomes 91 on every spare.
    const withBox = frame('spare');
    const boxOnly = frame('box');
    for (let i = 0; i < withBox.binary.length; i++) {
      if (boxOnly.binary[i]) withBox.binary[i] = 1;
    }

    const [found] = findGlyphs(withBox.binary, withBox.width, cell, band);
    expect(found.glyph).toBe('spare');
    expect(found.left).toBeLessThan(8);
  });

  it('has nothing to say about a frame too small to hold a mark', () => {
    const { binary, width } = frame('strike');
    expect(findGlyphs(binary, width, { x0: 0, x1: 6 }, band)).toEqual([]);
  });
});
