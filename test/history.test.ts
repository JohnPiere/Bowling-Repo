import { describe, expect, it } from 'vitest';
import { dayKey, groupByDay, searchGames, sessionSpan } from '../src/lib/history';
import type { Game } from '../src/lib/db';

const at = (day: number, hour = 19, minute = 0) =>
  new Date(2026, 7, day, hour, minute).getTime();

const game = (total: number, playedAt: number, house?: string): Game => ({
  id: `g${playedAt}`,
  bowler: 'You',
  rolls: [],
  total,
  isComplete: true,
  source: 'manual',
  house,
  playedAt,
  updatedAt: playedAt,
});

describe('dayKey', () => {
  it('puts two games on the same evening in the same day', () => {
    expect(dayKey(at(4, 19))).toBe(dayKey(at(4, 22)));
  });

  it('separates games either side of midnight', () => {
    expect(dayKey(at(4, 23))).not.toBe(dayKey(at(5, 1)));
  });
});

describe('searchGames', () => {
  const games = [game(180, at(4), 'Rose Bowl Lanes'), game(150, at(11), 'Korona Cat Bowl')];

  it('matches the house, however it was capitalised', () => {
    expect(searchGames(games, 'rose')).toHaveLength(1);
    expect(searchGames(games, 'ROSE')).toHaveLength(1);
  });

  it('matches the date as it is written on screen', () => {
    expect(searchGames(games, 'august').length).toBe(2);
  });

  it('matches an exact score', () => {
    expect(searchGames(games, '180')).toHaveLength(1);
  });

  it('returns everything for an empty query rather than nothing', () => {
    expect(searchGames(games, '   ')).toHaveLength(2);
  });

  it('survives a game with no house', () => {
    expect(searchGames([game(120, at(4))], 'rose')).toHaveLength(0);
  });

  it('matches what the bowler wrote about the game', () => {
    // The reason the box is worth having: a house name narrows a season to
    // dozens of games, "left the ten" narrows it to the nights in question.
    const noted = { ...game(140, at(18)), note: 'Left the ten pin four times' };
    expect(searchGames([...games, noted], 'ten pin')).toHaveLength(1);
  });
});

describe('groupByDay', () => {
  const night = [game(150, at(4, 19)), game(210, at(4, 20)), game(180, at(4, 21), 'Rose Bowl')];
  const later = [game(120, at(11, 19))];

  it('makes one group per session, with its series total', () => {
    const groups = groupByDay([...night, ...later]);
    expect(groups).toHaveLength(2);

    const first = groups.find((g) => g.games.length === 3)!;
    expect(first.series).toBe(540);
    expect(first.high).toBe(210);
    expect(first.average).toBe(180);
  });

  it('keeps games in the order they were bowled, whatever the sort', () => {
    // Game 3 has to mean the third of the night.
    for (const sort of ['new', 'old', 'high', 'low'] as const) {
      const group = groupByDay(night, sort)[0];
      expect(group.games.map((g) => g.total)).toEqual([150, 210, 180]);
    }
  });

  it('takes the house from whichever game recorded one', () => {
    expect(groupByDay(night)[0].house).toBe('Rose Bowl');
  });

  it('orders days newest or oldest first', () => {
    expect(groupByDay([...night, ...later], 'new')[0].at).toBe(at(11, 19));
    expect(groupByDay([...night, ...later], 'old')[0].at).toBe(at(4, 19));
  });

  it('ranks days by their best game, not by their series', () => {
    // The three-game night totals 540 and the one-game night 240, but the
    // single 240 is the better game — "highest" means the better game.
    const big = [game(240, at(11, 19))];
    expect(groupByDay([...night, ...big], 'high')[0].high).toBe(240);
    expect(groupByDay([...night, ...big], 'low')[0].high).toBe(210);
  });

  it('has nothing to group when there are no games', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('sessionSpan', () => {
  it('shows the run of the session', () => {
    const span = sessionSpan(groupByDay([game(150, at(4, 19)), game(180, at(4, 21))])[0]);
    expect(span).toContain('–');
  });

  it('shows one time for a single game', () => {
    expect(sessionSpan(groupByDay([game(150, at(4, 19))])[0])).not.toContain('–');
  });
});
