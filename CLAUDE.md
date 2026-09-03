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

# The migrations and their policies. Opt-in: apt-get install -y postgresql-16
npm run verify:sql       # 17 policy checks, on a throwaway server
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
  stats.ts        season and single-game summaries, trend, leaves, houses
  league.ts       the crew as nights: series, handicap, week by week
  pins.ts         the rack and its deck, adjacency, splits, leave names
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

**The rack replays one frame, not the game.** `deckFor` decides which pins the
bowler is shown, and therefore which pins get recorded against the ball they
throw. It used to walk every ball from a single rack and re-rack only when the
deck happened to empty — so a frame that ended *open* carried its survivors into
the next one, and a spare attempt in frame 2 was offered a deck missing pins
that frame 1 had knocked down. The score was never wrong, because the last line
forces the deck to the size the scorer asks for; only the *leave* was, which is
why it went unnoticed and why it mattered — a wrong leave is indistinguishable
downstream from one that happened.

It lived in the play screen, where the only way to check it was to bowl a game
by hand. It is in `lib/` now with a property test that bowls four hundred random
games and asserts every deck is either a full rack or exactly what survived the
ball before it. That test found this.

**And `leavesFromPinfalls` had the same bug, and outlived the fix to `deckFor`
by a fortnight.** They are the two halves of one fact — one decides what to
*show* the bowler, the other what the statistics *read back* out of a saved
game — and both walked the game from a single rack, re-racking only when the
deck happened to empty. Fixing one left the other wrong, and nothing failed,
because nothing compared them.

It is worse in the reading half, because nothing forces the answer back to a
plausible size. Leave the 7 pin open in one frame, throw at a full rack in the
next and leave the 7-10: the model still believes the 7 is lying down, removes
nothing for it, and records a **10 pin** where a **7-10 split** happened. Every
leave after every open frame was suspect, and open frames are most frames for
most bowlers — so `leaveRecords`, `splitSummary`, `practiceTargets`,
`spareBreakdown` and `conversionByType` were all reading a rack nobody had
swept. It takes `rolls` now, because frame boundaries are the only thing that
re-racks and pinfalls alone cannot say where they are.

The property test that would have caught it is the one that now does: over
three hundred random rack games, for every ball that does not open a frame,
what `deckFor` offered must equal what `leavesFromPinfalls` says stood after
the ball before it. Two implementations of one rule, checked against each
other, because that is the shape the bug had.

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

Those short-screen rules are scoped to `.play` on purpose. The game record
draws the same `FrameStrip` — `frameStrip(rolls, pinfalls, [], null)`, no ball
in flight — and it scrolls, so it must not inherit a squeeze that exists only
because a rack and two buttons have to fit under the strip. It falls back to the
plain `Scorecard` for a game with no pin data, since ten empty racks read as a
bug rather than as an absence.

**A profile picture is bounded, and that bound is load-bearing.** It lives in
`localStorage` beside the rest of the profile so every avatar on every screen
has it while rendering — a tile that flashed initials on the way to a picture is
worse than one that never had a picture. But `savePreferences` writes the whole
object at once, so a picture over the quota would take the name and the language
down with it, silently, from inside a `catch` that can do nothing useful. So
`lib/avatar.ts` re-encodes to a 192px square and refuses to return anything over
`MAX_DATA_URL`, `savePreferences` returns whether the write stuck, and the
picker puts the picture back to null and says so when it did not. A 12-megapixel
photograph of pure noise — the worst thing a compressor can be handed — comes
out at 18 KB of the 28 KB budget.

The tile keeps its ring, its tint and its initials underneath. A picture that
fails to decode leaves exactly the avatar the app drew before there were any.

**A note belongs to the bowler, not to the crew.** `Game.note` is the one field
that is somebody's own sentence rather than a number, and sharing a game does
not send it unless the switch on the share screen is turned on — it is off every
time. "Oily left, wrong ball" is written for yourself, and the crew reading it
should be a decision rather than a consequence of having kept one.

**A white page is the one failure that says nothing, and `index.html` carries a
guard against it.** The app is served from GitHub Pages, where a deploy renames
every hashed file and deletes the old ones. A phone that has the service worker
installed keeps being served the *precached* shell, which names files the server
no longer has — and because updates sit behind a prompt the app itself has to
draw, a shell that cannot load can never ask. That is a permanent white page
with no way out from inside, and it is what a real phone hit.

