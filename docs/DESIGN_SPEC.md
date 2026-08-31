# Handoff: Lane Log — full app + social layer (Android & iOS)

## Overview
Lane Log is a bowling score-tracking mobile app. This bundle covers **two prototypes** that
together make up the product:

1. **Bowling Analytics.dc.html** — the core solo app: Home dashboard, live game entry, history,
   analytics, video review, settings.
2. **Lane Log Social.dc.html** — the social layer, a separate path/flow: accounts & guest mode,
   invite-only groups, the **group dashboard**, member detail, group chat, shared video, invite
   links, storage/quota settings.

They are deliberately separate flows. The social layer is entered from the app but is its own
navigation stack; nothing in the solo app depends on a signed-in account.

Both prototypes render **the same screens in either an Android or an iPhone bezel** — a "Device"
toggle above each mock switches platform at runtime (also exposed as a `platform` prop). The
designs are intentionally identical on both platforms: same layout, same components, same type.
Only the frame, the safe-area insets, and the status bar/home-indicator differ. If your iOS build
should instead be platform-idiomatic (SF nav bars, large titles, UIKit sheets), treat these as the
content/visual spec and adapt the chrome.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended
look and behavior. They are **not production code to copy**. The task is to **recreate these
designs in the target codebase's existing environment** (React Native, Flutter, SwiftUI + Kotlin,
whatever is in place) using its established patterns, component library, and navigation. If no
codebase exists yet, pick the framework that best fits shipping one app to both platforms and
implement the designs there.

The `.dc.html` files are self-contained: open either one in a browser and every screen is
clickable via the chip row above the phone.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, motion, and copy. Recreate pixel-accurately
using the codebase's own primitives. The only stand-ins are avatars and video thumbnails, which are
drawn placeholders occupying the exact slots real assets will take.

---

## Design Tokens

Source: the "Nocturne" design system (dark, blurple accent). Type is Inter throughout.

### Color
| Token | Hex | Use |
|---|---|---|
| `bg` | `#161826` | app background (the outer page uses `#0d0f16`) |
| `surface` | `#232532` | cards, rows, inputs |
| `text` | `#e9e9ed` | primary text |
| `divider` | `#e9e9ed` @ 16% | hairlines |
| `accent` | `#9184d9` | primary accent (blurple) |
| `accent-200/300/400` | `#e7e5fe` / `#d2cefd` / `#b5abfc` | accent text on dark |
| `accent-500/600/700` | `#968ae0` / `#796cbf` / `#5d5294` | accent borders, bar fills |
| `accent-800/900` | `#423a6a` / `#2b2741` | accent surfaces |
| `neutral-100…900` | `#f3f5fe`, `#e4e7f5`, `#cfd3e5`, `#b2b6ca`, `#9397ab`, `#75798c`, `#595d6c`, `#3f424d`, `#292b31` | text ramp + borders |
| negative | `#e0a3b6` | drops, warnings (rank loss, quota) |

### Typography
- Family: `Inter, system-ui, sans-serif` for both heading and body.
- Heading weight 500. Body 400. Numerals: `font-variant-numeric: tabular-nums` **everywhere a
  number can change** — scores, ranks, deltas, counts.
- Screen title: 26px / 1.12, `letter-spacing: -0.028em`.
- Section heading: 23px / 1.2, `-0.02em`.
- Body: 13px / 1.65. Secondary: 11–12px. Meta/labels: 9.5–10.5px uppercase, `letter-spacing`
  `.09em`–`.16em`.
- Hero numeral: 46px / 1, `-0.05em`.

### Space, radius, shadow
- Spacing rhythm: 6 / 8 / 10 / 11 / 14 / 16 / 18px. Screen gutter 16px.
- Radius: pills `999px`; rows and buttons `12px`; cards `14–18px`; avatar squares `13–15px`.
- Elevation is a **hairline + ambient darkness**, not a soft drop shadow:
  `shadow-sm: 0 0 0 1px #3f424d` · `shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)`.
  Accent glow where an element should feel lit: `0 20px 44px -26px rgba(145,132,217,.7)`.
- Minimum hit target 44×44 (icon buttons are 40–44px; primary buttons `min-height: 52px`).

### Motion
| Name | Spec |
|---|---|
| `fadeUp` | screen enter, `.32s ease both`, opacity 0→1 + translateY(10px)→0 |
| `rise` | podium columns, `.4s ease both`, staggered 0 / .04s / .08s |
| `glow` | hero orb, `6s ease-in-out infinite`, opacity .55→1→.55 |
| rank slide | `top .44s cubic-bezier(.2,.8,.2,1)` |
| bar fill | `width .42–.5s cubic-bezier(.2,.8,.2,1)` |

---

## Screens — Bowling Analytics (solo app)

