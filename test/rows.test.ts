import { describe, expect, it } from 'vitest';
import {
  countDividers,
  detectGameRows,
  findPaper,
  gridScore,
  inkSpan,
  rowStrip,
  stableRows,
  toInk,
  trackRows,
  type RowBox,
  type TrackedRow,
} from '../src/lib/ocr/rows';

const PAPER = 235;
const INK = 40;

interface RowSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
  dividers: number;
}

/** A grey buffer with the given boxes drawn on it, as a phone preview sees. */
function preview(width: number, height: number, rows: RowSpec[]) {
  const gray = new Uint8Array(width * height).fill(PAPER);
  const set = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] = INK;
  };

  for (const row of rows) {
    for (let x = row.left; x <= row.right; x++) {
      set(x, row.top);
      set(x, row.bottom);
    }
    // Dividers include both ends, the way a ruled box does.
    const step = (row.right - row.left) / (row.dividers - 1);
    for (let i = 0; i < row.dividers; i++) {
      const x = Math.round(row.left + i * step);
      for (let y = row.top; y <= row.bottom; y++) set(x, y);
    }
  }

  return { gray, width, height };
}

describe('toInk', () => {
  it('separates ink from paper', () => {
    const { gray, width, height } = preview(60, 40, [
      { top: 10, bottom: 26, left: 4, right: 55, dividers: 11 },
    ]);
    const ink = toInk(gray, width, height);
    expect(ink[10 * width + 20]).toBe(1);
    expect(ink[2 * width + 20]).toBe(0);
  });

  it('finds no ink on blank paper', () => {
    const gray = new Uint8Array(40 * 20).fill(PAPER);
    expect(Array.from(toInk(gray, 40, 20)).some(Boolean)).toBe(false);
  });
});

describe('findPaper', () => {
  it('crops away the table the sheet is lying on', () => {
    const width = 320;
    const height = 240;
    // A dark surround with a bright sheet inside it.
    const gray = new Uint8Array(width * height).fill(30);
    for (let y = 40; y < 200; y++) {
      for (let x = 20; x < 300; x++) gray[y * width + x] = PAPER;
    }

    const paper = findPaper(gray, width, height);
    expect(paper).not.toBeNull();
    expect(paper!.y).toBeGreaterThanOrEqual(40);
    expect(paper!.y + paper!.height).toBeLessThanOrEqual(200);
  });

  it('does not mistake the inside of a row for the sheet', () => {
    // Held close, the sheet fills the frame and there is nothing to crop. The
    // brightest run is then the space between two rules, and cropping to it
    // would throw away both.
    const { gray, width, height } = preview(320, 100, [
      { top: 30, bottom: 66, left: 12, right: 308, dividers: 11 },
    ]);
    expect(findPaper(gray, width, height)).toBeNull();
  });
});

describe('inkSpan', () => {
  it('measures how far a band reaches', () => {
    const { gray, width, height } = preview(120, 60, [
      { top: 20, bottom: 40, left: 15, right: 100, dividers: 11 },
    ]);
    const ink = toInk(gray, width, height);
    const span = inkSpan(ink, width, { top: 20, bottom: 40 });
    expect(span).not.toBeNull();
    expect(span!.start).toBe(15);
    expect(span!.end).toBe(100);
  });

  it('returns nothing for an empty band', () => {
    const ink = new Uint8Array(50 * 50);
    expect(inkSpan(ink, 50, { top: 5, bottom: 20 })).toBeNull();
  });
});

describe('countDividers', () => {
  it('counts the rules that split a row into frames', () => {
    const { gray, width, height } = preview(220, 60, [
      { top: 15, bottom: 40, left: 10, right: 210, dividers: 11 },
    ]);
    const ink = toInk(gray, width, height);
    expect(countDividers(ink, width, { top: 15, bottom: 40, left: 10, right: 210 })).toBe(11);
  });

  it('does not count the band borders as dividers', () => {
    // A box with borders but nothing inside it.
    const width = 200;
    const height = 60;
    const gray = new Uint8Array(width * height).fill(PAPER);
    for (let x = 10; x <= 190; x++) {
      gray[20 * width + x] = INK;
      gray[45 * width + x] = INK;
    }
    const ink = toInk(gray, width, height);
    expect(countDividers(ink, width, { top: 20, bottom: 45, left: 10, right: 190 })).toBe(0);
  });
});

describe('gridScore', () => {
  it('is highest for the eleven rules ten frames need', () => {
    expect(gridScore(11)).toBe(1);
  });

  it('is just as happy with a total column or two', () => {
    expect(gridScore(13)).toBe(1);
  });

  it('falls off for a partial read', () => {
    expect(gridScore(8)).toBeGreaterThan(0);
    expect(gridScore(8)).toBeLessThan(1);
    expect(gridScore(11)).toBeGreaterThan(gridScore(8));
  });

  it('refuses too few rules to be a row of frames', () => {
    expect(gridScore(3)).toBe(0);
  });
});

