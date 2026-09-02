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
  stats.ts        season summary, trend, outcomes, buckets, leaves, houses
  league.ts       the crew as nights: series, handicap, week by week
  pins.ts         the rack, adjacency, split detection, leave names
  history.ts      sorting, searching and grouping games into sessions
  datetime.ts     input round-trips, and every date the app prints
  scorecard.ts    the ten cells, printed and drawn
  ocr/            segmentation, preprocessing, the recogniser interface
  db.ts           IndexedDB
  cloud.ts        the account's copy of the season, and what a sync changes
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

**A note belongs to the bowler, not to the crew.** `Game.note` is the one field
that is somebody's own sentence rather than a number, and sharing a game does
not send it unless the switch on the share screen is turned on — it is off every
time. "Oily left, wrong ball" is written for yourself, and the crew reading it
should be a decision rather than a consequence of having kept one.

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
  it. **The bar is the crop.** Detection still runs on the preview at 8 Hz, and
  a row found lying in the bar slides the bar onto it — re-centred, never
  resized, so the amount of paper taken is always the amount the bowler was
  shown. It used to crop to the row it had found, and that was the bug behind
  "the scan bar gets smaller and it can't get the numbers": what detection is
  surest of on a real sheet is the strip that numbers the frames, a tenth of the
  height of the game it belongs to. The bar shrank to it and photographed
  "1 2 3 4 5 6 7 8 9 10".
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

They are wired all the way through to the saved game now, and kept as a
*prefix*: `pinfallsUpTo` walks frame by frame and stops at the first diagram
that cannot be confirmed against the marks, because `pinfalls` is read ball by
ball against the rolls beside it and a gap in the middle would put every later
ball against the wrong frame. On the four real sheets that prefix is currently
one or two frames — `readDiagram` demands a clean 4/3/2/1 rack and two circles
touching on a photograph cost it the whole frame. The mechanism is right and
the reader is strict; making it read further is splitting merged blobs, and it
is the next thing to do here rather than something already done.

Within a row it finds the rules and reads each frame separately, because
reading even one row in a single pass throws away the grid that says where
frames end. The order that works is **horizontal first**: the borders of the
row's ruled box, then the bands between them, and only then the frame rules
*inside* that box. The frame rules are only as tall as the box, so in a crop
that also holds the pin diagrams they are not the tallest ink in the picture and
cannot be found first.

**The frame grid is fitted, not found.** Eleven rules are a comb with two
unknowns — the spacing and where it starts — and searching those two beats
detecting eleven lines, because on a photograph about half of them do not
survive thresholding. `fitFrameGrid` scores a comb by how much *rule* each tooth
lands on: not ink, but how much of the box's height the column is inked over,
which is the one thing that tells a frame rule from the border of a mark box
printed inside the frame. Ink alone fits the mark boxes perfectly at half the
true spacing and puts every frame boundary through the middle of a frame.

**Where there are pin diagrams, they place the comb and the rules only refine
it.** The rules have a rival the racks do not: the sheet numbers each frame in
its middle and prints the second ball's box there too, so the *centre* of a
frame carries ink in every band the same way its edge does — and on a bent sheet
it carries more. That ambiguity put the grid half a frame out on real
photographs, cutting every mark in two. A rack of ten circles sits under every
frame with a lane of white paper between one and the next, exactly where the
frames divide; `rackColumns` is that lane, and a comb half a frame out cuts
every rack in half rather than passing between them.

**The marks on a Japanese sheet are shapes, not characters.** A strike is a
square filled corner to corner both ways, a spare a square with one triangular
half filled, a miss a bar, and a count thrown at a split a digit with a ring
round it. `markglyphs.ts` classifies them by which corners of the shape are
inked, the way `pindiagram.ts` classifies pins, and only what is left goes to
OCR. Handing those shapes to a recogniser constrained to `X0123456789/-` returns
whichever of the thirteen a black shape most resembles, which is nothing in
particular and differs every time.

**The sheet checks itself.** Every frame carries its running total, and that
column is a second record of the same game. `lib/reconcile.ts` cleans it (totals
never fall, and never climb by more than thirty), repairs frames the recogniser
read short — an open frame's two balls are worth exactly what the total climbed
by, so one ball and the climb give the other — and says whether the game that
came out matches the paper. A scan that agrees with every printed total says so
on the review screen, and that is worth more than any confidence figure the
recogniser can offer about itself. What it will not do is invent: a frame where
nothing was read stays blank, because the score would be right and the two balls
behind it would be a guess.

