/**
 * The sheet's own check on a scan.
 *
 * A score sheet prints the running total under every frame, and that column is
 * a second, independent record of the same game: the marks say what was thrown
 * and the totals say what it came to, written by one machine from one throw.
 * Where the two agree, a scan is worth believing without squinting at the
 * photograph. Where they disagree, one of them is misread — and it is usually
 * the marks, because a column of numbers is the easiest thing on the page to
 * recognise and a mark is among the hardest.
 *
 * So this does two things with the totals: it repairs frames the recogniser
 * read short, and it says whether what came out matches the paper.
 *
 * It never invents a ball it cannot derive. A frame where the totals imply nine
 * pins and nothing at all was read stays empty for the bowler to fill in: the
 * score would be right and the two balls behind it would be a guess, and a
 * guess in somebody's history is worse than a blank.
 */

import { scoreGame } from './scoring';

/** The most a frame can add to the running total: a strike and two more. */
const MOST_PER_FRAME = 30;

/** The most any game can reach. */
const PERFECT = 300;

/**
 * Drop the totals that cannot be right.
 *
 * A column of running totals never decreases and never climbs by more than
 * thirty in a frame, which is enough to catch a misread outright: a 195 sitting
 * between 88 and 114 is not a total, it is a 95 with the frame's own rule read
 * as a 1 in front of it.
 *
 * The longest chain that obeys both rules is kept and everything else is
 * dropped, rather than walking left to right and discarding whatever comes
 * after the first bad value — one bad value early would otherwise cost the
 * whole column.
 */
export function cleanTotals(totals: (number | null)[]): (number | null)[] {
  const usable = totals.map((value) =>
    value !== null && Number.isInteger(value) && value >= 0 && value <= PERFECT ? value : null,
  );

  // Longest chain ending at each frame, by the two rules above.
  const length: number[] = usable.map((value) => (value === null ? 0 : 1));
  const from: number[] = usable.map(() => -1);

  for (let i = 0; i < usable.length; i++) {
    const value = usable[i];
    if (value === null) continue;

    for (let j = 0; j < i; j++) {
      const earlier = usable[j];
      if (earlier === null || length[j] === 0) continue;
      if (value < earlier || value - earlier > MOST_PER_FRAME * (i - j)) continue;
      if (length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        from[i] = j;
      }
    }
  }

  let end = -1;
  for (let i = 0; i < length.length; i++) if (end < 0 || length[i] > length[end]) end = i;

  const kept = new Set<number>();
  for (let at = end; at >= 0; at = from[at]) kept.add(at);

  return usable.map((value, i) => (kept.has(i) ? value : null));
}

/**
 * Fill in what the totals imply and the recogniser missed.
 *
 * Only open frames, and only where exactly one ball is missing. An open frame's
 * two balls are worth exactly what the running total climbed by, since nothing
 * carries into a frame that was not marked — so one ball plus the climb gives
 * the other, and there is nothing to guess.
 *
 * A frame that ends in a strike or a spare is left alone even when it is short:
 * the ball before a spare does not change the score by a single pin, so filling
 * it in from arithmetic would be inventing a detail rather than deriving one.
 *
 * The tenth is its own case, handled below. It re-racks, so its bonus balls are
 * inside it rather than borrowed from the frames after — which means the last
 * total on the sheet says exactly what the tenth was worth, and one missing
 * ball out of three follows from the other two.
 */
