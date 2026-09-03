/**
 * A game as a picture.
 *
 * The app can already print a game — `exporting.ts` builds a self-contained
 * HTML sheet, which is the right thing for keeping and the wrong thing for
 * showing somebody. A score travels between people as a picture: it goes into
 * LINE, into a group chat, onto a story, and none of those will take an HTML
 * file. So this draws the same ten frames onto a canvas and hands the result to
 * the system share sheet.
 *
 * The split here is the usual one. `scorecardCells` is pure and is what
 * `exporting.ts` builds its table from as well, so the printed sheet and the
 * picture can never disagree about what was thrown. Everything below it touches
 * a canvas and is not unit tested; it is layout, and the thing worth testing
 * about layout is that the numbers going into it are right.
 */

import type { Game } from './db';
import { formatDay, formatLongDate } from './datetime';
import { tf } from './i18n';
import { frameMarks, FRAMES_PER_GAME, scoreGame } from './scoring';

export interface ScorecardCell {
  /** 1-based, as the sheet prints it. */
  frame: number;
  /** "X", "9 /", "8 -", or the tenth's three. Empty for a frame not bowled. */
  marks: string;
  /** The running total, or empty while the frame is still waiting on a bonus. */
  total: string;
}

/**
 * The ten cells of a scorecard: what to write in each, and the running total
 * under it.
 *
 * A frame whose score is still pending — a strike with nothing after it yet —
 * gets an empty total rather than a zero. Zero is a score somebody could have,
 * and printing one for "not yet known" is the kind of thing that ends up in a
 * screenshot.
 */
export function scorecardCells(game: Game): ScorecardCell[] {
  return scoreGame(game.rolls)
    .frames.slice(0, FRAMES_PER_GAME)
    .map((frame, index) => ({
      frame: index + 1,
      marks: frameMarks(frame).join(' '),
      total: frame.score === null ? '' : String(frame.score),
    }));
}

/**
 * The card, in pixels.
 *
 * Fixed rather than measured off the screen: the output is an image somebody
 * else will look at on a different phone, so it should not come out narrower
 * because it was made on an SE. 1080 wide is the width every messaging app is
 * built around.
 */
export const CARD = {
  width: 1080,
  height: 600,
  pad: 56,
  gridTop: 210,
  numbersHeight: 44,
  marksHeight: 116,
  totalsHeight: 84,
};

