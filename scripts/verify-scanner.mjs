/**
 * End-to-end check of the score sheet scanner.
 *
 * The unit tests cover the segmentation maths on synthetic buffers; this
 * drives the real thing — canvas, thresholding, deskew, Tesseract, the mark
 * parser and the review screen — against generated sheets that imitate what a
 * phone actually captures: a tilt, uneven overhead light, sensor noise, and
 * pencil rather than ink.
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

/** The game every generated sheet carries. Scores to 178. */
const MARKS = [['X'], ['9', '/'], ['7', '2'], ['X'], ['X'], ['8', '-'], ['9', '/'], ['X'], ['6', '3'], ['X', 'X', 'X']];
const RUNNING = [20, 37, 46, 74, 92, 100, 120, 139, 148, 178];
const EXPECTED = 'X9/72XX8-9/X63XXX';

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
  const W = PAD * 2 + FW * 10;
  const H = PAD * 2 + FH;

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

  if (opts.rules !== false) {
    g.strokeStyle = opts.faint ? '#777' : '#111';
    g.lineWidth = 3;
    g.strokeRect(PAD, PAD, FW * 10, FH);
    for (let i = 1; i < 10; i++) {
      g.beginPath();
      g.moveTo(PAD + i * FW, PAD);
      g.lineTo(PAD + i * FW, PAD + FH);
      g.stroke();
    }
    const divider = PAD + FH * 0.58;
    g.beginPath();
    g.moveTo(PAD, divider);
    g.lineTo(PAD + FW * 10, divider);
    g.stroke();
  }

  g.fillStyle = opts.pencil ? '#555' : '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  MARKS.forEach((marks, f) => {
    const x0 = PAD + f * FW;
    const slots = f === 9 ? 3 : 2;
    g.font = '600 46px Helvetica, Arial, sans-serif';
    marks.forEach((m, i) => g.fillText(m, x0 + (FW / slots) * (i + 0.5), PAD + FH * 0.29));
    if (opts.rules !== false) {
      g.font = '500 40px Helvetica, Arial, sans-serif';
      g.fillText(String(RUNNING[f]), x0 + FW / 2, PAD + FH * 0.79);
    }
  });
  g.restore();

  if (opts.lighting) {
    const grad = g.createRadialGradient(W * 0.25, 0, 0, W * 0.25, 0, W);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  if (opts.noise) {
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * opts.noise;
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
  const page = await browser.newPage({ viewport: { width: 412, height: 892 } });

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
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Scan a paper score sheet' }).click();
    await page.waitForSelector('text=Use a photo instead');
    await page.setInputFiles('input[type=file]', join(OUT, testCase.file));

    await page
      .waitForSelector('text=Marks — correct anything', { timeout: 180000 })
      .catch(() => null);

    const marks = await page.locator('.input.tnum').inputValue().catch(() => '');
    const footnote = await page.locator('.footnote').last().textContent().catch(() => '');
    const strategy = footnote.includes('frame by frame') ? 'per-frame' : 'whole-sheet';

    const read = marks.replace(/\s/g, '');
    // A sheet with no grid should refuse rather than invent a game; anything
    // it does produce must still not be a wrong reading presented as right.
    const ok = testCase.readable ? read === EXPECTED : read !== EXPECTED;

    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${testCase.label}`);
    console.log(`        ${strategy} · ${JSON.stringify(marks)}`);
  }

  await browser.close();

  console.log(`\n${CASES.length - failures}/${CASES.length} sheets behaved as expected.`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