Bottom tab bar: **Home · Play · History · Stats · Videos** (+ Settings from the header).
Header pattern on every screen: uppercase accent kicker, hairline rule fading right, optional
back chevron / bell, then a 26px title with a small tabular meta string beside it.

- **Home** — the dashboard: greeting + current average hero, quick "start a game" action, recent
  games list, and trend cards. Entry point for everything.
- **Play** — live scoring: frame strip, pin-selection pad, running total, per-frame commit.
- **History** — reverse-chronological game list, grouped by session, each row showing score,
  date, lane/venue, and a spark of the frame shape.
- **Stats / Analytics** — range selector (last 5 games / 30 / 90 / 180 days / all), average and
  high trend charts, strike/spare/open split, first-ball distribution.
- **Videos** — clip library with thumbnails, duration, and storage used.
- **Settings** — account, units, storage, export.

## Screens — Lane Log Social

Reachable screens (also the `startScreen` prop values): `auth`, `groups`, `group`, `create`,
`manage`, `member`, `chat`, `video`, `join`, `share`, `gear`, `settings`, `link`.

- **auth** — "Keep your games, or just start bowling". 52px-tall Continue-with-Google and
  Continue-with-Apple buttons on `surface` with a `neutral-700` border, an "or" hairline divider,
  then a **dashed-border** guest button. Guest-first is the product rule: nothing asks for sign-in
  until the user touches something shared.
- **groups** — list of the user's groups; each row shows avatar, name, member count, and last
  activity. Plus a create/join affordance.
- **group** — **the group dashboard. See the detailed spec below.**
- **create / join / link / share** — group creation, invite-code join, invite-link screen, and
  share-to-group sheet.
- **manage / gear** — group settings: members with roles, invite policy, remove/promote.
- **member** — one member's detail: their averages, trend, and games shared with the group.
- **chat** — group chat thread with score cards inlined as messages.
- **video** — shared clip playback with per-clip storage cost surfaced.
- **settings** — account + cloud storage, including the quota-near warning state (`quotaNear` prop).

---

## The group dashboard (redesigned — build this carefully)

Top-to-bottom, inside the 16px gutter, column gap 16px, whole screen animates in with `fadeUp`.

### 1. Hero card
- Radius 18px, padding `14px 15px 13px`.
- Background is two layers: a radial accent wash
  `radial-gradient(120% 150% at 10% 0%, rgba(145,132,217,.26), rgba(145,132,217,.05) 52%, transparent)`
  over a linear `168deg, #1f2136 → #141621`.
- Edge + lift: `0 0 0 1px accent-800, 0 20px 44px -26px rgba(145,132,217,.7)`.
- A decorative 196px circle, `radial-gradient(circle, rgba(145,132,217,.34), transparent 70%)`,
  offset `top:-78px right:-56px`, animating `glow` 6s infinite. `pointer-events: none`.
- **Row 1:** 44px rounded-square group avatar (accent-900 fill, accent-700 inset border, accent
  glow), group name 15.5px/500, meta line 11px neutral-500 ("6 members · invite-only · you own it"),
  then two 40px icon buttons — settings (neutral outline) and chat (accent-tinted, with a 7-unread
  badge: accent fill, `#191b26` text, 18px pill).
- **Row 2 (the standing):** left, "YOUR RANK" 9.5px uppercase accent-400 over a **46px tabular
  numeral** in `#cfc7ff` with `text-shadow: 0 0 26px rgba(145,132,217,.45)`, and a small "of 6".
  Right, a flexible column: metric label + 21px value on one baseline row, a 6px accent bar
  (`linear-gradient(90deg, accent-700, #b5abfc)` + glow) whose width is the member's value scaled
  8%–92% across the group's min→max, then a 10.5px movement line ("▲ 2 places vs rolling avg").
- **Row 3 (group pulse):** three equal columns above a 1px inset top hairline — group average,
  games this week, pins this month. 15px tabular value over a 9.5px uppercase neutral-600 label.

### 2. Metric chips
Horizontally scrollable pill row, bleeding to the screen edges (`margin: 0 -16px` +
16px padding). Selected chip is accent-tinted; others are neutral outline. Metrics: rolling
average, high game, pins this month, strike %, most improved.

### 3. Metric note
12px neutral-400 explanatory line (max 74% width) with the unit right-aligned in 10px uppercase
neutral-600.

### 4. Podium (top 3)
Three equal columns, bottom-aligned, gap 8px, order **2nd · 1st · 3rd** so the leader stands in the
middle. Each column: circular avatar (1st is 42px with accent-500 border and
`0 0 22px -4px rgba(145,132,217,.85)` glow; 2nd/3rd are 34/32px neutral), first name 10.5px,
value (20/16/15px), then the column itself — a `10px 10px 0 0` capped bar of height **74 / 52 / 40px**
holding the place number at its top. 1st bar:
`linear-gradient(180deg, rgba(145,132,217,.34), rgba(145,132,217,.06))` with an accent-700 inset
border; others a white 9%→1% gradient with a neutral-800 border. Columns enter with `rise`,
staggered. Bar height transitions on metric change.

