import { describe, expect, it } from 'vitest';
import {
  METRICS,
  metricByKey,
  podium,
  rankRoster,
  rowOffset,
  type Member,
  type MetricKey,
} from '../src/lib/leaderboard';

/**
 * Fuzzing the board.
 *
 * The dashboard's whole behaviour — rows sliding rather than re-mounting —
 * rests on the ranking being a permutation of the roster in a stable order.
 * A duplicate rank, a missing one, or a reordered array would break the
 * animation in a way that looks like a rendering bug rather than a data one.
 */

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function randomRoster(rand: () => number, size: number): Member[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `m${i}`,
    name: `Member ${i}`,
    initials: `M${i}`,
    // Deliberately coarse, so ties happen often — that is where ranking breaks.
    avg: 150 + Math.floor(rand() * 8) * 5,
    high: 180 + Math.floor(rand() * 8) * 5,
    pins: 1000 + Math.floor(rand() * 8) * 250,
    hdcp: 190 + Math.floor(rand() * 8) * 2,
    imp: Math.floor(rand() * 5) - 2,
    games: 1 + Math.floor(rand() * 20),
    since: 'Jan 2026',
    isMe: i === 0,
  }));
}

const KEYS: MetricKey[] = METRICS.map((m) => m.key);

describe('rankRoster, under random rosters', () => {
  it('always ranks 1..n exactly once, in roster order', () => {
    const rand = seededRandom(5);

    for (let n = 0; n < 4_000; n++) {
      const size = 1 + Math.floor(rand() * 20);
      const roster = randomRoster(rand, size);
      const key = KEYS[Math.floor(rand() * KEYS.length)];
      const standings = rankRoster(roster, key);

      // Roster order is what lets a row keep its DOM node and just move.
      expect(standings.map((s) => s.member.id)).toEqual(roster.map((m) => m.id));

      const ranks = standings.map((s) => s.rank).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: size }, (_, i) => i + 1));
    }
  });

  it('never puts a lower value above a higher one', () => {
    const rand = seededRandom(19);

    for (let n = 0; n < 4_000; n++) {
      const roster = randomRoster(rand, 2 + Math.floor(rand() * 12));
      const key = KEYS[Math.floor(rand() * KEYS.length)];
      const metric = metricByKey(key);
      const standings = rankRoster(roster, key);

      for (const a of standings) {
        for (const b of standings) {
          if (metric.get(a.member) > metric.get(b.member)) {
            expect(a.rank, `${key}: better value ranked worse`).toBeLessThan(b.rank);
          }
        }
      }
    }
  });

  it('keeps every bar inside 8..92 percent', () => {
    const rand = seededRandom(37);

    // Fewer rosters than the checks above, since this one walks every metric.
    for (let n = 0; n < 800; n++) {
      const roster = randomRoster(rand, 1 + Math.floor(rand() * 20));
      for (const key of KEYS) {
        for (const standing of rankRoster(roster, key)) {
          expect(standing.barPercent).toBeGreaterThanOrEqual(8);
          expect(standing.barPercent).toBeLessThanOrEqual(92);
        }
      }
    }
  });

  it('gives every row a distinct position', () => {
    const rand = seededRandom(41);

    for (let n = 0; n < 2_000; n++) {
      const roster = randomRoster(rand, 1 + Math.floor(rand() * 20));
      const key = KEYS[Math.floor(rand() * KEYS.length)];
      // Two rows sharing a `top` would sit on top of each other.
      const tops = rankRoster(roster, key).map((s) => rowOffset(s.rank));
      expect(new Set(tops).size).toBe(tops.length);
    }
  });

  it('moves nobody by more than the roster is long', () => {
    const rand = seededRandom(43);

    for (let n = 0; n < 800; n++) {
      const size = 1 + Math.floor(rand() * 20);
      const roster = randomRoster(rand, size);
      for (const key of KEYS) {
        for (const standing of rankRoster(roster, key)) {
          expect(Math.abs(standing.movement)).toBeLessThan(size);
        }
      }
    }
  });
});

describe('podium, under random rosters', () => {
  it('is ordered 2nd, 1st, 3rd and never invents a place', () => {
    const rand = seededRandom(47);

    for (let n = 0; n < 2_000; n++) {
      const size = 1 + Math.floor(rand() * 8);
      const roster = randomRoster(rand, size);
      const slots = podium(rankRoster(roster, KEYS[Math.floor(rand() * KEYS.length)]));

      expect(slots.length).toBe(Math.min(3, size));

      // The columns are laid out 2nd · 1st · 3rd, so the leader stands in the
      // middle. A group too small to fill the podium keeps that order for the
      // places it does have.
      const expected = size === 1 ? [1] : size === 2 ? [2, 1] : [2, 1, 3];
      expect(slots.map((s) => s.place)).toEqual(expected);

      for (const slot of slots) {
        expect(slot.standing.rank).toBe(slot.place);
      }
      // Nobody appears twice on the podium.
      expect(new Set(slots.map((s) => s.standing.member.id)).size).toBe(slots.length);
    }
  });
});
