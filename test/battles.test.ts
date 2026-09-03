import { describe, expect, it } from 'vitest';
import {
  battleOrder,
  battleRecord,
  battleResult,
  daysLeftIn,
  entryScore,
  isIn,
  opponentOf,
  problemWithBattle,
  problemWithEntry,
  type Battle,
  type BattleEntry,
} from '../src/lib/battles';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.parse('2026-06-15T12:00:00Z');

const ME = 'me';
const THEM = 'them';

function battle(over: Partial<Battle> = {}): Battle {
  return {
    id: 'b1',
    groupId: 'g1',
    challengerId: ME,
    opponentId: THEM,
    name: 'Best game this week',
    endsAt: NOW + 7 * DAY,
    createdAt: NOW - DAY,
    ...over,
  };
}

function entry(memberId: string, score: number, over: Partial<BattleEntry> = {}): BattleEntry {
  return { battleId: 'b1', memberId, score, rolls: [], playedAt: NOW - DAY, ...over };
}

describe('entryScore', () => {
  it('takes the typed score when there are no rolls behind it', () => {
    expect(entryScore(entry(ME, 187))).toBe(187);
  });

  it('rescores from the rolls rather than trusting the number beside them', () => {
    // Twelve strikes is 300 whatever the row claims.
    const perfect = entry(ME, 42, { rolls: Array(12).fill(10) });
    expect(entryScore(perfect)).toBe(300);
  });
});

describe('battleResult', () => {
  it('is waiting while nobody has bowled and there is time', () => {
    const result = battleResult(battle(), [], NOW);
    expect(result.outcome).toBe('waiting');
    expect(result.winnerId).toBeNull();
    expect(result.waitingOn).toEqual([ME, THEM]);
    expect(result.final).toBe(false);
  });

  it('names who is still to bowl when one side has', () => {
    const result = battleResult(battle(), [entry(ME, 180)], NOW);
    expect(result.outcome).toBe('waiting');
    expect(result.waitingOn).toEqual([THEM]);
  });

  it('gives it to the higher score once both have bowled', () => {
    const result = battleResult(battle(), [entry(ME, 180), entry(THEM, 201)], NOW);
    expect(result.outcome).toBe('won');
    expect(result.winnerId).toBe(THEM);
    expect(result.waitingOn).toEqual([]);
  });

  it('calls equal scores a tie rather than picking one', () => {
    const result = battleResult(battle(), [entry(ME, 180), entry(THEM, 180)], NOW);
    expect(result.outcome).toBe('tied');
    expect(result.winnerId).toBeNull();
  });

  it('decides on the rescored total, not the stored one', () => {
    const result = battleResult(
      battle(),
      // 300 against a claimed 290: the rolls win.
      [entry(ME, 1, { rolls: Array(12).fill(10) }), entry(THEM, 290)],
      NOW,
    );
    expect(result.winnerId).toBe(ME);
  });

  it('is a walkover when the deadline passes with one side never entering', () => {
    const result = battleResult(battle(), [entry(THEM, 120)], NOW + 8 * DAY);
    expect(result.outcome).toBe('walkover');
    expect(result.winnerId).toBe(THEM);
    expect(result.final).toBe(true);
  });

  it('is void when the deadline passes and nobody bowled', () => {
    const result = battleResult(battle(), [], NOW + 8 * DAY);
    expect(result.outcome).toBe('void');
    expect(result.winnerId).toBeNull();
  });

  it('ignores entries belonging to another battle', () => {
    const other = entry(THEM, 300, { battleId: 'b2' });
    const result = battleResult(battle(), [entry(ME, 180), other], NOW);
    expect(result.outcome).toBe('waiting');
    expect(result.waitingOn).toEqual([THEM]);
  });

  it('is not final while the deadline is still ahead, even with both in', () => {
    // Both may put up a better game until it closes; that is what the week is
    // for, and it is why a lead is not a win yet.
    const result = battleResult(battle(), [entry(ME, 200), entry(THEM, 180)], NOW);
    expect(result.outcome).toBe('won');
    expect(result.final).toBe(false);
  });
});

describe('battleRecord', () => {
  const past = { endsAt: NOW - DAY };

  it('counts nothing that is still running', () => {
    const record = battleRecord([battle()], [entry(ME, 200), entry(THEM, 180)], ME, NOW);
    expect(record).toEqual({ won: 0, lost: 0, drawn: 0, void: 0, played: 0 });
  });

  it('counts a settled win, loss and tie separately', () => {
    const won = battle({ id: 'b1', ...past });
    const lost = battle({ id: 'b2', ...past });
    const tied = battle({ id: 'b3', ...past });

    const entries = [
      entry(ME, 200), entry(THEM, 180),
      entry(ME, 150, { battleId: 'b2' }), entry(THEM, 190, { battleId: 'b2' }),
      entry(ME, 170, { battleId: 'b3' }), entry(THEM, 170, { battleId: 'b3' }),
    ];

    expect(battleRecord([won, lost, tied], entries, ME, NOW)).toEqual({
      won: 1, lost: 1, drawn: 1, void: 0, played: 3,
    });
  });

  it('counts a walkover as a win for whoever turned up', () => {
    const record = battleRecord([battle(past)], [entry(ME, 140)], ME, NOW);
    expect(record.won).toBe(1);
    expect(record.played).toBe(1);
  });

  it('keeps a battle nobody bowled out of played', () => {
    // "0 from 1" reads as a defeat; what happened is that nothing happened.
    const record = battleRecord([battle(past)], [], ME, NOW);
    expect(record).toEqual({ won: 0, lost: 0, drawn: 0, void: 1, played: 0 });
  });

  it('ignores battles the member is not in', () => {
    const theirs = battle({ id: 'b9', challengerId: 'a', opponentId: 'b', ...past });
    expect(battleRecord([theirs], [], ME, NOW).void).toBe(0);
  });
});

