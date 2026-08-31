import { describe, expect, it } from 'vitest';
import { MarkParseError, parseMarks, tryParseMarks } from '../src/lib/marks';
import { isValidRolls, scoreGame } from '../src/lib/scoring';

/**
 * Fuzzing the mark parser.
 *
 * The parser reads whatever OCR produces, so it is fed noise by definition.
 * The property that matters is not that it succeeds — most noise is not a
 * game — but that it never *quietly* succeeds with something wrong. Either it
 * refuses, or it hands back a roll list that is a legal game. A parser that
 * silently produced a plausible wrong game would put a score in a bowler's
 * history that they never bowled, and nothing would look amiss.
 */

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Characters a sheet, or a bad read of one, can produce. */
const ALPHABET = 'X/-0123456789 xO|\\l';

function noise(rand: () => number, maxLength = 40): string {
  const length = Math.floor(rand() * maxLength);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

describe('parseMarks, under noise', () => {
  it('either refuses or returns a legal game — never a quiet wrong one', () => {
    const rand = seededRandom(3);
    const failures: string[] = [];
    let accepted = 0;

    for (let n = 0; n < 20_000 && failures.length < 3; n++) {
      const input = noise(rand);
      const result = tryParseMarks(input);

      if ('error' in result) continue;

      accepted += 1;
      if (!isValidRolls(result.rolls)) {
        failures.push(`accepted an illegal game from ${JSON.stringify(input)}`);
        continue;
      }

      const total = scoreGame(result.rolls).total;
      if (total < 0 || total > 300) {
        failures.push(`scored ${total} from ${JSON.stringify(input)}`);
      }
    }

    expect(failures).toEqual([]);
    // If nothing were ever accepted the property would be vacuous.
    expect(accepted).toBeGreaterThan(0);
  });

  it('never throws anything but a MarkParseError', () => {
    const rand = seededRandom(11);

    for (let n = 0; n < 20_000; n++) {
      const input = noise(rand, 80);
      try {
        parseMarks(input);
      } catch (err) {
        // A TypeError here would reach a click handler as an unhandled
        // rejection rather than a message the bowler can act on.
        expect(err, `unexpected error type for ${JSON.stringify(input)}`).toBeInstanceOf(
          MarkParseError,
        );
      }
    }
  });

  it('is unaffected by the whitespace between frames', () => {
    const rand = seededRandom(17);

    for (let n = 0; n < 2_000; n++) {
      const input = noise(rand, 30);
      const tight = tryParseMarks(input);
      // Spacing is how frames are separated, so collapsing runs of spaces must
      // not change the reading; padding around the whole string must not either.
      const padded = tryParseMarks(`   ${input.replace(/ +/g, '  ')}   `);

      if ('error' in tight) {
        expect('error' in padded, `padding changed the outcome for ${JSON.stringify(input)}`).toBe(
          true,
        );
      } else {
        expect('rolls' in padded && padded.rolls, JSON.stringify(input)).toEqual(tight.rolls);
      }
    }
  });

  it('round-trips a game it produced from marks it produced', () => {
    const rand = seededRandom(23);

    for (let n = 0; n < 2_000; n++) {
      const input = noise(rand, 30);
      const first = tryParseMarks(input);
      if ('error' in first) continue;

      // The frames it read, written back out the way a sheet writes them.
      const rewritten = first.frames.map((frame) => frame.join('')).join(' ');
      const second = tryParseMarks(rewritten);

      expect('rolls' in second, `could not re-read its own output: ${rewritten}`).toBe(true);
      if ('rolls' in second) expect(second.rolls).toEqual(first.rolls);
    }
  });
});
