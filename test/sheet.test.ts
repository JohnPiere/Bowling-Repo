import { describe, expect, it } from 'vitest';
import {
  findSheetBox,
  hasDarkSurround,
  insetBox,
  otsuThreshold,
  widestRun,
} from '../src/lib/ocr/sheet';

describe('otsuThreshold', () => {
  it('splits two well-separated groups in the gap between them', () => {
    const histogram = new Array(256).fill(0);
    histogram[30] = 500; // a dark table
    histogram[220] = 500; // and white paper
    const t = otsuThreshold(histogram);
    // Anywhere in the gap separates them; the middle leaves the most room
    // for a noisy pixel to fall on the right side.
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThan(200);
  });

  it('leans towards the larger group when they are uneven', () => {
    const histogram = new Array(256).fill(0);
    histogram[40] = 100;
    histogram[200] = 900;
    const t = otsuThreshold(histogram);
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(200);
  });

  it('copes with an empty histogram', () => {
    expect(otsuThreshold(new Array(256).fill(0))).toBe(128);
  });

  it('copes with a single-valued image', () => {
    const histogram = new Array(256).fill(0);
    histogram[100] = 1000;
    expect(otsuThreshold(histogram)).toBeGreaterThanOrEqual(0);
  });
});

describe('widestRun', () => {
  it('finds a run above the share of the peak', () => {
    expect(widestRun([0, 0, 10, 10, 10, 0, 0])).toEqual({ start: 2, end: 4 });
  });

  it('prefers the longest run, not the first', () => {
    // A reflection beside the sheet must not win over the sheet.
    expect(widestRun([10, 0, 0, 10, 10, 10, 10, 0])).toEqual({ start: 3, end: 6 });
  });

  it('handles a run that reaches the end', () => {
    expect(widestRun([0, 0, 5, 5, 5])).toEqual({ start: 2, end: 4 });
  });

  it('returns nothing for an empty signal', () => {
    expect(widestRun([0, 0, 0])).toBeNull();
    expect(widestRun([])).toBeNull();
  });
});

describe('findSheetBox', () => {
  /** A bright rectangle on a dark ground. */
  function photo(width: number, height: number, box: { x: number; y: number; w: number; h: number }) {
    const bright = new Uint8Array(width * height);
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) bright[y * width + x] = 1;
    }
    return bright;
  }

  it('finds a sheet lying on a dark surface', () => {
    const bright = photo(200, 100, { x: 40, y: 20, w: 120, h: 60 });
    expect(findSheetBox(bright, 200, 100)).toEqual({ x: 40, y: 20, width: 120, height: 60 });
  });

  it('declines when paper already fills the frame', () => {
    // Cropping would gain nothing, and the pipeline is right as it is.
    const bright = photo(200, 100, { x: 0, y: 0, w: 200, h: 100 });
    expect(findSheetBox(bright, 200, 100)).toBeNull();
  });

  it('declines when the bright region is too small to be a sheet', () => {
    const bright = photo(200, 100, { x: 90, y: 45, w: 8, h: 6 });
    expect(findSheetBox(bright, 200, 100)).toBeNull();
  });

  it('declines on an entirely dark photo', () => {
    expect(findSheetBox(new Uint8Array(200 * 100), 200, 100)).toBeNull();
  });

  it('is not fooled by a bright patch beside the sheet', () => {
    const bright = photo(300, 100, { x: 100, y: 20, w: 150, h: 60 });
    // A small highlight on the table to the left.
    for (let y = 40; y < 50; y++) {
      for (let x = 5; x < 20; x++) bright[y * 300 + x] = 1;
    }
    const box = findSheetBox(bright, 300, 100);
    expect(box?.x).toBeGreaterThanOrEqual(100);
  });
});

describe('insetBox', () => {
  it('pulls the edges in', () => {
    const box = insetBox({ x: 100, y: 100, width: 400, height: 200 }, 0.01);
    expect(box.x).toBeGreaterThan(100);
    expect(box.width).toBeLessThan(400);
  });

  it('never inverts a small box', () => {
    const box = insetBox({ x: 0, y: 0, width: 2, height: 2 }, 0.5);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe('hasDarkSurround', () => {
  const framed = (width: number, height: number, inside: number, outside: number) => {
    const grey = new Uint8Array(width * height).fill(outside);
    const margin = Math.round(Math.min(width, height) * 0.15);
    for (let y = margin; y < height - margin; y++) {
      for (let x = margin; x < width - margin; x++) grey[y * width + x] = inside;
    }
    return grey;
  };

  it('sees the table a sheet is lying on', () => {
    expect(hasDarkSurround(framed(200, 150, 230, 30), 200, 150, 128)).toBe(true);
  });

  it('sees nothing around a sheet that fills the frame', () => {
    const grey = new Uint8Array(200 * 150).fill(230);
    expect(hasDarkSurround(grey, 200, 150, 128)).toBe(false);
  });

  it('is not fooled by a printed rule crossing the edge', () => {
    // A crop of one row: paper to the edges, with the row's own borders in it.
    const width = 300;
    const height = 60;
    const grey = new Uint8Array(width * height).fill(230);
    for (let x = 0; x < width; x++) {
      grey[2 * width + x] = 20;
      grey[57 * width + x] = 20;
    }
    expect(hasDarkSurround(grey, width, height, 128)).toBe(false);
  });
});
