import { describe, expect, it } from 'vitest';
import {
  frameMarks,
  isGameComplete,
  isValidRolls,
  pinsAvailable,
  scoreGame,
} from '../src/lib/scoring';

const roll = (times: number, pins: number) => Array<number>(times).fill(pins);

describe('scoreGame', () => {
  it('scores a perfect game as 300', () => {
    const card = scoreGame(roll(12, 10));
    expect(card.total).toBe(300);
    expect(card.isComplete).toBe(true);
  });

  it('scores all spares with a five count as 150', () => {
    const card = scoreGame(roll(21, 5));
    expect(card.total).toBe(150);
  });

  it('scores an all-open game', () => {
    const card = scoreGame(roll(20, 4));
    expect(card.total).toBe(80);
  });

  it('scores a gutter game as 0', () => {
    expect(scoreGame(roll(20, 0)).total).toBe(0);
  });

  it('carries strike bonuses across frames', () => {
    // X 9/ 5 ... => 20 + 15 + 5
    const card = scoreGame([10, 9, 1, 5, 0]);
    expect(card.frames[0].score).toBe(20);
    expect(card.frames[1].score).toBe(35);
    expect(card.frames[2].score).toBe(40);
  });

  it('leaves a frame unscored while its bonus balls are pending', () => {
    const card = scoreGame([10]);
    expect(card.frames[0].score).toBeNull();
    expect(card.isComplete).toBe(false);
  });

  it('stops the running total at the first unscorable frame', () => {
    const card = scoreGame([3, 4, 10]);
    expect(card.frames[0].score).toBe(7);
    expect(card.frames[1].score).toBeNull();
    expect(card.frames[2].score).toBeNull();
    expect(card.total).toBe(7);
  });

  it('gives the tenth frame three balls after a mark', () => {
    const nine = roll(18, 0);
    expect(scoreGame([...nine, 10, 10, 10]).total).toBe(30);
    expect(scoreGame([...nine, 5, 5, 10]).total).toBe(20);
  });

  it('gives the tenth frame two balls when it is left open', () => {
    const card = scoreGame([...roll(18, 0), 4, 5]);
    expect(card.total).toBe(9);
    expect(card.isComplete).toBe(true);
  });
});

describe('pinsAvailable', () => {
  it('offers a full rack on the first ball of a frame', () => {
    expect(pinsAvailable([])).toBe(10);
    expect(pinsAvailable([10])).toBe(10);
  });

  it('offers only the standing pins on a second ball', () => {
    expect(pinsAvailable([3])).toBe(7);
  });

  it('resets the rack in the tenth after a strike', () => {
    const nine = roll(18, 0);
    expect(pinsAvailable([...nine, 10])).toBe(10);
    expect(pinsAvailable([...nine, 10, 4])).toBe(6);
    expect(pinsAvailable([...nine, 5, 5])).toBe(10);
  });

  it('offers nothing once the game is over', () => {
    expect(pinsAvailable(roll(12, 10))).toBe(0);
  });
});

describe('isValidRolls', () => {
  it('rejects more pins than a frame holds', () => {
    expect(isValidRolls([7, 5])).toBe(false);
  });

  it('rejects counts outside 0..10', () => {
    expect(isValidRolls([11])).toBe(false);
    expect(isValidRolls([-1])).toBe(false);
  });

  it('accepts a legal game', () => {
    expect(isValidRolls(roll(12, 10))).toBe(true);
    expect(isValidRolls([7, 3, 10, 0, 9])).toBe(true);
  });
});

describe('isGameComplete', () => {
  it('is false mid-game and true at the end', () => {
    expect(isGameComplete([])).toBe(false);
    expect(isGameComplete(roll(20, 4))).toBe(true);
    expect(isGameComplete(roll(12, 10))).toBe(true);
  });
});

describe('frameMarks', () => {
  it('renders strikes, spares and misses the way a sheet does', () => {
    const card = scoreGame([10, 9, 1, 0, 4]);
    expect(frameMarks(card.frames[0])).toEqual(['X']);
    expect(frameMarks(card.frames[1])).toEqual(['9', '/']);
    expect(frameMarks(card.frames[2])).toEqual(['-', '4']);
  });
});
