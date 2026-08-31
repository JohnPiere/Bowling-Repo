import { describe, expect, it } from 'vitest';
import { boxFrom, clampBox, defaultBox, isUsable, moveBox, resizeBox } from '../src/lib/region';

const bounds = { width: 400, height: 300 };

describe('boxFrom', () => {
  it('makes a box from two corners', () => {
    expect(boxFrom({ x: 10, y: 20 }, { x: 110, y: 60 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
  });

  it('does not care which way the drag went', () => {
    expect(boxFrom({ x: 110, y: 60 }, { x: 10, y: 20 })).toEqual(
      boxFrom({ x: 10, y: 20 }, { x: 110, y: 60 }),
    );
  });
});

describe('clampBox', () => {
  it('leaves a box that already fits alone', () => {
    const box = { x: 10, y: 10, width: 100, height: 50 };
    expect(clampBox(box, bounds)).toEqual(box);
  });

  it('slides a box back inside rather than shrinking it', () => {
    expect(clampBox({ x: 380, y: 10, width: 100, height: 50 }, bounds)).toEqual({
      x: 300,
      y: 10,
      width: 100,
      height: 50,
    });
  });

  it('shrinks a box too big for the picture', () => {
    expect(clampBox({ x: -20, y: 0, width: 500, height: 50 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 50,
    });
  });
});

describe('moveBox', () => {
  it('drags the box with the pointer', () => {
    expect(moveBox({ x: 10, y: 10, width: 100, height: 50 }, { x: 25, y: -5 }, bounds)).toEqual({
      x: 35,
      y: 5,
      width: 100,
      height: 50,
    });
  });

  it('stops at the edge of the picture', () => {
    expect(moveBox({ x: 10, y: 10, width: 100, height: 50 }, { x: -50, y: 0 }, bounds).x).toBe(0);
  });
});

describe('resizeBox', () => {
  const box = { x: 100, y: 100, width: 200, height: 80 };

  it('moves the corner dragged and leaves the opposite one', () => {
    const next = resizeBox(box, 'se', { x: 350, y: 200 }, bounds);
    expect(next).toEqual({ x: 100, y: 100, width: 250, height: 100 });
  });

  it('grows up and to the left from the north-west corner', () => {
    const next = resizeBox(box, 'nw', { x: 40, y: 60 }, bounds);
    expect(next).toEqual({ x: 40, y: 60, width: 260, height: 120 });
  });

  it('keeps a minimum size rather than turning inside out', () => {
    const next = resizeBox(box, 'se', { x: 20, y: 20 }, bounds);
    expect(next.width).toBe(24);
    expect(next.height).toBe(24);
    expect(next.x).toBe(100);
  });

  it('does not let a corner leave the picture', () => {
    const next = resizeBox(box, 'se', { x: 900, y: 900 }, bounds);
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.width);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.height);
  });
});

describe('defaultBox', () => {
  it('starts as a row-shaped strip across the middle', () => {
    const box = defaultBox(bounds);
    expect(box.width / box.height).toBeGreaterThan(4);
    expect(box.x + box.width / 2).toBeCloseTo(bounds.width / 2);
    expect(box.y + box.height / 2).toBeCloseTo(bounds.height / 2);
    expect(isUsable(box)).toBe(true);
  });

  it('fits inside a picture that is wider than it is tall', () => {
    const box = defaultBox({ width: 1000, height: 60 });
    expect(box.height).toBeLessThanOrEqual(60);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});

describe('isUsable', () => {
  it('rejects a box too small to hold a row', () => {
    expect(isUsable({ x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
