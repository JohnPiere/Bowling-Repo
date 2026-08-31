/**
 * Self-host Inter.
 *
 * The design system's CSS pulls Inter from Google Fonts with an `@import`,
 * which is render-blocking: the browser will not paint until that stylesheet
 * resolves. For an app whose whole point is working at a bowling alley, that
 * makes first paint hostage to a third-party host — and when the host is
 * unreachable the page stalls until the request times out, not merely until
 * the font falls back. Measured at roughly twelve seconds to DOMContentLoaded
 * on a blocked network.
 *
 * Self-hosting removes the third party, lets the service worker precache the
 * file, and keeps the typography the handoff specifies.
 *
 * Generated into public/, not committed.
 */

import { mkdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'fonts');

// The variable font covers every weight the design uses (400 body, 500
// headings, 600 for numerals) in one file, rather than four static cuts.
const FONT_URL =
  'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.woff2';
const FONT_FILE = join(out, 'InterVariable.woff2');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(out, { recursive: true });

  if (await exists(FONT_FILE)) {
    console.log('  InterVariable.woff2 already present');
    return;
  }

  try {
    const response = await fetch(FONT_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(FONT_FILE));
    console.log('  downloaded InterVariable.woff2');
  } catch (err) {
    // The @font-face in app.css simply will not resolve, and `font-display:
    // swap` means text paints in the fallback immediately. Not worth failing
    // a build over.
    console.warn(`  ! could not fetch Inter (${err.message}).`);
    console.warn('    The app falls back to the system sans, which is fine.');
  }
}

await main();
