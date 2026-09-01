# Handoff — where the scanner stands

Written at the end of the session that reworked scanning to be row-by-row.
Everything described here is committed and the app builds, tests and runs.

## What was asked for, and what landed

The starting point was "scan the whole sheet". That got redirected twice:

1. Sheets stack a row per game — three is normal, six happens — so the unit of
   a scan should be **one row**, not one sheet.
2. The interaction should be **a barcode reader**: a fixed bar in the camera
   preview that you slide one game's row into, and for a photo you already
   have, **a box you drag around the game you want**.
3. **Date, time and house are typed, not read** off the sheet.
4. **Pins are not read from the sheet.** The scanner reads the marks only; pin
   detail stays something you enter in the app.

All four landed. The scan flow is now:

```
choose ─┬─ camera  → bar to line a row up inside  ─┐
        └─ photo   → box to drag around one game  ─┴→ read → review → save
```

Review is unchanged except that it now carries **date and time fields**, and
the save button stays off until they make a real date.

## New code

| File | What it is |
| --- | --- |
| `src/lib/ocr/rows.ts` | Finding row-shaped boxes in a frame, plus holding them still across frames. Pure. |
| `src/lib/ocr/sheet.ts` | Otsu, the widest bright run, and `hasDarkSurround` — the guard on every crop-to-the-paper. |
| `src/lib/ocr/orientation.ts` | EXIF orientation, read by hand because Chromium ignores the tag. |
| `src/lib/reticle.ts` | The bar, and deciding when a detected row is lying in it. |
| `src/lib/region.ts` | The box dragged around a game: move, resize, clamp. |
| `src/lib/cover.ts` | Mapping between a frame's pixels and the element showing it, `cover` and `contain`. |
| `src/lib/datetime.ts` | The two `<input>`s to a timestamp and back. |
| `src/components/RowFinder.tsx` | The camera, the bar, and lock-on. |
| `src/components/RegionPicker.tsx` | The picked photo, the box, and a live preview of the crop. |

Tests: `test/rows.test.ts`, `sheet.test.ts`, `orientation.test.ts`,
`reticle.test.ts`, `region.test.ts`, `cover.test.ts`, `datetime.test.ts`.

## Where it works, and where it does not

Verified:

- **280 unit tests** pass.
- **`verify:scanner` — 6/6 generated sheets**, all five readable ones now read
  through the *per-frame* path (previously some fell back to whole-sheet).
- **`verify:app` — 30 checks**, including two new ones covering the picker and
  the camera bar.
- **Row detection on a real photograph** (a Japanese house sheet, three games
  stacked, photographed at an angle): finds **all three rows**, correctly
  tilted, at the preview resolution the app actually uses.

Not solved, and the reason the real sheet still will not import cleanly:

- **The marks on that sheet are graphical, not characters.** A strike is a
  black bowtie and a spare a black triangle in a box — Tesseract is whitelisted
  for `X0123456789/-` and cannot see them.
- **`G` (gutter) is dropped by the mark parser.** `VALID_MARK` in
  `src/lib/marks.ts` does not include it, so a `G` silently shifts every later
  frame. This is a small fix and worth doing early.
- **Circled digits** (`⑥⑧`, used for splits) are unhandled.
- **That sheet has 11 columns** (ten frames plus "TO SUB/T") where
  `toFrameCells` fits a ten-frame grid.

## The idea worth picking up next

The running totals are **plain digits**, which OCR reads reliably. They are a
free check on everything else: score the marks that were read and compare
against the printed totals. If they disagree, the read is wrong — say so
instead of importing it. That turns an unreliable mark reader into a reliable
*refuser*, which is the behaviour that actually matters, and it works without
solving the graphical-mark problem at all.

## Three traps, already paid for

1. **Crop to the paper — but only when there is paper to crop to.** A sheet on
   a table is bright on dark, and without cropping the table's edges are
   stronger than any printed rule. Held close, though, the sheet *is* the
   frame, the same threshold now splits print from paper, and the brightest run
   is the inside of one cell — cropping to which throws away everything.
   `hasDarkSurround` checks the frame's edge before anything crops.
   This bit both the live detector and the still pipeline, separately.
2. **A row's box runs rule-centre to rule-centre.** Crop exactly to it and the
   borders are gone, and the borders are what the frame grid is found from.
   Both capture paths pad on all four sides, measured off the row's *height*
   (a row is far wider than it is tall, so a share of width is enormous).