The guard is the only non-module script on the page and nothing in it may import
anything, because the case it exists for is the bundle not arriving. It paints
the dark ground first, so a missing stylesheet is not a white page either; it
catches a failed `<script>`/`<link>` load in the capture phase, clears the
service worker and every cache and reloads **once** per session; and anything
else before mount paints a message in both languages with a button that does the
same by hand. `main.tsx` sets `window.__laneLogReady` so the guard knows the app
arrived. `lib/recover.ts` is the same clearing, for code that can import.

Nothing there touches IndexedDB. It clears the copy of the *program*, never the
copy of the season.

The lazily-imported chunks are the other half of the same failure: the Supabase
SDK is deliberately not precached, so for a client still on the old shell it
404s and sign-in did nothing at all. `backend()` now clears its cached promise
on failure — one bad fetch used to poison every later call — and `signIn` is
wrapped, because a sign-in button whose only failure mode is silence is worse
than one that refuses.

**Two Pages publishers, and the wrong one was winning.** With the repository's
Pages source set to "Deploy from a branch", GitHub runs its *own* Jekyll build
over the repository root on every push and deploys that — alongside, and
independently of, `pages.yml`. Both were green on every commit and the later
one won: measured for `d7180b9`, this workflow deployed at 06:41:24 and the
branch publisher at 06:41:31, seven seconds behind it. What the branch
publisher publishes is the *source* tree, so the site served `index.html` with
`<script src="/src/main.tsx">` — TypeScript, which no browser runs.

That is the real cause of the white page, and the stale precache was only ever
half of it: a phone with the worker installed kept serving itself the working
precached copy, which is why it looked like a caching problem and why it hit
whoever had cleared their data or never visited before. The race also explains
its coming and going without a commit in between.

It is a race and it goes both ways: for `d7180b9` the branch publisher landed
last and the app was replaced by its own "could not start" screen; for
`5054860`, the very next push, this workflow landed last and the same code was
fine. Reading the deployed site back cannot tell those apart — sample it on a
push that happened to win and it passes while the repository is still
configured to break the next one.

So `pages.yml` asks what the configuration *is*, which is not a race. GitHub's
own answer, from the run for `6e5f914`: `Pages build_type is 'legacy'`. The
workflow then tries to set it to `workflow`, which would stop the Jekyll
publisher being run at all — and is refused: `403 Resource not accessible by
integration`. `pages: write` does not extend to `PUT /repos/{owner}/{repo}/pages`,
so **this one setting has to be changed by hand**, once, at Settings → Pages →
Build and deployment → Source: GitHub Actions.

That step therefore *warns and carries on*, and the reason is worth keeping:
`deploy` needs `build`, so failing there stops the only publisher that produces
a working site and hands the domain to the broken one. A check that breaks the
thing it is checking is not a check. Until the setting is fixed, the `deploy`
job waits for the branch publisher to finish before deploying — the winner is
whoever lands last, so be last on purpose. It is a mitigation, it is skipped
the moment `build_type` reads `workflow`, and the read-back behind it still
fails the run if the site ends up wrong anyway.

The boot guard tells the two apart now, because the advice differs and one of
them was actively wrong. A failed asset whose path is a source entry
(`/src/…​.tsx`) means the *server* is serving an unbuilt page: clearing caches
cannot fix it, reloads into the same wall, and on a phone that still had a
working offline copy spends that copy for nothing. That case gets its own words
and a plain reload; everything else still heals once.

**A version that waits for permission never arrives.** The worker is registered
`prompt` rather than `autoUpdate` and that part is right — rolls are component
state until a game is saved, so a reload mid-frame costs somebody the game they
are bowling. Everything around it was wrong. The prompt was a `confirm()`,
which is dismissed by a stray tap, never returns for that worker, and on a Home
Screen PWA may not be shown at all; so the new worker sat waiting while the old
one kept serving the old app, indefinitely.

`lib/updates.ts` takes the update immediately unless a game is in progress,
holds it behind a banner when one is, takes it the moment the game is saved,
and asks the browser to look on `visibilitychange` — left alone it checks on
navigation and roughly daily, which for an app opened from the Home Screen can
mean never.

Two things there are less obvious than they look. `applyUpdate` reloads if the
handover has not happened within `HANDOVER_MS`, because the handover is a
message to a *waiting* worker and there is not always one: a page loaded before
any worker controlled it is uncontrolled, so the next worker activates without
ever passing through `waiting` — nothing to skip, no `controllerchange`, and
the reload that hangs off it never happens. Measured in the browser, that made
"Update now" a button that did nothing whatsoever. The reload is once per tab,
guarded in `sessionStorage` the way `index.html` guards its own.

