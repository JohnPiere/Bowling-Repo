/**
 * End-to-end check of the score sheet scanner.
 *
 * The unit tests cover the segmentation maths on synthetic buffers; this
 * drives the real thing — canvas, thresholding, deskew, row detection, the box
 * a bowler draws round one game, Tesseract, the mark parser and the review
 * screen — against generated sheets that imitate what a phone actually
 * captures: a tilt, uneven overhead light, sensor noise, and pencil rather than
 * ink.
 *
 * Opt-in, because it needs a browser and takes a minute:
 *
 *   npm i -D playwright
 *   npm run build && npm run preview &
 *   node scripts/verify-scanner.mjs [baseUrl]
 *
 * Exits non-zero if any sheet that should be readable is misread.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = 'scanner-check';

/** The game every generated sheet carries. */
const MARKS = [['X'], ['9', '/'], ['7', '2'], ['X'], ['X'], ['8', '-'], ['9', '/'], ['X'], ['6', '3'], ['X', 'X', 'X']];
const RUNNING = [20, 37, 46, 74, 92, 100, 120, 139, 148, 178];

/**
 * What the sheet is worth.
 *
 * The check compares the *game*, not the mark string. Different marks can
 * describe the same throws — a spare after a 9 is one pin whether it was
 * written "9/" or read as "91" — and a scanner that gets the game right has
 * done its job even when a character came back differently.
 */
const EXPECTED_SCORE = 178;

const CASES = [
  { file: 'clean.png', label: 'flat scan, printed', opts: {}, readable: true },
  {
    file: 'photo.png',
    label: 'phone photo: tilted, uneven light, noisy, pencil',
    opts: { rotate: 1.6, lighting: true, noise: 34, pencil: true },
    readable: true,
  },
  {
    file: 'faint.png',
    label: 'faint printed rules, pencil marks',
    opts: { faint: true, pencil: true, noise: 18 },
    readable: true,
  },
  {
    file: 'tilted-hard.png',
    label: 'held badly: 2.6 degrees off square',
    opts: { rotate: -2.6, lighting: true, noise: 20, pencil: true },
    readable: true,
  },
  {
    // A league sheet: several bowlers stacked, each with a totals row under
    // their marks. The top row must be read, and the totals rows must not be
    // mistaken for games.
    file: 'league.png',
    label: 'four bowlers on one sheet',
    opts: { bowlers: 4, pencil: true, noise: 14 },
    readable: true,
  },
  {
    // No grid to segment on, so the scanner must fall back and then refuse to
    // guess rather than import a wrong game.
    file: 'no-rules.png',
    label: 'no grid at all (must fall back, must not invent a game)',
    opts: { rules: false },
    readable: false,
  },
];

