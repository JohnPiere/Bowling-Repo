# The social layer

Everything that makes Lane Log a scoring app — the rack, the sheet scanner,
history, analytics — runs on this phone with no account and no network. This
document covers the part that cannot: crews, chat, and games posted to a board
other people read.

It is Supabase, on the free tier. One Postgres database, its built-in OAuth,
and a websocket for the chat.

**Nothing here is a server you run.** Supabase hosts all of it; the app is a
static bundle on GitHub Pages that talks to a URL. There is no machine to keep
switched on, no process to restart, and nothing to deploy but the front end.
What follows is three forms to fill in once, not an installation.

## What you have to do once

Three of these are dashboard steps that only the project's owner can do. None of
them take long, and the app keeps scoring games perfectly well until they are
done — the crew tab simply says it cannot reach anything.

### 1. Create the tables

Dashboard → **SQL Editor** → New query → paste the whole of
`supabase/migrations/0001_social.sql` → **Run**.

It is written to be safe to run twice (`create table if not exists`, `drop
policy if exists`), so re-running it after an edit is fine.

### 2. Give Google somewhere to send people back to

Google is the only provider the app offers. The design has an Apple button
beside it and it is not built: Apple will not issue the key Supabase needs
without a paid Apple Developer account (currently $99/yr), so it is left out
rather than drawn as a button that can only refuse. Adding it later is that
account, one `Provider` type widened, and one button.