/** The Nocturne dark values, for a canvas that cannot read a CSS variable. */
const INK = {
  background: '#14121c',
  panel: '#1c1a26',
  rule: '#2e2b3b',
  text: '#efedf6',
  muted: '#8e88a3',
  accent: '#b5abfc',
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Draw the card.
 *
 * Takes a context rather than making one so the caller owns the canvas — which
 * matters because the same drawing has to work into an offscreen canvas for
 * sharing and, one day, into a visible one for a preview.
 */
export function drawScorecard(
  context: CanvasRenderingContext2D,
  game: Game,
  bowler: string,
): void {
  const { width, height, pad } = CARD;
  const cells = scorecardCells(game);
  const card = scoreGame(game.rolls);
  const strikes = card.frames.filter((frame) => frame.isStrike).length;
  const spares = card.frames.filter((frame) => frame.isSpare).length;

  context.fillStyle = INK.background;
  context.fillRect(0, 0, width, height);

  // ── The head: who, when, where, and the number they came for ──
  context.textBaseline = 'alphabetic';
  context.fillStyle = INK.muted;
  context.font = `500 30px ${FONT}`;
  context.textAlign = 'left';
  context.fillText(bowler, pad, pad + 34);

  context.fillStyle = INK.text;
  context.font = `400 26px ${FONT}`;
  const where = [formatDay(game.playedAt), game.house].filter(Boolean).join(' · ');
  context.fillStyle = INK.muted;
  context.fillText(where, pad, pad + 78);

  context.textAlign = 'right';
  context.fillStyle = INK.text;
  context.font = `600 132px ${FONT}`;
  context.fillText(String(game.total), width - pad, pad + 100);

  // ── The grid ──
  drawGrid(context, cells, {
    x: pad,
    y: CARD.gridTop,
    width: width - pad * 2,
    numbers: CARD.numbersHeight,
    marks: CARD.marksHeight,
    totals: CARD.totalsHeight,
    numberFont: 22,
    markFont: 56,
    totalFont: 40,
  });

  // ── The foot ──
  context.textAlign = 'left';
  context.fillStyle = INK.muted;
  context.font = `400 26px ${FONT}`;
  context.fillText(tf('{strikes} strikes · {spares} spares', { strikes, spares }), pad, height - pad);

  context.textAlign = 'right';
  context.fillStyle = INK.accent;
  context.font = `600 26px ${FONT}`;
  context.fillText('Lane Log', width - pad, height - pad);
}

export interface GridBox {
  x: number;
  y: number;
  width: number;
  /** Height of the band carrying the frame numbers. */
  numbers: number;
  marks: number;
  totals: number;
  numberFont: number;
  markFont: number;
  totalFont: number;
}

/**
 * Ten frames, ruled, with their marks and running totals.
 *
 * Taken out of `drawScorecard` when the series card arrived: a night is three
 * of these stacked, and two implementations of a frame grid would be two
 * chances to disagree about where the tenth's third mark goes. The box carries
 * its own font sizes because the series draws the same grid smaller, not a
 * different grid.
 */
export function drawGrid(
  context: CanvasRenderingContext2D,
  cells: ScorecardCell[],
  box: GridBox,
): void {
  const columnWidth = box.width / FRAMES_PER_GAME;
  const numbersBottom = box.y + box.numbers;
  const marksBottom = numbersBottom + box.marks;
  const bottom = marksBottom + box.totals;

  context.fillStyle = INK.panel;
  context.fillRect(box.x, box.y, box.width, bottom - box.y);

  context.strokeStyle = INK.rule;
  context.lineWidth = 2;
  context.beginPath();
  for (let i = 0; i <= FRAMES_PER_GAME; i++) {
    const x = box.x + i * columnWidth;
    context.moveTo(x, box.y);
    context.lineTo(x, bottom);
  }
  for (const y of [box.y, numbersBottom, marksBottom, bottom]) {
    context.moveTo(box.x, y);
    context.lineTo(box.x + box.width, y);
  }
  context.stroke();

  context.textAlign = 'center';

  for (const cell of cells) {
    const centre = box.x + (cell.frame - 0.5) * columnWidth;

    context.fillStyle = INK.muted;
    context.font = `500 ${box.numberFont}px ${FONT}`;
    context.fillText(String(cell.frame), centre, box.y + box.numbers * 0.7);

    // The tenth writes three marks where every other frame writes two, so its
    // text is the one that will not fit. The max-width argument condenses it
    // into the cell rather than letting it run into the neighbouring frame.
    context.fillStyle = INK.text;
    context.font = `600 ${box.markFont}px ${FONT}`;
    context.fillText(
      cell.marks,
      centre,
      marksBottom - box.marks * 0.33,
      // Inset, so a wide tenth still has a gutter either side of it.
      columnWidth - 16,
    );

    context.fillStyle = INK.accent;
    context.font = `500 ${box.totalFont}px ${FONT}`;
    context.fillText(cell.total, centre, bottom - box.totals * 0.31);
  }
}

/** The card as a PNG. */
export async function scorecardBlob(game: Game, bowler: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser would not give us a canvas to draw on.');

  drawScorecard(context, game, bowler);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The card could not be turned into an image.')),
      'image/png',
    );
  });
}