describe('detectGameRows', () => {
  it('finds a row filling the preview', () => {
    const { gray, width, height } = preview(320, 100, [
      { top: 30, bottom: 66, left: 12, right: 308, dividers: 11 },
    ]);

    const boxes = detectGameRows(gray, width, height);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].y).toBe(30);
    expect(boxes[0].x).toBe(12);
    expect(boxes[0].dividers).toBe(11);
    expect(boxes[0].confidence).toBeGreaterThan(0.9);
  });

  it('finds every row on a six-game sheet', () => {
    const rows: RowSpec[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push({ top: 20 + i * 45, bottom: 52 + i * 45, left: 10, right: 310, dividers: 11 });
    }
    const { gray, width, height } = preview(320, 300, rows);

    const boxes = detectGameRows(gray, width, height);
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    // The six real rows are the confident ones; the gaps between boxes have no
    // dividers and drop out.
    expect(boxes.filter((b) => b.dividers >= 10)).toHaveLength(6);
  });

  it('ignores a box with no frames in it', () => {
    // The header band on a sheet: ruled, but empty of dividers.
    const width = 320;
    const height = 100;
    const gray = new Uint8Array(width * height).fill(PAPER);
    for (let x = 10; x <= 310; x++) {
      gray[30 * width + x] = INK;
      gray[66 * width + x] = INK;
    }
    expect(detectGameRows(gray, width, height)).toEqual([]);
  });

  it('ignores a band too tall to be a row of frames', () => {
    const { gray, width, height } = preview(200, 300, [
      { top: 20, bottom: 260, left: 10, right: 190, dividers: 11 },
    ]);
    expect(detectGameRows(gray, width, height)).toEqual([]);
  });

  it('finds nothing in an empty frame', () => {
    expect(detectGameRows(new Uint8Array(320 * 200).fill(PAPER), 320, 200)).toEqual([]);
  });

  it('refuses a frame too small to hold a sheet', () => {
    expect(detectGameRows(new Uint8Array(16 * 8), 16, 8)).toEqual([]);
  });
});

describe('trackRows', () => {
  const box = (y: number, extra: Partial<RowBox> = {}): RowBox => ({
    x: 10,
    y,
    width: 300,
    height: 36,
    dividers: 11,
    slope: 0,
    confidence: 0.9,
    ...extra,
  });

  it('gives a box an identity the first time it is seen', () => {
    const tracked = trackRows([], [box(30)]);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].hits).toBe(1);
    expect(tracked[0].misses).toBe(0);
  });

  it('keeps the same identity as a row drifts', () => {
    let tracked = trackRows([], [box(30)]);
    const id = tracked[0].id;
    tracked = trackRows(tracked, [box(34)]);

    expect(tracked).toHaveLength(1);
    expect(tracked[0].id).toBe(id);
    expect(tracked[0].hits).toBe(2);
  });

  it('eases towards the new reading rather than snapping to it', () => {
    let tracked = trackRows([], [box(30)]);
    tracked = trackRows(tracked, [box(50)], { ease: 0.5 });
    expect(tracked[0].y).toBe(40);
  });

  it('treats a box somewhere else as a different row', () => {
    let tracked = trackRows([], [box(30)]);
    tracked = trackRows(tracked, [box(30), box(200)]);
    expect(tracked).toHaveLength(2);
    expect(new Set(tracked.map((r) => r.id)).size).toBe(2);
  });

  it('holds a box through a blurred frame, then lets it go', () => {
    let tracked = trackRows([], [box(30)]);
    for (let i = 0; i < 3; i++) tracked = trackRows(tracked, [], { patience: 3 });
    expect(tracked).toHaveLength(1);
    expect(tracked[0].misses).toBe(3);

    tracked = trackRows(tracked, [], { patience: 3 });
    expect(tracked).toEqual([]);
  });

  it('returns rows top to bottom, whatever order they were found in', () => {
    const tracked = trackRows([], [box(200), box(30), box(120)]);
    expect(tracked.map((r) => r.y)).toEqual([30, 120, 200]);
  });
});

describe('stableRows', () => {
  it('waits for a box to settle before showing it', () => {
    const rows: TrackedRow[] = [
      { ...({ x: 0, y: 0, width: 10, height: 5, dividers: 11, slope: 0, confidence: 1 } as RowBox), id: 1, hits: 1, misses: 0 },
      { ...({ x: 0, y: 20, width: 10, height: 5, dividers: 11, slope: 0, confidence: 1 } as RowBox), id: 2, hits: 4, misses: 0 },
    ];
    expect(stableRows(rows).map((r) => r.id)).toEqual([2]);
  });
});

describe('rowStrip', () => {
  it('is the whole box when the row is level', () => {
    const strip = rowStrip({ x: 0, y: 0, width: 300, height: 40, dividers: 11, slope: 0, confidence: 1 });
    expect(strip.height).toBe(40);
    expect(strip.angle).toBe(0);
  });

  it('takes back the height the tilt added to the box', () => {
    // A row tilted across 300px at 0.1 rise-over-run spans 30px more upright
    // than the strip itself is tall.
    const strip = rowStrip({ x: 0, y: 0, width: 300, height: 70, dividers: 11, slope: 0.1, confidence: 1 });
    expect(strip.height).toBeCloseTo(40);
    expect(strip.angle).toBeCloseTo(Math.atan(0.1));
  });

  it('turns the other way for the other tilt', () => {
    const strip = rowStrip({ x: 0, y: 0, width: 300, height: 70, dividers: 11, slope: -0.1, confidence: 1 });
    expect(strip.height).toBeCloseTo(40);
    expect(strip.angle).toBeLessThan(0);
  });

  it('never gives back a strip with no height', () => {
    const strip = rowStrip({ x: 0, y: 0, width: 300, height: 10, dividers: 11, slope: 0.5, confidence: 1 });
    expect(strip.height).toBeGreaterThan(0);
  });
});
