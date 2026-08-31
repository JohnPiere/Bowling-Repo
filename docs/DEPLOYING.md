# Deploying Lane Log

Two pieces: a static site, and a small push server. The site is the app; the
server exists only to hold push subscriptions and send notifications. You can
ship the site alone and everything works except notifications.

## The one hard requirement: HTTPS

The camera, the service worker, and Web Push all require a secure context.
`localhost` counts; a bare LAN address like `http://192.168.1.20:5173` does
not — the app will load and the camera and install prompt will silently not
work. Every host below gives you HTTPS by default.

## The static site

```bash
npm ci
npm run build      # -> dist/
```

Upload `dist/` to any static host. Nothing needs Node at runtime.

### Two settings that matter

**Serve `index.html` for unknown paths.** The app owns its routing, so a
refresh on any in-app screen must return the shell rather than a 404.

**Never cache `sw.js`.** If the service worker is cached, an update can be
pinned indefinitely and users get stale code with no way to escape it. Serve it
with `Cache-Control: no-cache`. Hashed assets under `/assets/` are the
opposite: they are immutable and should be cached hard.

### Security headers

`public/_headers` and `vercel.json` also carry a Content-Security-Policy and
friends. The policy is tight — everything the app needs is same-origin — with
three allowances that are not obvious and are load-bearing:

- `'wasm-unsafe-eval'` and `blob:` in `script-src`/`worker-src`: the OCR engine
  is WebAssembly running in a worker. Remove either and scanning stops working.
- `'unsafe-inline'` in `style-src`: React sets element styles as attributes,
  which counts as inline.
- `mediastream:` in `media-src`: the live camera preview.

**If you move the push API to another host, add it to `connect-src`** or the
browser will block every call to it, silently as far as the app is concerned.

Verify the headers before deploying, since `vite preview` ignores them:

```bash
npm run build
npm run serve:headers 4200 &
npm run verify:app -- http://localhost:4200
npm run verify:scanner -- http://localhost:4200
```

Example configs are in this repo:

- `public/_headers` and `public/_redirects` — Netlify and Cloudflare Pages
  read these automatically from the build output.
- `vercel.json` — Vercel.

For nginx:

```nginx
location = /sw.js        { add_header Cache-Control "no-cache"; }
location /assets/        { add_header Cache-Control "public, max-age=31536000, immutable"; }
location /tesseract/     { add_header Cache-Control "public, max-age=31536000, immutable"; }
location /               { try_files $uri /index.html; }
```

### Deploying to a subpath

The app assumes it is served from the domain root. To host it under
`/lane-log/`, set `base: '/lane-log/'` in `vite.config.ts` and change
`scope` and `start_url` in the manifest to match. The service worker's scope
cannot reach above where it is served from.

## The push server

`server/index.mjs` is one file with one dependency (`web-push`) and a JSON
file for storage. It is deliberately small: it is a working reference, not a
production backend. Anything that runs Node will host it.

```bash
npm run push:keys        # generate a VAPID pair, once, and keep the private key secret
```

Set these on the host:

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:you@example.com
PORT=8787

# Required on anything reachable from the internet: without it, whoever can
# reach the server can notify every subscriber.
PUSH_AUTH_TOKEN=…
```

With a token set, sends must carry it:

```bash
curl -X POST https://push.example.com/api/notify \
  -H 'authorization: Bearer YOUR_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"title":"Lane Log","body":"Deployment works."}'
```

Then point the client at it. Either serve the API under the same origin at
`/api` (a reverse proxy, or the platform's rewrite rules), or set
`VITE_PUSH_API_URL=https://push.example.com/api` before building.

Rotating the VAPID keys invalidates every existing subscription — everyone has
to turn notifications on again — so generate them once and keep them.

### Before it holds anything real

The server refuses subscription endpoints that are not a known push service —
otherwise it will POST to any URL a client hands it, which makes it a willing
proxy for probing whatever it can reach — caps how many it will hold, and
gates `/api/notify` behind `PUSH_AUTH_TOKEN` when one is set.

What it still is not:

- A real store. Subscriptions live in a JSON file, so they cannot be looked up
  by group or shared between instances.
- Aware of who belongs to what. A notification goes to every subscriber, not
  to a crew.
- Rate limited.

## Verifying a deployment

Open the deployed URL on a phone and check, in this order:

1. **It installs.** Android offers "Add to Home Screen" from the browser menu;
   on iOS use Safari's Share sheet. If nothing is offered, the manifest or the
   service worker did not load.
2. **It works offline.** Turn on airplane mode and reload. The app should open
   and your games should be there.
3. **The camera opens.** Play → Scan a paper score sheet → Open the camera.
   A permission prompt means HTTPS is working.
4. **Notifications arrive.** Settings → Turn on notifications, then
   "Send a test notification". On iOS this only appears once the app is on the
   Home Screen and opened from there — in a Safari tab the option is absent,
   and the screen says so.
5. **A real push lands.** With the server running:

   ```bash
   curl -X POST https://push.example.com/api/notify \
     -H 'content-type: application/json' \
     -d '{"title":"Lane Log","body":"Deployment works."}'
   ```

## What is not deployed

There is no backend for games, groups or chat. Everything is on the device,
and the social screens run on sample data. Deploying this gets you a working
personal bowling log with notifications and scanning; it does not get you a
shared board that two phones agree on.
