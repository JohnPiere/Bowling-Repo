import { describe, expect, it } from 'vitest';
import {
  agreesWith,
  classify,
  findBlobs,
  readDiagram,
  toPinfalls,
  toRows,
  type Blob,
} from '../src/lib/ocr/pindiagram';

/**
 * A frame's pin diagram, drawn the way the sheet draws it.
 *
 * Four rows of 4/3/2/1, back row at the top. Each pin is one of the three
 * shapes the sheet's own legend defines:
 *
 *   'o'  an open ring     — the pin went down
 *   '@'  a filled ball    — still standing after ball one
 *   '8'  a stacked pair   — still standing after ball two
 *
 * Drawn at 9x9 per cell, which is about what a frame's diagram occupies on a
 * 3000px-wide photograph of a Korona sheet.
 */
function drawDiagram(glyphs: Record<number, 'o' | '@' | '8'>): {
  binary: Uint8Array;
  width: number;
  height: number;
} {
  const CELL = 12;
  const ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
  const width = CELL * 4;
  const height = CELL * ROWS.length;
  const binary = new Uint8Array(width * height);

  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) binary[y * width + x] = 1;
  };

  const ring = (cx: number, cy: number, r: number) => {
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      set(Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r));
    }
  };
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) set(Math.round(cx + x), Math.round(cy + y));
      }
    }
  };

  ROWS.forEach((pins, r) => {
    // Rows are centred, the way a rack is.
    const indent = ((4 - pins.length) * CELL) / 2;
    pins.forEach((pin, i) => {
      const cx = indent + i * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      const glyph = glyphs[pin] ?? 'o';

      if (glyph === 'o') ring(cx, cy, 3);
      else if (glyph === '@') disc(cx, cy, 3);
      else {
        // Two small rings stacked: taller than it is wide, which is the thing
        // that tells it apart.
        ring(cx, cy - 2.4, 2);
        ring(cx, cy + 2.4, 2);
      }
    });
  });

  return { binary, width, height };
}

describe('classify', () => {
  const blob = (over: Partial<Blob> = {}): Blob => ({
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    fill: 0.3,
    ...over,
  });

  it('reads a solid shape as standing after the first ball', () => {
    expect(classify(blob({ fill: 0.8 }))).toBe('first');
  });

  it('reads a hollow shape as a pin that went down', () => {
    // A printed ring is mostly white inside, which is the whole difference.
    expect(classify(blob({ fill: 0.28 }))).toBe('down');
  });

  it('reads a tall shape as standing after the second ball', () => {
    // Two rings stacked. Proportion decides before fill does, because the pair
    // is hollow and would otherwise read as an ordinary ring.
    expect(classify(blob({ width: 6, height: 13, fill: 0.3 }))).toBe('second');
  });
});

describe('findBlobs', () => {
  it('finds one shape per pin', () => {
    const { binary, width, height } = drawDiagram({});
    expect(findBlobs(binary, width, height)).toHaveLength(10);
  });

  it('ignores specks too small to be a pin', () => {
    const { binary, width, height } = drawDiagram({});
    binary[0] = 1;
    binary[5] = 1;
    expect(findBlobs(binary, width, height)).toHaveLength(10);
  });

  it('holds a ring together despite a one-pixel outline', () => {
    // Four-connectivity breaks a drawn circle into arcs; this is why the fill
    // is eight-connected.
    const { binary, width, height } = drawDiagram({ 1: 'o' });
    const blobs = findBlobs(binary, width, height);
    expect(blobs.every((b) => b.width <= 9 && b.height <= 9)).toBe(true);
  });
});

describe('toRows', () => {
  it('splits the rack into its four rows, back row first', () => {
    const { binary, width, height } = drawDiagram({});
    const rows = toRows(findBlobs(binary, width, height));
    expect(rows.map((row) => row.length)).toEqual([4, 3, 2, 1]);
  });

  it('has nothing to group in an empty diagram', () => {
    expect(toRows([])).toEqual([]);
  });
});

