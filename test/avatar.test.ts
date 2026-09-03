import { describe, expect, it } from 'vitest';
import { dataUrlBytes, MAX_DATA_URL, squareCrop, withinBudget } from '../src/lib/avatar';

describe('squareCrop', () => {
  it('takes the middle of a landscape picture', () => {
    // Not the left-hand square: a phone photograph of a person has the face
    // somewhere in the middle third, and the edges are whatever was behind them.
    expect(squareCrop(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
  });

  it('takes the middle of a portrait picture', () => {
    expect(squareCrop(300, 400)).toEqual({ x: 0, y: 50, side: 300 });
  });

  it('leaves a square alone', () => {
    expect(squareCrop(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });

  it('rounds to whole pixels rather than half of one', () => {
    const crop = squareCrop(301, 300);
    expect(Number.isInteger(crop.x)).toBe(true);
    expect(crop.side).toBe(300);
  });

  it('has nothing to crop out of nothing', () => {
    expect(squareCrop(0, 0).side).toBe(0);
  });
});

describe('withinBudget', () => {
  it('accepts a small picture', () => {
    expect(withinBudget('data:image/webp;base64,' + 'A'.repeat(1000))).toBe(true);
  });

  it('refuses one that would not fit beside the rest of the profile', () => {
    // The bound is load-bearing: preferences are written as one object, so an
    // oversized picture would take the bowler's name and language down with it.
    expect(withinBudget('data:image/webp;base64,' + 'A'.repeat(MAX_DATA_URL))).toBe(false);
  });
});

describe('dataUrlBytes', () => {
  it('reads the size of the image rather than the length of the string', () => {
    // "AAAA" is four base64 characters, which is three bytes.
    expect(dataUrlBytes('data:image/webp;base64,AAAA')).toBe(3);
  });

  it('discounts the padding', () => {
    expect(dataUrlBytes('data:image/webp;base64,AAA=')).toBe(2);
    expect(dataUrlBytes('data:image/webp;base64,AA==')).toBe(1);
  });

  it('says nothing about a string that is not a data URL', () => {
    expect(dataUrlBytes('not a data url')).toBe(0);
  });
});
