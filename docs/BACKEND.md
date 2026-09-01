# The social layer

Everything that makes Lane Log a scoring app — the rack, the sheet scanner,
history, analytics — runs on this phone with no account and no network. This
document covers the part that cannot: crews, chat, and games posted to a board
other people read.

It is Supabase, on the free tier. One Postgres database, its built-in OAuth,
and a websocket for the chat.

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

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   **Create credentials** → **OAuth client ID** → *Web application*.
2. Under **Authorized redirect URIs**, add exactly:

   ```
   https://kbfzyfbwnwpntiknhyjc.supabase.co/auth/v1/callback
   ```

   That is Supabase's callback, not the app's. Google talks to Supabase;
   Supabase talks to the app.
3. Copy the **Client ID** and **Client secret** into Supabase dashboard →
   **Authentication → Sign In / Providers → Google**, and switch it on.

### 3. Tell Supabase where the app lives

Dashboard → **Authentication → URL Configuration**.

| Field | Value |
| --- | --- |
| Site URL | `https://johnpiere.github.io/Bowling-Repo/` |
| Redirect URLs | `https://johnpiere.github.io/Bowling-Repo/` |
| Redirect URLs | `http://localhost:4173/` |
| Redirect URLs | `http://localhost:5173/` |

The **trailing slash matters** and so does the `/Bowling-Repo/` path. A GitHub
Pages project site is served from a subdirectory, and a redirect to the bare
origin lands on a different page entirely. The app builds this URL itself in
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
```

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

Standings — averages, handicap, improvement — are computed in
`src/lib/social.ts`, not in SQL. There is one definition of what an average
means and it is the one the analytics screen already uses; a second copy in a
Postgres view would drift.
