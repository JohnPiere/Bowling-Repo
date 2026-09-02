import { describe, expect, it } from 'vitest';
import {
  fitFrameGrid,
  findHorizontalRules,
  findSheetBounds,
  idealRules,
  looksLikeFrameNumbers,
  looksLikeMarks,
  marksWithin,
  projectRows,
  ruleCoverage,
  toBands,
} from '../src/lib/ocr/segment';

/** Draw a synthetic score sheet: vertical rules, plus optional ink blobs. */
function sheet(
  width: number,
  height: number,
  options: {
    ruleColumns?: number[];
    ruleHeight?: number;
    ruleTop?: number;
    /** Degrees; tilts the rules the way a hand-held photo does. */
    rotate?: number;
    dividerRow?: number;
    blobs?: { x: number; y: number; w: number; h: number }[];
  } = {},
) {
  const binary = new Uint8Array(width * height);
  const ruleTop = options.ruleTop ?? 0;
  const ruleHeight = options.ruleHeight ?? height;
  const tilt = Math.tan(((options.rotate ?? 0) * Math.PI) / 180);
  const midY = height / 2;

  for (const x of options.ruleColumns ?? []) {
    for (let y = ruleTop; y < ruleTop + ruleHeight && y < height; y++) {
      const shifted = Math.round(x + (y - midY) * tilt);
      if (shifted >= 0 && shifted < width) binary[y * width + shifted] = 1;
    }
  }

  if (options.dividerRow !== undefined) {
    for (let x = 0; x < width; x++) binary[options.dividerRow * width + x] = 1;
  }

  for (const blob of options.blobs ?? []) {
    for (let y = blob.y; y < blob.y + blob.h; y++) {
      for (let x = blob.x; x < blob.x + blob.w; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) binary[y * width + x] = 1;
      }
    }
  }

  return { binary, width, height };
}

describe('projectRows', () => {
  it('counts dark pixels per row', () => {
    const { binary, width, height } = sheet(10, 8, { dividerRow: 5 });
    expect(projectRows(binary, width, height)[5]).toBe(10);
    expect(projectRows(binary, width, height)[4]).toBe(0);
  });
});

describe('ruleCoverage', () => {
  const band = { top: 5, bottom: 45 };

  it('measures how much of the band a column is inked over', () => {
    const { binary, width } = sheet(60, 50, { ruleColumns: [10], ruleTop: 5, ruleHeight: 41 });
    expect(ruleCoverage(binary, width, band)[10]).toBe(41);
    expect(ruleCoverage(binary, width, band)[30]).toBe(0);
  });

  it('scores a rule broken by thresholding for what is left of it', () => {
    // A printed rule under alley lighting comes through in pieces. Counting
    // the longest unbroken piece throws away most of the evidence that it is
    // a rule at all.
    const width = 60;
    const binary = new Uint8Array(width * 50);
    for (let y = 5; y <= 45; y++) if (y % 3 !== 0) binary[y * width + 10] = 1;
    expect(ruleCoverage(binary, width, band)[10]).toBeGreaterThan(25);
  });

  it('forgives a rule that drifts by a pixel', () => {
    // Straightening and scaling leave a rule very slightly off vertical.
    const width = 60;
    const binary = new Uint8Array(width * 50);
    for (let y = 5; y <= 45; y++) binary[y * width + 10 + (y > 25 ? 1 : 0)] = 1;
    expect(ruleCoverage(binary, width, band)[10]).toBe(41);
  });

  it('is unmoved by the ink around it', () => {
    const { binary, width } = sheet(60, 50, {
      ruleColumns: [10],
      ruleTop: 5,
      ruleHeight: 41,
      blobs: [{ x: 30, y: 10, w: 3, h: 8 }],
    });
    const coverage = ruleCoverage(binary, width, band);
    expect(coverage[31]).toBe(8);
    expect(coverage[10]).toBe(41);
  });
});