describe('readDiagram', () => {
  it('reads a strike as nothing left standing', () => {
    const { binary, width, height } = drawDiagram({});
    const leave = readDiagram(binary, width, height);
    expect(leave.readable).toBe(true);
    expect(leave.afterFirst).toEqual([]);
    expect(leave.afterSecond).toEqual([]);
  });

  it('reads a 10-pin left by the first ball', () => {
    const leave = readDiagram(...spread(drawDiagram({ 10: '@' })));
    expect(leave.afterFirst).toEqual([10]);
    expect(leave.afterSecond).toEqual([]);
  });

  it('reads the 7-10 split, which is the one everybody recognises', () => {
    const leave = readDiagram(...spread(drawDiagram({ 7: '@', 10: '@' })));
    expect(leave.afterFirst).toEqual([7, 10]);
  });

  it('carries a pin left by the second ball back into the first', () => {
    // The sheet draws only the later mark. A pin standing after ball two was
    // standing after ball one, and reporting otherwise would say it fell and
    // stood back up.
    const leave = readDiagram(...spread(drawDiagram({ 7: '8' })));
    expect(leave.afterFirst).toEqual([7]);
    expect(leave.afterSecond).toEqual([7]);
  });

  it('reads a frame where one of two pins was picked up', () => {
    const leave = readDiagram(...spread(drawDiagram({ 4: '@', 7: '8' })));
    expect(leave.afterFirst).toEqual([4, 7]);
    expect(leave.afterSecond).toEqual([7]);
  });

  it('refuses a diagram that is not a rack', () => {
    // Three rows where there should be four: a fold, or a crop that clipped it.
    const width = 48;
    const height = 24;
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < 20; i++) binary[i] = 1;
    expect(readDiagram(binary, width, height).readable).toBe(false);
  });

  it('refuses a row of the wrong length rather than sliding pins along it', () => {
    // A back row missing its 7-pin would otherwise report 8-9-10 as 7-8-9.
    const { binary, width, height } = drawDiagram({});
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) binary[y * width + x] = 0;
    expect(readDiagram(binary, width, height).readable).toBe(false);
  });
});

describe('toPinfalls', () => {
  it('gives a strike one ball, not two', () => {
    // An empty second array would read as a gutter ball nobody threw.
    const falls = toPinfalls(readDiagram(...spread(drawDiagram({}))));
    expect(falls).toHaveLength(1);
    expect(falls?.[0]).toHaveLength(10);
  });

  it('splits an open frame into what each ball took', () => {
    const falls = toPinfalls(readDiagram(...spread(drawDiagram({ 4: '@', 7: '8' }))));
    expect(falls?.[0]).toEqual([1, 2, 3, 5, 6, 8, 9, 10]);
    expect(falls?.[1]).toEqual([4]);
  });

  it('gives a spare both balls with nothing left', () => {
    const falls = toPinfalls(readDiagram(...spread(drawDiagram({ 10: '@' }))));
    expect(falls?.[0]).toHaveLength(9);
    expect(falls?.[1]).toEqual([10]);
  });

  it('has nothing to offer for an unreadable diagram', () => {
    expect(toPinfalls({ afterFirst: [], afterSecond: [], readable: false })).toBeNull();
  });
});

describe('agreesWith', () => {
  it('accepts a diagram that matches the marks above it', () => {
    // The sheet is written by one machine from one throw, so the counts and
    // the pins are two records of the same fact.
    const leave = readDiagram(...spread(drawDiagram({ 4: '@', 7: '8' })));
    expect(agreesWith(leave, [8, 1])).toBe(true);
  });

  it('rejects a diagram that contradicts them', () => {
    // A leave that disagrees with the score is worse than no leave: it looks
    // like data.
    const leave = readDiagram(...spread(drawDiagram({ 4: '@', 7: '8' })));
    expect(agreesWith(leave, [9, 1])).toBe(false);
  });

  it('accepts a strike against a single ten', () => {
    expect(agreesWith(readDiagram(...spread(drawDiagram({}))), [10])).toBe(true);
  });

  it('checks the tenth on the two balls a diagram can describe', () => {
    // The tenth re-racks and throws up to three; one diagram cannot say that,
    // so the bonus ball is not held against it.
    const leave = readDiagram(...spread(drawDiagram({ 10: '@' })));
    expect(agreesWith(leave, [9, 1, 10])).toBe(true);
  });

  it('never agrees with an unreadable diagram', () => {
    expect(agreesWith({ afterFirst: [], afterSecond: [], readable: false }, [10])).toBe(false);
  });
});

/** `drawDiagram` returns an object; `readDiagram` takes three arguments. */
function spread(drawn: { binary: Uint8Array; width: number; height: number }) {
  return [drawn.binary, drawn.width, drawn.height] as const;
}
