/**
 * The ten-frame strip on the play screen.
 *
 * The screen draws two rows of five cells, each carrying its number, its
 * running total, a pin diagram of what that frame took down, and a box per
 * ball. Everything a cell shows is decided here so the screen stays layout.
 *
 * The pin diagram is the point of it: a frame that scored 9 tells you nothing,
 * and a frame that scored 9 with the 10-pin still up tells you what to work
 * on. Ten of them side by side is the shape of the game.
 */

import { FULL_RACK, PIN_POSITIONS } from './pins';
import { scoreGame, FRAMES_PER_GAME, PINS } from './scoring';

/** Rows of the rack, back row first, so the diagram draws top to bottom. */
export const PIN_ROWS: number[][] = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

export interface RollBox {
  /** `X`, `/`, a count, or empty for a ball not thrown. */
  mark: string;
  /** The ball the next tap fills. At most one box in the strip has this. */
  isLive: boolean;
  /** The tenth's third box, which only exists once a mark has earned it. */
  isBonus: boolean;
}

export interface StripFrame {
  /** 1-based, as it is written on the sheet. */
  number: number;
  /** Cumulative score, or null while it waits on bonus balls. */
  total: number | null;
  /** Two boxes, or three in the tenth. */
  boxes: RollBox[];
  /** Pins this frame has taken down, including the ball being entered. */
  down: number[];
  /**
   * The same pins, split by which ball took them — index 0 is the first ball.
   *
   * A paper sheet has carried this all along: its legend gives an open ring to
   * a pin the first ball took and a filled one to a pin that was *standing
   * after ball one*, so a single diagram says both leaves. The flat `down`
   * threw that away and drew a 9-spare identically to a strike.
   */
  downBy: number[][];
  isCurrent: boolean;
  isComplete: boolean;
  isStrike: boolean;
}

/**
 * One cell per frame.
 *
 * `pinfalls` is per *ball* and optional — a game entered on the number pad has
 * counts and nothing more — so a frame with no pin record simply draws an
 * empty rack rather than guessing which pins a 7 took.
 */
export function frameStrip(
  rolls: number[],
  pinfalls: number[][],
  pending: number[],
  activeFrame: number | null,
): StripFrame[] {
  const card = scoreGame(rolls);

  // Where each frame's balls start in the flat roll list. `frame.rolls` is a
  // contiguous slice of it, so the offsets fall out of the lengths.
  let ballIndex = 0;

  return card.frames.map((frame) => {
    const start = ballIndex;
    ballIndex += frame.rolls.length;

    const isCurrent = frame.index === activeFrame;
    const down = new Set<number>();
    const downBy: number[][] = [];
    for (let i = start; i < start + frame.rolls.length; i++) {
      const took = pinfalls[i] ?? [];
      downBy.push([...took]);
      for (const pin of took) down.add(pin);
    }
    // The ball being entered shows in its own frame as it is tapped, so the
    // strip and the rack below never disagree about what has just fallen. It
    // belongs to the ball it is: the next one.
    if (isCurrent && pending.length > 0) {
      while (downBy.length < frame.rolls.length + 1) downBy.push([]);
      downBy[frame.rolls.length] = [...pending];
      for (const pin of pending) down.add(pin);
    }

    return {
      number: frame.index + 1,
      total: frame.score,
      boxes: boxesFor(frame.rolls, frame.index, isCurrent),
      down: FULL_RACK.filter((pin) => down.has(pin)),
      downBy,
      isCurrent,
      isComplete: frame.isComplete,
      isStrike: frame.isStrike,
    };
  });
}

/**
 * The boxes across the bottom of a cell.
 *
 * Written the way a paper sheet writes them, which is not the way the rolls
 * are stored: a strike leaves the second box *empty* rather than putting the
 * ten in it, because that is the shape a bowler reads a sheet by.
 */
function boxesFor(frameRolls: number[], index: number, isCurrent: boolean): RollBox[] {
  const isTenth = index === FRAMES_PER_GAME - 1;
  const count = isTenth ? 3 : 2;
  const live = isCurrent ? liveBox(frameRolls, isTenth) : -1;

  return Array.from({ length: count }, (_, box) => ({
    mark: markFor(frameRolls, box, isTenth),
    isLive: box === live,
    isBonus: isTenth && box === 2,
  }));
}

/** Which box the next ball fills, or -1 when the frame is done. */
function liveBox(frameRolls: number[], isTenth: boolean): number {
  if (isTenth) return frameRolls.length;
  // A strike ends the frame, so its second box is never live.
  if (frameRolls[0] === PINS) return -1;
  return frameRolls.length;
}

function markFor(frameRolls: number[], box: number, isTenth: boolean): string {
  if (isTenth) {
    if (frameRolls.length <= box) return '';
    const roll = frameRolls[box];
    if (roll === PINS) return 'X';
    // In the tenth the rack resets after a mark, so a ten in the second box is
    // a strike on a fresh rack, not a spare — only a pair on the same rack is.
    const before = frameRolls[box - 1];
    if (box > 0 && before !== PINS && before + roll === PINS) return '/';
    return roll === 0 ? '-' : String(roll);
  }

  if (box === 0) {
    if (frameRolls.length === 0) return '';
    if (frameRolls[0] === PINS) return 'X';
    // A gutter is a dash, the way `frameMarks` writes it and the way the
    // scorecard, the export and the shareable card all print it. The strip
    // wrote a bare `0`, which was the only place in the app using a third
    // notation for the same throw.
    return frameRolls[0] === 0 ? '-' : String(frameRolls[0]);
  }

  // The second box of a struck frame stays blank: on paper the X sits alone.
  if (frameRolls[0] === PINS) return '';
  if (frameRolls.length < 2) return '';
  if (frameRolls[0] + frameRolls[1] === PINS) return '/';
  return frameRolls[1] === 0 ? '-' : String(frameRolls[1]);
}

export interface PinDot {
  pin: number;
  isDown: boolean;
  /** Which ball took it — 0 for the first — or -1 while it still stands. */
  ball: number;
}

/**
 * The dot grid for a cell, back row first.
 *
 * Returns which pins are down and to which ball, rather than colours, because
 * a cell in the strip, the rack under it and the shareable card all want the
 * same fact drawn three different sizes.
 *
 * Takes either shape: a flat list is every pin attributed to the first ball,
 * which is what a caller that has no per-ball record can honestly say.
 */
export function pinRows(down: number[] | number[][]): PinDot[][] {
  const byPin = new Map<number, number>();
  if (down.length > 0 && Array.isArray(down[0])) {
    (down as number[][]).forEach((pins, ball) => {
      // First one wins: a pin cannot fall twice, and a rack that re-racks
      // mid-frame in the tenth starts the count again anyway.
      for (const pin of pins) if (!byPin.has(pin)) byPin.set(pin, ball);
    });
  } else {
    for (const pin of down as number[]) byPin.set(pin, 0);
  }

  return PIN_ROWS.map((row) =>
    row.map((pin) => ({ pin, isDown: byPin.has(pin), ball: byPin.get(pin) ?? -1 })),
  );
}

/** Left-to-right order within a rack row, for laying the buttons out. */
export function rackRows(): number[][] {
  return PIN_ROWS.map((row) => [...row].sort((a, b) => PIN_POSITIONS[a].x - PIN_POSITIONS[b].x));
}
