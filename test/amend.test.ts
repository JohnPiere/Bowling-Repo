import { describe, expect, it } from 'vitest';
import {
  editableFrames,
  frameBounds,
  isValidRolls,
  replaceFrame,
  scoreGame,
} from '../src/lib/scoring';
import { deckFor, leavesFromPinfalls } from '../src/lib/pins';

/** Pins for a ball, as the rack would have recorded them. */
function fell(from: number[], count: number): number[] {
  return from.slice(0, count);
}

/** A game bowled on the rack, so rolls and pinfalls stay in step. */
function bowl(frames: number[][]): { rolls: number[]; pinfalls: number[][] } {
  const rolls: number[] = [];
  const pinfalls: number[][] = [];
  for (const frame of frames) {
    for (const count of frame) {
      const standing = deckFor(rolls, pinfalls);
      rolls.push(count);
      pinfalls.push(fell(standing, count));
    }
  }
  return { rolls, pinfalls };
}

describe('frameBounds', () => {
  it('is ten frames whatever has been bowled', () => {
    expect(frameBounds([]).length).toBe(10);
    expect(frameBounds([10, 9, 1]).length).toBe(10);
  });

  it('gives a strike one ball and an open two', () => {
    const bounds = frameBounds([10, 9, 0, 7, 3]);
    expect(bounds[0]).toEqual({ start: 0, length: 1 });
    expect(bounds[1]).toEqual({ start: 1, length: 2 });
    expect(bounds[2]).toEqual({ start: 3, length: 2 });
  });

  it('gives the tenth its three balls after a mark', () => {
    const rolls = [...Array(9).fill(10), 10, 10, 10];
    expect(frameBounds(rolls)[9]).toEqual({ start: 9, length: 3 });
  });

  it('gives a frame not yet bowled a length of zero', () => {
    const bounds = frameBounds([10]);
    expect(bounds[1]).toEqual({ start: 1, length: 0 });
    expect(bounds[9]).toEqual({ start: 1, length: 0 });
  });
});

describe('editableFrames', () => {
  it('has nothing to offer before a frame is finished', () => {
    expect(editableFrames([])).toEqual([]);
    expect(editableFrames([3])).toEqual([]);
  });

  it('offers a frame once it is done', () => {
    expect(editableFrames([3, 4])).toEqual([0]);
    expect(editableFrames([10, 3, 4])).toEqual([0, 1]);
  });

  it('leaves out the frame being bowled, which is Undo the job', () => {
    // Frame 1 is finished; frame 2 has one ball in it and is where the next
    // ball goes.
    expect(editableFrames([3, 4, 5])).toEqual([0]);
  });

  it('offers the tenth once the game is over', () => {
    const rolls = Array(12).fill(10);
    expect(editableFrames(rolls)).toContain(9);
  });
});

