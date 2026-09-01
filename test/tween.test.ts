import { describe, expect, it } from 'vitest';
import { resample } from '../src/components/charts/useTweenedPoints';

const line = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 20, y: 20 },
];

describe('resample', () => {
  it('leaves a run that is already the right length alone', () => {
    expect(resample(line, 3)).toBe(line);
  });

  it('keeps both ends when stretching', () => {
    const out = resample(line, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[4]).toEqual({ x: 20, y: 20 });
  });

  it('samples between the points it was given', () => {
    // Halfway along a straight run is the midpoint of it.
    expect(resample(line, 5)[1]).toEqual({ x: 5, y: 5 });
  });

  it('keeps both ends when compressing', () => {
    const out = resample(line, 2);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ]);
  });

  it('spreads a single point across the whole run', () => {
    // Nowhere to interpolate from, so everything starts in the same place and
    // fans out on the first frame.
    expect(resample([{ x: 4, y: 7 }], 3)).toEqual([
      { x: 4, y: 7 },
      { x: 4, y: 7 },
      { x: 4, y: 7 },
    ]);
  });

  it('survives having nothing to sample', () => {
    expect(resample([], 2)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(resample(line, 0)).toEqual([]);
  });
});
