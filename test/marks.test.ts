import { describe, expect, it } from 'vitest';
import { MarkParseError, parseMarks, tryParseMarks } from '../src/lib/marks';
import { scoreGame } from '../src/lib/scoring';

const score = (sheet: string) => scoreGame(parseMarks(sheet).rolls).total;

describe('parseMarks', () => {
  it('reads a perfect game off a sheet', () => {
    expect(score('X X X X X X X X X XXX')).toBe(300);
  });

  it('reads all spares', () => {
    expect(score('5/ 5/ 5/ 5/ 5/ 5/ 5/ 5/ 5/ 5/5')).toBe(150);
  });

  it('reads misses as zero', () => {
    expect(score('-- -- -- -- -- -- -- -- -- --')).toBe(0);
  });

  it('resolves a spare against the ball before it', () => {
    const { rolls } = parseMarks('9/ 45');
    expect(rolls.slice(0, 4)).toEqual([9, 1, 4, 5]);
  });

  it('treats a tenth-frame spare after a strike as a fresh rack', () => {
    const { rolls } = parseMarks('-- -- -- -- -- -- -- -- -- X5/');
    expect(rolls.slice(-3)).toEqual([10, 5, 5]);
  });

  it('corrects characters OCR commonly mangles', () => {
    // lowercase x, backslash for slash, letter O for zero, pipe for slash
    expect(score('x x x x x x x x x xxx')).toBe(300);
    expect(parseMarks('9\\ 4O').rolls.slice(0, 4)).toEqual([9, 1, 4, 0]);
    expect(parseMarks('9| 44').rolls.slice(0, 2)).toEqual([9, 1]);
  });

  it('accepts frames separated by printed rules and stray punctuation', () => {
    expect(parseMarks('  X , 9/ ; 4-  ').frames).toEqual([['X'], ['9', '/'], ['4', '-']]);
  });

  it('warns rather than failing on a partly readable sheet', () => {
    const sheet = parseMarks('X 9/ 44');
    expect(sheet.warnings.join(' ')).toMatch(/3 of 10/);
    expect(sheet.rolls).toEqual([10, 9, 1, 4, 4]);
  });

  it('warns and truncates when more than ten frames are read', () => {
    const sheet = parseMarks('44 44 44 44 44 44 44 44 44 44 44');
    expect(sheet.frames).toHaveLength(10);
    expect(sheet.warnings.join(' ')).toMatch(/ignored the rest/);
  });

  it('rejects a spare opening a frame', () => {
    expect(() => parseMarks('/5')).toThrow(MarkParseError);
  });

  it('rejects a frame with too many marks', () => {
    expect(() => parseMarks('123')).toThrow(/at most 2/);
  });

  it('rejects counts that exceed a rack', () => {
    expect(() => parseMarks('75 44')).toThrow(/more pins than a frame holds/);
  });

  it('rejects a sheet with nothing readable on it', () => {
    expect(() => parseMarks('   ')).toThrow(/No score marks/);
  });
});

describe('tryParseMarks', () => {
  it('returns an error instead of throwing', () => {
    const result = tryParseMarks('/5');
    expect(result).toHaveProperty('error');
  });

  it('returns the sheet when it parses', () => {
    expect(tryParseMarks('X 9/')).toHaveProperty('rolls');
  });
});
