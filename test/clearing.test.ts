import { describe, expect, it } from 'vitest';
import { clearingIsStrike } from '../src/lib/scoring';

/**
 * "Would clearing the deck right now be a strike?"
 *
 * The play screen asked "are ten pins standing" instead, and a gutter ball
 * leaves ten standing — so knocking them all down with the second ball was
 * announced as a strike on the button, on the commit and in the shout. The
 * score was written down correctly the whole time; only the words were wrong.
 */
describe('clearingIsStrike', () => {
  it('is a strike on the first ball of a frame', () => {
    expect(clearingIsStrike([])).toBe(true);
    expect(clearingIsStrike([10])).toBe(true);
    expect(clearingIsStrike([7, 2])).toBe(true);
  });

  it('is a spare on the second ball, even after a gutter', () => {
    // The bug, exactly: ten pins standing and it is still not a strike.
    expect(clearingIsStrike([0])).toBe(false);
    expect(clearingIsStrike([7])).toBe(false);
    expect(clearingIsStrike([9])).toBe(false);
  });

  it('is a spare on the second ball of the tenth after an open first', () => {
    const nine = [10, 10, 10, 10, 10, 10, 10, 10, 10];
    expect(clearingIsStrike([...nine, 0])).toBe(false);
    expect(clearingIsStrike([...nine, 4])).toBe(false);
  });

  it('is a strike again in the tenth once the rack is fresh', () => {
    const nine = [10, 10, 10, 10, 10, 10, 10, 10, 10];
    // Second ball behind a strike: a new rack.
    expect(clearingIsStrike([...nine, 10])).toBe(true);
    // Third ball behind two strikes: another new rack.
    expect(clearingIsStrike([...nine, 10, 10])).toBe(true);
    // Third ball behind a spare: also a new rack.
    expect(clearingIsStrike([...nine, 4, 6])).toBe(true);
  });

  it('is a spare on the tenth third ball when it follows an open count', () => {
    const nine = [10, 10, 10, 10, 10, 10, 10, 10, 10];
    // X then 7 leaves three standing; clearing those is a spare.
    expect(clearingIsStrike([...nine, 10, 7])).toBe(false);
  });

  it('is neither once the game is over', () => {
    expect(clearingIsStrike(Array(12).fill(10))).toBe(false);
  });
});
