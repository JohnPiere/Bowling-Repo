/**
 * Minimal Web Push server.
 *
 * Holds subscriptions and sends notifications. Deliberately tiny and
 * dependency-light: one file, one JSON store, no framework. It exists so the
 * client's push path can be exercised end to end; swap the store for a real
 * database when there is a backend to put it in.
 *
 *   npm run push:keys     generate a VAPID key pair
 *   npm run push:server   start on :8787 (the Vite dev proxy points at it)
 *
 * Send a notification:
 *   curl -X POST localhost:8787/api/notify \
 *     -H 'content-type: application/json' \
 *     -d '{"title":"Tuesday Crew","body":"Aya just posted a 234","url":"/?screen=group"}'
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import webpush from 'web-push';

const PORT = Number(process.env.PORT ?? 8787);
const STORE = join(dirname(fileURLToPath(import.meta.url)), 'subscriptions.json');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// A mailto: subject is required by the VAPID spec; push services reject
// anything else.
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

if (!PUBLIC_KEY || !PRIVATE_KEY) {
  console.error(
    'Missing VAPID keys. Run `npm run push:keys`, then set VAPID_PUBLIC_KEY and\n' +
      'VAPID_PRIVATE_KEY (see .env.example).',
  );
  process.exit(1);
}

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

/** endpoint -> subscription. The endpoint is the push service's own unique id. */
let subscriptions = new Map();

async function loadStore() {
  try {
    const raw = await readFile(STORE, 'utf8');
    subscriptions = new Map(Object.entries(JSON.parse(raw)));
    console.log(`Loaded ${subscriptions.size} subscription(s).`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function saveStore() {
  await writeFile(STORE, JSON.stringify(Object.fromEntries(subscriptions), null, 2));
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Nothing legitimate posted here is large; refuse to buffer more.
    if (size > 64 * 1024) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const routes = {
  'GET /api/vapid-public-key': (_body) => ({ key: PUBLIC_KEY }),

  'POST /api/subscribe': async (body) => {
    const subscription = body.subscription;
    if (!subscription?.endpoint) throw Object.assign(new Error('No subscription.'), { status: 400 });

    subscriptions.set(subscription.endpoint, subscription);
    await saveStore();
    return { ok: true, count: subscriptions.size };
  },

  'POST /api/unsubscribe': async (body) => {
    if (body.endpoint) {
      subscriptions.delete(body.endpoint);
      await saveStore();
    }
    return { ok: true, count: subscriptions.size };
  },

  'POST /api/notify': async (body) => {
    const payload = JSON.stringify({
      title: body.title ?? 'Lane Log',
      body: body.body ?? '',
      url: body.url ?? '/',
      tag: body.tag,
    });

    const results = await Promise.allSettled(
      [...subscriptions.values()].map((sub) => webpush.sendNotification(sub, payload)),
    );

    // 404 and 410 mean the browser threw the subscription away; keeping it
    // would make every future send fail.
    let pruned = 0;
    results.forEach((result, index) => {
      const status = result.status === 'rejected' ? result.reason?.statusCode : null;
      if (status === 404 || status === 410) {
        subscriptions.delete([...subscriptions.keys()][index]);
        pruned += 1;
      }
    });
    if (pruned) await saveStore();

    return {
      sent: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      pruned,
    };
  },
};

const server = createServer(async (req, res) => {
  // The dev proxy makes this same-origin, but a phone on the LAN hitting the
  // server directly needs CORS.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const route = routes[`${req.method} ${req.url?.split('?')[0]}`];
  if (!route) return send(res, 404, { error: 'Not found' });

  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await route(body));
  } catch (err) {
    send(res, err.status ?? 500, { error: err.message });
  }
});

await loadStore();
server.listen(PORT, () => console.log(`Push server on http://localhost:${PORT}`));
