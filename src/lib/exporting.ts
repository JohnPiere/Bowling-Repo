/**
 * Exporting a game or a session as a printable score sheet.
 *
 * A self-contained HTML file rather than a PDF: generating a real PDF in the
 * browser means shipping a library the size of the rest of the app, and every
 * platform can already print an HTML file to PDF — on iOS that is the share
 * sheet, on Android the print dialog. The file opens correctly with no network
 * and no Lane Log installed, which a PDF would also manage and a JSON dump
 * would not.
 *
 * The markup is built as a string here, and it is the one place in the app
 * that does that. Everything interpolated is escaped: a house called
 * `<script>` is a silly name, not a way into the exported file.
 */

import type { Game } from './db';
import type { DayGroup } from './history';
import { frameMarks, scoreGame, FRAMES_PER_GAME } from './scoring';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One game's frames: the marks over the running total, as a sheet prints it. */
export function gameRowsHtml(game: Game): string {
  const card = scoreGame(game.rolls);
  const frames = card.frames.slice(0, FRAMES_PER_GAME);

  const marks = frames
    .map((frame) => `<td>${escapeHtml(frameMarks(frame).join(' ')) || '&nbsp;'}</td>`)
    .join('');
  const totals = frames
    .map((frame) => `<td class="run">${frame.score ?? '&nbsp;'}</td>`)
    .join('');

  return `<tr class="marks">${marks}</tr><tr class="totals">${totals}</tr>`;
}

function gameBlock(game: Game, label: string): string {
  const card = scoreGame(game.rolls);
  const when = new Date(game.playedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `
    <section class="game">
      <header>
        <h2>${escapeHtml(label)}</h2>
        <div class="meta">${escapeHtml(when)}${game.house ? ` · ${escapeHtml(game.house)}` : ''}</div>
        <div class="score">${card.total}</div>
      </header>
      <table>
        <thead>
          <tr>${Array.from({ length: FRAMES_PER_GAME }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr>
        </thead>
        <tbody>${gameRowsHtml(game)}</tbody>
      </table>
    </section>`;
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; color: #16181f; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; margin-bottom: 20px; }
  .series { font-size: 34px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .game { margin-bottom: 22px; page-break-inside: avoid; }
  .game header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .game h2 { font-size: 14px; margin: 0; }
  .game .meta { color: #666; flex: 1; font-size: 11px; }
  .game .score { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #16181f; text-align: center; padding: 4px 2px; }
  th { font-size: 10px; font-weight: 500; background: #f2f2f5; }
  .marks td { height: 28px; font-weight: 600; letter-spacing: 0.08em; }
  .totals td { height: 22px; font-size: 11px; font-variant-numeric: tabular-nums; background: #fafafb; }
  footer { margin-top: 24px; color: #888; font-size: 10px; }
  @media print { body { margin: 0; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
<footer>Exported from Lane Log. Print this page to save it as a PDF.</footer>
</body>
</html>`;
}

export function gameSheetHtml(game: Game): string {
  const when = new Date(game.playedAt).toLocaleDateString(undefined, { dateStyle: 'long' });
  return page(
    `Lane Log — ${when}`,
    `<h1>Score sheet</h1><div class="sub">${escapeHtml(when)}</div>${gameBlock(game, 'Game')}`,
  );
}

export function daySheetHtml(group: DayGroup): string {
  const when = new Date(group.at).toLocaleDateString(undefined, { dateStyle: 'long' });
  const games = group.games.map((game, i) => gameBlock(game, `Game ${i + 1}`)).join('');

  return page(
    `Lane Log — ${when}`,
    `<h1>${escapeHtml(when)}</h1>
     <div class="sub">${group.house ? `${escapeHtml(group.house)} · ` : ''}${group.games.length} game${
       group.games.length === 1 ? '' : 's'
     } · series <span class="series">${group.series}</span></div>
     ${games}`,
  );
}

/** Hand a generated file to the browser to save. */
export function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // Revoking immediately can pull the blob out from under a download the
  // browser has not started reading yet. One frame is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