describe('fitFrameGrid', () => {
  /** Where a row of ten frames rules a 330-wide crop, with margin either side. */
  const RULES = idealRules(300).map((x) => x + 15);

  /** Coverage as a well-ruled row of ten frames would produce it. */
  const ruled = (width: number, bandHeight: number, rules = RULES) => {
    const coverage = new Array<number>(width).fill(0);
    for (const x of rules) if (x < width) coverage[x] = bandHeight;
    return coverage;
  };

  it('cuts a well-ruled row into ten frames', () => {
    const grid = fitFrameGrid(ruled(330, 40), 330, 40);
    expect(grid?.cells).toHaveLength(10);
    expect(grid?.certainty).toBeGreaterThan(0.9);
  });

  it('produces cells in order and without overlap', () => {
    const cells = fitFrameGrid(ruled(330, 40), 330, 40)!.cells;
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].x0).toBeGreaterThan(cells[i - 1].x1);
    }
    expect(cells[0].x0).toBeGreaterThanOrEqual(0);
    expect(cells[9].x1).toBeLessThanOrEqual(330);
  });

  it('places the rules that thresholding lost', () => {
    // Half the grid gone, which is an ordinary photograph of a printed sheet.
    const grid = fitFrameGrid(ruled(330, 40, RULES.filter((_, i) => i % 2 === 0)), 330, 40);
    expect(grid?.cells).toHaveLength(10);
    // The second frame still starts where its rule would have been.
    expect(grid!.cells[1].x0).toBeGreaterThan(RULES[1] - 4);
    expect(grid!.cells[1].x0).toBeLessThan(RULES[1] + 6);
  });

  it('does not fit the mark boxes printed inside each frame', () => {
    // This is the failure it exists to prevent: a box drawn inside every frame
    // offers a grid of twice as many rules, fits perfectly, and puts every
    // frame boundary through the middle of a frame.
    const coverage = ruled(330, 40);
    // …and a half-height box border halfway through each frame.
    for (const x of RULES) if (x + 15 < 330) coverage[x + 15] = 22;

    const grid = fitFrameGrid(coverage, 330, 40)!;
    expect(grid.cells[0].x1 - grid.cells[0].x0).toBeGreaterThan(20);
  });

  it('is not dragged along by a column of stacked digits', () => {
    // A totals column beyond the tenth frame carries far more ink than a rule,
    // and uncapped it drags the whole comb a frame to the right — every mark
    // then lands one frame along, which reads as a real game and is not one.
    const coverage = ruled(330, 40);
    coverage[325] = 400;

    const grid = fitFrameGrid(coverage, 330, 40)!;
    expect(grid.cells[0].x0).toBeLessThan(RULES[1]);
  });

  it('refuses a row with no grid to find', () => {
    expect(fitFrameGrid(new Array(330).fill(0), 330, 40)).toBeNull();
  });

  it('refuses rules crowded into one corner', () => {
    const coverage = new Array<number>(330).fill(0);
    for (let i = 0; i < 11; i++) coverage[i * 8] = 40;
    expect(fitFrameGrid(coverage, 330, 40)).toBeNull();
  });

  it('refuses a band too short to hold a row', () => {
    expect(fitFrameGrid(ruled(330, 4), 330, 4)).toBeNull();
  });
});

describe('findSheetBounds', () => {
  it('finds the sheet between its own horizontal borders', () => {
    const { binary, width, height } = sheet(200, 120, { dividerRow: 20 });
    // Add a second border lower down.
    for (let x = 0; x < 200; x++) binary[100 * 200 + x] = 1;
    const rows = projectRows(binary, width, height);
    expect(findSheetBounds(rows, width)).toEqual({ top: 20, bottom: 100 });
  });

  it('rejects an image with no borders', () => {
    const { binary, width, height } = sheet(200, 120);
    expect(findSheetBounds(projectRows(binary, width, height), width)).toBeNull();
  });

  it('rejects borders too close together to be a sheet', () => {
    const { binary, width, height } = sheet(200, 120, { dividerRow: 40 });
    for (let x = 0; x < 200; x++) binary[45 * 200 + x] = 1;
    expect(findSheetBounds(projectRows(binary, width, height), width)).toBeNull();
  });

  it('measures only the sheet columns, so margins do not weaken a border', () => {
    // A sheet occupying the middle half of a wide photo.
    const width = 400;
    const height = 120;
    const binary = new Uint8Array(width * height);
    for (const y of [20, 100]) {
      for (let x = 100; x < 300; x++) binary[y * width + x] = 1;
    }
    // Counting the whole width would put each border at half strength and
    // miss it; counting the sheet's own columns finds it.
    expect(findSheetBounds(projectRows(binary, width, height), width)).toBeNull();
    expect(findSheetBounds(projectRows(binary, width, height, 100, 300), 200)).toEqual({
      top: 20,
      bottom: 100,
    });
  });
});