And in `PlayScreen` the `setBowling(false)` cleanup is its own effect with no
dependencies. As the cleanup of the effect that tracks the rolls, it ran on
*every ball* — which took the held update between two frames and reloaded the
page out from under the game it was there to protect.

`scratchpad`-style simulations are what caught both: two builds with different
version numbers and a static server that can be pointed at either while a real
service worker is installed against it. Neither bug is visible in a unit test,
and neither was visible by hand.

**Three settings that skip something, and nothing that only toggles.** The app
already had a colour and an avatar; what it did not have was a way to stop
paying for the same decision twice. `startScreen` is the tab the app opens on —
somebody who opens this at the lane wants the rack and somebody who opens it on
the train wants the board, and either way that tap is paid every launch.
`scoringEntry` skips "how are you scoring this game?" for anyone who has settled
on one of the two. `homeHouse` fills in the alley on the finishing step, which
is the one piece of typing in the app and is asked for at the moment somebody
least wants to type; Settings offers it as a datalist of the houses actually
played, most-played first, which is `housesPlayed` rather than `houseStats`
because a suggestion list wants the alley you *go to*, not the one you happen
to bowl best at.

Every default is the behaviour that existed before, so the app somebody already
knows does not change because a setting now exists — there is a test that says
so, including for a preferences object stored before these fields existed.

Two things fell out of building it that are worth keeping. `scoringEntry` is
read *once* into state rather than watched, so changing it on another screen
mid-game cannot reach in and change how the game on screen is being entered.
And the link under the two buttons is now one function, `footLink`, used by
both entry modes: before the first ball it switches mode, after it discards.
That has to be a swap and not a second line — the scoring step fits one screen
with nothing to scroll, and this costs exactly 0px, measured. The first version
of it changed only the rack's copy of that line, because the keypad had its own.

The "Open on" chips are named after the tabs, which collided with
`verify:app`: a bare `getByRole('button', { name: 'Home' })` matched two
buttons and died on a strict-mode violation. The tab clicks now go through a
`tab()` helper scoped to `.tabbar`, which is what they always meant.

**A game's date can be corrected, because it is the field people walk past.**
The finishing step asks when it was bowled and arrives with *today* already in
it, which is right almost always and invisible when it is wrong — a game
written up the next morning is filed under the morning. `reviseGame` has taken
a `playedAt` since it was written and nothing ever passed one, so that was
permanent. The correction form has the date and the time now, beside the house
and the note. An unreadable date leaves `playedAt` alone rather than becoming
one: a cleared field must not silently move a game to 1970, and the history
screen groups by night, so moving a game moves which night it belongs to.

The crew board was the last place still calling
`toLocaleDateString(undefined, …)`, which is the thing the rule below exists to
stop — a phone set to English put "Aug 31" in the middle of a Japanese board.
It goes through `formatDay` now, and nothing in `src/` calls the browser's
locale any more.

**Counting is a different question from averaging, and the labels have to say
so.** Everything else on the analytics screen is a rate: it moves both ways and
says how somebody is bowling now. `tally` says how much has been bowled, which
only ever goes up, and two of its definitions will be misread unless they are
spelled out on the card itself:

- **Pins means pinfall, not score.** A perfect game is 300 points and 120 pins.
  `Summary.totalPins` next door is a sum of *scores* despite its name, so
  anything drawing both has to say which it means.
- **Strikes are counted off the sheet's marks**, via `frameMarks`, so a perfect
  game is twelve. `ballOutcomes` counts the same game as ten frames, on
  purpose, because its shares have to add to one. Both are right for their own
  question and they must never be drawn beside each other unlabelled.

`TallyCard` is a real `<table>` because it is one, and it is shared with a
crew member's page — where it counts *only what that member shared*, which is
all anybody else can see of them. `SharedGame` carries `rolls` and `playedAt`
for that and deliberately not `pinfalls`: leaves are not shared, so a member's
page can show frames and strikes and never what they left.

**The ball, the lane and the condition were a sentence, and are fields now.**
`Game.note`'s own comment named all three — "the lane, the oil, a ball changed
at the fifth". A sentence is the right place to *explain* a game and the wrong
place to *count* one: nothing can average a season by ball while the ball is a
phrase inside prose. All three are free text and deliberately so, offering what
has already been typed rather than a table of ball models the app would then
have to maintain. `defaultBall` is pre-filled on the finishing step for the same
reason `homeHouse` is: per-ball averages are worth nothing if the field stops
getting filled in.

