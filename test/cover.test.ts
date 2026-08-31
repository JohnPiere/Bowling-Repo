import { describe, expect, it } from 'vitest';
import { coverFit, projectRect, unprojectPoint } from '../src/lib/cover';

describe('coverFit', () => {
  it('scales a wide frame to fill a tall box, cropping the sides', () => {
    const fit = coverFit({ width: 1920, height: 1080 }, { width: 300, height: 400 });
    expect(fit.scale).toBeCloseTo(400 / 1080);
    // The frame is wider than the box once scaled, so it hangs off both sides.
    expect(fit.x).toBeLessThan(0);
    expect(fit.y).toBeCloseTo(0);
  });

  it('scales a tall frame to fill a wide box', () => {
    const fit = coverFit({ width: 1080, height: 1920 }, { width: 400, height: 300 });
    expect(fit.scale).toBeCloseTo(400 / 1080);
    expect(fit.x).toBeCloseTo(0);
    expect(fit.y).toBeLessThan(0);
  });

  it('is the identity for a frame that already fits', () => {
    expect(coverFit({ width: 100, height: 50 }, { width: 100, height: 50 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it('survives a frame with no size yet', () => {
    expect(coverFit({ width: 0, height: 0 }, { width: 100, height: 100 }).scale).toBe(1);
  });
});

describe('projectRect and unprojectPoint', () => {
  const fit = coverFit({ width: 320, height: 240 }, { width: 400, height: 400 });

  it('places a rectangle where the video shows it', () => {
    const rect = projectRect({ x: 0, y: 0, width: 320, height: 240 }, fit);
    expect(rect.width).toBeCloseTo(400 * (400 / 240) * (320 / 400));
    expect(rect.y).toBeCloseTo(fit.y);
  });

  it('round-trips a point back to the frame it came from', () => {
    const rect = projectRect({ x: 40, y: 90, width: 10, height: 10 }, fit);
    const back = unprojectPoint({ x: rect.x, y: rect.y }, fit);
    expect(back.x).toBeCloseTo(40);
    expect(back.y).toBeCloseTo(90);
  });
});
