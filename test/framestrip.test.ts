import { describe, expect, it } from 'vitest';
import { frameStrip, pinRows, rackRows, PIN_ROWS } from '../src/lib/framestrip';

/** Marks across a frame's boxes, as a string, for readable assertions. */
const marks = (rolls: number[], pinfalls: number[][] = [], pending: number[] = []) =>
  frameStrip(rolls, pinfalls, pending, null).map((f) => f.boxes.map((b) => b.mark).join('|'));

describe('frameStrip boxes', () => {
  it('leaves a struck frame’s second box empty, the way a sheet writes it', () => {
    // Not "X|10": on paper the X sits alone, and that shape is how a frame is
    // read at a glance.
    expect(marks([10])[0]).toBe('X|');
  });

  it('writes a spare as a slash in the second box', () => {
    expect(marks([7, 3])[0]).toBe('7|/');
  });

  it('writes an open frame as two counts', () => {
    expect(marks([7, 2])[0]).toBe('7|2');
  });

  it('writes a gutter as its own zero rather than a blank', () => {
    expect(marks([0, 0])[0]).toBe('0|0');
  });

  it('gives the tenth three boxes and the rest two', () => {
    const strip = frameStrip([], [], [], null);
    expect(strip[0].boxes).toHaveLength(2);
    expect(strip[9].boxes).toHaveLength(3);
  });

  it('reads a ten in the tenth’s second box as a strike on a fresh rack', () => {
    // The rack resets after a mark, so X X is two strikes and not a spare.
    const rolls = [...new Array(18).fill(0), 10, 10, 10];
    expect(marks(rolls)[9]).toBe('X|X|X');
  });

  it('still reads a spare in the tenth when both balls share a rack', () => {
    const rolls = [...new Array(18).fill(0), 7, 3, 5];
    expect(marks(rolls)[9]).toBe('7|/|5');
  });

  it('marks the tenth’s third box as the bonus one', () => {
    const strip = frameStrip([], [], [], null);
    expect(strip[9].boxes.map((b) => b.isBonus)).toEqual([false, false, true]);
    expect(strip[0].boxes.every((b) => !b.isBonus)).toBe(true);
  });
});

describe('frameStrip live box', () => {
  it('marks the box the next ball fills', () => {
    const strip = frameStrip([7], [], [], 0);
    expect(strip[0].boxes.map((b) => b.isLive)).toEqual([false, true]);
  });

  it('never makes a struck frame’s second box live', () => {
    // A strike ends the frame; there is no second ball to aim at.
    const strip = frameStrip([10], [], [], 0);
    expect(strip[0].boxes.every((b) => !b.isLive)).toBe(true);
  });

  it('lights nothing when the frame is not the current one', () => {
    const strip = frameStrip([7], [], [], 3);
    expect(strip[0].boxes.every((b) => !b.isLive)).toBe(true);
  });
});

describe('frameStrip totals', () => {
  it('carries the running score through each frame', () => {
    const strip = frameStrip([7, 2, 5, 3], [], [], null);
    expect(strip[0].total).toBe(9);
    expect(strip[1].total).toBe(17);
  });

  it('leaves a frame blank while it waits on its bonus balls', () => {
    // A strike cannot be scored until two more balls are thrown, and printing
    // a provisional number there would be a score that later changes.
    expect(frameStrip([10], [], [], null)[0].total).toBeNull();
  });
});

describe('frameStrip pins', () => {
  it('collects every pin a frame took across both balls', () => {
    const strip = frameStrip(
      [3, 4],
      [
        [1, 2, 3],
        [5, 8, 9, 10],
      ],
      [],
      null,
    );
    expect(strip[0].down).toEqual([1, 2, 3, 5, 8, 9, 10]);
  });

  it('attributes each ball to the frame it was thrown in', () => {
    // Two frames, one ball each: a strike opens frame one, then frame two.
    const strip = frameStrip(
      [10, 4],
      [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [1, 2, 3, 4],
      ],
      [],
      null,
    );
    expect(strip[0].down).toHaveLength(10);
    expect(strip[1].down).toEqual([1, 2, 3, 4]);
  });

  it('shows the ball being entered in its own frame', () => {
    // So the strip and the rack under it never disagree about what just fell.
    const strip = frameStrip([], [], [1, 3], 0);
    expect(strip[0].down).toEqual([1, 3]);
    expect(strip[1].down).toEqual([]);
  });

  it('draws an empty rack for a game entered by count', () => {
    // A 7 on the number pad knows a 7 happened, not which pins it took, and
    // guessing would put a leave in the statistics nobody bowled.
    expect(frameStrip([7, 2], [], [], null)[0].down).toEqual([]);
  });

  it('returns pins in rack order however they were tapped', () => {
    expect(frameStrip([3], [[9, 1, 5]], [], null)[0].down).toEqual([1, 5, 9]);
  });
});

describe('pinRows', () => {
  it('draws the rack back row first, so it reads top to bottom', () => {
    expect(PIN_ROWS).toEqual([[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]]);
    expect(pinRows([]).map((row) => row.length)).toEqual([4, 3, 2, 1]);
  });

  it('flags the pins that went down', () => {
    const rows = pinRows([7, 1]);
    expect(rows[0][0]).toEqual({ pin: 7, isDown: true });
    expect(rows[0][1]).toEqual({ pin: 8, isDown: false });
    expect(rows[3][0]).toEqual({ pin: 1, isDown: true });
  });
});

describe('rackRows', () => {
  it('lays each row out left to right as it stands on the deck', () => {
    expect(rackRows()).toEqual([[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]]);
  });
});
