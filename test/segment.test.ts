import { describe, expect, it } from 'vitest';
import {
  estimateShear,
  findHorizontalRules,
  findMarkBand,
  findRules,
  findSheetBounds,
  looksLikeMarks,
  toBands,
  idealRules,
  projectColumns,
  projectRows,
  regularity,
  toFrameCells,
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

describe('projectColumns', () => {
  it('counts dark pixels per column', () => {
    const { binary, width, height } = sheet(10, 8, { ruleColumns: [3] });
    const projection = projectColumns(binary, width, height);
    expect(projection[3]).toBe(8);
    expect(projection[2]).toBe(0);
  });
});

describe('projectRows', () => {
  it('counts dark pixels per row', () => {
    const { binary, width, height } = sheet(10, 8, { dividerRow: 5 });
    expect(projectRows(binary, width, height)[5]).toBe(10);
    expect(projectRows(binary, width, height)[4]).toBe(0);
  });
});

describe('findRules', () => {
  it('finds full-height rules', () => {
    const { binary, width, height } = sheet(60, 40, { ruleColumns: [10, 30, 50] });
    const rules = findRules(projectColumns(binary, width, height), height);
    expect(rules).toEqual([10, 30, 50]);
  });

  it('collapses a thick rule to its centre', () => {
    const { binary, width, height } = sheet(60, 40, { ruleColumns: [20, 21, 22] });
    expect(findRules(projectColumns(binary, width, height), height)).toEqual([21]);
  });

  it('ignores ink that does not run the height', () => {
    // A mark is tall-ish but nowhere near a full rule.
    const { binary, width, height } = sheet(60, 40, {
      ruleColumns: [10],
      blobs: [{ x: 30, y: 5, w: 3, h: 8 }],
    });
    expect(findRules(projectColumns(binary, width, height), height)).toEqual([10]);
  });

  it('finds nothing on a blank sheet', () => {
    const { binary, width, height } = sheet(60, 40);
    expect(findRules(projectColumns(binary, width, height), height)).toEqual([]);
  });

  it('finds rules on a sheet that fills only part of the photo', () => {
    // The regression this guards: a photographed sheet has margin above and
    // below, so its rules are far shorter than the image and a threshold
    // anchored to image height finds nothing at all.
    const { binary, width, height } = sheet(330, 400, {
      ruleColumns: idealRules(300).map((x) => x + 15),
      ruleTop: 130,
      ruleHeight: 150,
    });
    expect(findRules(projectColumns(binary, width, height), height).length).toBe(11);
  });
});

describe('estimateShear', () => {
  it('is about zero for a square sheet', () => {
    const { binary, width, height } = sheet(330, 200, {
      ruleColumns: idealRules(300).map((x) => x + 15),
      ruleTop: 25,
      ruleHeight: 150,
    });
    expect(Math.abs(estimateShear(binary, width, height))).toBeLessThan(0.01);
  });

  it('recovers a tilted sheet so its rules project as spikes', () => {
    const tilted = sheet(330, 260, {
      ruleColumns: idealRules(300).map((x) => x + 15),
      ruleTop: 55,
      ruleHeight: 150,
      rotate: 1.6,
    });

    const shear = estimateShear(tilted.binary, tilted.width, tilted.height);
    const straight = projectColumns(tilted.binary, tilted.width, tilted.height, shear);
    const asIs = projectColumns(tilted.binary, tilted.width, tilted.height);

    // A tilt spreads each rule's ink over several columns. Deskewing puts it
    // back into one, which is what turns a smear into a spike — on a real
    // photo, with marks competing, that is the difference between finding the
    // grid and not.
    expect(Math.max(...straight)).toBeGreaterThan(Math.max(...asIs));
    expect(findRules(straight, tilted.height).length).toBeGreaterThanOrEqual(10);
  });
});

describe('regularity', () => {
  it('scores evenly spaced positions as 1', () => {
    expect(regularity([0, 10, 20, 30, 40])).toBe(1);
  });

  it('scores uneven spacing lower', () => {
    expect(regularity([0, 2, 30, 33, 90])).toBeLessThan(0.5);
  });

  it('needs at least three positions', () => {
    expect(regularity([0, 10])).toBe(0);
  });
});

describe('toFrameCells', () => {
  it('cuts a well-ruled sheet into ten frames', () => {
    const grid = toFrameCells(idealRules(330), 330);
    expect(grid).not.toBeNull();
    expect(grid?.cells).toHaveLength(10);
    expect(grid?.regularity).toBeGreaterThan(0.9);
  });

  it('produces cells in order and without overlap', () => {
    const cells = toFrameCells(idealRules(330), 330)!.cells;
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].x0).toBeGreaterThan(cells[i - 1].x1);
    }
    expect(cells[0].x0).toBeGreaterThanOrEqual(0);
    expect(cells[9].x1).toBeLessThanOrEqual(330);
  });

  it('survives a missing rule by fitting the span', () => {
    // Drop the sixth rule, as a faint printed line would be.
    const rules = idealRules(330).filter((_, i) => i !== 5);
    const grid = toFrameCells(rules, 330);
    expect(grid?.cells).toHaveLength(10);
  });

  it('refuses too few rules to be a sheet', () => {
    expect(toFrameCells([10, 50, 90], 330)).toBeNull();
  });

  it('refuses rules crowded into one corner', () => {
    const crowded = Array.from({ length: 11 }, (_, i) => i * 8);
    expect(toFrameCells(crowded, 330)).toBeNull();
  });

  it('refuses a badly irregular grid', () => {
    const ragged = [0, 4, 9, 60, 63, 140, 141, 200, 260, 300, 330];
    expect(toFrameCells(ragged, 330)).toBeNull();
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

describe('findMarkBand', () => {
  const bounds = { top: 10, bottom: 110 };

  it('cuts at the rule dividing marks from the running total', () => {
    const width = 200;
    const height = 120;
    const binary = new Uint8Array(width * height);
    for (const y of [10, 70, 110]) {
      for (let x = 0; x < width; x++) binary[y * width + x] = 1;
    }
    const rows = projectRows(binary, width, height);
    expect(findMarkBand(rows, width, bounds)).toEqual({ top: 10, bottom: 70 });
  });

  it('ignores the sheet borders themselves', () => {
    const width = 200;
    const height = 120;
    const binary = new Uint8Array(width * height);
    // Only the two borders, no interior divider.
    for (const y of [10, 110]) {
      for (let x = 0; x < width; x++) binary[y * width + x] = 1;
    }
    const rows = projectRows(binary, width, height);
    // No interior rule is a legitimate sheet: keep the whole band.
    expect(findMarkBand(rows, width, bounds)).toEqual({ top: 10, bottom: 110 });
  });

  it('refuses a band too short to hold marks', () => {
    expect(findMarkBand(new Array(120).fill(0), 200, { top: 10, bottom: 15 })).toBeNull();
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