describe('battleOrder', () => {
  it('puts what needs you first, then what is running, then what is over', () => {
    const needsMe = battle({ id: 'needsMe', endsAt: NOW + 5 * DAY });
    const needsThem = battle({ id: 'needsThem', endsAt: NOW + 5 * DAY });
    const bothIn = battle({ id: 'bothIn', endsAt: NOW + 5 * DAY });
    const over = battle({ id: 'over', endsAt: NOW - DAY });

    const entries = [
      entry(THEM, 180, { battleId: 'needsMe' }),
      entry(ME, 180, { battleId: 'needsThem' }),
      entry(ME, 180, { battleId: 'bothIn' }),
      entry(THEM, 190, { battleId: 'bothIn' }),
      entry(ME, 180, { battleId: 'over' }),
      entry(THEM, 190, { battleId: 'over' }),
    ];

    const order = battleOrder([over, bothIn, needsThem, needsMe], entries, ME, NOW);
    expect(order.map((one) => one.id)).toEqual(['needsMe', 'needsThem', 'bothIn', 'over']);
  });

  it('leaves the caller list alone', () => {
    const list = [battle({ id: 'a' }), battle({ id: 'b', endsAt: NOW - DAY })];
    const before = list.map((one) => one.id);
    battleOrder(list, [], ME, NOW);
    expect(list.map((one) => one.id)).toEqual(before);
  });
});

describe('who is who', () => {
  it('names the other side whichever end you are', () => {
    expect(opponentOf(battle(), ME)).toBe(THEM);
    expect(opponentOf(battle(), THEM)).toBe(ME);
  });

  it('knows who is in it', () => {
    expect(isIn(battle(), ME)).toBe(true);
    expect(isIn(battle(), 'somebody')).toBe(false);
  });
});

describe('daysLeftIn', () => {
  it('rounds up, so six hours left is not "0 days"', () => {
    expect(daysLeftIn(battle({ endsAt: NOW + 6 * HOUR }), NOW)).toBe(1);
  });

  it('never goes below zero once it is over', () => {
    expect(daysLeftIn(battle({ endsAt: NOW - 30 * DAY }), NOW)).toBe(0);
  });
});

describe('problemWithBattle', () => {
  const good = { name: 'This week', opponentId: THEM, endsAt: NOW + 7 * DAY };

  it('accepts one that is ready', () => {
    expect(problemWithBattle(good, ME, NOW)).toBeNull();
  });

  it('wants a name', () => {
    expect(problemWithBattle({ ...good, name: '   ' }, ME, NOW)).toBe('Give it a name.');
  });

  it('wants somebody to bowl against', () => {
    expect(problemWithBattle({ ...good, opponentId: '' }, ME, NOW)).toBe(
      'Pick who you are bowling against.',
    );
  });

  it('refuses a battle against yourself', () => {
    expect(problemWithBattle({ ...good, opponentId: ME }, ME, NOW)).toBe(
      'Pick somebody other than yourself.',
    );
  });

  it('refuses one that closes before two people could bowl', () => {
    expect(problemWithBattle({ ...good, endsAt: NOW + 60_000 }, ME, NOW)).toBe(
      'Give it until at least an hour from now.',
    );
  });

  it('refuses a mistyped year', () => {
    expect(problemWithBattle({ ...good, endsAt: NOW + 400 * DAY }, ME, NOW)).toBe(
      'Keep it under a year.',
    );
  });
});

describe('problemWithEntry', () => {
  it('accepts a real score', () => {
    expect(problemWithEntry(187, NOW - DAY, NOW)).toBeNull();
    expect(problemWithEntry(0, NOW - DAY, NOW)).toBeNull();
    expect(problemWithEntry(300, NOW - DAY, NOW)).toBeNull();
  });

  it('refuses what is not a score', () => {
    expect(problemWithEntry(Number.NaN, NOW, NOW)).toBe('That is not a score.');
    expect(problemWithEntry(-1, NOW, NOW)).toBe('A score is a whole number, 0 or more.');
    expect(problemWithEntry(187.5, NOW, NOW)).toBe('A score is a whole number, 0 or more.');
    expect(problemWithEntry(301, NOW, NOW)).toBe('Nothing scores over 300.');
  });

  it('refuses a game from the future, allowing a day for a slow clock', () => {
    expect(problemWithEntry(187, NOW + 2 * DAY, NOW)).toBe('That game has not been bowled yet.');
    expect(problemWithEntry(187, NOW + HOUR, NOW)).toBeNull();
  });
});
