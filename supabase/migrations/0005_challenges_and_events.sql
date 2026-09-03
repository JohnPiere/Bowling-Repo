-- Lane Log — challenges a crew chases, and nights it arranges.
--
-- Two tables' worth of feature and one idea shared between them: neither
-- stores anything that can be derived. A challenge holds a target and a
-- window and *no progress*, because progress is the games already in
-- `shared_games`, counted by the same `tally` the analytics screen uses. A
-- second copy in SQL would be a second definition of what a strike is, free to
-- drift from the first — which is the reasoning `docs/BACKEND.md` already gives
-- for keeping standings out of Postgres, and it applies twice as hard here.
--
-- The consequence is worth being plain about, in the schema as well as on the
-- screen: **a challenge can only count games that were shared with the crew.**
-- A member's own phone holds the rest of their season and this database has no
-- business with it. `game_backups` is not an escape hatch — every policy on it
-- says `owner_id = auth.uid()` and it is a safe, not a feed.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is safe to run twice.

-- ── Challenges ─────────────────────────────────────────────────────────────

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  creator_id uuid not null references public.profiles on delete cascade,
  name text not null check (length(name) between 1 and 80),
  -- Sums only. An "average 180" target can go down, is held rather than
  -- reached, and "62% of the way to an average" is not a sentence — that wants
  -- a different kind of challenge rather than a wrong reading of this one.
  metric text not null check (metric in ('strikes', 'spares', 'games', 'pins', 'frames', 'balls')),
  target integer not null check (target between 1 and 1000000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- A window that ends before it starts would make every standing zero and
  -- look like nobody had bowled.
  check (ends_at > starts_at)
);

create index if not exists challenges_group_idx on public.challenges (group_id, ends_at desc);

alter table public.challenges enable row level security;

drop policy if exists challenges_read on public.challenges;
create policy challenges_read on public.challenges for select
  using (public.is_member(group_id));

-- Anybody in the crew may set one. It costs nothing and creating things is
-- what makes a crew screen worth opening.
drop policy if exists challenges_insert on public.challenges;
create policy challenges_insert on public.challenges for insert
  with check (creator_id = auth.uid() and public.is_member(group_id));

-- Changing the target or the window halfway through rewrites everybody's
-- progress, so it belongs to whoever set it — or to the owner, who owns the
-- crew. Deliberately *not* `is_owner`, which is "owner or moderator":
-- moderating is taking down what somebody posted, and a challenge with a week
-- left is not a post. Same reading as migration 0004.
drop policy if exists challenges_update on public.challenges;
create policy challenges_update on public.challenges for update
  using (creator_id = auth.uid() or public.is_group_owner(group_id))
  with check (creator_id = auth.uid() or public.is_group_owner(group_id));

drop policy if exists challenges_delete on public.challenges;
create policy challenges_delete on public.challenges for delete
  using (creator_id = auth.uid() or public.is_group_owner(group_id));

-- ── Events ─────────────────────────────────────────────────────────────────

create table if not exists public.crew_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  creator_id uuid not null references public.profiles on delete cascade,
  title text not null check (length(title) between 1 and 80),
  -- The same free-text house the rest of the app uses. Not a reference to
  -- anything: the app has never had a table of alleys and does not want one.
  house text not null default '' check (length(house) <= 80),
  starts_at timestamptz not null,
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists crew_events_group_idx on public.crew_events (group_id, starts_at);

alter table public.crew_events enable row level security;

drop policy if exists crew_events_read on public.crew_events;
create policy crew_events_read on public.crew_events for select
  using (public.is_member(group_id));

drop policy if exists crew_events_insert on public.crew_events;
create policy crew_events_insert on public.crew_events for insert
  with check (creator_id = auth.uid() and public.is_member(group_id));

-- A night out with five people counting on it is not a post either.
drop policy if exists crew_events_update on public.crew_events;
create policy crew_events_update on public.crew_events for update
  using (creator_id = auth.uid() or public.is_group_owner(group_id))
  with check (creator_id = auth.uid() or public.is_group_owner(group_id));

drop policy if exists crew_events_delete on public.crew_events;
create policy crew_events_delete on public.crew_events for delete
  using (creator_id = auth.uid() or public.is_group_owner(group_id));

-- ── Who is coming ──────────────────────────────────────────────────────────

create table if not exists public.event_replies (
  event_id uuid not null references public.crew_events on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  status text not null check (status in ('in', 'out')),
  updated_at timestamptz not null default now(),
  -- One answer each, changed rather than added to. Saying yes twice is not two
  -- people.
  primary key (event_id, profile_id)
);

alter table public.event_replies enable row level security;

-- The membership test has to go through the event, because the reply does not
-- carry a group. Written as an exists() over `crew_events` the same way
-- `reactions_read` goes through `shared_games` in 0001.
drop policy if exists event_replies_read on public.event_replies;
create policy event_replies_read on public.event_replies for select
  using (exists (
    select 1 from public.crew_events e
    where e.id = event_id and public.is_member(e.group_id)
  ));

drop policy if exists event_replies_write on public.event_replies;
create policy event_replies_write on public.event_replies for insert
  with check (profile_id = auth.uid() and exists (
    select 1 from public.crew_events e
    where e.id = event_id and public.is_member(e.group_id)
  ));

-- Changing your mind is the normal case, not the exception, and it is only
-- ever your own answer you may change.
drop policy if exists event_replies_update on public.event_replies;
create policy event_replies_update on public.event_replies for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists event_replies_delete on public.event_replies;
create policy event_replies_delete on public.event_replies for delete
  using (profile_id = auth.uid());