/** A name the file can carry into whatever it lands in. */
export function scorecardFilename(game: Game): string {
  return `lane-log-${new Date(game.playedAt).toISOString().slice(0, 10)}-${game.total}.png`;
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled';

/**
 * Hand the card to the system, however this device does that.
 *
 * `navigator.share` with a file is the whole point — it is what puts a score in
 * LINE or a group chat in two taps. Where it is not available, or where the
 * browser will not take a file, the card is saved instead: a picture in the
 * downloads folder is still a picture, and a button that did nothing on a
 * desktop would be worse.
 *
 * A share the person backs out of is not a failure and must not be reported as
 * one — `AbortError` is the browser saying they closed the sheet.
 */
export async function shareScorecard(game: Game, bowler: string): Promise<ShareOutcome> {
  const blob = await scorecardBlob(game, bowler);
  const file = new File([blob], scorecardFilename(game), { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${game.total} at Lane Log` });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Anything else — a browser that claimed it could share and then would
      // not — falls through to saving the file, which always works.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = scorecardFilename(game);
  link.click();
  // Revoked on the next turn of the loop: revoking immediately can beat the
  // download starting on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return 'saved';
}

// ── A night, rather than a game ────────────────────────────────────────────

/**
 * The series card.
 *
 * People bowl three. The single-game card has been the only thing shareable,
 * and the thing that actually gets posted to a group chat is the night: three
 * scores, a total, and the marks that explain them.
 *
 * Height is computed rather than fixed, because a series is three games and
 * sometimes six, and a card padded out to fit six would be mostly empty for
 * the three that are normal.
 */
export const SERIES = {
  width: 1080,
  pad: 56,
  headHeight: 236,
  /** Per game: a label line, then the grid. */
  rowHeight: 196,
  footHeight: 96,
};

export function seriesCardHeight(count: number): number {
  return SERIES.headHeight + Math.max(1, count) * SERIES.rowHeight + SERIES.footHeight;
}

/**
 * A night's games, in the order they were bowled.
 *
 * The caller has them grouped by day already; this only guarantees the order,
 * because "game 1" on the card had better be the one bowled first.
 */
export function seriesOrder(games: Game[]): Game[] {
  return [...games].sort((a, b) => a.playedAt - b.playedAt);
}

export function drawSeriesCard(
  context: CanvasRenderingContext2D,
  games: Game[],
  bowler: string,
): void {
  const played = seriesOrder(games);
  const { width, pad } = SERIES;
  const height = seriesCardHeight(played.length);

  const total = played.reduce((sum, game) => sum + game.total, 0);
  const best = Math.max(0, ...played.map((game) => game.total));
  const average = played.length ? Math.round(total / played.length) : 0;

  context.fillStyle = INK.background;
  context.fillRect(0, 0, width, height);

  // ── The head ──
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = INK.muted;
  context.font = `500 30px ${FONT}`;
  context.fillText(bowler, pad, pad + 34);

  const when = played[0] ? formatLongDate(played[0].playedAt) : '';
  const where = played.find((game) => game.house)?.house ?? '';
  context.fillStyle = INK.text;
  context.font = `400 26px ${FONT}`;
  context.fillText([when, where].filter(Boolean).join(' · '), pad, pad + 76);

  // The series total is the number somebody came for, so it is the big one.
  context.textAlign = 'right';
  context.fillStyle = INK.text;
  context.font = `700 128px ${FONT}`;
  context.fillText(String(total), width - pad, pad + 116);

  context.fillStyle = INK.muted;
  context.font = `500 26px ${FONT}`;
  context.fillText(
    played.length === 1
      ? tf('{n} game · {average} average', { n: played.length, average })
      : tf('{n} games · {average} average', { n: played.length, average }),
    width - pad,
    pad + 156,
  );

  // ── One grid per game ──
  played.forEach((game, index) => {
    const top = SERIES.headHeight + index * SERIES.rowHeight;

    context.textAlign = 'left';
    context.fillStyle = INK.muted;
    context.font = `500 24px ${FONT}`;
    context.fillText(tf('Game {n}', { n: index + 1 }), pad, top + 26);

    // The best game of the night is worth pointing at; on a night where every
    // game is the same score, nothing is singled out.
    context.textAlign = 'right';
    context.fillStyle = game.total === best && played.length > 1 ? INK.accent : INK.text;
    context.font = `600 34px ${FONT}`;
    context.fillText(String(game.total), width - pad, top + 28);

    drawGrid(context, scorecardCells(game), {
      x: pad,
      y: top + 46,
      width: width - pad * 2,
      numbers: 28,
      marks: 74,
      totals: 48,
      numberFont: 17,
      markFont: 38,
      totalFont: 27,
    });
  });

  // ── The foot ──
  const marks = played.reduce(
    (count, game) => {
      const card = scoreGame(game.rolls);
      return {
        strikes: count.strikes + card.frames.filter((frame) => frame.isStrike).length,
        spares: count.spares + card.frames.filter((frame) => frame.isSpare).length,
      };
    },
    { strikes: 0, spares: 0 },
  );

  context.textAlign = 'left';
  context.fillStyle = INK.muted;
  context.font = `400 26px ${FONT}`;
  context.fillText(
    tf('{strikes} strikes · {spares} spares', {
      strikes: marks.strikes,
      spares: marks.spares,
    }),
    pad,
    height - pad,
  );

  context.textAlign = 'right';
  context.fillStyle = INK.accent;
  context.font = `600 26px ${FONT}`;
  context.fillText('Lane Log', width - pad, height - pad);
}

export async function seriesCardBlob(games: Game[], bowler: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SERIES.width;
  canvas.height = seriesCardHeight(games.length);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser would not give us a canvas to draw on.');

  drawSeriesCard(context, games, bowler);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The card could not be turned into an image.')),
      'image/png',
    );
  });
}

export function seriesFilename(games: Game[]): string {
  const played = seriesOrder(games);
  const day = new Date(played[0]?.playedAt ?? Date.now()).toISOString().slice(0, 10);
  const total = played.reduce((sum, game) => sum + game.total, 0);
  return `lane-log-${day}-series-${total}.png`;
}

/** The night, into the share sheet — or saved, where sharing is not offered. */
export async function shareSeries(games: Game[], bowler: string): Promise<ShareOutcome> {
  const blob = await seriesCardBlob(games, bowler);
  const file = new File([blob], seriesFilename(games), { type: 'image/png' });
  const total = seriesOrder(games).reduce((sum, game) => sum + game.total, 0);

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${total} at Lane Log` });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // As above: a browser that claimed it could share and then would not
      // falls through to saving, which always works.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = seriesFilename(games);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return 'saved';
}