export function repairFrames(
  frames: string[][],
  totals: (number | null)[],
): { frames: string[][]; repaired: number[] } {
  const repaired: number[] = [];
  const fixed = frames.map((marks) => [...marks]);

  for (let i = 0; i < fixed.length && i < 9; i++) {
    const marks = fixed[i];
    if (marks.some((mark) => mark === 'X' || mark === '/')) continue;

    const climb = climbAt(totals, i);
    if (climb === null || climb < 0 || climb > 9) continue;

    if (marks.length === 1) {
      const known = pinsOf(marks[0]);
      if (known === null || known > climb) continue;

      // A lone dash is the second ball — the sheet writes the miss in the
      // second box — so what is missing is the first. A lone digit is the other
      // way round: it is the first ball, and the second was not read.
      const missing = String(climb - known);
      fixed[i] = marks[0] === '-' ? [missing, '-'] : [marks[0], missing];
      repaired.push(i);
      continue;
    }

    // Too many marks: a frame's own rule read as a 1 beside the two real ones.
    // The pair that adds up to what the total climbed by is the frame, and it
    // is only taken when exactly one pair does — two would be a guess.
    if (marks.length > 2) {
      const pairs = [];
      for (let at = 0; at + 1 < marks.length; at++) {
        const left = pinsOf(marks[at]);
        const right = pinsOf(marks[at + 1]);
        if (left !== null && right !== null && left + right === climb) pairs.push(at);
      }

      if (pairs.length === 1) {
        fixed[i] = [marks[pairs[0]], marks[pairs[0] + 1]];
        repaired.push(i);
      }
    }
  }

  if (repairTenth(fixed, totals)) repaired.push(fixed.length - 1);

  return { frames: fixed, repaired };
}

/**
 * The tenth's last ball, where the sheet's final total gives it away.
 *
 * The commonest thing missing from a scanned tenth is its third ball: three
 * marks are written where every other frame writes two, so the last is in the
 * narrowest box on the sheet. Two of the three and the frame's own total are
 * enough to say what it was.
 */
function repairTenth(frames: string[][], totals: (number | null)[]): boolean {
  const at = frames.length - 1;
  if (at !== 9) return false;

  const marks = frames[at];
  const climb = climbAt(totals, at);
  if (climb === null || climb < 0 || climb > 30) return false;

  // Three balls when the first is a strike or the first two make a spare.
  const balls = marks[0] === 'X' || marks[1] === '/' ? 3 : 2;
  if (marks.length !== balls - 1) return false;

  const sofar = tenthPins(marks);
  if (sofar === null) return false;

  const missing = climb - sofar;
  if (missing < 0 || missing > 10) return false;

  frames[at] = [...marks, missing === 10 ? 'X' : String(missing)];
  return true;
}

/** What the tenth's marks are worth so far, or null if they make no sense. */
function tenthPins(marks: string[]): number | null {
  let total = 0;
  let previous = 0;

  for (const mark of marks) {
    if (mark === 'X') previous = 10;
    else if (mark === '/') previous = 10 - previous;
    else {
      const pins = pinsOf(mark);
      if (pins === null) return null;
      previous = pins;
    }
    total += previous;
  }

  return total;
}

/**
 * How far the running total climbed through frame `i`, or null when the sheet
 * did not say.
 */
function climbAt(totals: (number | null)[], i: number): number | null {
  const now = totals[i] ?? null;
  if (now === null) return null;
  if (i === 0) return now;

  const before = totals[i - 1] ?? null;
  return before === null ? null : now - before;
}

/** What a mark is worth as a count, or null when it is not one. */
function pinsOf(mark: string): number | null {
  if (mark === '-') return 0;
  return /^[0-9]$/.test(mark) ? Number(mark) : null;
}

export interface TotalsCheck {
  /** Frames where the scored total and the printed one are the same. */
  agree: number;
  /** …and where they are not. */
  differ: number;
  /** The first frame that disagrees, 1-based, or null. */
  firstWrong: number | null;
}

/**
 * Whether a game agrees with the totals printed beneath it.
 *
 * Compared only where both are known: a frame whose total could not be read
 * says nothing either way, and a frame still waiting on its bonus balls has no
 * score to compare yet.
 */
export function checkAgainstTotals(rolls: number[], totals: (number | null)[]): TotalsCheck {
  const scored = scoreGame(rolls).frames;

  let agree = 0;
  let differ = 0;
  let firstWrong: number | null = null;

  for (let i = 0; i < scored.length; i++) {
    const printed = totals[i] ?? null;
    const own = scored[i]?.score ?? null;
    if (printed === null || own === null) continue;

    if (printed === own) agree += 1;
    else {
      differ += 1;
      if (firstWrong === null) firstWrong = i + 1;
    }
  }

  return { agree, differ, firstWrong };
}