`statsBy` is the one grouping behind house, ball, lane and condition. Four
plausible copy-pastes of an average are four chances for them to stop meaning
the same thing. It fixed one on the way: **`houseStats` did not filter
unfinished games** and `summarise` always has, so a season average and a
per-house average disagreed about what a game is — a two-frame abandonment
carried a total of about 24 into one of them and not the other.

Note that these read the *stored* `total` rather than rescoring, which is
deliberate and is what the denormalisation on `Game` exists for. `tally`
rescores instead, because it is answering a different question. They agree on
real data because `saveGame` writes the total from the scorer; they diverge on
synthetic data, which is how a seeded season with `total: 0` briefly made every
average on every card read zero.

**Consistency is the stat this app was missing.** Averages and highs describe
the middle and the ceiling and say nothing about the range — and the range is
what most people are actually trying to fix. 150 ± 40 and 150 ± 12 are the same
average and two completely different bowlers, and only one of them can be
relied on for a team. It is also the more honest goal: a ceiling moves rarely,
a spread moves with practice. Population deviation, not sample — these are all
the games there are. Under `MIN_FOR_SPREAD` games it returns null rather than a
number, because a spread over three games is noise wearing a number's clothes
and a number on a screen is believed.

**The heat map is the summary; the leave list is the detail.** "What you leave"
knows everything `pinHeat` does and says it as twelve rows of names — "Baby
split", "2-4-5", "Gutter". That is the right shape for reading carefully and
the wrong one for the question people actually bring to it, which is *what
keeps happening to me*. A tinted rack answers that before it is read, and most
bowlers have a lopsided one they recognise instantly as their own.

`weight` is relative to the *worst* pin, not to the frame count. An absolute
scale would leave every rack looking nearly blank — a given pin survives a
small share of frames even for a bad bowler — and the shape is what is being
read, not the level. The colour runs on `--negative` for the same reason the
practice list does: everywhere else in the app a long bar is good news, and
here a bright pin is one that keeps beating you.

It is not a `PinRack`. That is a grid of 44px buttons because it is aimed at
with a thumb; this is read, not tapped. What it does share is the orientation —
`PIN_ROWS` is back row first and `.rack__deck` draws it that way, so the play
screen puts the 7-8-9-10 at the top. The first version of `.heatrack` used
`column-reverse` and produced a rack that was internally correct and upside
down against every other one in the app.

**Splits get their own section, because the leave list cannot answer the
question.** "What you leave" is ranked by how often a leave happens, which puts
the ten pin and the head pin at the top and a split rarely on the screen at
all. `splitRecords` is splits only, still ranked by frequency — what keeps
happening to you — with both the conversion rate and the miss rate, because
"I get a third of these" and "this costs me two frames in three" are different
sentences and a reader should not have to do the subtraction.

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

**The policies can be run now, and could not be before.** RLS is the security
model — the key in the bundle is public precisely because the policies are what
stands between a crewmate and somebody's season — and until `npm run verify:sql`
there was no way to execute a single one of them. They were written, reviewed by
reading, and applied by hand to the one database that matters.

It stands up a throwaway Postgres, gives it the parts of Supabase the migrations
stand on (`supabase/tests/shim.sql`: an `auth.users` with the columns 0001's
trigger reads, an `auth.uid()` off a session setting, the three roles, and the
default grants — without which every policy is unreachable behind a plain
"permission denied"), applies every migration in order, and runs
`supabase/tests/policies.sql`. Seventeen checks, each one a sentence from a
migration's own comment. It also applies everything twice, which is the claim
on the tin of anything pasted into a dashboard.

Worth keeping two things it caught while being built. Reintroducing the hole
0004 closes — `is_owner` where `is_group_owner` belongs — fails the run on "a
moderator cannot delete the crew", so the checks are attributable. And the
runner's own first version read stdout while `raise notice` writes to stderr:
it found nothing, printed "0 policy checks passed" and exited 0. A check runner
that asserts nothing and calls it success is worse than no check runner, which
is why it now fails on an empty result.

**The publishable key in `lib/backend.ts` is public and committed.** A static
site has no server to keep a secret in, so the key ships in the bundle whatever
you do. RLS is the security model; the policies are the review. The
`service_role` key and the database password must never appear in `src/`.

