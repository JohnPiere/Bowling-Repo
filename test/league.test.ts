import { describe, expect, it } from 'vitest';
import { allowanceFor, leagueNights, leagueTable, seriesFrom } from '../src/lib/league';
import { handicap, type MembershipRow, type ProfileRow, type SharedGameRow } from '../src/lib/social';

const profile = (id: string, name: string): ProfileRow => ({ id, name, initials: '' });

const member = (id: string, name: string): MembershipRow => ({
  group_id: 'g1',
  profile_id: id,
  role: 'member',
  joined_at: '2026-01-01T00:00:00Z',
  profiles: profile(id, name),
});

/** A game bowled by `who` on a given evening. */
const played = (who: string, total: number, day: number, hour = 19): SharedGameRow => ({
  id: `s-${who}-${day}-${hour}`,
  group_id: 'g1',
  profile_id: who,
  local_id: `l-${who}-${day}-${hour}`,
  rolls: [],
  total,
  house: null,
  note: null,
  played_at: new Date(2026, 7, day, hour).toISOString(),
  created_at: new Date(2026, 7, day, hour).toISOString(),
});

describe('allowanceFor', () => {
  it('is the pins added per game, not the handicapped average', () => {
    // handicap() gives what a bowler is worth with the allowance in; a series
    // needs the allowance on its own, and the two must not drift apart.
    expect(allowanceFor(150)).toBe(handicap(150) - 150);
    expect(allowanceFor(150)).toBe(63);
  });

  it('gives nothing to a bowler already over the basis', () => {
    expect(allowanceFor(230)).toBe(0);
  });
});

describe('seriesFrom', () => {
  it('adds up the games of one night', () => {
    const night = seriesFrom(
      [played('a', 150, 4, 19), played('a', 170, 4, 20), played('a', 160, 4, 21)],
      0,
    );
    expect(night).toHaveLength(1);
    expect(night[0].games).toBe(3);
    expect(night[0].scratch).toBe(480);
  });

  it('gives one allowance per game, not one per series', () => {
    // The whole point of a handicap is that the gap between two bowlers is per
    // game; one allowance a night would halve it for anyone bowling three.
    const night = seriesFrom([played('a', 150, 4, 19), played('a', 150, 4, 20)], 63);
    expect(night[0].withHandicap).toBe(300 + 126);
  });

  it('keeps two evenings apart', () => {
    const nights = seriesFrom([played('a', 150, 4), played('a', 170, 11)], 0);
    expect(nights).toHaveLength(2);
  });

  it('puts the most recent night first', () => {
    const nights = seriesFrom([played('a', 150, 4), played('a', 170, 11)], 0);
    expect(nights[0].scratch).toBe(170);
  });

  it('counts a single game as a series of one', () => {
    // Plenty of bowling is one game after work, and a league table that dropped
    // those would be missing the nights somebody turned up for.
    expect(seriesFrom([played('a', 150, 4)], 0)[0].games).toBe(1);
  });

  it('has nothing to report for a bowler who has shared nothing', () => {
    expect(seriesFrom([], 20)).toEqual([]);
  });
});

describe('leagueTable', () => {
  const roster = [member('a', 'Aya Sato'), member('b', 'Kenji Mori')];

  it('ranks on the best handicap series, which narrows the gap without closing it', () => {
    // Kenji bowls 120 pins better scratch. At 90% of the gap to 220 the board
    // brings that down to 12 — a handicap league is meant to make the night
    // competitive, not to make everybody equal.
    const table = leagueTable(
      roster,
      [
        played('a', 130, 4, 19),
        played('a', 140, 4, 20),
        played('b', 200, 4, 19),
        played('b', 190, 4, 20),
      ],
      'a',
    );
    expect(table[0].id).toBe('b');
    expect(table[0].best?.scratch).toBe(390);
    expect(table[0].best?.withHandicap).toBe(390 + allowanceFor(195) * 2);

    const gap = (table[0].best?.withHandicap ?? 0) - (table[1].best?.withHandicap ?? 0);
    expect(gap).toBe(12);
  });

  it('gives a member with nothing shared a line of their own', () => {
    // Being in the crew is being in the league; an empty row says "has not
    // bowled here yet" where leaving them out says nothing.
    const table = leagueTable(roster, [played('a', 150, 4)], 'a');
    expect(table).toHaveLength(2);
    const quiet = table.find((line) => line.id === 'b');
    expect(quiet?.series).toEqual([]);
    expect(quiet?.best).toBeNull();
  });

  it('sorts a bowler with no nights below one with any', () => {
    const table = leagueTable(roster, [played('b', 90, 4)], 'a');
    expect(table[0].id).toBe('b');
  });

  it('marks your own line', () => {
    const table = leagueTable(roster, [], 'b');
    expect(table.find((line) => line.isMe)?.id).toBe('b');
  });

  it('takes the best night, not the latest', () => {
    const table = leagueTable([member('a', 'Aya Sato')], [played('a', 220, 4), played('a', 120, 11)], 'a');
    expect(table[0].best?.scratch).toBe(220);
    expect(table[0].latest?.scratch).toBe(120);
  });
});

describe('leagueNights', () => {
  const roster = [member('a', 'Aya Sato'), member('b', 'Kenji Mori')];

  it('puts everybody who bowled that evening on one night', () => {
    const table = leagueTable(roster, [played('a', 150, 4), played('b', 180, 4)], 'a');
    const nights = leagueNights(table);
    expect(nights).toHaveLength(1);
    expect(nights[0].results).toHaveLength(2);
  });

  it('leaves out a bowler who was not there, rather than scoring them zero', () => {
    // A zero would sit in the table looking like a catastrophic series.
    const table = leagueTable(roster, [played('a', 150, 4), played('b', 180, 11)], 'a');
    const nights = leagueNights(table);
    expect(nights.map((night) => night.results.length)).toEqual([1, 1]);
  });

  it('orders a night by handicap series, not by what was bowled', () => {
    // Kenji bowls 160 to Aya's 150 on the night, but he averages 200 across the
    // season and she averages 150, so his allowance is 18 and hers is 63.
    const table = leagueTable(
      roster,
      [played('a', 150, 4), played('b', 160, 4), played('b', 240, 11)],
      'a',
    );
    const night = leagueNights(table).find((n) => n.results.length === 2);
    expect(night?.results[0].line.id).toBe('a');
    expect(night?.results[0].series.withHandicap).toBe(213);
    expect(night?.results[1].series.withHandicap).toBe(178);
  });

  it('shows the most recent nights first, and only so many', () => {
    const games = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((day) => played('a', 150, day));
    const nights = leagueNights(leagueTable(roster, games, 'a'), 3);
    expect(nights).toHaveLength(3);
    expect(nights[0].at).toBeGreaterThan(nights[1].at);
  });

  it('has no nights before anybody has bowled', () => {
    expect(leagueNights(leagueTable(roster, [], 'a'))).toEqual([]);
  });
});
