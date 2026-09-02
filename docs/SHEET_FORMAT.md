# What a Korona sheet actually prints

Decoded from four photographed sheets (Korona Cat Bowl / Korona Bowl, Japan,
Aug–Sep 2026). They are gitignored — they carry a name and a QR code — so this
is the record of what they contain.

## The page

One sheet holds **four or five games** for one bowler, stacked vertically.

```
日付 2026-08-29 土曜日   レーン 7   氏名 ジョン      競技 303   HDCP 0
                                                  ●は1投目の残ピン
                                                  ８は2投目の残ピン
 1G                ┌─1──┬─2──┬─3──┬ … ┬─10─┬ TO SUB/T ┐
 開始時間 00:41    │ ⊠  │ ⊠  │ ⊠  │   │8 │−│   159    │
                   │ 30 │ 59 │ 79 │   │ 159│   159    │
                   └────┴────┴────┴───┴────┴──────────┘
                    ○○○○ ○○○○ …          one pin triangle per frame
                     ○○○  ○○○
                      ○○   ○○
                       ○     ○
 2G  開始時間 00:51   …
```

The date is machine-printed and unambiguous (`2026-08-29`), and each game
carries its own **start time** on the left (`開始時間 00:41`).

## The marks box

| Glyph | Means |
| --- | --- |
| `⊠` a box crossed corner to corner | strike |
| `◤` a filled triangle in the box | spare |
| digit | pins felled by that ball |
| `−` | miss |
| `G` | gutter |
| `⑧` a circled digit | count on a re-racked tenth-frame ball |

Under each frame is its **running total**, and the row ends with `TO SUB/T` —
the game's total and the running series.

## The pin diagram, which is the valuable part

Every frame gets a 4/3/2/1 triangle of the rack, back row at the top. The
sheet's own legend defines three shapes:

| Shape | Means |
| --- | --- |
| `○` open ring | the pin went down to the first ball |
| `●` filled ball | **standing after ball one** — so the second ball took it |
| `８` two rings stacked | **standing after ball two** — it survived the frame |

One diagram therefore carries *both* leaves. `9 /` says nine fell and the spare
was taken; the diagram says it was the 5-pin. That is precisely the `pinfalls`
the app stores for games scored on its own rack, so a scanned sheet can feed the
leave statistics rather than only the scores.

Two consequences fall out of the encoding and are implemented in
`lib/ocr/pindiagram.ts`:

- **A pin drawn `８` was also standing after ball one.** The sheet only draws
  the later mark. Reporting otherwise would say a pin fell and stood back up.
- **The marks are a checksum on the diagram.** Both are printed by one machine
  from one throw, so `agreesWith()` refuses a leave that contradicts the count.
  A leave that disagrees with the score is worse than no leave, because it looks
  like data.

Verified by hand against game one of the 08-29 sheet, marks
`X X X 9/ 8− X 9− 9− 9− 8−`: frame 4 shows a single filled ball, frame 5 shows
two stacked pairs and no filled ball, and every strike shows ten open rings.

## The shape of a row, measured

The numbers matter because everything that crops a row is sized off them, and
the synthetic sheets `verify:scanner` generates had assumed something else. From
the 09-01 sheet, straightened, with the ruled grid 2200px wide:

| | Height | As an aspect |
| --- | --- | --- |
| The ruled box: frame numbers, marks, running totals | 147–169 px | **13–15 : 1** |
| …its marks-and-totals band alone | 100–116 px | 19–22 : 1 |
| …its frame-number strip alone | 47–53 px | **40–50 : 1** |
| One game: the box plus the pin diagrams under it | 376–407 px | **5–6 : 1** |

Three things follow, and each of them was a bug:

- **The numbering strip is the most grid-like band on the page.** It is ruled
  top and bottom and crossed by every one of the row's vertical rules, so it
  scores as a perfect ten-frame grid while being a tenth of the height of the
  game it belongs to. Anything that picks "the most convincing row" picks it.
- **A bar shaped for the whole game is two and a half times taller than the
  ruled box.** That is the right shape to *aim* with — the diagrams have to be
  in the picture — but it means the crop is mostly not the row, and every
  threshold downstream has to be measured off the box rather than off the crop.
- **The frame rules only run the height of the box.** In a crop that includes
  the diagrams they are not the tallest ink in the picture, so they have to be
  looked for inside the box and not before it is found.

## Why the marks still do not read

The segmentation now finds the row, the box, the bands and the ten frames on
these sheets. The characters that come back are still wrong, and the reason is
in the table above: a strike is `⊠` and a spare is `◤`. Neither is a character.
Tesseract is asked for `X0123456789/-` and hands back whatever of that alphabet
those filled shapes most resemble, which is nothing in particular.

Reading these needs the frames classified by shape the way the pin diagrams
already are — a crossed box, a filled triangle, a digit — rather than recognised
as text. That is the next piece of work, and it is much closer to
`pindiagram.ts` than to OCR.

## What a photograph adds, that a synthetic sheet does not

Measured on the 08-29 sheet, 3000×4000:

- **Tilt.** Frame 1's grid rule sits at y≈895 and frame 10's at y≈918 — roughly
  0.8° across the sheet. Enough that a band located from the left edge misses
  the right-hand frames entirely.
- **A fold.** These sheets are folded to go in a pocket. The crease runs down
  the middle of the photograph and defeats a paper level taken per column:
  frame 5 of game one yields *no* rows at a threshold that reads frames 1 and 10
  perfectly.
- **The marks grid's bottom rule** sits directly above the diagram band and, if
  the crop includes it, becomes one blob spanning the full width — which then
  merges the top row of pins into itself.

The first two are why `verify:scanner`'s generated sheets tilt and shade; the
third is a crop the segmentation has to place from the rules rather than from a
fraction of the page.
