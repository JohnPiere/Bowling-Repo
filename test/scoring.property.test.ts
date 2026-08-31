import { describe, expect, it } from 'vitest';
import {
  FRAMES_PER_GAME,
  isGameComplete,
  isValidRolls,
  pinsAvailable,
  scoreGame,
} from '../src/lib/scoring';

/**
 * A second scorer, written from the rules rather than from the code it checks.
 *
 * The point is that it shares no logic with `scoreGame` — it walks the roll
 * list with the frame arithmetic straight out of the rulebook. Two
 * implementations agreeing on twenty thousand random games is worth more than
 * any number of examples I would have thought to write down, because the games
 * I think of are the ones I already handled.
 */
function referenceScore(rolls: number[]): number | null {
  let total = 0;
  let i = 0;

  for (let frame = 0; frame < 10; frame++) {
    if (rolls[i] === 10) {
      if (rolls[i + 1] === undefined || rolls[i + 2] === undefined) return null;
      total += 10 + rolls[i + 1] + rolls[i + 2];
      i += 1;
      continue;
    }

    if (rolls[i] === undefined || rolls[i + 1] === undefined) return null;

    if (rolls[i] + rolls[i + 1] === 10) {
      if (rolls[i + 2] === undefined) return null;
      total += 10 + rolls[i + 2];
    } else {
      total += rolls[i] + rolls[i + 1];
    }
    i += 2;
  }

  return total;
}

/** Deterministic, so a failure is reproducible. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Bowl a legal game by only ever throwing a count the engine says is on the
 * deck — so anything illegal that comes out is the engine's own doing.
 */
function randomGame(rand: () => number): number[] {
  const rolls: number[] = [];
  let guard = 0;

  while (!isGameComplete(rolls)) {
    rolls.push(Math.floor(rand() * (pinsAvailable(rolls) + 1)));
    // A game cannot need more than 21 balls; anything more means the engine
    // never treats it as finished, which is itself the bug.
    if (++guard > 40) throw new Error(`game never finished: ${rolls.join(',')}`);
  }

  return rolls;
}

describe('scoreGame, against an independent scorer', () => {
  const GAMES = 20_000;

  it(`agrees on ${GAMES.toLocaleString('en-US')} random legal games`, () => {
    const rand = seededRandom(1);
    const disagreements: string[] = [];

    for (let n = 0; n < GAMES && disagreements.length < 3; n++) {
      const rolls = randomGame(rand);
      const card = scoreGame(rolls);
      const expected = referenceScore(rolls);

      if (expected === null) {
        disagreements.push(`reported complete but is not: ${rolls.join(',')}`);
      } else if (card.total !== expected) {
        disagreements.push(`${card.total} vs ${expected} for ${rolls.join(',')}`);
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('never produces a game it would itself call illegal', () => {
    const rand = seededRandom(7);
    for (let n = 0; n < 5_000; n++) {
      const rolls = randomGame(rand);
      expect(isValidRolls(rolls), `illegal rolls: ${rolls.join(',')}`).toBe(true);
    }
  });

  it('always scores between 0 and 300, over exactly ten frames', () => {
    const rand = seededRandom(13);
    for (let n = 0; n < 5_000; n++) {
      const card = scoreGame(randomGame(rand));
      expect(card.frames).toHaveLength(FRAMES_PER_GAME);
      expect(card.total).toBeGreaterThanOrEqual(0);
      expect(card.total).toBeLessThanOrEqual(300);
      expect(card.isComplete).toBe(true);
    }
  });

  it('never lets a running score go backwards', () => {
    const rand = seededRandom(29);
    for (let n = 0; n < 5_000; n++) {
      const rolls = randomGame(rand);
      const scores = scoreGame(rolls).frames.map((frame) => frame.score);

      // Every frame of a finished game is scorable.
      expect(scores.includes(null), `unscored frame in ${rolls.join(',')}`).toBe(false);

      for (let i = 1; i < scores.length; i++) {
        expect(
          (scores[i] as number) >= (scores[i - 1] as number),
          `scores decrease: ${scores.join(',')}`,
        ).toBe(true);
      }
    }
  });

  it('scores a partial game as a prefix of the finished one', () => {
    const rand = seededRandom(31);

    for (let n = 0; n < 2_000; n++) {
      const rolls = randomGame(rand);
      const finished = scoreGame(rolls);

      // Every frame that was already scorable partway through must keep the
      // same score once the game ends — a later ball may reveal a frame's
      // score, but must never change one already shown.
      for (let cut = 1; cut < rolls.length; cut++) {
        const partial = scoreGame(rolls.slice(0, cut));
        partial.frames.forEach((frame, index) => {
          if (frame.score === null) return;
          expect(
            frame.score,
            `frame ${index + 1} was ${frame.score} after ${cut} balls, ${finished.frames[index].score} at the end (${rolls.join(',')})`,
          ).toBe(finished.frames[index].score);
        });
      }
    }
  });
});
