import { describe, expect, it } from 'vitest';
import { SERIES, seriesCardHeight, seriesFilename, seriesOrder } from '../src/lib/scorecard';
import type { Game } from '../src/lib/db';

/**
 * A night, rather than a game.
 *
 * The canvas cannot be drawn in this environment, so what is checked here is
 * everything the drawing depends on being right: the order the games go in, how
 * tall the card has to be, and the name the file carries into whatever it lands
 * in. A card that drew "Game 1" against the third game bowled would be wrong in
 * a way nobody would notice until they read their own screenshot.
 */

function game(total: number, playedAt: number): Game {
  return {
    id: `g${playedAt}`,
    bowler: 'You',
    rolls: [],
    total,
    isComplete: true,
    source: 'manual',
    playedAt,
    updatedAt: playedAt,
  };
}

describe('seriesOrder', () => {
  it('puts the games in the order they were bowled', () => {
    // "Game 1" on the card had better be the one bowled first.
    const night = [game(200, 3000), game(150, 1000), game(180, 2000)];
    expect(seriesOrder(night).map((one) => one.total)).toEqual([150, 180, 200]);
  });

  it('leaves the array it was given alone', () => {
    const night = [game(200, 3000), game(150, 1000)];
    seriesOrder(night);
    expect(night[0].total).toBe(200);
  });
});

describe('seriesCardHeight', () => {
  it('grows with the night rather than padding out to fit six', () => {
    expect(seriesCardHeight(3)).toBeLessThan(seriesCardHeight(6));
    expect(seriesCardHeight(6) - seriesCardHeight(3)).toBe(3 * SERIES.rowHeight);
  });

  it('is never shorter than a one-game card', () => {
    // A night that somehow has no games still has to be an image.
    expect(seriesCardHeight(0)).toBe(seriesCardHeight(1));
  });
});

describe('seriesFilename', () => {
  it('names the night by its date and its total', () => {
    const night = [
      game(200, new Date(2026, 5, 15, 21, 0).getTime()),
      game(150, new Date(2026, 5, 15, 19, 0).getTime()),
    ];
    expect(seriesFilename(night)).toMatch(/^lane-log-2026-06-15-series-350\.png$/);
  });

  it('dates it by the first game, not whichever came first in the array', () => {
    const night = [
      game(200, new Date(2026, 5, 16, 1, 0).getTime()),
      game(150, new Date(2026, 5, 15, 23, 0).getTime()),
    ];
    expect(seriesFilename(night)).toContain('2026-06-15');
  });
});