describe('marksWithin', () => {
  const band = { top: 10, bottom: 110 };

  it('cuts at the boxes dividing marks from the running total', () => {
    const width = 200;
    const height = 120;
    const binary = new Uint8Array(width * height);
    for (const y of [10, 110]) for (let x = 0; x < width; x++) binary[y * width + x] = 1;
    // The divider is not a rule across the sheet: it is a row of little boxes,
    // one per frame, so it covers half the width and no more.
    for (let x = 0; x < width; x += 2) binary[70 * width + x] = 1;

    const rows = projectRows(binary, width, height);
    expect(marksWithin(rows, band)).toEqual({ top: 10, bottom: 70 });
  });

  it('keeps a band with nothing dividing it', () => {
    const width = 200;
    const height = 120;
    const binary = new Uint8Array(width * height);
    for (const y of [10, 110]) for (let x = 0; x < width; x++) binary[y * width + x] = 1;

    const rows = projectRows(binary, width, height);
    expect(marksWithin(rows, band)).toEqual(band);
  });

  it('is not fooled by a band of ordinary writing', () => {
    const width = 200;
    const height = 120;
    const binary = new Uint8Array(width * height);
    for (const y of [10, 110]) for (let x = 0; x < width; x++) binary[y * width + x] = 1;
    // Digits across the whole band, thickest in the middle of a glyph.
    for (let y = 30; y < 90; y++) for (let x = 0; x < 40; x++) binary[y * width + x] = 1;

    const rows = projectRows(binary, width, height);
    expect(marksWithin(rows, band)).toEqual(band);
  });

  it('leaves a band too short to divide alone', () => {
    expect(marksWithin(new Array(120).fill(0), { top: 10, bottom: 15 })).toEqual({
      top: 10,
      bottom: 15,
    });
  });
});

describe('findHorizontalRules', () => {
  /** A sheet with `count` full-width rules at the given rows. */
  const ruled = (width: number, height: number, rows: number[]) => {
    const binary = new Uint8Array(width * height);
    for (const y of rows) {
      for (let x = 0; x < width; x++) binary[y * width + x] = 1;
    }
    return { binary, width, height };
  };

  it('finds every rule between the sheet borders', () => {
    const { binary, width, height } = ruled(200, 200, [10, 50, 90, 130, 170]);
    const rows = projectRows(binary, width, height);
    const rules = findHorizontalRules(rows, width, { top: 10, bottom: 170 });
    expect(rules).toEqual([10, 50, 90, 130, 170]);
  });

  it('ignores anything outside the sheet', () => {
    const { binary, width, height } = ruled(200, 200, [2, 10, 50, 90, 195]);
    const rows = projectRows(binary, width, height);
    expect(findHorizontalRules(rows, width, { top: 10, bottom: 90 })).toEqual([10, 50, 90]);
  });

  it('collapses a thick rule to its centre', () => {
    const { binary, width, height } = ruled(200, 200, [40, 41, 42]);
    const rows = projectRows(binary, width, height);
    expect(findHorizontalRules(rows, width, { top: 0, bottom: 199 })).toEqual([41]);
  });
});

describe('toBands', () => {
  it('returns the gap between each pair of rules', () => {
    expect(toBands([10, 50, 90])).toEqual([
      { top: 10, bottom: 50 },
      { top: 50, bottom: 90 },
    ]);
  });

  it('drops bands too thin to hold anything', () => {
    // 10..14 is four rows: ruling, not content.
    expect(toBands([10, 14, 60])).toEqual([{ top: 14, bottom: 60 }]);
  });

  it('returns nothing for fewer than two rules', () => {
    expect(toBands([10])).toEqual([]);
    expect(toBands([])).toEqual([]);
  });
});