### 5. Full board (all 6 members)
**Important implementation detail:** the list's DOM/child order is the **roster** order, never the
ranking. Each row is absolutely positioned inside a fixed-height container, and its **`top` encodes
its rank** (`(rank-1) × 61px`, rows 54px + 7px gap). Changing the metric only changes `top`, so
rows **slide to their new position** with `top .44s cubic-bezier(.2,.8,.2,1)` instead of
re-mounting. Reproduce this with whatever your framework's equivalent is (a keyed list + layout
animation, e.g. `LayoutAnimation` / `Animated` / `matchedGeometryEffect`) — never re-sort children.

Each row, radius 12px, `overflow: hidden`, 11px horizontal padding:
- A **bar fill** absolutely positioned behind the content, width = value scaled 8%–92%,
  transitioning on the same curve. Own row: `rgba(145,132,217,.30)→.04`; top-3:
  `.16→.02`; everyone else: white `.07→.01`.
- Rank numeral, 18px right-aligned, 13px/600 — accent for top 3, neutral-600 otherwise.
- 30px circular avatar with initials.
- Name (13px/500, accent-tinted for the signed-in user) over a sub-line
  "N games · high NNN" (10.5px neutral-500).
- Right cluster: movement glyph (▲n / ▼n / – , accent-300 up, `#e0a3b6` down), then a 17px tabular
  value over a 9.5px "+n vs base" delta.
- The signed-in user's row is tinted `rgba(145,132,217,.08)` with an accent-700 inset border.
- Hover/press: inset accent-700 ring. Tapping a row opens **member** detail.

### 6. Footnote
11px neutral-600 explaining that switching metric re-ranks in place and that the user's own row is
tinted.

Below the dashboard the existing sections continue unchanged: **shared games & frames**, the
activity feed, and the storage/quota strip.

---

## Interactions & Behavior
- **Navigation** is a single `screen` state string plus a `prev` for the back chevron; the social
  flow additionally carries `memberIdx` for member detail. Bottom tab bar switches top-level
  screens; header chevron pops back to `prev`.
- **Metric switch** re-derives ranks and animates: podium bar heights, row `top`s, and all bar
  widths on the same easing. Movement glyphs compare the current ranking to the **rolling-average**
  board (the default view), so on `avg` they are blank.
- **Guest → account migration:** a guest's local games migrate into the account on first sign-in;
  the auth screen must never block solo play.
- **Quota:** video is the cost centre (~25 MB per 15s 1080p clip). The settings screen has a
  near-quota warning state; surface per-clip cost in the video screen.
- **Motion**: all specs in the Design Tokens › Motion table. Respect
  `prefers-reduced-motion` — drop the glow loop and the slide/fill transitions, keep final states.

## State Management
```
platform      'android' | 'ios'        // frame only in the prototype; real app reads the OS
screen        string                   // current route
prev          string                   // back target
metric        'avg' | 'high' | 'pins' | 'strike' | 'improved'
memberIdx     number                   // selected member for detail
range         'g5' | 'd30' | 'd90' | 'd180' | 'all'   // analytics range
guestMode     boolean
quotaNear     boolean
```
Derived per render (do not store): rankings, base ranks, min/max/span for bar scaling, bar
percentages, podium ordering, movement deltas.

Data needed: member roster (name, initials, isMe, avg, high, pins, strike%, improvement, games),
group meta (name, member count, privacy, ownership), unread chat count, group pulse aggregates,
shared games, activity feed, storage usage.

## Assets
No binary assets. All icons are inline SVG strokes at `stroke-width: 1.5–1.9`,
`stroke-linecap: round`, sized 18–19px in buttons — substitute your codebase's icon set at the same
optical size. Avatars are initials-on-tint; video thumbnails are drawn placeholders. Google and
Apple mark SVGs on the auth screen are the official marks and must be replaced with the ones from
each provider's current sign-in branding guidelines.

## Files
| File | What it is |
|---|---|
| `Bowling Analytics.dc.html` | solo app prototype — all screens, both device frames |
| `Lane Log Social.dc.html` | social layer prototype — all screens, both device frames |
| `frames.jsx` | the Android + iPhone bezel components used by both |
| `nocturne-styles.css` | the design system's tokens and base component CSS |
| `support.js` | prototype runtime — **not** part of the design; needed only to open the HTML |

Open either `.dc.html` directly in a browser. Use the chip row above the phone to jump to any
screen and the Device toggle to switch Android / iPhone.
