/**
 * Serve dist/ with the headers from public/_headers.
 *
 * `vite preview` ignores them, so without this the Content-Security-Policy is
 * only exercised in production — which is the worst place to discover that it
 * blocks the OCR engine's worker.
 *
 *   npm run build
 *   node scripts/serve-with-headers.mjs 4200 &
 *   npm run verify:app -- http://localhost:4200
 *   npm run verify:scanner -- http://localhost:4200
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = 'dist';
const PORT = Number(process.argv[2] ?? 4200);

const raw = await readFile('public/_headers', 'utf8');
const headers = {};
let inGlobal = false;
for (const line of raw.split('\n')) {
  if (line.startsWith('/')) { inGlobal = line.trim() === '/*'; continue; }
  if (!inGlobal) continue;
  const m = line.match(/^\s{2}([A-Za-z-]+):\s*(.+)$/);
  if (m) headers[m[1]] = m[2];
}
console.log('applying:', Object.keys(headers).join(', '));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.woff2': 'font/woff2', '.gz': 'application/gzip',
  '.wasm': 'application/wasm', '.traineddata': 'application/octet-stream',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, safe);

  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(ROOT, 'index.html');
    body = await readFile(file);
  }

  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  if (file.endsWith('.gz')) res.setHeader('content-encoding', 'gzip');
  res.end(body);
}).listen(PORT, () => console.log(`csp server on ${PORT}`));
