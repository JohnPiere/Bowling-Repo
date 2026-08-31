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

Set three environment variables on the host:

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:you@example.com
PORT=8787
```

Then point the client at it. Either serve the API under the same origin at
`/api` (a reverse proxy, or the platform's rewrite rules), or set
`VITE_PUSH_API_URL=https://push.example.com/api` before building.

Rotating the VAPID keys invalidates every existing subscription — everyone has
to turn notifications on again — so generate them once and keep them.

### Before it holds anything real

The reference server keeps subscriptions in a JSON file and lets anyone POST
to `/api/notify`. That is fine while you are the only user and wrong the
moment you are not. Three things to add:

- Authentication on `/api/notify`, so only your backend can send.
- A real store, so subscriptions survive a restart and can be looked up by
  group.
- Group membership, so a notification goes to a crew rather than to everyone.

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