1. [Google Cloud Console](https://console.cloud.google.com/auth/clients) →
   **Create client** → *Web application*.
2. Under **Authorised redirect URIs**, add exactly:

   ```
   https://kbfzyfbwnwpntiknhyjc.supabase.co/auth/v1/callback
   ```

3. Leave **Authorised JavaScript origins** empty.
4. Copy the **Client ID** and **Client secret** into Supabase dashboard →
   **Authentication → Sign In / Providers → Google**, and switch it on.

**No GitHub Pages URL goes anywhere in Google.** Every address in that form is
Supabase's, because during sign-in the browser is *on* supabase.co when it
talks to Google — the app only reappears at the very end, and that last hop is
Supabase's business, configured in step 3 below.

Putting `https://johnpiere.github.io/Bowling-Repo/` into JavaScript origins is
the mistake the form invites, and it fails twice over: an origin is scheme and
host only, so a path and a trailing slash are both refused. The two fields have
opposite rules and sit next to each other — a redirect URI *must* carry the
`/auth/v1/callback` path, an origin must carry no path at all — so read which
one you are in before pasting.

### 3. Tell Supabase where the app lives

Dashboard → **Authentication → URL Configuration**.

| Field | Value |
| --- | --- |
| Site URL | `https://johnpiere.github.io/Bowling-Repo/` |
| Redirect URLs | `https://johnpiere.github.io/Bowling-Repo/` |
| Redirect URLs | `http://localhost:4173/` |
| Redirect URLs | `http://localhost:5173/` |

The **trailing slash matters** here and so does the `/Bowling-Repo/` path —
the exact opposite of Google's origins rule one step above. A GitHub Pages
project site is served from a subdirectory, and a redirect to the bare origin
lands on a different page entirely. The app builds this URL itself in
`redirectUrl()` — if the two ever disagree, Supabase refuses the redirect rather
than following it, which is the failure you want but an opaque one to read.

## Why the key in the repo is not a leak

`src/lib/backend.ts` carries the project URL and the publishable key as
constants, and they are committed.

A single-page app on static hosting has no server to keep a secret in. Whatever
key it uses is in the JavaScript bundle, one network-tab click away from anyone
who loads the site. Supabase is designed around that: the publishable key names
the *project* and grants nothing by itself.

What actually decides who may read a crew's chat is the row-level security
policies, evaluated by Postgres against the signed-in user on every query. So:

- **The policies are the security review.** Read them, not the key.
- **The `service_role` key and the database password must never come near the
  client.** Those bypass RLS completely. Nothing in `src/` should ever need
  either.
- **A new table is unreachable until it has policies.** Once RLS is on, Postgres
  denies by default — which is the right way round, because a table somebody
  forgot to write a policy for fails closed rather than open.

The one thing being public does cost: anybody who finds the project can attempt
to sign up, which uses free-tier monthly-active-user quota. If that ever
matters, turn off public sign-ups in Authentication → Sign In / Providers and
invite by hand.

## What is on the server and what is not

| Stays on the phone | Goes to Postgres |
| --- | --- |
| Every game you bowl or scan | Your name and avatar initials |
| Sheet photos | Which crews you are in |
| Your whole history and analytics | Messages in those crews |
| Preferences, language, badges | Games you explicitly share |

Sharing a game **copies** it up. It stays in your own history whether or not it
is on a board, and unsharing takes the copy down without touching the original.

This split is the reason a paused project or an alley with no signal costs you
the crew screens and not your season. It also means there is no cloud backup of
your games yet — `Settings → Export` is still the only copy off this device.

## Things worth knowing about the free tier

- **A project pauses after 7 days with no requests.** It comes back from the
  dashboard with nothing lost, but a week of not bowling means the crew tab is
  down when you next open it. The app reports this as "cannot reach the server"
  rather than as an error in your data, because that is what it is.
- 500 MB of database and 50,000 monthly active users, neither of which a
  bowling crew will trouble.
- Realtime is included. Only the chat subscribes: a leaderboard that moved while
  you read it would be worse than one you pull to refresh, and every
  subscription is a socket held open on a phone in a bowling alley.

## Local development

```bash
# The committed default points at the live project.
npm run dev

# To point at your own project instead:
VITE_SUPABASE_URL=https://yours.supabase.co VITE_SUPABASE_KEY=sb_publishable_… npm run dev
```

Add whatever origin you serve from to the Redirect URLs list above, or sign-in
will bounce.

## The shape of it

```
profiles      one row per account, made by a trigger on sign-up
groups        name, home alley, invite code, who made it
memberships   (group, profile) → owner | moderator | member
shared_games  a game copied up to one crew's board
messages      the chat, with an optional pointer at a shared game
reactions     hearts on a shared game
game_backups  your own season, readable by nobody else  (0002)
```

`profiles.avatar` (0003) holds a small square data URL rather than a Storage
object: 192px of WebP is about ten kilobytes, smaller than several of the chat
messages beside it, and a bucket would be a second set of access rules to get
right for no benefit at that size. It needs no new policy — `profiles_read` is
already "you, plus anybody you share a crew with" and `profiles_write` is
already "your own row", so the picture is visible to exactly the people who can
see the name it belongs to. The column's own check keeps it under 40 000
characters and shaped like `data:image/…`, because a text column the client
renders into an `<img src>` should not be able to hold a sentence.

Two pieces of it are worth reading before changing anything:

**`is_member()` is `security definer` and has to be.** A policy on `memberships`
that selected from `memberships` to decide who may read `memberships` recurses,
and Postgres refuses the query rather than the row. Reading the table inside a
definer function steps outside RLS and breaks the cycle.

**Creating and joining a crew are functions, not inserts.** Creating one has to
make the owner's membership in the same breath — two statements from a client
can stop between them and leave a group nobody is in and, because `groups_read`
needs a membership, nobody can see. Joining has to look up a group you are not
yet in, which the policies forbid and should: being able to select by invite
code *is* the ability to enumerate crews. Both happen inside `security definer`
functions where the only thing that escapes is a group you now belong to.

**`game_backups` is not part of the social layer.** It is in this database
because this is the database there is, and every policy on it says
`owner_id = auth.uid()` and nothing else — no crew clause, on any of the four
verbs. Sharing a game with a crew writes `shared_games` and is a deliberate act
per game; this table is a safe, and the only reader is the account that filled
it.

Two things about it are load-bearing on the client side:

- **`updated_at` is the device's clock, not `now()`.** It is what decides a
  conflict between two phones, and a server timestamp would make "newest wins"
  mean "whichever synced last" — losing a week of offline edits to a phone that
  opened the app first.
- **A delete has to be told, not inferred.** The phone keeps a tombstone for
  every game it deletes (`tombstones` in IndexedDB) and the sync sends those
  before anything else. Without them a pull is an undelete: the row is still on
  the server, the game is not on the phone, and "missing here" looks exactly
  like "bowled on the other phone".

**Reactions are counted on the client.** `loadSharedGames` reads every reaction
row for the posts it is about to draw and folds them in with `heartsBy`; there
is no `count` per post and no view. A board is tens of posts and a crew is a
handful of people, so this is one extra query against a few dozen rows — where
an aggregate per post would be one round trip each. The reaction fetch is also
allowed to fail on its own: a board that draws without its hearts is worth more
than one that does not draw.

The `emoji` column takes eight characters and the app only ever writes `♥`. A
second reaction is a change of mind rather than a migration.

Standings — averages, handicap, improvement — are computed in
`src/lib/social.ts`, not in SQL. There is one definition of what an average
means and it is the one the analytics screen already uses; a second copy in a
Postgres view would drift.