3. **Project along the tilt.** A photographed sheet is never square, and even
   a degree or two smears a horizontal rule across enough rows that it stops
   being a peak. `estimateTilt` searches for the angle that makes the profile
   peakiest. Without it, detection found one row out of three, and a different
   one at each resolution.

## Running it

```bash
npm ci
npm run dev                  # :5173

npm test
npm run typecheck
npm run build

# Browser checks need Playwright and a served build.
npm i -D playwright
npm run build && npm run preview &
npm run verify:app
npm run verify:scanner
```

`CHROMIUM_PATH` overrides the browser both check scripts launch.

**The personal test photo is deliberately not in the repo.** `.gitignore`
excludes `public/real-sheet.jpg`; it carries a name and a QR code. To re-run
the real-sheet work, drop a photo back at that path.

## Deploying

`docs/DEPLOYING.md` has the whole story. The short version: `npm run build`,
upload `dist/`, serve `index.html` for unknown paths, and never cache `sw.js`.
HTTPS is not optional — the camera, the service worker and Web Push all need a
secure context, and on plain HTTP they fail silently rather than loudly.

---

# Spec audit — what the handoff asks for versus what is built

A pass over `docs/DESIGN_HANDOFF.md` section by section, checking each concrete
claim against the code. Prompted by the analytics animations, which the handoff
specified in full and which had simply not been built — the worry being that
other parts of the spec had been read the same way.

Most of it holds up. The numbers that matter are all in place and traceable:
the leaderboard's 54px rows and 7px gap, the 8%–92% bar range, the podium's
`rise` stagger, `top 0.44s cubic-bezier(.2,.8,.2,1)` for the rank slide,
`0.42s` for the bar fills, the 46px hero numeral, `--negative: #e0a3b6`, the
44px touch targets, and the `prefers-reduced-motion` handling. All fourteen
screens exist. What follows is only what does not match.

## Gaps

### 1. The high-game trend chart is missing
`Stats / Analytics` lists four charts: **average trend, high game trend**,
strike/spare/open split, first-ball distribution. Three are built. High game
appears only as a single summary number on the stats screen, not as a series
over the selected range.

`src/lib/stats.ts` already produces per-game points; a running maximum over the
same `TrendPoint[]` is most of the work, and `ScoreTrendChart` is close to
reusable. Half a day at most.

### 2. History cannot be filtered by venue
"Filterable by range / **venue**" — `HistoryScreen` has the range chips and
nothing else. Games already carry `house`, so the data is there; it needs a
second chip row, or a combined filter, plus a decision about what to show when
a game has no house recorded (most scanned ones will not).

### 3. Settings has no units control
"Units (pins / points)" is listed under Settings and does not exist. Worth
deciding whether it is real before building it: everything in the app is
already pin counts, and it is not obvious what "points" would change. This may
be a line in the spec that does not survive contact.

### 4. The history screen's numerals are not tabular
The handoff is emphatic — `tabular-nums` **everywhere numbers can change** —
and calls it out as overriding general charting guidance. The session header
in `HistoryScreen` prints a game count and an average with neither `tnum` nor
the class that sets it, so those numbers shift horizontally as they change
between days. One-line fix, and the only place in the app it is wrong.

### 5. The leaderboard's metric set follows the prototype, not the document
The written handoff lists **Strike %** as the fourth metric (`metric: 'avg' |
'high' | 'pins' | 'strike' | 'improved'`). The prototype's own `CREW_METRICS`
lists **Handicap avg** instead. They disagree, and the build followed the
prototype, so `hdcp` is in and `strike` is out.

This is a decision to confirm rather than a defect. Handicap is the more useful
of the two on a mixed-ability board — it is the entire reason league bowling
has handicaps — but the document is the document.

## Not gaps, recorded so they are not re-litigated

- **Video** is a placeholder screen on purpose; the handoff puts it in Phase 4
  and conditions it on a storage backend.
- **Google and Apple OAuth** are stubbed. Real credentials were one of the
  handoff's own open questions.
- **The backend** does not exist; groups, rosters, chat and posts are sample
  data in `src/data/`. Also the handoff's question, unanswered.
- **Frame outcomes stayed a stacked bar** rather than becoming a second ring.
  A ring reads one number against its own maximum and cannot be read against
  another ring; three proportions belong in a bar.
- **The chart motion is interpolated in JS**, not with `transition: d` and
  animated `cx`/`cy` as the prototype does. Neither is dependable in Safari and
  this app is opened on an iPhone; the durations and curves are the handoff's.
