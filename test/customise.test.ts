import { describe, expect, it } from 'vitest';
import { DEFAULTS, START_SCREENS, type Preferences } from '../src/lib/preferences';
import { housesPlayed } from '../src/lib/stats';
import type { Game } from '../src/lib/db';

/**
 * The settings that skip something.
 *
 * Each of these removes an action that is otherwise paid every time, which is
 * also what makes them dangerous: a bad default here is not a cosmetic
 * complaint, it is the app opening on the wrong screen or entering a game the
 * wrong way for somebody who never asked it to.
 */

function game(house: string | undefined, total: number, playedAt: number): Game {
  return {
    id: `g_${playedAt}`,
    bowler: 'You',
    house,
    rolls: [],
    total,
    isComplete: true,
    source: 'manual',
    playedAt,
    updatedAt: playedAt,
    hasSheet: false,
  };
}

describe('the defaults', () => {
  it('changes nothing for somebody who never opens Settings', () => {
    // Every one of these is opt-in. The app somebody already knows must not
    // behave differently because the setting now exists.
    expect(DEFAULTS.startScreen).toBe('home');
    expect(DEFAULTS.scoringEntry).toBe('ask');
    expect(DEFAULTS.homeHouse).toBe('');
  });

  it('survives a stored copy written before they existed', () => {
    // What is actually in localStorage on every phone that has the app today.
    const older = JSON.parse(
      '{"language":"ja","playerName":"Kenji","onboardedAt":1}',
    ) as Partial<Preferences>;
    const merged = { ...DEFAULTS, ...older };

    expect(merged.startScreen).toBe('home');
    expect(merged.scoringEntry).toBe('ask');
    expect(merged.language).toBe('ja');
  });

  it('offers only screens the tab bar actually has', () => {
    // A start screen with no tab would open the app somewhere it cannot get
    // back to.
    expect(START_SCREENS.map((s) => s.key)).toEqual(['home', 'play', 'history', 'stats', 'groups']);
  });
});

describe('housesPlayed', () => {
  it('puts the alley you go to most first', () => {
    // `houseStats` ranks by average, which is right for a table and wrong for
    // a list of suggestions: the one you mean is the one you go to.
    const games = [
      game('Rose Bowl Lanes', 120, 1),
      game('Rose Bowl Lanes', 130, 2),
      game('Rose Bowl Lanes', 110, 3),
      game('Korona Bowl', 220, 4),
    ];

    expect(housesPlayed(games)).toEqual(['Rose Bowl Lanes', 'Korona Bowl']);
  });

  it('breaks a tie with the most recent', () => {
    const games = [game('Old Alley', 150, 1), game('New Alley', 150, 9)];
    expect(housesPlayed(games)).toEqual(['New Alley', 'Old Alley']);
  });

  it('says nothing about games that never named a house', () => {
    expect(housesPlayed([game(undefined, 150, 1), game('  ', 150, 2)])).toEqual([]);
  });

  it('treats one alley written two ways as one alley', () => {
    const games = [game('Rose Bowl', 120, 1), game('rose bowl', 130, 2)];
    expect(housesPlayed(games)).toEqual(['Rose Bowl']);
  });
});
