import { describe, expect, it } from 'vitest';
import { ballStats, ballsOf, valuesUsed } from '../src/lib/stats';
import type { Game } from '../src/lib/db';

function game(over: Partial<Game>): Game {
  return {
    id: Math.random().toString(36).slice(2),
    bowler: 'You',
    rolls: Array(12).fill(10),
    total: 300,
    isComplete: true,
    source: 'manual',
    playedAt: Date.parse('2026-09-01T19:00:00Z'),
    updatedAt: Date.now(),
    ...over,
  };
}

describe('ballsOf', () => {
  it('reads a game saved before more than one could be named', () => {
    expect(ballsOf(game({ ball: 'Phaze II' }))).toEqual(['Phaze II']);
  });

  it('prefers the list once a game has one', () => {
    expect(ballsOf(game({ ball: 'Old', balls: ['Phaze II', 'Spare Ball'] }))).toEqual([
      'Phaze II',
      'Spare Ball',
    ]);
  });

  it('is empty for a game that named none', () => {
    expect(ballsOf(game({}))).toEqual([]);
    expect(ballsOf(game({ balls: [] }))).toEqual([]);
  });
});

describe('ballStats with more than one ball a game', () => {
  it('counts a game in every ball it names', () => {
    const stats = ballStats([
      game({ balls: ['Phaze II', 'Spare Ball'], total: 200 }),
      game({ balls: ['Phaze II'], total: 160 }),
    ]);

    const phaze = stats.find((one) => one.name === 'Phaze II')!;
    const spare = stats.find((one) => one.name === 'Spare Ball')!;

    expect(phaze.games).toBe(2);
    expect(phaze.average).toBe(180);
    // The row means "games you threw it in", so the same game is in both.
    expect(spare.games).toBe(1);
    expect(spare.average).toBe(200);
  });

  it('keeps an old single-ball game in the averages', () => {
    const stats = ballStats([
      game({ ball: 'Phaze II', total: 180 }),
      game({ balls: ['Phaze II'], total: 200 }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].games).toBe(2);
    expect(stats[0].average).toBe(190);
  });

  it('treats one ball spelled two ways as one ball, named as first written', () => {
    const stats = ballStats([
      game({ balls: ['Phaze II'], total: 180 }),
      game({ balls: ['phaze ii'], total: 200 }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].name).toBe('Phaze II');
    expect(stats[0].games).toBe(2);
  });

  it('leaves an unfinished game out, like every other average', () => {
    const stats = ballStats([
      game({ balls: ['Phaze II'], total: 180 }),
      game({ balls: ['Phaze II'], total: 24, isComplete: false }),
    ]);
    expect(stats[0].games).toBe(1);
  });
});

describe('valuesUsed over a list', () => {
  it('offers every ball named, the most-used first', () => {
    const used = valuesUsed(
      [
        game({ balls: ['Phaze II', 'Spare Ball'] }),
        game({ balls: ['Phaze II'] }),
        game({ balls: ['Hammer'] }),
      ],
      ballsOf,
    );
    expect(used[0]).toBe('Phaze II');
    expect(used).toContain('Spare Ball');
    expect(used).toContain('Hammer');
  });
});
