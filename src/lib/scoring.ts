/**
 * Ten-pin bowling scoring.
 *
 * Rolls are stored as a flat list of pin counts, exactly as they were thrown.
 * Everything else (frame boundaries, strikes, spares, bonus balls, the funny
 * shape of the tenth frame) is derived from that list, so a partially played
 * game is just a shorter list.
 */

export const FRAMES_PER_GAME = 10;
export const PINS = 10;

export interface Frame {
  /** 0-based frame number. */
  index: number;
  /** Pin counts thrown in this frame (up to 3 in the tenth). */
  rolls: number[];
  /** Cumulative score through this frame, or null while bonus balls are pending. */
  score: number | null;
  isStrike: boolean;
  isSpare: boolean;
  /** True once no further ball can be thrown in this frame. */
  isComplete: boolean;
}

export interface Scorecard {
  frames: Frame[];
  /** Cumulative score through the last frame that can be scored. */
  total: number;
  /** True when all ten frames (and any bonus balls) have been thrown. */
  isComplete: boolean;
}

/** Frame index a roll belongs to, plus how many rolls precede it in that frame. */
interface RollCursor {
  frame: number;
  rollInFrame: number;
}

/**
 * Walk the roll list and record where each frame starts. A frame ends after a
 * strike or two balls; the tenth runs to three balls when it is opened with a
 * mark.
 */
function frameSlices(rolls: number[]): number[][] {
  const slices: number[][] = [];
  let i = 0;

  for (let frame = 0; frame < FRAMES_PER_GAME; frame++) {
    if (i >= rolls.length) {
      slices.push([]);
      continue;
    }

    if (frame === FRAMES_PER_GAME - 1) {
      // The tenth frame keeps its bonus balls rather than borrowing from a
      // frame that does not exist.
      const tenth = rolls.slice(i, i + 3);
      const earnsThird =
        tenth[0] === PINS || (tenth.length >= 2 && tenth[0] + tenth[1] === PINS);
      slices.push(earnsThird ? tenth : tenth.slice(0, 2));
      i += slices[frame].length;
      continue;
    }

    if (rolls[i] === PINS) {
      slices.push([rolls[i]]);
      i += 1;
    } else {
      slices.push(rolls.slice(i, i + 2));
      i += slices[frame].length;
    }
  }

  return slices;
}

/**
 * Score a game from its flat roll list.
 *
 * Frames whose bonus balls have not been thrown yet score `null` rather than a
 * provisional number, so a live scorecard never shows a total it might revise.
 */
export function scoreGame(rolls: number[]): Scorecard {
  const slices = frameSlices(rolls);

  // Index of the first roll of each frame within the flat list, so bonus
  // lookups can read past the end of their own frame.
  const starts: number[] = [];
  let cursor = 0;
  for (const slice of slices) {
    starts.push(cursor);
    cursor += slice.length;
  }

  const frames: Frame[] = [];
  let running = 0;
  let stillScoring = true;

  for (let index = 0; index < FRAMES_PER_GAME; index++) {
    const frameRolls = slices[index];
    const start = starts[index];
    const isTenth = index === FRAMES_PER_GAME - 1;

    const isStrike = frameRolls[0] === PINS;
    const isSpare =
      !isStrike && frameRolls.length >= 2 && frameRolls[0] + frameRolls[1] === PINS;

    let value: number | null = null;
    let isComplete: boolean;

    if (isTenth) {
      const needed = isStrike || isSpare ? 3 : 2;
      isComplete = frameRolls.length === needed;
      if (isComplete) value = frameRolls.reduce((a, b) => a + b, 0);
    } else if (isStrike) {
      isComplete = true;
      const bonus = rolls.slice(start + 1, start + 3);
      if (bonus.length === 2) value = PINS + bonus[0] + bonus[1];
    } else if (isSpare) {
      isComplete = true;
      const bonus = rolls.slice(start + 2, start + 3);
      if (bonus.length === 1) value = PINS + bonus[0];
    } else {
      isComplete = frameRolls.length === 2;
      if (isComplete) value = frameRolls[0] + frameRolls[1];
    }

    // Once one frame is unscorable every later frame is too, so the running
    // total stops rather than skipping a gap.
    if (value === null) stillScoring = false;
    if (stillScoring) running += value as number;

    frames.push({
      index,
      rolls: frameRolls,
      score: stillScoring ? running : null,
      isStrike,
      isSpare,
      isComplete,
    });
  }

  return {
    frames,
    total: running,
    isComplete: frames[FRAMES_PER_GAME - 1].isComplete,
  };
}