describe('looksLikeMarks', () => {
  it('recognises a row with strikes or spares', () => {
    expect(looksLikeMarks('X 9/ 72 X X')).toBe(true);
    expect(looksLikeMarks('5/ 5/ 5/')).toBe(true);
  });

  it('rejects a row of running totals', () => {
    expect(looksLikeMarks('20 37 46 74 92 100 120 139 148 178')).toBe(false);
  });

  it('keeps an all-open game, which has no marks to find', () => {
    // Pin counts that fall as often as they rise are not running totals.
    expect(looksLikeMarks('44 53 71 62 44 35 80 44 53 62')).toBe(true);
  });

  it('does not mistake a couple of numbers for a totals row', () => {
    expect(looksLikeMarks('44 53')).toBe(true);
  });

  it('rejects totals even when they are read imperfectly', () => {
    expect(looksLikeMarks('20 37 46 74 92')).toBe(false);
  });
});

describe('looksLikeFrameNumbers', () => {
  it('recognises the strip that numbers the frames', () => {
    const header = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    expect(looksLikeFrameNumbers(header)).toBe(true);
  });

  it('recognises it through the mistakes OCR makes on it', () => {
    // The tenth reads as "1" as often as "10", and the first is easily lost.
    expect(looksLikeFrameNumbers(['', '2', '3', '4', '5', '6', '7', '8', '9', '1'])).toBe(true);
  });

  it('leaves a game alone, however tidy', () => {
    expect(looksLikeFrameNumbers(['9/', '81', 'X', '7-', '90', 'X', '5/', '63', 'X', 'XX9'])).toBe(
      false,
    );
  });

  it('leaves a game that opens 1 2 3 alone', () => {
    // Three frames agreeing with their own number is a coincidence, not a
    // header — and a header is ten of them.
    expect(looksLikeFrameNumbers(['1', '2', '3', '72', '81', '9-', '45', '63', 'X', '9/'])).toBe(
      false,
    );
  });

  it('needs a row long enough to be a sheet', () => {
    expect(looksLikeFrameNumbers(['1', '2', '3'])).toBe(false);
  });
});

describe('findHorizontalRules — a photographed sheet', () => {
  /**
   * Straightening resamples the image, so a rule that was one solid row
   * becomes two rows at roughly half strength. A threshold anchored to the
   * sheet width misses those; one anchored to the strongest row does not.
   */
  const blurred = (width: number, height: number, rows: number[]) => {
    const binary = new Uint8Array(width * height);
    for (const y of rows) {
      for (let x = 0; x < width; x++) {
        // Half the pixels on each of two adjacent rows.
        if (x % 2 === 0) binary[y * width + x] = 1;
        else binary[(y + 1) * width + x] = 1;
      }
    }
    return { binary, width, height };
  };

  it('finds rules that resampling has spread and weakened', () => {
    const { binary, width, height } = blurred(200, 200, [10, 60, 110]);
    const rows = projectRows(binary, width, height);
    const rules = findHorizontalRules(rows, width, { top: 8, bottom: 130 });
    expect(rules).toHaveLength(3);
  });

  it('still finds nothing on a blank sheet', () => {
    const binary = new Uint8Array(200 * 200);
    const rows = projectRows(binary, 200, 200);
    expect(findHorizontalRules(rows, 200, { top: 0, bottom: 199 })).toEqual([]);
  });

  it('does not promote scattered ink into a rule', () => {
    const width = 200;
    const height = 200;
    const binary = new Uint8Array(width * height);
    // One real rule, plus a band of marks covering a tenth of the width.
    for (let x = 0; x < width; x++) binary[100 * width + x] = 1;
    for (let y = 40; y < 60; y++) {
      for (let x = 0; x < 20; x++) binary[y * width + x] = 1;
    }
    const rows = projectRows(binary, width, height);
    expect(findHorizontalRules(rows, width, { top: 0, bottom: 199 })).toEqual([100]);
  });
});

