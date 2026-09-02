import { describe, expect, it } from 'vitest';
import { reticleFor, rowInReticle, snapReticle } from '../src/lib/reticle';
import type { RowBox } from '../src/lib/ocr/rows';

describe('reticleFor', () => {
  it('is a long shallow bar across the middle of the preview', () => {
    const bar = reticleFor({ width: 390, height: 520 });
    expect(bar.width).toBeCloseTo(351);
    expect(bar.width / bar.height).toBeGreaterThan(4);
    // Centred, so the phone can be held naturally.
    expect(bar.y + bar.height / 2).toBeCloseTo(260);
  });

  it('stays tall enough to aim at on a wide preview', () => {
    // A short bar on a small screen is impossible to line a row up inside.
    expect(reticleFor({ width: 200, height: 400 }).height).toBeGreaterThanOrEqual(56);
  });

  it('never swallows the rows above and below the one meant', () => {
    const box = { width: 900, height: 200 };
    expect(reticleFor(box).height).toBeLessThanOrEqual(box.height * 0.4);
  });
});

describe('rowInReticle', () => {
  const bar = { x: 10, y: 100, width: 300, height: 60 };
  const row = (extra: Partial<RowBox>): RowBox => ({
    x: 12,
    y: 110,
    width: 290,
    height: 40,
    dividers: 11,
    slope: 0,
    confidence: 0.9,
    ...extra,
  });

  it('locks on to a row lying in the bar', () => {
    expect(rowInReticle([row({})], bar)).not.toBeNull();
  });

  it('ignores a row somewhere else on the sheet', () => {
    expect(rowInReticle([row({ y: 300 })], bar)).toBeNull();
  });

  it('refuses a row only half inside the bar', () => {
    // Cropping this would cut the game in two.
    expect(rowInReticle([row({ y: 135, height: 60 })], bar)).toBeNull();
  });

  it('refuses a row too narrow to be the whole game', () => {
    expect(rowInReticle([row({ x: 12, width: 80 })], bar)).toBeNull();
  });

  it('takes the row nearest the middle of the bar', () => {
    // The middle is where the bowler aimed.
    const chosen = rowInReticle(
      [row({ y: 105, height: 20 }), row({ y: 118, height: 24, dividers: 12 })],
      bar,
    );
    expect(chosen?.dividers).toBe(12);
  });

  it('does not prefer a sliver to the row it is printed inside', () => {
    // The strip of frame numbers along the top of a row is inside the bar
    // perfectly, and the row itself is not. Choosing by containment chose the
    // strip every time, and the scan came back with no marks on it.
    const numbering = row({ y: 112, height: 6, dividers: 12 });
    const whole = row({ y: 110, height: 40 });
    expect(rowInReticle([numbering, whole], bar)?.height).toBe(40);
  });

  it('finds nothing when nothing was detected', () => {
    expect(rowInReticle([], bar)).toBeNull();
  });
});

describe('snapReticle', () => {
  const bar = { x: 10, y: 100, width: 300, height: 60 };
  const row: RowBox = {
    x: 12,
    y: 118,
    width: 290,
    height: 24,
    dividers: 11,
    slope: 0,
    confidence: 0.9,
  };

  it('leaves the bar alone when nothing locked', () => {
    expect(snapReticle(bar, null)).toEqual(bar);
  });

  it('centres the bar on the row without resizing it', () => {
    // The lock says where the row is; the bar still says how much to take. A
    // lock that resized the crop shrank it to the sliver it had found.
    const snapped = snapReticle(bar, row);
    expect(snapped.height).toBe(bar.height);
    expect(snapped.width).toBe(bar.width);
    expect(snapped.x).toBe(bar.x);
    expect(snapped.y + snapped.height / 2).toBeCloseTo(130);
  });

  it('keeps the whole row inside the bar, borders and all', () => {
    const snapped = snapReticle(bar, row);
    expect(snapped.y).toBeLessThan(row.y);
    expect(snapped.y + snapped.height).toBeGreaterThan(row.y + row.height);
  });
});