/** Where the next ball would land, or null if the game is over. */
export function nextRollCursor(rolls: number[]): RollCursor | null {
  const slices = frameSlices(rolls);

  for (let frame = 0; frame < FRAMES_PER_GAME; frame++) {
    const frameRolls = slices[frame];
    const isTenth = frame === FRAMES_PER_GAME - 1;

    if (isTenth) {
      const isStrike = frameRolls[0] === PINS;
      const isSpare =
        !isStrike && frameRolls.length >= 2 && frameRolls[0] + frameRolls[1] === PINS;
      const needed = isStrike || isSpare ? 3 : 2;
      if (frameRolls.length < needed) {
        return { frame, rollInFrame: frameRolls.length };
      }
      return null;
    }

    if (frameRolls[0] === PINS) continue;
    if (frameRolls.length < 2) return { frame, rollInFrame: frameRolls.length };
  }

  return null;
}

/**
 * Pins still standing for the next ball. Drives the scoring keypad so it can
 * never offer a count that is not physically available.
 */
export function pinsAvailable(rolls: number[]): number {
  const cursor = nextRollCursor(rolls);
  if (!cursor) return 0;

  const slices = frameSlices(rolls);
  const frameRolls = slices[cursor.frame];
  const isTenth = cursor.frame === FRAMES_PER_GAME - 1;

  if (!isTenth) {
    return cursor.rollInFrame === 0 ? PINS : PINS - frameRolls[0];
  }

  // The tenth resets the rack after a strike or a spare.
  if (cursor.rollInFrame === 0) return PINS;
  if (cursor.rollInFrame === 1) {
    return frameRolls[0] === PINS ? PINS : PINS - frameRolls[0];
  }
  // Third ball: available only after a mark, and the rack is fresh unless the
  // second ball was itself an open count on a fresh rack.
  if (frameRolls[0] === PINS && frameRolls[1] !== PINS) return PINS - frameRolls[1];
  return PINS;
}

/** True when `rolls` is a legal, physically possible roll sequence. */
export function isValidRolls(rolls: number[]): boolean {
  const partial: number[] = [];
  for (const roll of rolls) {
    if (!Number.isInteger(roll) || roll < 0 || roll > PINS) return false;
    if (roll > pinsAvailable(partial)) return false;
    partial.push(roll);
  }
  return true;
}

/** Rolls remaining before the game is finished. */
export function isGameComplete(rolls: number[]): boolean {
  return nextRollCursor(rolls) === null;
}

/**
 * Render a frame the way it appears on a paper sheet: X for a strike, / for a
 * spare, - for a miss.
 */
export function frameMarks(frame: Frame): string[] {
  const marks: string[] = [];
  frame.rolls.forEach((roll, i) => {
    if (roll === PINS) {
      const opensRack = i === 0 || marks[i - 1] === 'X' || marks[i - 1] === '/';
      marks.push(opensRack ? 'X' : '/');
    } else if (i > 0 && marks[i - 1] !== 'X' && marks[i - 1] !== '/' && frame.rolls[i - 1] + roll === PINS) {
      marks.push('/');
    } else if (roll === 0) {
      marks.push('-');
    } else {
      marks.push(String(roll));
    }
  });
  return marks;
}

