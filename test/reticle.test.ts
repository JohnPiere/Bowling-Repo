import { describe, expect, it } from 'vitest';
import { reticleFor, rowInReticle } from '../src/lib/reticle';
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

  it('takes the row most fully inside the bar', () => {
    const chosen = rowInReticle(
      [row({ y: 105, height: 55 }), row({ y: 112, height: 36, dividers: 12 })],
      bar,
    );
    expect(chosen?.dividers).toBe(12);
  });

  it('finds nothing when nothing was detected', () => {
    expect(rowInReticle([], bar)).toBeNull();
  });
});