**`profiles.avatar` is never named in a roster join.** It arrives with migration
0003, and a database still on 0002 would fail *every* roster query if the column
were in the join — taking the boards, the chat and the member screens with it.
`loadAvatars` asks for it separately and returns an empty map on any error, so a
missing column costs the pictures and nothing else. Same trade as the hearts.

`saveMyProfile` is the first thing in the app that writes `profiles` at all:
until it existed the name a crew saw was whatever the provider handed over at
sign-up, and the name field in Settings was local only. It retries without the
avatar if the first write fails, so an un-migrated database still gets the name.

**The crew settings screen was a mock, and is not any more.** Every control on
it was local state: the name and alley were typed into a `useState` and never
sent, rotating the invite code called a `nextCode()` that added 51 to the last
two digits, removing a member pushed an id into an array, "Leave" navigated back
to the crew list without leaving, and the roles map was seeded
`{ kenji: 'moderator' }` — the last of the fictional Tuesday Crew. The RPCs it
should have been calling (`rotateInviteCode`, `leaveGroup`) had existed since
`social.ts` was written and had never been called by anything.

It now writes to Postgres and re-reads the crew after each change rather than
keeping its own copy: what an owner does here is what everybody else's board is
about to show. The doors switch is gone — there is no column for it, `toGroup`
has always had a comment saying so, and a switch that flips nothing is a promise
the database never made.

**`is_owner()` means "owner or moderator", and two policies wanted stricter.**
It is the right test for moderation and it was also wired to `groups_delete` and
`memberships_update`, which meant a moderator could delete an entire crew and
could set anybody's role — their own included — to owner. Nothing had exercised
either, because the screen was a mock; wiring it up is what made it matter.
Migration 0004 adds `is_group_owner()` and moves those two onto it, plus
`groups_update`, since the screen has always disabled the name field for
anybody but the owner.

**Signing in is not a one-way door.** `useSession` has always returned a
`signOut` and, until now, nothing called it — so an account, once connected, was
permanent. Settings has an Account card that disconnects it. Signing out touches
neither the games on the phone nor the copy on the server; what goes is the
crews, the chat and the boards. Revoking at Google's end is Google's screen, and
the card says so rather than pretending to do it.

**Signing in has to say so.** It is the only thing in the app that leaves the
page: the bowler taps Continue with Google, goes through somebody else's
screens, and comes back to a *fresh load* of the dashboard. Nothing about that
load says the round trip worked — the one changed word is a name on a screen
they are not looking at — so the honest reading of a silent return is that it
failed, and the next thing somebody does is try again.

So a dialogue, once, naming the account; and the route underneath it is
switched to the crews before it opens, so whichever way it is dismissed — the
button, Escape, the backdrop — what is behind it is the screen the account was
for. Landing back on a dashboard that scores games perfectly well without an
account is landing nowhere.

`RETURNING_FROM_PROVIDER` is read at *module load*, because `detectSessionInUrl`
strips `?code=` out of the address bar as soon as it has exchanged it: by the
time anything renders, the only evidence a sign-in just happened is gone.
`shouldAnnounceSignIn` is the rest of it, and it is a pure function with tests
because every way of getting it wrong is invisible until somebody is holding
the phone — announce a restored session and the dialogue greets them on every
launch, announce twice (`getSession` and `onAuthStateChange` both deliver the
same session on a landing) and one sign-in is congratulated twice, announce a
guest and a failed code exchange congratulates somebody on nothing.

The browser check for it stubs the SDK chunk rather than the network: the whole
event straddles a page load the app does not control, so the only way to watch
it is to *be* the thing that answers with a session.

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

**A challenge stores no progress, and a calendar stores no attendance count.**
Both are `lib/challenges.ts` and `lib/events.ts`, and both keep the rule the
leaderboard set: a challenge is a target and a window, and where everybody
stands is the games already in `shared_games`, counted by the same `tally` the
analytics screen uses. A `challenge_progress` table would be a second
definition of what a strike is, free to drift from the first.

The consequence has to be said on the screen, repeatedly: **only shared games
count.** A crew sees what its members posted to it and nothing else, and a
challenge is not a reason to break that. Somebody who bowls 300 and keeps it to
themselves has not moved the bar, and without the footnote would reasonably
conclude the app was broken. `game_backups` is not a way round it — every
policy on it says `owner_id = auth.uid()`, and it is a safe, not a feed.

Two things in the calendar are decisions rather than defaults. `monthGrid`
always returns **six** weeks, so the grid does not change height between a
five-week month and a six-week one and move what you were about to tap; and the
days from the months either side are drawn visibly outside, or next month's
first Tuesday becomes this month's league night. It opens on "coming up"
rather than on today, because on the very common day with nothing on it the
first thing the screen would otherwise say is "nothing on this day" while two
nights sit further down the month.

