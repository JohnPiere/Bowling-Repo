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
import { formatDay } from './datetime';
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
  const gridWidth = width - pad * 2;
  const columnWidth = gridWidth / FRAMES_PER_GAME;
  const top = CARD.gridTop;
  const numbersBottom = top + CARD.numbersHeight;
  const marksBottom = numbersBottom + CARD.marksHeight;
  const bottom = marksBottom + CARD.totalsHeight;

  context.fillStyle = INK.panel;
  context.fillRect(pad, top, gridWidth, bottom - top);

  context.strokeStyle = INK.rule;
  context.lineWidth = 2;
  context.beginPath();
  for (let i = 0; i <= FRAMES_PER_GAME; i++) {
    const x = pad + i * columnWidth;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (const y of [top, numbersBottom, marksBottom, bottom]) {
    context.moveTo(pad, y);
    context.lineTo(pad + gridWidth, y);
  }
  context.stroke();

  context.textAlign = 'center';

  for (const cell of cells) {
    const centre = pad + (cell.frame - 0.5) * columnWidth;

    context.fillStyle = INK.muted;
    context.font = `500 22px ${FONT}`;
    context.fillText(String(cell.frame), centre, top + 31);

    // The tenth writes three marks where every other frame writes two, so its
    // text is the one that will not fit. The max-width argument condenses it
    // into the cell rather than letting it run into the neighbouring frame.
    context.fillStyle = INK.text;
    context.font = `600 56px ${FONT}`;
    context.fillText(
      cell.marks,
      centre,
      marksBottom - 38,
      // Inset, so a wide tenth still has a gutter either side of it.
      columnWidth - 16,
    );

    context.fillStyle = INK.accent;
    context.font = `500 40px ${FONT}`;
    context.fillText(cell.total, centre, bottom - 26);
  }

  // ── The foot ──
  context.textAlign = 'left';
  context.fillStyle = INK.muted;
  context.font = `400 26px ${FONT}`;
  context.fillText(`${strikes} strikes · ${spares} spares`, pad, height - pad);

  context.textAlign = 'right';
  context.fillStyle = INK.accent;
  context.font = `600 26px ${FONT}`;
  context.fillText('Lane Log', width - pad, height - pad);
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
