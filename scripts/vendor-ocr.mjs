/**
 * Put the OCR engine on our own origin.
 *
 * Tesseract.js otherwise pulls its wasm core and language data from a public
 * CDN on the first scan. Same-origin copies mean scanning works behind a
 * firewall, is not broken by a CDN outage, and can be cached by the service
 * worker so the second scan needs no network at all.
 *
 * The files are large and derived, so they are generated into public/ rather
 * than committed. If the language data cannot be fetched the build still
 * succeeds — the app falls back to the CDN at runtime and says so.
 */

import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'tesseract');
const core = join(root, 'node_modules', 'tesseract.js-core');

/**
 * Both engine builds: tesseract.js picks the SIMD one where the browser
 * supports it and falls back otherwise, so shipping only one would break the
 * devices that need the other.
 */
const CORE_FILES = ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'];

/**
 * The worker script also defaults to the CDN, so it is vendored too —
 * otherwise the engine is local but the thing that loads it is not.
 */
const WORKER_FILE = 'worker.min.js';

// The "fast" integer model: a fifth the size of the best model, and the
// alphabet is constrained to thirteen characters anyway.
const LANG_URL =
  'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz';
const LANG_FILE = join(out, 'eng.traineddata.gz');

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

  for (const file of CORE_FILES) {
    const from = join(core, file);
    if (!(await exists(from))) {
      console.warn(`  ! ${file} not in node_modules — skipping`);
      continue;
    }
    await copyFile(from, join(out, file));
    console.log(`  copied ${file}`);
  }

  const workerFrom = join(root, 'node_modules', 'tesseract.js', 'dist', WORKER_FILE);
  let worker = false;
  if (await exists(workerFrom)) {
    await copyFile(workerFrom, join(out, WORKER_FILE));
    worker = true;
    console.log(`  copied ${WORKER_FILE}`);
  } else {
    console.warn(`  ! ${WORKER_FILE} not in node_modules — skipping`);
  }

  if (await exists(LANG_FILE)) {
    console.log('  eng.traineddata.gz already present');
  } else {
    try {
      const response = await fetch(LANG_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await pipeline(response.body, createWriteStream(LANG_FILE));
      console.log('  downloaded eng.traineddata.gz');
    } catch (err) {
      console.warn(`  ! could not fetch language data (${err.message}).`);
      console.warn('    Scanning will fall back to the CDN at runtime.');
    }
  }

  // The app reads this to decide whether to point at our origin or the CDN.
  await writeFile(
    join(out, 'manifest.json'),
    JSON.stringify(
      { core: CORE_FILES, worker, lang: (await exists(LANG_FILE)) ? ['eng'] : [] },
      null,
      2,
    ),
  );
}

await main();