Deleting a challenge or calling off a night belongs to whoever set it, or the
crew's **owner** — `is_group_owner`, not `is_owner`. Moderating is taking down
what somebody posted; a challenge with a week left and a night five people are
counting on are not posts. Same reading as migration 0004.

Migration **0005** carries both, and like 0003 it arrives after crews already
exist: `loadChallenges` and `loadEvents` return empty on any error rather than
throwing, so a database still on 0004 loses the two new screens and nothing
else. Same trade as `loadAvatars` makes for a missing column.

Neither can be tested from a machine with no route to the database, which is
this one — so everything with a decision in it is pure and unit-tested, and the
screens are driven in a browser against a **stubbed SDK chunk**: the same
interception the sign-in check uses, answering `from()` with rows. That
exercises the real screens, the real queries and the real logic. What it cannot
check is the SQL and the policies.

**"Notifications" is two things, and only one of them can work here.** Waking a
*closed* app is the browser's push service, and sending to it needs somebody
holding a VAPID private key. A static site has nobody: `server/index.mjs` is a
one-file dev server behind the Vite proxy at `/api`, and on GitHub Pages that
path is a 404. Raising a notification *while the app runs* needs none of that.

All three reasons the toggle did nothing were real and separate. The build has
no `VITE_VAPID_PUBLIC_KEY`, so `vapidPublicKey()` fell back to fetching
`/api/vapid-public-key`, which 404s — and that threw before permission was even
kept. `/api/subscribe` was not there either. And nothing in the app ever *sent*
one: the push server's only trigger is a `curl /api/notify` by hand.

So `subscribeToPush` returns a `NotifyReach` — `none`, `alerts` or `push` —
and takes the permission *first*, because permission alone is the part that
always works and losing it to a failed subscription was the bug. `pushConfigured()`
decides whether to try the rest at all. Settings says which of the two you have
in as many words, since "on" and "off" were both lies for the middle case.

The alerts themselves ride the Realtime subscription that already existed for
chat, plus a new `watchSharedGames`. `useCrewAlerts` subscribes at the *top* of
the app, not on the chat screen, and that is the point: a notification about
the conversation already open is worth nothing and the one about the crew you
are not looking at is the whole feature. `lib/alerts.ts` holds the two rules
that decide whether to interrupt — never your own doing, never what is already
on screen unless the app is backgrounded — as a pure function, because those
are judgements worth stating as tests rather than discovering on a phone.

The share screen's "send a notification" switch is gone. It said "needs the
push server running", nothing was running, and it did nothing — the doors
switch again. Posting to a board *is* telling the crew, and whoever has
notifications on is told as the row lands.

**Background push is still not built**, and it needs one thing this app does
not have: something that holds the private key and sends. The place for it is
a Supabase Edge Function on a database webhook over `messages` and
`shared_games`, with subscriptions in a table of their own. That is a deploy
step outside this repository, which is why it is written down here rather than
half-built.

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
for itself earns nothing, so it is gone rather than parked. Nothing links to it,
the `videos` route no longer exists, and the last sentence that promised video
"comes later" is off the shared-games screen. A feature that is not coming
should not be advertised on a screen that works.

**The league table is parked**, not deleted. `lib/league.ts`, its tests and
`LeagueScreen.tsx` are intact and the `league` route still renders; nothing
links to it. Putting it back is one `onOpenLeague` prop and one button in
`GroupScreen.tsx`.

**There is no tour.** There were four cards on the first run — the two scoring
modes, the scanner, sharing, where the games live — and they are gone rather
than parked. A first run is somebody standing at a lane wanting to score a game,
and four screens of explanation before the first ball is four screens they will
skip. What is left is the language, then the name and the tile, and those stay
because they are what a crew sees and nobody goes back to change them.

The language comes **before** the profile, and it is the one step that has to be
answerable without reading the screen it is on: both options are written in
their own language and nothing else is on the step. Asking somebody to read a
screen in the wrong language before offering to change it is the wrong way
round.

**The scan button on the play screen is parked**, not deleted: `ScanScreen` and
everything under `lib/ocr/` are intact and still reached by `?screen=scan`,
which is how both browser checks drive them. The reader works on a real sheet
about as far as the notes above say and no further, and the button goes back the
moment that is worth offering — one `onScan` prop and one button in
`PlayScreen.tsx`.
