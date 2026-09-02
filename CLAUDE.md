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
npm run verify:app       # 30 checks
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
  framestrip.ts   the play screen's ten cells: boxes, totals, pins per frame
  dashboard.ts    what the home screen shows, and where you stand in your crew
  leaderboard.ts  ranking, bar scaling, podium order, movement
  stats.ts        season summary, trend, outcomes, first-ball buckets, leaves
  pins.ts         the rack, adjacency, split detection, leave names
  history.ts      sorting, searching and grouping games into sessions
  datetime.ts     input round-trips, and every date the app prints
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

**The scoring step fits one screen, and that is a constraint, not a wish.**
Strip, status line, rack, two buttons — nothing scrolls, because the screen is
used a ball at a time with one hand while somebody else is bowling. It wants
about 720px and an SE-sized phone gives 545, so `app.css` carries two
height media queries that give back what an ordinary phone does not need to.
Two things are held fixed through all of them: targets stay at 44px, and the
strip stays **five frames across**. Ten across fits the height and was tried;
a phone is not wide, and at 37px a cell the pin diagram is the first thing to
become unreadable, which is the reason the strip is drawn at all. What gives
instead is explanation — the legend, the leave caption, the axis labels, the
tenth's note, in that order. Anything added here has to earn its height
against something already there; `scrollHeight - clientHeight` on `.screen` is
the test.

**Dates go through `datetime.ts`.** `toLocaleDateString(undefined, …)` follows
the *browser*, so a phone in English shows "Aug 31" in the middle of a
Japanese screen. One helper decides, and it reads the app's own setting.

## The scanner: one game at a time

A house sheet stacks a row per game — three is normal, six happens — and
reading the whole sheet at once does not work. Every row's frame grid has to
survive being projected on top of every other row's, and it does not: the
rules of one land in the gaps of the next until the projection is noise.

So the unit of a scan is **one row**, and the bowler says which:

- **The camera is a barcode reader.** A fixed bar sits in the middle of the
  preview (`lib/reticle.ts`) and the sheet is slid until one row lies inside
  it. Only that strip is captured. Detection still runs on the preview at 8 Hz
  and, when it finds a row lying in the bar, the brackets snap to the row's own
  rules and the capture takes those instead — lock-on, not selection, so a miss
  costs nothing.
- **A picked photo gets a box to drag** (`components/RegionPicker.tsx`), seeded
  on whichever row `detectGameRows` likes best. The seed is opened out past the
  row's rules on purpose: the band runs from one rule's centre to the next, and
  a crop that shaves the borders off leaves the reader nothing to find the
  frame grid against.

The house is not read, and neither is the date: two fields to type beats a date
silently read wrong. The **time** is different — a Korona sheet prints
`開始時間 00:41` beside every game, so where it can be read it is offered and
the bowler confirms it.

**The pin diagrams are read.** That reverses an earlier decision, and the reason
is that the sheets turned out to carry more than was assumed: each frame gets a
4/3/2/1 rack drawn in three shapes that say which pins survived which ball. See
`docs/SHEET_FORMAT.md` — that is the same `pinfalls` a game scored on the app's
own rack stores, so a scan can feed the leave statistics instead of only the
scores. The marks above the diagram are a checksum on it, and a leave that
disagrees with the count is dropped rather than imported.

Within a row it finds the rules and reads each frame separately, because
reading even one row in a single pass throws away the grid that says where
frames end.

Three mistakes that are easy to repeat:

1. **Thresholds must be relative to what was found, not to the image.** A
   photographed sheet fills part of the frame, so a threshold anchored to
   image height or sheet width demands rules bigger than the sheet and finds
   nothing. This bit twice — once for vertical rules, once for horizontal.
2. **Straightening must be a rotation, not a shear.** A shear fixes vertical
   rules and leaves horizontal ones tilted — and the horizontal borders are
   what locate the sheet at all.
3. **Live detection must crop to the paper first, but only when there is
   paper to crop to.** A sheet on a table is a bright rectangle on something
   darker; thresholded, that darker something is ink across every row it
   occupies, far stronger than any printed rule, so the rules never clear the
   bar. Cropping fixes it — but held close the sheet fills the frame, the same
   threshold now separates print from paper, and the brightest run is the
   *inside of a row*. Cropping to that throws away the rules being looked for.
   `findPaper` checks the frame's outer edge is actually dark before it crops.

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

## The social layer

Supabase, free tier — see `docs/BACKEND.md` for the schema, the RLS reasoning
and the three dashboard steps it needs. Two rules hold here:

**The publishable key in `lib/backend.ts` is public and committed.** A static
site has no server to keep a secret in, so the key ships in the bundle whatever
you do. RLS is the security model; the policies are the review. The
`service_role` key and the database password must never appear in `src/`.

**The SDK is dynamically imported and kept out of the precache.** It is 56 KB
gzipped for screens that cannot work offline anyway, and the app it is bolted
onto scores games with no account at all. `hasStoredSession()` reads the token
key straight from localStorage so a guest never fetches the chunk to be told
they are a guest.

Standings — average, handicap, improvement — are computed in `lib/social.ts`,
not in SQL. One definition of what an average means; a Postgres view would be a
second copy of it, free to drift.

There is no `src/data/` any more. Crews, chat and shared games all read the
database; the shapes the screens render live in `lib/social.ts` beside the code
that fills them. A fictional Tuesday Crew sitting next to a real one was worse
than an empty screen.

## Not built

Apple sign-in — the design has the button, and Apple will not issue the key
Supabase needs without a paid developer account, so it is not drawn rather than
drawn refusing. Also no cloud backup of games, no reactions on a shared game
beyond the schema that holds them, and no video.