/**
 * Would clearing the deck right now be a strike, or a spare?
 *
 * Not the same question as "are ten pins standing", which is what the play
 * screen asked and why a gutter ball broke it: a gutter leaves all ten up, so
 * knocking them all down with the *second* ball of the frame was announced as
 * a strike — on the quick button, on the commit button and in the shout under
 * the rack, three times at once. The scorer had it right the whole time and
 * wrote the spare down correctly; only the words were wrong, which is the kind
 * of wrong that makes somebody distrust the score that is actually fine.
 *
 * The tenth is why this is not simply "first ball of the frame". It re-racks
 * after a mark, so its second and third balls can face a fresh rack too, and
 * clearing one of those is another strike.
 */
export function clearingIsStrike(rolls: number[]): boolean {
  const cursor = nextRollCursor(rolls);
  if (!cursor) return false;
  if (cursor.rollInFrame === 0) return true;
  if (cursor.frame !== FRAMES_PER_GAME - 1) return false;

  const tenth = frameSlices(rolls)[FRAMES_PER_GAME - 1];
  // Second ball: fresh only behind a strike.
  if (cursor.rollInFrame === 1) return tenth[0] === PINS;
  // Third: fresh when the first two cleared the rack between them, either as
  // two strikes or as a spare.
  return tenth[0] === PINS ? tenth[1] === PINS : tenth[0] + tenth[1] === PINS;
}

/**
 * Where each frame's balls sit in the flat roll list.
 *
 * The list is flat because that is what the scorer reads, and a frame is one
 * ball or two or three depending on what was thrown — so "frame 3" is a slice
 * to be found rather than an index that can be computed. Always ten entries;
 * a frame not yet bowled has a length of zero.
 */
export function frameBounds(rolls: number[]): { start: number; length: number }[] {
  const bounds: { start: number; length: number }[] = [];
  let start = 0;
  for (const frame of scoreGame(rolls).frames) {
    bounds.push({ start, length: frame.rolls.length });
    start += frame.rolls.length;
  }
  return bounds;
}

/**
 * Frames that can be re-entered.
 *
 * Finished, and not the one being bowled: correcting the ball you have just
 * thrown is Undo's job, and two ways to do the same thing on the same screen
 * would fight over the same tap.
 */
export function editableFrames(rolls: number[]): number[] {
  const cursor = nextRollCursor(rolls);
  return scoreGame(rolls)
    .frames.filter(
      (frame) => frame.isComplete && frame.rolls.length > 0 && frame.index !== cursor?.frame,
    )
    .map((frame) => frame.index);
}

/**
 * Put different balls in one frame, keeping everything thrown after it.
 *
 * A strike is one ball and an open is two, so replacing a frame changes the
 * *length* of the list and shifts every later ball along it. That is fine —
 * the scorer re-derives frames from the list — but it is why this cannot be an
 * assignment to an index.
 *
 * `pinfalls` travels with `rolls` because it is indexed by the same list, ball
 * for ball. Splicing one without the other would put every later ball's pins
 * against the wrong ball: the same failure `leavesFromPinfalls` had, and the
 * same reason it went unnoticed — nothing downstream can tell a wrong leave
 * from one that happened.
 */
export function replaceFrame(
  rolls: number[],
  pinfalls: number[][],
  frame: number,
  newRolls: number[],
  newPinfalls: number[][],
): { rolls: number[]; pinfalls: number[][] } {
  const bounds = frameBounds(rolls)[frame];
  if (!bounds) return { rolls: [...rolls], pinfalls: [...pinfalls] };

  const { start, length } = bounds;
  return {
    rolls: [...rolls.slice(0, start), ...newRolls, ...rolls.slice(start + length)],
    // A game entered on the pad has no pinfalls at all, and an empty list has
    // to stay empty rather than becoming a ragged one with a hole before it.
    pinfalls:
      pinfalls.length === 0
        ? []
        : [...pinfalls.slice(0, start), ...newPinfalls, ...pinfalls.slice(start + length)],
  };
}