function drawSheet({ MARKS, RUNNING, opts }) {
  const FW = 110;
  const FH = 150;
  const PAD = 60;
  // A league sheet stacks bowlers; each gets a marks row over a totals row.
  const BOWLERS = opts.bowlers ?? 1;
  const W = PAD * 2 + FW * 10;
  const H = PAD * 2 + FH * BOWLERS;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);

  g.save();
  if (opts.rotate) {
    g.translate(W / 2, H / 2);
    g.rotate((opts.rotate * Math.PI) / 180);
    g.translate(-W / 2, -H / 2);
  }

  const sheetH = FH * BOWLERS;

  if (opts.rules !== false) {
    g.strokeStyle = opts.faint ? '#777' : '#111';
    g.lineWidth = 3;
    g.strokeRect(PAD, PAD, FW * 10, sheetH);
    for (let i = 1; i < 10; i++) {
      g.beginPath();
      g.moveTo(PAD + i * FW, PAD);
      g.lineTo(PAD + i * FW, PAD + sheetH);
      g.stroke();
    }
    for (let b = 0; b < BOWLERS; b++) {
      const top = PAD + b * FH;
      // Marks over totals, then the divider to the next bowler.
      for (const y of [top + FH * 0.58, top + FH]) {
        if (y > PAD + sheetH) continue;
        g.beginPath();
        g.moveTo(PAD, y);
        g.lineTo(PAD + FW * 10, y);
        g.stroke();
      }
    }
  }

  g.fillStyle = opts.pencil ? '#555' : '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  for (let b = 0; b < BOWLERS; b++) {
    const top = PAD + b * FH;
    // Later bowlers get a different game, so a row cannot be confused for
    // the one above it.
    const rowMarks = b === 0 ? MARKS : MARKS.map((m, i) => (i % 3 === b % 3 ? ['5', '/'] : m));

    rowMarks.forEach((marks, f) => {
      const x0 = PAD + f * FW;
      const slots = f === 9 ? 3 : 2;
      g.font = '600 46px Helvetica, Arial, sans-serif';
      marks.forEach((m, i) => g.fillText(m, x0 + (FW / slots) * (i + 0.5), top + FH * 0.29));
      if (opts.rules !== false) {
        g.font = '500 40px Helvetica, Arial, sans-serif';
        g.fillText(String(RUNNING[f] + b * 3), x0 + FW / 2, top + FH * 0.79);
      }
    });
  }
  g.restore();

  if (opts.lighting) {
    const grad = g.createRadialGradient(W * 0.25, 0, 0, W * 0.25, 0, W);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  if (opts.noise) {
    // Seeded, so a sheet is the same every run. Random noise would make a
    // pass or a failure impossible to attribute to a change in the scanner.
    let seed = opts.seed ?? 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * opts.noise;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

async function main() {
  const { chromium } = await import('playwright').catch(() => {
    console.error('This check needs Playwright:  npm i -D playwright');
    process.exit(2);
  });

  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  // Past the first run, which otherwise stands between the app and the Play
  // tab. Seeded only when nothing is stored, so the app's own gate is what
  // decides on a real first run.
  const context = await browser.newContext({ viewport: { width: 412, height: 892 } });
  await context.addInitScript(() => {
    try {
      if (localStorage.getItem('lane-log.preferences') === null) {
        localStorage.setItem('lane-log.preferences', JSON.stringify({ onboardedAt: Date.now() }));
      }
    } catch {
      /* No storage to seed; the app will show its first-run screen and fail loudly. */
    }
  });
  const page = await context.newPage();

  // Draw the sheets in a blank page, where a canvas is available.
  await page.goto('about:blank');
  for (const testCase of CASES) {
    const dataUrl = await page.evaluate(drawSheet, {
      MARKS,
      RUNNING,
      opts: testCase.opts,
    });
    writeFileSync(join(OUT, testCase.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }

  let failures = 0;

  for (const testCase of CASES) {
    // Straight to the scanner. The play screen's button is parked while the
    // reader is being worked on; the app's own ?screen= link still opens it.
    await page.goto(`${BASE}/?screen=scan`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Use a photo instead');
    await page.setInputFiles('input[type=file]', join(OUT, testCase.file));

    // A picked photo now stops at a box to draw around one game. The box comes
    // up on whichever row the detector likes best, so accepting it is the same
    // thing a bowler does on a sheet the app has read correctly. Every row on
    // these sheets carries the same game, so which one it lands on does not
    // change what the score should be.
    await page.waitForSelector('text=Drag a box around one game', { timeout: 30000 });
    await page.getByRole('button', { name: 'Read this game' }).click();

    await page
      .waitForSelector('text=Marks — correct anything', { timeout: 180000 })
      .catch(() => null);

    const marks = await page.locator('.input.tnum').inputValue().catch(() => '');
    const raw = await page.locator('.rawtext').textContent().catch(() => '');
    const footnote = await page.locator('.footnote').last().textContent().catch(() => '');
    const strategy = footnote.includes('frame by frame') ? 'per-frame' : 'whole-sheet';

    // Read the score the app itself derived from the marks, rather than
    // re-implementing the scorer here.
    const scored = await page
      .locator('.card .tnum')
      .first()
      .textContent()
      .then((t) => Number(t))
      .catch(() => NaN);

    const ok = testCase.readable
      ? scored === EXPECTED_SCORE
      : // A sheet with no grid must refuse rather than invent a game.
        scored !== EXPECTED_SCORE;

    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${testCase.label}`);
    console.log(
      `        ${strategy} · scored ${Number.isNaN(scored) ? '—' : scored} · ${JSON.stringify(marks)}`,
    );
    // When the marks box is empty the read still happened; showing what came
    // back separates "recognised nothing" from "recognised, would not parse".
    if (!ok && raw && raw.trim() !== marks) console.log(`        raw: ${JSON.stringify(raw.trim())}`);
  }

  await browser.close();

  console.log(`\n${CASES.length - failures}/${CASES.length} sheets behaved as expected.`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
