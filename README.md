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
| **Scan a score sheet** | Photograph a paper sheet; the grid is found, each frame is read on-device, and the parsed game is shown for correction before it is saved. A league sheet with several bowlers on it is read as several rows, and you pick yours. |
| **Live scoring** | Tap the pins you knocked down on a drawn rack, so a leave is recorded as itself — a 10-pin, a 7-10 — not just as a number. Or a counting pad when you need to keep up with a league. |
| **What you leave** | Which leaves come up most and how often you pick them up, split conversion included. Only from games scored on the rack, and it says so. |
| **History** | Every game, grouped by session, filterable by range. |
| **Analytics** | Score trend, how frames finish, first-ball distribution — one range selector over all three, each with a table view. |
| **Each game** | Full scorecard, the sheet it was scanned from, which boards it is on, correcting a frame after the fact, and deletion. |
| **Group dashboard** | The handoff's centrepiece: hero standing, metric switcher, podium, and the six-row board whose rows *slide* between ranks. |
| **The rest of the crew** | Auth (guest by default), groups list, create a group, join by typed code or by scanning a QR, chat, member detail, group settings, and sharing a game to a board. |

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

Two browser-driven checks cover what unit tests cannot. Opt-in, since they need
a browser:

```bash
npm i -D playwright
npm run build && npm run preview &
npm run verify:app       # 27 checks
npm run verify:scanner   # 6 generated sheets
```

`verify:app` answers the questions only a real browser can: does the service
worker serve the app with the network cut, does a push actually reach the
worker with its click target intact, does a save that fails lose the game, does
the leaderboard *move* its rows rather than re-sort them, is every control 44px
to a thumb, does navigating take a screen reader with it, does reduced motion
drop the travel without losing the layout.

`verify:scanner` generates score sheets that imitate what a phone captures — a
tilt, uneven overhead light, sensor noise, pencil rather than ink, and a league
sheet with four bowlers stacked on it — pushes each through the real scan flow,
and fails if a readable sheet is misread or an unreadable one produces a game
anyway. The sheets are seeded, so a pass or a failure is attributable to a
change in the scanner rather than to the noise. It compares the resulting
*game*, not the mark string: different marks can describe the same throws, and a
scanner that gets the game right has done its job.

### Testing on a phone

Both the camera and Web Push require a secure context, so `localhost` works but
a bare LAN address does not. Put an HTTPS tunnel in front of the dev server
(`cloudflared tunnel --url http://localhost:5173`, or similar) and open that URL
on the handset.

### Deploying

`docs/DEPLOYING.md` covers it: build, upload `dist/` to any static host, and —
if you want notifications — run the push server somewhere with three
environment variables. Two host settings matter (serve `index.html` for unknown
paths; never cache `sw.js`), and configs for Netlify, Cloudflare Pages, Vercel
and nginx are included. There is a five-step checklist at the end for
confirming a deployment on a real phone.

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

**Nothing third-party is on the critical path.** Inter and the OCR engine are
both fetched at build time and served from our own origin. This is not tidiness:
the design system's upstream CSS imports Inter from Google Fonts, and that
import is render-blocking, so first paint waited on a third party. On a network
that could not reach it the page stalled until the request timed out rather than
falling back — about **12.7 seconds to DOMContentLoaded, measured**. Self-hosted,
the same load is **40ms**. An app meant to work at a bowling alley cannot have a
CDN between the user and first paint.

**A scan is never imported silently.** OCR on pencil marks is good enough to
save typing and not good enough to trust. Every scan lands on a review screen
with an editable mark string, and a wrong read costs a correction rather than a
corrupted average.

**The scanner reads the grid, not the page.** A score sheet's vertical rules say
exactly where one frame ends; reading the whole image in one pass throws that
away and leaves the parser guessing frame boundaries from whitespace. So the
sheet is straightened, its rules are located, and each frame is cropped and read
on its own. Two details are easy to get wrong and were: the rule threshold has to
be measured against the tallest column actually found rather than the image
height, because a photographed sheet fills only part of the frame; and the
straightening has to be a rotation rather than a horizontal shear, because a
shear fixes the vertical rules while leaving the sheet's horizontal borders
tilted — and those borders are what locate the sheet at all. When no grid is
found the scanner falls back to reading the whole image and says so.

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

The video screen and clip storage (out of scope for MVP in the handoff too),
real Google and Apple OAuth, QR *scanning* (showing a code works; reading one
does not), and any backend at all — groups, rosters, chat and shared posts are
sample data in `src/data/`, obviously fictional, and the one place to replace
when there is a group API.

## Known limits

- **iOS notifications need the app installed.** Safari exposes no push API in a
  normal tab; it appears only once the app is on the Home Screen (iOS 16.4+).
  The Settings screen says so rather than showing a button that cannot work.
- **On-device OCR reads printed and neatly pencilled sheets well, messy
  handwriting poorly.** `ScoreSheetRecogniser` in `src/lib/ocr/types.ts` is the
  seam for a cloud vision model when better accuracy is worth a server. The
  generated sheets `verify:scanner` uses are clean handwriting-substitutes, not
  real handwriting — treat them as a regression guard, not proof it reads yours.
- **The OCR engine is vendored to our own origin** by `scripts/vendor-ocr.mjs`
  (wasm core, worker and language data, ~5 MB), so scanning does not depend on a
  public CDN. It is deliberately left out of the precache — it downloads on the
  first scan and is cached from then on, rather than costing every install five
  megabytes up front.
- **The icons are placeholders**, generated by `scripts/make-icons.py`. Replace
  `public/icons/` with the real brand assets.
