import { describe, expect, it } from 'vitest';
import { scorecardCells, scorecardFilename } from '../src/lib/scorecard';
import { parseMarks } from '../src/lib/marks';
import { scoreGame } from '../src/lib/scoring';
import type { Game } from '../src/lib/db';

const AT = Date.UTC(2026, 7, 14, 19, 30);

function game(marks: string): Game {
  const rolls = parseMarks(marks).rolls;
  const card = scoreGame(rolls);
  return {
    id: 'g1',
    bowler: 'You',
    rolls,
    total: card.total,
    isComplete: card.isComplete,
    source: 'manual',
    playedAt: AT,
    updatedAt: AT,
  };
}

describe('scorecardCells', () => {
  it('gives ten cells, numbered as the sheet numbers them', () => {
    const cells = scorecardCells(game('81 8- 9/ 9- 8/ 8- X 7- X 9-'));
    expect(cells).toHaveLength(10);
    expect(cells.map((cell) => cell.frame)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('writes the marks the way they were thrown', () => {
    const cells = scorecardCells(game('81 8- 9/ 9- 8/ 8- X 7- X 9-'));
    expect(cells[0].marks).toBe('8 1');
    expect(cells[2].marks).toBe('9 /');
    expect(cells[6].marks).toBe('X');
  });

  it('carries the running total under each frame', () => {
    const cells = scorecardCells(game('81 8- 9/ 9- 8/ 8- X 7- X 9-'));
    expect(cells.map((cell) => cell.total)).toEqual(
      ['9', '17', '36', '45', '63', '71', '88', '95', '114', '123'],
    );
  });

  it('leaves a total blank while the frame is still waiting on its bonus', () => {
    // Zero is a score somebody could have, and printing one for "not known yet"
    // is exactly the kind of thing that ends up in a screenshot.
    const cells = scorecardCells(game('X'));
    expect(cells[0].total).toBe('');
    expect(cells[0].marks).toBe('X');
  });

  it('fits all three of the tenth’s balls in one cell', () => {
    const cells = scorecardCells(game('X X X X X X X X X XXX'));
    expect(cells[9].marks).toBe('X X X');
    expect(cells[9].total).toBe('300');
  });

  it('has nothing to write in a frame nobody has bowled', () => {
    const cells = scorecardCells(game('81'));
    expect(cells[1].marks).toBe('');
    expect(cells[1].total).toBe('');
  });
});

describe('scorecardFilename', () => {
  it('names the file by the day and the score', () => {
    expect(scorecardFilename(game('81 8- 9/ 9- 8/ 8- X 7- X 9-'))).toBe(
      'lane-log-2026-08-14-123.png',
    );
  });
});
