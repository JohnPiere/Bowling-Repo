# Lane Log — Developer Handoff

**Status:** Design complete, ready for implementation.

## Overview

Lane Log is a bowling score-tracking mobile app with two distinct flows:

1. **Solo app** (Bowling Analytics) — Home, Play (live scoring), History, Analytics/Stats, Videos, Settings
2. **Social layer** (Lane Log Social) — Accounts, groups, group dashboard with leaderboards, chat, shared games, invite codes

Both flows render identically on Android and iOS (same layout, typography, spacing). The designs are high-fidelity prototypes showing intended final appearance and behavior.

**Key principle:** Nothing asks for sign-in until the user touches shared content. Guest play is the default entry.

---

## Design References

### Prototypes (HTML, browser-viewable)
- `Bowling Analytics.dc.html` — solo app, all 6 screens + Play flow
- `Lane Log Social.dc.html` — social layer, all screens + auth + create group + group dashboard
- Open either in a browser; use the chip row above the phone to jump to screens; toggle Device to switch Android/iOS

### Design System & Assets
- **Design System:** Nocturne (dark theme, blurple accent #9184d9)
- **Color palette:** See "Design Tokens" section below
- **Typography:** Inter throughout (body weight 400, headings 500)
- **Icons:** Lucide (stroke-width 1.5–1.9, 18–19px)
- **Frames:** Android and iOS device bezels in `frames.jsx` (for reference only; your build will use the native platform chrome)

### Reference Files in Project
- `design_handoff_lane_log/README.md` — full design spec (copy attached below)
- `nocturne-styles.css` — design tokens (colors, type scales, spacing, shadows, radii)
- `frames.jsx`, `support.js` — prototype runtime (not for production)

---

## Design Tokens

### Color Palette
All hex values are the canonical ones. Use these for all UI colors.

| Role | Value | Use |
|------|-------|-----|
| `bg` | `#161826` | app background |
| `surface` | `#232532` | cards, rows, inputs |
| `text` | `#e9e9ed` | primary text |
| `divider` | `#e9e9ed` @ 16% opacity | hairlines |
| **accent** | **`#9184d9`** | primary accent (blurple) |
| accent-200/300/400 | `#e7e5fe` / `#d2cefd` / `#b5abfc` | accent text on dark |
| accent-500/600/700 | `#968ae0` / `#796cbf` / `#5d5294` | accent borders, fills |
| accent-800/900 | `#423a6a` / `#2b2741` | accent surfaces |
| neutral-100–900 | `#f3f5fe`, `#e4e7f5`, `#cfd3e5`, `#b2b6ca`, `#9397ab`, `#75798c`, `#595d6c`, `#3f424d`, `#292b31` | text/border ramp |
| negative | `#e0a3b6` | rank drop, warnings |

### Typography
- **Family:** Inter (system-ui, sans-serif fallback)
- **Heading weight:** 500
- **Body weight:** 400
- **Numerals:** Use `font-variant-numeric: tabular-nums` **everywhere numbers can change** (scores, ranks, deltas, game counts, pins)
- **Sizes:**
  - Screen title: 26px / 1.12, letter-spacing -0.028em
  - Section heading: 23px / 1.2, -0.02em
  - Hero numeral: 46px / 1, -0.05em
  - Body: 13px / 1.65
  - Secondary: 11–12px
  - Meta/labels: 9.5–10.5px uppercase, letter-spacing .09em–.16em

### Spacing & Radius
- **Spacing:** 6 / 8 / 10 / 11 / 14 / 16 / 18px rhythm (screen gutter 16px)
- **Radius:**
  - Buttons & rows: 12px
  - Cards: 14–18px
  - Avatars: 13–15px (square), 50% (circular)
  - Pills: 999px
- **Hit targets:** ≥44px (buttons 52px min-height, icon buttons 40–44px)

### Elevation & Shadows
- **Hairline + ambient:**
  - `shadow-sm: 0 0 0 1px #3f424d`
  - `shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)`
- **Accent glow:** `0 20px 44px -26px rgba(145,132,217,.7)` (where an element feels "lit")

### Motion
| Name | Spec |
|------|------|
| `fadeUp` | screen enter, 0.32s ease, opacity 0→1 + translateY(10px)→0 |
| `rise` | podium columns, 0.4s ease, staggered 0 / 0.04s / 0.08s |
| `glow` | hero orb, 6s ease-in-out infinite, opacity 0.55↔1 |
| rank slide | `top 0.44s cubic-bezier(.2,.8,.2,1)` |
| bar fill | `width 0.42–0.5s cubic-bezier(.2,.8,.2,1)` |
| **Respect `prefers-reduced-motion`:** drop glow loop and slide/fill transitions; keep final states |

---

## Screens & Flows

### Solo App (Bowling Analytics)
**Bottom tab bar:** Home · Play · History · Stats · Videos · (Settings from header)

#### Home
- Hero card: current average (46px numeral), date, alley
- 3-up quick-stats grid (average, high game, strike rate)
- "Start a new game" primary button
- Recent 5 games list (score, date, lane, strikes/spares)
- "View Analytics" secondary button
- Link to crew dashboard (if groups exist)

#### Play
- Method selection: manual pin entry (fastest) or video scan
- Pin-selection pad: 10 pins, tap to toggle, commit per frame
- Running score + per-frame breakdown
- Full game: 10 frames + 2/3 bonus balls depending on final frame

#### History
- Reverse-chronological game list, grouped by session
- Each row: score, date, lane, spark (visual frame shape)
- Filterable by range / venue

#### Stats / Analytics
- Range selector: Last 5 games / 30 / 90 / 180 days / all
- Charts: average trend, high game trend, strike/spare/open split, first-ball distribution
- All charts derive from selected range

#### Videos
- Clip library (thumbnails, duration, storage used)
- Video is out of scope for MVP (placeholder screen shown)

#### Settings
- Account / sign-in
- Units (pins / points)
- Storage / export
- App settings

---

### Social Layer (Lane Log Social)

**Navigation:** State-driven screen stack (screen + prev for back button)

#### Auth
- "Keep your games, or just start bowling" hero
- "Continue with Google" + "Continue with Apple" (native OAuth)
- "—or—" divider
- "Play as a guest" dashed button
- Info box: what a guest gives up (no groups, no cloud backup, no chat)

#### Groups (list screen)
- "Your groups" list (if signed in)
- Each group: avatar tile, name, member count, last activity, last message, unread badge
- "Join a group" + QR scanner button
- "Create a group" secondary button
- (If guest mode, banner explaining account needed for groups + "Link account" button)

#### Create Group
- Form: group name, home alley (optional), who can get in (invite-only or open, open "Soon")
- On submit: show success state with invite code (large mono display, expires in 14 days)
- Copy code / Show QR code buttons
- "Open the group" button to navigate to the new group dashboard

#### Group Dashboard (redesigned — main feature)
See detailed spec below. The leaderboard is the centerpiece.

#### Group Chat
- Thread of messages (text + inlined score cards)
- Each message: sender, timestamp
- Score card: score (large), strikes/spares, alley name, "Shared to board" note
- Sticky composer bar at bottom (fixed above tab nav)
- Replies / threads not in MVP

#### Member Detail
- One member's profile within the group
- Stats: average, high game, pins this season
- (Only shared games shown — private ones stay private)

#### Shared Games & Frames
- List of games pushed to the crew
- Each row: date, alley, score, strikes/spares
- "Unshare" button to retract (stays local)
- Note: "Sharing sends score sheet only — video comes later"

#### Group Settings (owner / moderator)
- Editable group name and home alley
- Doors toggle: open / invite-only (open disabled for MVP, "Soon" badge)
- Invite code display: large mono, expires in 14 days, copy / rotate / QR buttons
- Members list with roles (owner / member), option to promote / remove (toggle expands)
- (Delete group also here, not MVP)

---

## The Group Dashboard (Detailed Spec)

This is the most complex screen. Read carefully.

### Hero Card
- **Background:** Two-layer gradient + decorative orb
  - Layer 1: `radial-gradient(120% 150% at 10% 0%, rgba(145,132,217,.26), rgba(145,132,217,.05) 52%, transparent)`
  - Layer 2: `linear-gradient(168deg, #1f2136, #141621)`
  - Decorative 196px circle, `radial-gradient(circle, rgba(145,132,217,.34), transparent 70%)`, positioned top-right (offset -78px top, -56px right), animating `glow` 6s infinite, `pointer-events: none`
- **Padding:** 14px 15px 13px
- **Border:** 1px inset accent-800 + drop shadow (0 0 0 1px accent-800, 0 20px 44px -26px rgba(145,132,217,.7))
- **Radius:** 18px

#### Hero Content — Row 1 (group identity)
- 44px rounded-square group avatar (accent-900 bg, accent-700 inset border, accent glow)
- Group name (15.5px / 500)
- Meta line (11px neutral-500): "6 members · invite-only · you own it"
- Two icon buttons (40px): settings (neutral outline) + chat (accent-tinted with unread badge)

#### Hero Content — Row 2 (your standing)
- Left: "YOUR RANK" label (9.5px uppercase accent-400) over a 46px tabular numeral (#cfc7ff, text-shadow glow) + "of 6" note
- Right: flexible column
  - Top line: metric label (11px) + 21px tabular value, right-aligned
  - 6px accent bar (gradient accent-700→#b5abfc, glow), width scaled to member's place (8%–92% across min→max range)
  - Small movement line ("▲2 places vs rolling avg") in accent-300 or negative

#### Hero Content — Row 3 (pulse metrics)
- Three equal columns: group average / games this week / pins this month
- Each: 15px tabular value over 9.5px uppercase neutral-600 label
- Top inset hairline separator (1px #e9e9ed @ 6% opacity)

### Metric Chips
- Horizontally scrollable pill row, bleeds to screen edges
- Metrics: "Rolling avg", "High game", "Pins this month", "Strike %", "Most improved"
- Selected: accent-tinted background
- Unselected: neutral outline
- On tap: recalculate rankings and animate bar/row transitions

### Podium (Top 3)
- Three equal columns, bottom-aligned, **order 2nd · 1st · 3rd** (leader in middle)
- Gap 8px between columns
- Each column (animated in with `rise`, staggered 0 / 0.04s / 0.08s):
  - Circular avatar (1st: 42px, accent-500 border, accent glow; 2nd/3rd: 34px/32px neutral)
  - First name (10.5px)
  - Value (20/16/15px tabular)
  - Capped bar (10px 10px 0 0 radius): 74/52/40px height, transitions on metric change
    - 1st bar: gradient accent + accent-700 inset border
    - 2nd/3rd: white 9%→1% gradient, neutral-800 border
  - Rank numeral at bar top

### Full Board (all 6 members)
**Critical implementation detail:** The board's DOM children are in **roster order** (never re-sorted). Each row's **`top` CSS property encodes its rank** as `(rank - 1) × 61px` (rows 54px tall + 7px gap). Switching the metric only updates `top`, so rows **slide** instead of re-mounting.

**Implementation approach:**
- Keep a fixed-order child list keyed by member ID (not by rank)
- Use layout animation (e.g., React's `LayoutAnimation`, RN's `Animated`, or CSS transitions)
- On metric switch, update each row's `top` value; the framework animates the slide

#### Row Structure (each 54px tall, 12px radius, overflow hidden, 11px horizontal padding)
- **Background bar** (absolute, full height, behind content): scales width on metric change
  - Own row: `rgba(145,132,217,.30)→.04`
  - Top 3: `.16→.02`
  - Everyone else: white `.07→.01`
  - Transition: `width 0.44s cubic-bezier(.2,.8,.2,1)`

- **Rank numeral** (right-aligned, 18px / 600): accent for top 3, neutral-600 otherwise

- **30px circular avatar** with initials

- **Name** (13px / 500, accent-tinted for signed-in user) over sub-line "N games · high NNN" (10.5px neutral-500)

- **Right cluster:**
  - Movement glyph (▲n / ▼n / –, accent-300 up, negative color down)
  - 17px tabular value over 9.5px "+n vs base" delta

- **Own row** styling: `rgba(145,132,217,.08)` tint with accent-700 inset border

- **Hover/press:** inset accent-700 ring

- **Tap row:** navigate to member detail screen

### Footnote
11px neutral-600 explaining: "Switching the metric re-ranks in place — rows slide to their new position. Tap anyone to see their season."

---

## State Management

```javascript
// Navigation & context
screen: 'home' | 'play' | 'history' | 'stats' | 'videos' | 'settings' 
       | 'auth' | 'groups' | 'group' | 'create' | 'manage' | 'member' | 'chat' | 'video' | 'join' | 'share' | 'gear' | 'link'
prev: string  // back target
memberIdx: number  // for member detail screen

// Auth & user
guestMode: boolean
quotaNear: boolean  // warning state for video storage

// Solo app
range: 'g5' | 'd30' | 'd90' | 'd180' | 'all'  // analytics range
gameIdx: number  // current game being played

// Social layer
metric: 'avg' | 'high' | 'pins' | 'strike' | 'improved'  // leaderboard metric
platform: 'android' | 'ios'  // for frame only; real app reads OS
```

**Derived (do not store; compute per render):**
- Rankings and base ranks per metric
- Min/max/span for bar scaling (8%–92% range)
- Bar fill percentages
- Podium ordering (2nd / 1st / 3rd)
- Movement deltas (compare current rank to rolling-avg rank)
- Pinned rows (top 3 styling, own row styling)

---

## Data Schema

### Solo App
```javascript
Game {
  id: string
  date: ISO string
  alley: string
  frames: Frame[]  // 10 frames
  totalPins: number
  score: number
  strikes: number
  spares: number
  isGameHigh: boolean
}

Frame {
  frameNum: 1–10
  ball1: number (0–10)
  ball2?: number  // not in 10th if strike in 9th
  ball3?: number  // 10th frame bonus
}
```

### Social Layer
```javascript
Group {
  id: string
  name: string
  createdBy: userId
  members: Member[]  // 2–20 people
  inviteCode: string
  codeExpiresAt: ISO string
  isOpen: boolean  // false = invite-only (MVP)
  homeAlley?: string
  createdAt: ISO string
}

Member {
  id: string
  name: string
  email: string
  joinedAt: ISO string
  role: 'owner' | 'member'
  stats: {
    avg: number
    high: number
    pins: number
    strikeRate: number
    gamesPlayed: number
    improvement: number  // delta vs first game
  }
}

Post {  // shared game or frame
  id: string
  authorId: string
  groupId: string
  gameData: Game | Frame[]
  sharedAt: ISO string
  reactions: { [emoji]: userId[] }
  thread: Reply[]
}

Reply {
  id: string
  authorId: string
  body: string
  createdAt: ISO string
}
```

---

## Implementation Priorities

### Phase 1: Solo App (MVP)
1. Home screen (dashboard + recent games)
2. Play (live scoring, frame-by-frame entry)
3. History (game list)
4. Settings (account, storage)

### Phase 2: Analytics & Social
1. Stats / Analytics screen (charts per range)
2. Auth (guest + Google/Apple OAuth)
3. Groups list screen
4. Group dashboard (hero + podium + full board)

### Phase 3: Shared Features
1. Group chat
2. Shared games & frames
3. Group settings (manage members, rotate code)
4. Member detail

### Phase 4: Polish
1. Video screen (if storage backend added)
2. Quota warnings
3. Guest → account migration flow
4. QR code scanning / generation

---

## Technical Notes

### Platform Considerations
- **Android:** Full-screen status bar, 24px inset top + bottom (soft buttons)
- **iOS:** Safe area insets (notch/Dynamic Island handling), home indicator 20px bottom
- **Both:** Same layout, typography, colors — only frame/chrome differs

### Animations
- Use native platform animation systems (e.g., RN's `Animated`, Flutter's `AnimationController`)
- Hero screens animate in with `fadeUp` on mount
- Leaderboard rows slide with `cubic-bezier(.2,.8,.2,1)` timing on metric change
- Respect `prefers-reduced-motion` system setting

### Storage & Sync
- **Local-first:** Guests store games in on-device storage (AsyncStorage, Realm, SQLite)
- **On sign-in:** Fetch account data from backend; merge local games into account
- **Cloud:** Firebase Auth + custom backend (Firestore / PostgreSQL)
- **Video:** Cloudflare R2 (10 GB free tier ≈ 40 full-length games)

### Assets
- **Icons:** Lucide set, stroke-width 1.5–1.9, 18–19px sizing
- **Avatars:** Initials on colored background (tint per user, deterministic)
- **Video thumbnails:** Placeholder in MVP (motion waveform graphic)

---

## Delivery Checklist

- [ ] Solo app core (Home, Play, History, Settings)
- [ ] Analytics screen + charts
- [ ] Auth flow (guest + OAuth providers)
- [ ] Groups list + group dashboard
- [ ] Group chat + shared posts
- [ ] Group settings (members, code rotation)
- [ ] Leaderboard metric switcher + row animation
- [ ] Responsive layout (both platforms, all screen sizes)
- [ ] Motion respectful of `prefers-reduced-motion`
- [ ] Accessibility: ARIA labels, focus management, touch targets ≥44px
- [ ] Performance: chart rendering, leaderboard re-ranking
- [ ] Error handling: network failures, auth errors, storage quota
- [ ] Testing: unit (logic), component (UI), E2E (flows)

---

## Questions for the Build

1. **Backend:** Is Firebase/Firestore in place, or do we use a custom API?
2. **Video storage:** Will Cloudflare R2 be set up, or should this be stubbed?
3. **OAuth:** Are Google and Apple sign-in credentials ready?
4. **Database:** SQLite (local) + Firestore (cloud), or something else?
5. **Framework:** React Native, Flutter, native (Swift/Kotlin)?
6. **Analytics:** What events should we log? (game completion, group join, share, etc.)

---

## Contact & Reference

- **Design files:** `Bowling Analytics.dc.html`, `Lane Log Social.dc.html`
- **Spec (full):** `design_handoff_lane_log/README.md`
- **Design system:** `nocturne-styles.css` + colors/tokens above
- **Frames reference:** `frames.jsx` (not for production, reference only)

Good luck building! 🎳
