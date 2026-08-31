# Lane Log

A bowling score tracker built as an installable web app, so it runs on iOS and
Android without going through either store.

Implements the Nocturne design in `docs/DESIGN_HANDOFF.md`, plus score sheet
scanning, which is not in the handoff.

## What works today

| | |
|---|---|
| **Installable** | Web app manifest, service worker, offline app shell. Android gets a native install prompt; iOS gets Share-sheet instructions, which is the only route Safari offers. |
| **Notifications** | Web Push with VAPID, end to end — permission, subscription, delivery, and tapping a notification to focus the app. |
| **Scan a score sheet** | Photograph a paper sheet; OCR reads the marks on-device and shows the parsed game for correction before it is saved. |
| **Live scoring** | Pin keypad that only offers counts that are physically standing, with a scorecard that fills in as you bowl. |
| **History** | Every game, grouped by session, filterable by range. |
| **Group dashboard** | The handoff's centrepiece: hero standing, metric switcher, podium, and the six-row board whose rows *slide* between ranks. |

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Notifications need the push server and a VAPID key pair:

```bash
npm run push:keys                    # prints a public/private pair
cp .env.example .env                 # paste them in
npm run push:server                  # :8787, proxied at /api in dev
```

Then send one:

```bash
curl -X POST localhost:8787/api/notify \
  -H 'content-type: application/json' \
  -d '{"title":"Tuesday Crew","body":"Aya just posted a 234","url":"/?screen=group"}'
```

```bash
npm test             # unit tests
npm run typecheck
npm run build        # production build into dist/
```

### Testing on a phone

Both the camera and Web Push require a secure context, so `localhost` works but
a bare LAN address does not. Put an HTTPS tunnel in front of the dev server
(`cloudflared tunnel --url http://localhost:5173`, or similar) and open that URL
on the handset.

## How it is put together

```
src/lib/          the parts worth testing on their own
  scoring.ts      ten-pin scoring from a flat roll list
  marks.ts        parses X / - marks off a sheet into rolls
  leaderboard.ts  ranking, bar scaling, podium order, movement
  ocr/            recogniser interface + on-device Tesseract implementation
  import.ts       photo -> recognise -> parse -> review -> save
  db.ts           IndexedDB store
  push.ts         subscription and permission
  install.ts      Home Screen installation
  camera.ts       live capture and the file-input fallback
src/screens/      one file per screen
src/styles/       nocturne.css (design system, vendored) + app.css
src/sw.ts         service worker: offline shell + push handling
server/           minimal push server
```

The domain logic is deliberately separate from React. Scoring, mark parsing and
ranking are pure functions with unit tests (`npm test`), so the tricky parts —
tenth-frame bonus balls, a spare that follows a strike, re-ranking a board —
are verified without rendering anything.

### Two details that are load-bearing

**The leaderboard's rows are never sorted.** The board keeps its children in
roster order, keyed by member, and encodes each row's rank in its `top`
property. Switching metric changes `top`, so rows slide to their new places.
Sorting the array before rendering would re-mount the rows and lose the
animation entirely. `ROW_HEIGHT` and `ROW_GAP` in `lib/leaderboard.ts` must stay
in step with `.board__row` in `app.css`.

**A scan is never imported silently.** OCR on pencil marks is good enough to
save typing and not good enough to trust. Every scan lands on a review screen
with an editable mark string, and a wrong read costs a correction rather than a
corrupted average.

## Answers to the handoff's open questions

The handoff asks six questions under "Questions for the Build". Where this
build has taken a position:

- **Framework** — an installable PWA (React + Vite), not React Native or
  Flutter. This was the explicit product decision: no app stores for now.
- **Database** — IndexedDB on the device. No cloud, no account. Records carry
  `updatedAt` / `syncedAt` so a sync can find what changed when there is a
  backend.
- **Push** — self-hosted Web Push with VAPID rather than FCM. Works on both
  platforms and needs no Firebase.
- **OAuth, video storage, analytics** — not built. Guest play is the only mode,
  which matches the handoff's own "nothing asks for sign-in until you touch
  shared content".

## Not built yet

Phase 2 onward from the handoff: the analytics screen and its charts, auth,
the groups list, create/join a group, chat, shared posts, member detail, and
group settings. The group dashboard's roster is sample data in
`src/data/roster.ts` — obviously fictional, and the one place to replace when
there is a group API.

## Known limits

- **iOS notifications need the app installed.** Safari exposes no push API in a
  normal tab; it appears only once the app is on the Home Screen (iOS 16.4+).
  The Settings screen says so rather than showing a button that cannot work.
- **On-device OCR reads printed and neatly pencilled sheets well, messy
  handwriting poorly.** `ScoreSheetRecogniser` in `src/lib/ocr/types.ts` is the
  seam for a cloud vision model when better accuracy is worth a server.
- **Inter loads from Google Fonts** via the vendored design-system CSS, so the
  first offline load falls back to the system font. Self-host the woff2 files
  to fix.
- **The icons are placeholders**, generated by `scripts/make-icons.py`. Replace
  `public/icons/` with the real brand assets.
