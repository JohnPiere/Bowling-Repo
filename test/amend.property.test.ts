import { describe, expect, it } from 'vitest';
import {
  editableFrames,
  frameBounds,
  isGameComplete,
  isValidRolls,
  pinsAvailable,
  replaceFrame,
  scoreGame,
} from '../src/lib/scoring';

/**
 * Editing a frame, checked the way the scorer itself is.
 *
 * `replaceFrame` splices a new frame into a flat roll list, and the balls
 * after it keep their places — which is only safe if every later frame's
 * grouping is decided by its own contents rather than by where it happens to
 * start. That is true of ten-pin, but it is the kind of true that is worth
 * checking against a second scorer rather than reasoning about, because the
 * failure would be a *plausible* wrong total: a game that still looks like a
 * game and is quietly worth twenty points less.
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

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function randomGame(rand: () => number): number[] {
  const rolls: number[] = [];
  let guard = 0;
  while (!isGameComplete(rolls)) {
    rolls.push(Math.floor(rand() * (pinsAvailable(rolls) + 1)));
    if (++guard > 40) throw new Error(`game never finished: ${rolls.join(',')}`);
  }
  return rolls;
}

/**
 * The balls somebody could actually enter for one frame, thrown at the deck
 * that frame really offers — which is what the editor hands the bowler.
 */
function reThrow(rolls: number[], frame: number, rand: () => number): number[] {
  const start = frameBounds(rolls)[frame].start;
  const running = rolls.slice(0, start);
  const balls: number[] = [];
  let guard = 0;

  for (;;) {
    balls.push(Math.floor(rand() * (pinsAvailable(running) + 1)));
    running.push(balls[balls.length - 1]);
    const card = scoreGame(running);
    const done = card.frames[frame].isComplete || isGameComplete(running);
    if (done) return balls;
    if (++guard > 5) throw new Error('a frame that never ends');
  }
}

describe('replaceFrame, against an independent scorer', () => {
  const GAMES = 2_000;

  it(`keeps ${GAMES.toLocaleString('en-US')} edited games legal and correctly scored`, () => {
    const rand = seededRandom(20260904);

    for (let n = 0; n < GAMES; n++) {
      const original = randomGame(rand);
      const frames = editableFrames(original);
      const frame = frames[Math.floor(rand() * frames.length)];
      const balls = reThrow(original, frame, rand);

      const next = replaceFrame(original, [], frame, balls, []).rolls;

      expect(
        isValidRolls(next),
        `frame ${frame + 1} <- [${balls}] made an illegal game: [${next}] from [${original}]`,
      ).toBe(true);

      // The two scorers have to agree, including about a game the edit left
      // unfinished — `null` on both sides is an answer, not an escape.
      const mine = scoreGame(next);
      const theirs = referenceScore(next);
      const got = mine.isComplete ? mine.total : null;
      expect(
        got,
        `frame ${frame + 1} <- [${balls}] scored ${got} against ${theirs}: [${next}]`,
      ).toBe(theirs);
    }
  });

  it('never leaves a ball the scorer cannot see', () => {
    // Every roll has to belong to a frame. An edit that pushed a ball past the
    // tenth would leave it in the list, counted by `tally` as thrown and by
    // nothing else — a game worth more balls than it has.
    const rand = seededRandom(7717);

    for (let n = 0; n < 2_000; n++) {
      const original = randomGame(rand);
      const frames = editableFrames(original);
      const frame = frames[Math.floor(rand() * frames.length)];
      const next = replaceFrame(original, [], frame, reThrow(original, frame, rand), []).rolls;

      const consumed = frameBounds(next).reduce((sum, bound) => sum + bound.length, 0);
      expect(
        consumed,
        `frame ${frame + 1}: ${next.length - consumed} orphan ball(s) in [${next}]`,
      ).toBe(next.length);
    }
  });
});

describe('an edit never unfinishes a finished game', () => {
  // The failure this is looking for is the one that reads as "the score is
  // wrong": a complete game edited into an incomplete one keeps only its
  // partial total, drops out of every average that filters on `isComplete`,
  // and says nothing about why.
  it('holds over 2,000 random games and edits', () => {
    const rand = seededRandom(31337);

    for (let n = 0; n < 2_000; n++) {
      const original = randomGame(rand);
      expect(isGameComplete(original)).toBe(true);

      const frames = editableFrames(original);
      const frame = frames[Math.floor(rand() * frames.length)];
      const balls = reThrow(original, frame, rand);
      const next = replaceFrame(original, [], frame, balls, []).rolls;

      expect(
        isGameComplete(next),
        `frame ${frame + 1} <- [${balls}] left the game unfinished: [${next}] from [${original}]`,
      ).toBe(true);
    }
  });
});
