import { describe, expect, it } from 'vitest';
import {
  boardHeight,
  movementGlyph,
  movementSentence,
  podium,
  rankRoster,
  rowOffset,
  type Member,
} from '../src/lib/leaderboard';

const member = (id: string, over: Partial<Member> = {}): Member => ({
  id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  avg: 150,
  high: 200,
  pins: 1000,
  hdcp: 190,
  imp: 0,
  games: 10,
  since: 'Jan 2026',
  ...over,
});

const roster: Member[] = [
  member('kenji', { avg: 198, high: 268, pins: 3120, imp: 6 }),
  member('you', { avg: 191, high: 245, pins: 2740, imp: 18, isMe: true }),
  member('aya', { avg: 187, high: 234, pins: 3480, imp: 9 }),
];

describe('rankRoster', () => {
  it('keeps roster order so rows slide instead of re-mounting', () => {
    const standings = rankRoster(roster, 'avg');
    expect(standings.map((s) => s.member.id)).toEqual(['kenji', 'you', 'aya']);
  });

  it('ranks by the selected metric, highest first', () => {
    const byAvg = rankRoster(roster, 'avg');
    expect(byAvg.map((s) => s.rank)).toEqual([1, 2, 3]);

    // Aya has the most pins despite the lowest average.
    const byPins = rankRoster(roster, 'pins');
    expect(byPins.find((s) => s.member.id === 'aya')?.rank).toBe(1);
  });

  it('scales bars across 8%..92%', () => {
    const standings = rankRoster(roster, 'avg');
    expect(standings.find((s) => s.member.id === 'kenji')?.barPercent).toBe(92);
    expect(standings.find((s) => s.member.id === 'aya')?.barPercent).toBe(8);
  });

  it('keeps bars uniform when everyone is level', () => {
    const level = [member('a', { avg: 180 }), member('b', { avg: 180 })];
    expect(rankRoster(level, 'avg').map((s) => s.barPercent)).toEqual([8, 8]);
  });

  it('measures movement against the rolling-average board', () => {
    const standings = rankRoster(roster, 'pins');
    // Aya is 3rd on average and 1st on pins: up two places.
    expect(standings.find((s) => s.member.id === 'aya')?.movement).toBe(2);
    // Kenji falls from 1st to 2nd.
    expect(standings.find((s) => s.member.id === 'kenji')?.movement).toBe(-1);
  });

  it('reports no movement on the rolling-average board itself', () => {
    expect(rankRoster(roster, 'avg').every((s) => s.movement === 0)).toBe(true);
  });

  it('marks the top three as podium places', () => {
    const standings = rankRoster([...roster, member('mei', { avg: 120 })], 'avg');
    expect(standings.filter((s) => s.isPodium)).toHaveLength(3);
  });

  it('handles an empty roster', () => {
    expect(rankRoster([], 'avg')).toEqual([]);
  });
});

describe('podium', () => {
  it('orders the columns 2nd, 1st, 3rd', () => {
    const slots = podium(rankRoster(roster, 'avg'));
    expect(slots.map((s) => s.place)).toEqual([2, 1, 3]);
    expect(slots.map((s) => s.standing.member.id)).toEqual(['you', 'kenji', 'aya']);
  });

  it('gives the leader the tallest column', () => {
    const slots = podium(rankRoster(roster, 'avg'));
    const first = slots.find((s) => s.place === 1);
    expect(first?.barHeight).toBe(74);
    expect(first?.avatarSize).toBe(42);
  });

  it('does not invent places a small group does not have', () => {
    const pair = podium(rankRoster(roster.slice(0, 2), 'avg'));
    expect(pair.map((s) => s.place)).toEqual([2, 1]);
  });
});

describe('row geometry', () => {
  it('encodes rank as a pixel offset', () => {
    expect(rowOffset(1)).toBe(0);
    expect(rowOffset(2)).toBe(61);
    expect(rowOffset(3)).toBe(122);
  });

  it('sizes the board to its roster', () => {
    expect(boardHeight(6)).toBe(359);
    expect(boardHeight(1)).toBe(54);
  });
});

describe('movement copy', () => {
  it('is blank on the base board', () => {
    expect(movementGlyph(2, 'avg')).toBe('');
    expect(movementSentence(2, 'avg')).toBe("the group's default board");
  });

  it('shows direction and distance elsewhere', () => {
    expect(movementGlyph(2, 'pins')).toBe('▲2');
    expect(movementGlyph(-1, 'pins')).toBe('▼1');
    expect(movementGlyph(0, 'pins')).toBe('–');
    expect(movementSentence(1, 'pins')).toBe('▲ 1 place vs rolling avg');
    expect(movementSentence(2, 'pins')).toBe('▲ 2 places vs rolling avg');
    expect(movementSentence(0, 'pins')).toBe('same place as the rolling avg');
  });
});