describe('replaceFrame', () => {
  it('keeps everything thrown after it', () => {
    const rolls = [10, 9, 0, 7, 3, 10];
    const next = replaceFrame(rolls, [], 1, [5, 4], []);
    expect(next.rolls).toEqual([10, 5, 4, 7, 3, 10]);
  });

  it('shifts the later balls when a frame gets shorter', () => {
    // Frame 2 was two balls and becomes a strike, so the list loses one.
    const rolls = [10, 9, 0, 7, 3, 8];
    const next = replaceFrame(rolls, [], 1, [10], []);
    expect(next.rolls).toEqual([10, 10, 7, 3, 8]);
    // And what follows is still the same three balls, in the same frames.
    const frames = scoreGame(next.rolls).frames;
    expect(frames[2].rolls).toEqual([7, 3]);
    expect(frames[3].rolls).toEqual([8]);
  });

  it('shifts them the other way when a frame gets longer', () => {
    const rolls = [10, 10, 7, 3, 8];
    const next = replaceFrame(rolls, [], 1, [4, 5], []);
    expect(next.rolls).toEqual([10, 4, 5, 7, 3, 8]);
  });

  it('rescores the frame before it, because a mark takes its bonus from here', () => {
    // A strike, then an open second, then a 5: the first is 10 + 9 + 0 = 19.
    expect(scoreGame([10, 9, 0, 5]).frames[0].score).toBe(19);
    // Make the second a strike and the first frame is worth more, without the
    // first frame being touched at all: 10 + 10 + 5.
    const next = replaceFrame([10, 9, 0, 5], [], 1, [10], []);
    expect(next.rolls).toEqual([10, 10, 5]);
    expect(scoreGame(next.rolls).frames[0].score).toBe(25);
  });

  it('leaves the caller arrays alone', () => {
    const rolls = [10, 9, 0];
    const pinfalls = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9], []];
    replaceFrame(rolls, pinfalls, 1, [10], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    expect(rolls).toEqual([10, 9, 0]);
    expect(pinfalls.length).toBe(3);
  });

  it('does nothing to a frame that is not there', () => {
    const rolls = [10, 9, 0];
    expect(replaceFrame(rolls, [], 47, [5], []).rolls).toEqual(rolls);
  });

  it('keeps an empty pinfall list empty rather than making a ragged one', () => {
    // A game entered on the pad has no pin data, and half a list is worse than
    // none: every later ball would read against the wrong frame.
    const next = replaceFrame([10, 9, 0], [], 1, [10], [[1, 2, 3]]);
    expect(next.pinfalls).toEqual([]);
  });
});

describe('replaceFrame keeps rolls and pinfalls in step', () => {
  // The failure this is really guarding is the one `leavesFromPinfalls` had:
  // pins recorded against the wrong ball, which nothing downstream can tell
  // apart from pins that actually fell that way.
  const game = bowl([[10], [9, 0], [7, 3], [10], [5, 4], [10], [8, 1], [10], [6, 2], [9, 1, 10]]);

  it('starts from a game whose halves agree', () => {
    expect(game.rolls.length).toBe(game.pinfalls.length);
    expect(isValidRolls(game.rolls)).toBe(true);
  });

  for (const [label, frame, newRolls] of [
    ['an open into a strike', 1, [10]],
    ['a strike into an open', 3, [4, 3]],
    ['a spare into an open', 2, [7, 1]],
    ['an open into a spare', 4, [5, 5]],
  ] as [string, number, number[]][]) {
    it(`survives turning ${label}`, () => {
      // The replacement's pins are thrown at whatever the frame actually
      // offers, which is what the rack would have handed the bowler.
      const before = frameBounds(game.rolls)[frame].start;
      const prefixRolls = game.rolls.slice(0, before);
      const prefixPins = game.pinfalls.slice(0, before);

      const newPinfalls: number[][] = [];
      const running = [...prefixRolls];
      const runningPins = [...prefixPins];
      for (const count of newRolls) {
        const standing = deckFor(running, runningPins);
        const pins = fell(standing, count);
        running.push(count);
        runningPins.push(pins);
        newPinfalls.push(pins);
      }

      const next = replaceFrame(game.rolls, game.pinfalls, frame, newRolls, newPinfalls);

      expect(next.rolls.length).toBe(next.pinfalls.length);
      expect(isValidRolls(next.rolls)).toBe(true);

      // The two halves of one fact, checked against each other — the same
      // property that caught the original bug.
      const leaves = leavesFromPinfalls(next.pinfalls, next.rolls);
      const opens = new Set<number>();
      let at = 0;
      for (const one of scoreGame(next.rolls).frames) {
        opens.add(at);
        at += one.rolls.length;
      }
      for (let ball = 1; ball < next.rolls.length; ball++) {
        if (opens.has(ball)) continue;
        // The tenth re-racks mid-frame after a mark, so a ball there can not
        // open a frame and still be thrown at a full rack. "Nothing left
        // standing" is the signal for that, and it is the same rule
        // `leavesFromPinfalls` applies to decide it.
        if (leaves[ball - 1].length === 0) continue;
        const offered = deckFor(next.rolls.slice(0, ball), next.pinfalls.slice(0, ball));
        expect([...offered].sort((a, b) => a - b)).toEqual(
          [...leaves[ball - 1]].sort((a, b) => a - b),
        );
      }
    });
  }
});
