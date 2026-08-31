# Lane Log — working notes

A bowling score tracker built as an installable web app. No app stores, so
everything hangs off the browser: service worker, Web Push, `getUserMedia`,
IndexedDB.

Read `docs/DESIGN_HANDOFF.md` first — it is the spec, and the Nocturne design
system it names is vendored at `src/styles/nocturne.css`.

## Commands

```bash
npm run dev              # vendors assets, then serves on :5173
npm test                 # unit tests (vitest)
npm run typecheck
npm run build            # -> dist/

npm run push:keys        # VAPID pair for notifications
npm run push:server      # :8787, proxied at /api in dev

# Browser checks. Opt-in: npm i -D playwright
npm run build && npm run preview &
npm run verify:app       # 16 checks
npm run verify:scanner   # 6 generated sheets

# Headers are ignored by `vite preview`, so test the CSP against this instead.
npm run serve:headers 4200 &
npm run verify:app -- http://localhost:4200
```

## Shape

Domain logic lives in `src/lib/` as pure functions with unit tests. Screens
render what those return and compute nothing themselves. If you find yourself
deriving a number inside a component, it probably belongs in `lib/`.

```
src/lib/
  scoring.ts      ten-pin scoring from a flat roll list
  marks.ts        parses X / - marks off a sheet into rolls
  leaderboard.ts  ranking, bar scaling, podium order, movement
  stats.ts        season summary, trend, outcomes, first-ball buckets, leaves
  pins.ts         the rack, adjacency, split detection, leave names
  ocr/            segmentation, preprocessing, the recogniser interface
  db.ts           IndexedDB
  navigation.ts   the screen stack
```

## Things that are load-bearing

**The leaderboard's rows are never sorted.** The board keeps its children in
roster order, keyed by member, and encodes rank in each row's `top`. Switching
metric changes `top`, so rows slide. Sorting the array before rendering
re-mounts them and loses the animation entirely. `ROW_HEIGHT` and `ROW_GAP` in
`lib/leaderboard.ts` must agree with `.board__row` in `app.css`.

**Nothing third-party may sit on the critical path.** The design system's
upstream CSS imports Inter from Google Fonts. That import is render-blocking,
and on a network that cannot reach it the page stalls until timeout rather
than falling back — 12.7 seconds to DOMContentLoaded, measured, versus 40ms
self-hosted. Inter and the OCR engine are both vendored at build time
(`scripts/vendor-font.mjs`, `scripts/vendor-ocr.mjs`) into `public/`, which is
gitignored. If you add a dependency that fetches at runtime, vendor it too.

**Sheet photos live in their own object store.** They are the only thing big
enough to matter: 400 games once carried 49 MB of blobs into memory to render
a list of scores. `listGames()` returns games without images; `getSheetImage()`
fetches one when something actually shows it.

**A scan is never imported silently.** OCR on pencil is good enough to save
typing and not good enough to trust. Every scan lands on a review screen.

## The scanner, and two mistakes it is easy to repeat

It finds the sheet's rules and reads each frame separately, because reading
the whole image in one pass throws away the grid that says where frames end.

1. **Thresholds must be relative to what was found, not to the image.** A
   photographed sheet fills part of the frame, so a threshold anchored to
   image height or sheet width demands rules bigger than the sheet and finds
   nothing. This bit twice — once for vertical rules, once for horizontal.
2. **Straightening must be a rotation, not a shear.** A shear fixes vertical
   rules and leaves horizontal ones tilted — and the horizontal borders are
   what locate the sheet at all.

Segmentation is pure and tested on synthetic buffers, but those buffers hid
both bugs. `npm run verify:scanner` generates sheets that imitate a photograph
(tilt, uneven light, noise, pencil, four bowlers stacked) and is what actually
catches this class of thing. Its sheets are seeded — do not make them random,
or a pass stops being attributable to the code.

It compares the resulting **game**, not the mark string: `9/` and `91` are the
same two throws, so a scanner that reads one for the other is still right.

## Testing

Two kinds of unit test. The example tests say what should happen in cases
worth naming. The property tests (`*.property.test.ts`) fuzz — the scoring
engine against a second scorer written from the rules rather than from the
code, and the mark parser against random noise. They exist because the cases I
think to write down are the ones I already handled.

The parser property is the important one: fed anything, it must either refuse
or return a legal game. A parser that quietly produced a *plausible* wrong
game would put a score in someone's history that they never bowled, and
nothing would look amiss.

## Conventions

- Comments explain *why*, especially where something looks odd. Several things
  here are non-obvious for reasons worth writing down.
- Touch targets are 44px to the thumb, which is not the same as 44px painted:
  chips, the switch and icon buttons keep their designed size and extend the
  hit area with a pseudo-element. `verify:app` probes `elementFromPoint`, not
  `getBoundingClientRect`.
- Charts follow `dataviz` guidance: colour by the job it does, a table view
  behind every chart, no second y-axis. The design handoff overrides it on
  `tabular-nums`, which it requires everywhere numbers change.
- The design handoff wins over general guidance where they disagree. Say so in
  a comment when they do.

## Not built

No backend at all. Groups, rosters, chat and shared posts are sample data in
`src/data/` — obviously fictional, and the one place to replace. Also absent:
real Google and Apple OAuth, and video.
