import { describe, expect, it } from 'vitest';
import { checkAgainstTotals, cleanTotals, repairFrames } from '../src/lib/reconcile';
import { parseMarks } from '../src/lib/marks';

describe('cleanTotals', () => {
  it('keeps a column that behaves like running totals', () => {
    const totals = [9, 17, 36, 45, 63, 71, 88, 95, 114, 123];
    expect(cleanTotals(totals)).toEqual(totals);
  });

  it('drops a total that would mean the score went down', () => {
    expect(cleanTotals([9, 17, 8, 45])).toEqual([9, 17, null, 45]);
  });

  it('drops a total that would mean a frame was worth more than thirty', () => {
    // 195 between 88 and 114 is a 95 with the frame's own rule read as a 1.
    expect(cleanTotals([88, 195, 114])).toEqual([88, null, 114]);
  });

  it('keeps the longest chain rather than everything after the first mistake', () => {
    // Walking left to right and stopping at the first bad value would throw
    // away eight good totals for one misread.
    const cleaned = cleanTotals([400, 17, 36, 45, 63, 71, 88, 95, 114, 123]);
    expect(cleaned[0]).toBeNull();
    expect(cleaned.slice(1)).toEqual([17, 36, 45, 63, 71, 88, 95, 114, 123]);
  });

  it('has nothing to keep when nothing was read', () => {
    expect(cleanTotals([null, null])).toEqual([null, null]);
  });
});

describe('repairFrames', () => {
  const frames = (text: string) => text.split(' ').map((frame) => frame.split(''));
  const text = (of: string[][]) => of.map((frame) => frame.join('')).join(' ');

  it('fills in a first ball the scan lost', () => {
    // "-" alone is a miss with nothing before it. The total climbed by eight,
    // so eight is what the first ball took.
    const { frames: fixed, repaired } = repairFrames(frames('81 8- 9/ - 63'), [9, 17, 36, 44, 53]);
    expect(fixed[3]).toEqual(['8', '-']);
    expect(repaired).toEqual([3]);
  });

  it('fills in a second ball the scan lost', () => {
    const { frames: fixed } = repairFrames(frames('8 8- 9/'), [9, 17, 36]);
    expect(fixed[0]).toEqual(['8', '1']);
  });

  it('drops the extra mark a rule left in a frame', () => {
    // A frame's own rule read as a 1 beside the two real marks.
    const { frames: fixed } = repairFrames(frames('4- 2/ 44 116'), [4, 18, 26, 33]);
    expect(fixed[3]).toEqual(['1', '6']);
  });

  it('leaves a frame alone when two pairs would both fit', () => {
    const { frames: fixed, repaired } = repairFrames(frames('4- 2/ 44 143'), [4, 18, 26, 30]);
    expect(fixed[3]).toEqual(['1', '4', '3']);
    expect(repaired).toEqual([]);
  });

  it('leaves the ball before a spare alone', () => {
    // It does not change the score by a pin, so filling it in would be
    // inventing a detail rather than deriving one.
    const { frames: fixed, repaired } = repairFrames(frames('81 /'), [9, 29]);
    expect(fixed[1]).toEqual(['/']);
    expect(repaired).toEqual([]);
  });

  it('says nothing about a frame whose total was not read', () => {
    const { repaired } = repairFrames(frames('81 8- -'), [9, 17, null]);
    expect(repaired).toEqual([]);
  });

  it('refuses a frame whose total climbed by more than an open frame can', () => {
    // Eleven pins is not an open frame, so the marks are not what is wrong.
    const { repaired } = repairFrames(frames('81 8- 5'), [9, 17, 28]);
    expect(repaired).toEqual([]);
  });

  it('derives the tenth’s last ball from the final total', () => {
    // Three marks are written where every other frame writes two, so the last
    // sits in the narrowest box on the sheet and is the one most often lost.
    const marks = frames('X 61 7- 8- 63 34 9/ X 8- X6');
    const { frames: fixed } = repairFrames(marks, [17, 24, 31, 39, 48, 55, 75, 93, 101, 120]);
    expect(fixed[9]).toEqual(['X', '6', '3']);
  });

  it('writes a ten in the tenth as a strike', () => {
    // Two of the tenth's three balls read, and thirty on the paper: the third
    // was a strike as well.
    const marks = frames('X X X X X X X X X XX');
    const { frames: fixed } = repairFrames(marks, [
      30, 60, 90, 120, 150, 180, 210, 240, 270, 300,
    ]);
    expect(fixed[9]).toEqual(['X', 'X', 'X']);
  });

  it('leaves the tenth alone when it is already whole', () => {
    const { repaired } = repairFrames(frames('81 8- 9/ 9- 8/ 8- X 7- X 9-'), [
      9, 17, 36, 45, 63, 71, 88, 95, 114, 123,
    ]);
    expect(repaired).toEqual([]);
  });

  it('gives back a game the parser can read', () => {
    const { frames: fixed } = repairFrames(frames('X 61 7- - 63 34 9/ X 8- X6'), [
      17, 24, 31, 39, 48, 55, 75, 93, 101, 120,
    ]);
    expect(parseMarks(text(fixed)).rolls.length).toBeGreaterThan(0);
  });
});

describe('checkAgainstTotals', () => {
  const game = parseMarks('81 8- 9/ 9- 8/ 8- X 7- X 9-').rolls;
  const printed = [9, 17, 36, 45, 63, 71, 88, 95, 114, 123];

  it('agrees with a sheet it matches all the way down', () => {
    expect(checkAgainstTotals(game, printed)).toEqual({ agree: 10, differ: 0, firstWrong: null });
  });

  it('names the first frame that parts company with the sheet', () => {
    const wrong = [...printed];
    wrong[4] = 61;
    expect(checkAgainstTotals(game, wrong).firstWrong).toBe(5);
  });

  it('says nothing about frames the sheet did not give up', () => {
    expect(checkAgainstTotals(game, [9, null, null, null, null, null, null, null, null, null])).toEqual(
      { agree: 1, differ: 0, firstWrong: null },
    );
  });

  it('has nothing to compare in a frame still waiting on its bonus', () => {
    // A tenth that has not been thrown out has no score yet, and comparing it
    // to the paper would report a disagreement that is only impatience.
    const pending = parseMarks('X X X X X X X X X X').rolls;
    const onlyTheLast = [null, null, null, null, null, null, null, null, null, 300];
    expect(checkAgainstTotals(pending, onlyTheLast)).toEqual({
      agree: 0,
      differ: 0,
      firstWrong: null,
    });
  });
});
