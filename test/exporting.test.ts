import { describe, expect, it } from 'vitest';
import { daySheetHtml, escapeHtml, gameRowsHtml, gameSheetHtml } from '../src/lib/exporting';
import { groupByDay } from '../src/lib/history';
import type { Game } from '../src/lib/db';

const game = (rolls: number[], total: number, house?: string): Game => ({
  id: 'g1',
  bowler: 'You',
  rolls,
  total,
  isComplete: true,
  source: 'manual',
  house,
  playedAt: new Date(2026, 7, 4, 19, 30).getTime(),
  updatedAt: 0,
});

const PERFECT = new Array(12).fill(10);

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });
});

describe('gameRowsHtml', () => {
  it('writes the marks over the running totals', () => {
    const html = gameRowsHtml(game(PERFECT, 300));
    expect(html).toContain('X');
    // A perfect game runs 30, 60, 90 … and ends at 300.
    expect(html).toContain('>300<');
  });

  it('leaves a frame that cannot be scored yet blank rather than zero', () => {
    // One strike and nothing after it: the frame is thrown but not scorable.
    const html = gameRowsHtml(game([10], 0));
    expect(html).toContain('&nbsp;');
    expect(html).not.toContain('>0<');
  });
});

describe('gameSheetHtml', () => {
  it('is a whole document that stands on its own', () => {
    const html = gameSheetHtml(game(PERFECT, 300));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    // Nothing fetched: it has to open with no network and no app installed.
    expect(html).not.toMatch(/<(script|link)\b/);
  });

  it('escapes a house name rather than trusting it', () => {
    const html = gameSheetHtml(game(PERFECT, 300, '<script>alert(1)</script>'));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('daySheetHtml', () => {
  it('carries every game in the session and its series total', () => {
    const games = [
      { ...game(PERFECT, 300), id: 'a' },
      { ...game(PERFECT, 200), id: 'b', playedAt: new Date(2026, 7, 4, 20, 30).getTime() },
    ];
    const html = daySheetHtml(groupByDay(games)[0]);

    expect(html).toContain('Game 1');
    expect(html).toContain('Game 2');
    expect(html).toContain('500');
  });
});
