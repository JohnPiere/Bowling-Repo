/**
 * Parsing the marks written on a paper score sheet.
 *
 * A sheet records what the bowler *wrote* (X, /, -, digits), not pin counts, so
 * a spare only means something relative to the ball before it. This module is
 * deliberately separate from OCR: it takes a string and returns rolls, which
 * makes the tricky part testable without a camera.
 */

import { FRAMES_PER_GAME, PINS, isValidRolls } from './scoring';

export interface ParsedSheet {
  /** Pin counts, ready to hand to `scoreGame`. */
  rolls: number[];
  /** Marks grouped the way they were written, one entry per frame. */
  frames: string[][];
  /** Problems that did not stop the parse but should be shown for review. */
  warnings: string[];
}

export class MarkParseError extends Error {}

/** Characters OCR routinely confuses for the real mark. */
const CHARACTER_FIXES: Record<string, string> = {
  x: 'X',
  '×': 'X',
  '✕': 'X',
  '✗': 'X',
  '⨯': 'X',
  '\\': '/',
  '|': '/',
  '⁄': '/',
  '–': '-',
  '—': '-',
  '−': '-',
  '_': '-',
  o: '0',
  O: '0',
  Q: '0',
  l: '1',
  I: '1',
  i: '1',
  '!': '1',
  S: '5',
  s: '5',
  B: '8',
  g: '9',
};

/** Marks that can legally appear on a sheet, after normalisation. */
const VALID_MARK = /^[X\/\-0-9]$/;

/**
 * Fold OCR noise into the small alphabet a sheet actually uses, and split into
 * frames. Frames are separated by whitespace or any of the vertical rules a
 * printed sheet draws between boxes.
 */
function normalise(raw: string): string[][] {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((ch) => CHARACTER_FIXES[ch] ?? ch)
    .join('');

  return cleaned
    .split(/[\s,;:.]+/)
    .map((token) => token.replace(/^[[({]+|[\])}]+$/g, ''))
    .filter((token) => token.length > 0)
    .map((token) => token.split('').filter((ch) => VALID_MARK.test(ch)))
    .filter((frame) => frame.length > 0);
}

/**
 * Convert one frame's marks to pin counts.
 *
 * `carry` is the pin count of the ball before this frame's first mark, which a
 * leading spare would otherwise have nothing to subtract from.
 */
function frameToRolls(marks: string[], frameIndex: number, warnings: string[]): number[] {
  const rolls: number[] = [];
  const isTenth = frameIndex === FRAMES_PER_GAME - 1;

  // A strike ends a frame everywhere but the tenth, so anything after it is
  // ink the recogniser invented — a speck read as a dash, most often. Keeping
  // it would not fail loudly: it would push an extra roll into the list and
  // silently shift every later frame, which is the worst outcome available.
  if (!isTenth && marks[0] === 'X' && marks.length > 1) {
    warnings.push(
      `Frame ${frameIndex + 1}: a strike ends the frame, so "${marks.slice(1).join('')}" after it was ignored.`,
    );
    marks = marks.slice(0, 1);
  }

  marks.forEach((mark, i) => {
    if (mark === 'X') {
      rolls.push(PINS);
      return;
    }

    if (mark === '/') {
      if (i === 0) {
        throw new MarkParseError(
          `Frame ${frameIndex + 1}: a spare cannot be the first mark in a frame.`,
        );
      }
      const previous = rolls[i - 1];
      // In the tenth a spare follows a fresh rack after a strike, so it is only
      // relative when the ball before it left pins standing.
      const standing = previous === PINS ? PINS : PINS - previous;
      rolls.push(standing);
      return;
    }

    if (mark === '-') {
      rolls.push(0);
      return;
    }

    rolls.push(Number(mark));
  });

  const limit = isTenth ? 3 : 2;
  if (rolls.length > limit) {
    throw new MarkParseError(
      `Frame ${frameIndex + 1}: found ${rolls.length} marks but a frame holds at most ${limit}.`,
    );
  }

  return rolls;
}

/**
 * Parse the marks read off a score sheet into a roll list.
 *
 * Throws `MarkParseError` when the marks cannot describe a real game; the
 * caller is expected to show that message and let the bowler correct the scan
 * by hand rather than importing something wrong.
 */
export function parseMarks(raw: string): ParsedSheet {
  const frames = normalise(raw);
  const warnings: string[] = [];

  if (frames.length === 0) {
    throw new MarkParseError('No score marks were recognised on this sheet.');
  }

  if (frames.length > FRAMES_PER_GAME) {
    warnings.push(
      `Read ${frames.length} frames; kept the first ${FRAMES_PER_GAME} and ignored the rest.`,
    );
    frames.length = FRAMES_PER_GAME;
  }

  if (frames.length < FRAMES_PER_GAME) {
    warnings.push(
      `Only ${frames.length} of ${FRAMES_PER_GAME} frames were readable — the rest were left blank.`,
    );
  }

  const rolls: number[] = [];
  frames.forEach((frame, index) => {
    rolls.push(...frameToRolls(frame, index, warnings));
  });

  if (!isValidRolls(rolls)) {
    throw new MarkParseError(
      'The marks add up to more pins than a frame holds — check the scan against the sheet.',
    );
  }

  return { rolls, frames, warnings };
}

/**
 * Best-effort parse for the review screen: never throws, so a partly unreadable
 * sheet still shows the bowler what was recognised.
 */
export function tryParseMarks(raw: string): ParsedSheet | { error: string } {
  try {
    return parseMarks(raw);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
