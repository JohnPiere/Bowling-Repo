import { describe, expect, it } from 'vitest';
import { crewGlance, dashboard, gameShape } from '../src/lib/dashboard';
import type { Game } from '../src/lib/db';
import type { Group } from '../src/data/groups';
import type { Member } from '../src/lib/leaderboard';

const game = (over: Partial<Game> = {}): Game => ({
  id: Math.random().toString(36).slice(2),
  bowler: 'You',
  rolls: new Array(20).fill(4),
  total: 80,
  isComplete: true,
  source: 'manual',
  playedAt: Date.UTC(2026, 7, 20),
  updatedAt: Date.UTC(2026, 7, 20),
  ...over,
});

const member = (id: string, avg: number, isMe = false): Member => ({
  id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  avg,
  high: avg + 40,
  pins: 1000,
  hdcp: avg + 10,
  imp: 0,
  games: 10,
  since: 'Jan 2026',
  isMe,
});

const group = (over: Partial<Group> = {}): Group => ({
  id: 'crew',
  name: 'Tuesday Crew',
  initials: 'TC',
  isOpen: false,
  doorsOpen: true,
  inviteCode: 'TCRW31',
  codeExpiresInDays: 11,
  yourRole: 'owner',
  members: [member('kenji', 198), member('you', 191, true), member('aya', 187)],
  unread: 3,
  lastMessage: '',
  lastActivity: '',
  ...over,
});

describe('gameShape', () => {
  it('counts strikes and spares off the scored card', () => {
    // Three strikes, then a spare, then opens.
    const rolls = [10, 10, 10, 7, 3, ...new Array(12).fill(3)];
    const shape = gameShape(game({ rolls }));
    expect(shape.strikes).toBe(3);
    expect(shape.spares).toBe(1);
  });

  it('reports pins felled, not the score', () => {
    // A perfect game is 300 points off 120 pins: the bonus balls score twice.
    const shape = gameShape(game({ rolls: new Array(12).fill(10), total: 300 }));
    expect(shape.pins).toBe(120);
  });
});

describe('dashboard', () => {
  it('has nothing to show before the first game', () => {
    const empty = dashboard([]);
    expect(empty.best).toBeNull();
    expect(empty.average).toBeNull();
    expect(empty.strikeRate).toBeNull();
    expect(empty.recent).toEqual([]);
  });

  it('ignores a game still being bowled', () => {
    // A half-finished 60 is not a 60, and would drag the average down every
    // time the app was opened mid-game.
    const summary = dashboard([game({ total: 60, isComplete: false }), game({ total: 200 })]);
    expect(summary.played).toHaveLength(1);
    expect(summary.average).toBe(200);
    expect(summary.best?.total).toBe(200);
  });

  it('picks the highest game as the best', () => {
    const summary = dashboard([game({ total: 150 }), game({ total: 212 }), game({ total: 180 })]);
    expect(summary.best?.total).toBe(212);
  });

  it('keeps the earlier game when two tie', () => {
    // `games` arrives newest-first, so the last of a tie is the one that
    // actually set the record.
    const older = game({ id: 'older', total: 200 });
    const newer = game({ id: 'newer', total: 200 });
    expect(dashboard([newer, older]).best?.id).toBe('older');
  });

  it('averages across finished games', () => {
    expect(dashboard([game({ total: 100 }), game({ total: 201 })]).average).toBe(151);
  });

  it('reads the strike rate off the frames', () => {
    // Ten strikes in twelve balls is ten strikes in ten frames.
    expect(dashboard([game({ rolls: new Array(12).fill(10), total: 300 })]).strikeRate).toBe(100);
  });

  it('takes the five most recent, in the order given', () => {
    const games = Array.from({ length: 8 }, (_, i) => game({ id: `g${i}`, total: 100 + i }));
    expect(dashboard(games).recent.map((g) => g.id)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4']);
  });
});

describe('crewGlance', () => {
  it('reports where you stand on the default board', () => {
    const glance = crewGlance([group()]);
    expect(glance?.rank).toBe(2);
    expect(glance?.size).toBe(3);
    expect(glance?.unread).toBe(3);
  });

  it('takes the first group as the primary one', () => {
    const glance = crewGlance([group({ id: 'first' }), group({ id: 'second' })]);
    expect(glance?.group.id).toBe('first');
  });

  it('has nothing to show without a group', () => {
    expect(crewGlance([])).toBeNull();
  });

  it('has nothing to show for an empty roster', () => {
    // Would otherwise rank a board with nobody on it.
    expect(crewGlance([group({ members: [] })])).toBeNull();
  });

  it('falls back to the top of the board when no member is you', () => {
    const glance = crewGlance([group({ members: [member('kenji', 198), member('aya', 187)] })]);
    expect(glance?.rank).toBe(1);
  });
});