Four mistakes that are easy to repeat:

1. **Thresholds must be relative to what was found, not to the image.** A
   photographed sheet fills part of the frame, so a threshold anchored to
   image height or sheet width demands rules bigger than the sheet and finds
   nothing. This bit twice — once for vertical rules, once for horizontal.
2. **Straightening must be a rotation, not a shear, and the angle comes from
   the horizontal rules.** A shear fixes vertical rules and leaves horizontal
   ones tilted — and the horizontal borders are what locate the sheet at all.
   The angle itself was measured off the *columns* until a real sheet arrived:
   a crop that includes the pin diagrams is two thirds lattice of printed
   circles, the column projection locks on to that lattice, and straightening
   then *adds* two degrees of tilt to a row that was level. `estimateTilt`
   measures rows, where the box's borders are the longest lines on the page.
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

It stands at **5 of 6**. The one that fails is the noisiest sheet, on one
character: a pencil `9` that reads as nothing, so `9/` comes back as `/` and
will not parse. The totals cannot repair it and should not — the ball before a
spare does not change the score by a pin, so any digit written there would be
invented rather than derived, and it would land in somebody's first-ball
average. The bowler types one character on the review screen instead.

**Where it stands on real sheets.** Of six rows photographed off four Korona
sheets, two now read exactly and say so, both agreeing with every running total
printed under them. The rest parse into a game and warn that they do not match
the paper, which is the honest answer and what the review screen is for. What
goes wrong now is ordinary: a digit misread in an open frame, on a row bent
enough that a straight grid cannot sit on it.

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
second copy of it, free to drift. `lib/league.ts` builds on that rather than
beside it: `allowanceFor` is `handicap(avg) - avg`, so the board and the league
cannot disagree about what a handicap is.

**A night is a day, and `history.ts` decides where it ends.** The league's unit
is the series — every game bowled on one evening — and it has to use the same
boundary the history screen does, or the two will disagree about which games
were "that Tuesday". The handicap in a series is **per game**: three games earn
three allowances, and one per series would quietly halve the handicap of anyone
who bowls more than one.

**Reactions are counted on the client.** `loadSharedGames` reads the reaction
rows for the posts it is about to draw and folds them in with `heartsBy`, rather
than a `count` per post. That query is allowed to fail on its own — a board that
draws without its hearts beats one that does not draw.

There is no `src/data/` any more. Crews, chat and shared games all read the
database; the shapes the screens render live in `lib/social.ts` beside the code
that fills them. A fictional Tuesday Crew sitting next to a real one was worse
than an empty screen.

## The backup, which is not the social layer

`game_backups` (migration 0002) lives in the same database because that is the
database there is, and every policy on it says `owner_id = auth.uid()` and
nothing else. Sharing a game with a crew is a deliberate act per game that
writes `shared_games`; this table is a safe, and its only reader is the account
that filled it.

**`updated_at` is the device's clock, not the server's.** It settles a conflict
between two phones, and `now()` would turn "newest wins" into "whichever synced
last" — losing a week of offline edits to whichever phone opened the app first.

**A deletion has to be told, not inferred.** `deleteGame` writes a tombstone
(its own IndexedDB store, added at DB version 3) and the sync sends those first.
Without them a pull is an undelete: the row is still on the server, the game is
not on the phone, and "missing here" looks exactly like "bowled on the other
phone". Writing a game with the same id clears its tombstone.

Rows coming back go through `problemWith` in `lib/backup.ts` — the same check a
restored file gets, because both are outside data that ends up persisted and
then rendered. Photos are not carried, and the sync is a button: an alley is a
reliably bad place for a network, so a background sync would mostly run at the
worst moment and fail quietly.

## Not built

Apple sign-in — the design has the button, and Apple will not issue the key
Supabase needs without a paid developer account, so it is not drawn rather than
drawn refusing.

**Video is out, and its screen with it.** The handoff has a Videos tab and there
was a screen explaining why it was empty — the arithmetic of storing clips, and
what a backend for them would cost. A screen whose whole content is an apology
for itself earns nothing, so it is gone rather than parked. Nothing links to it
and the `videos` route no longer exists.

**The scan button on the play screen is parked**, not deleted: `ScanScreen` and
everything under `lib/ocr/` are intact and still reached by `?screen=scan`,
which is how both browser checks drive them. The reader works on a real sheet
about as far as the notes above say and no further, and the button goes back the
moment that is worth offering — one `onScan` prop and one button in
`PlayScreen.tsx`.
