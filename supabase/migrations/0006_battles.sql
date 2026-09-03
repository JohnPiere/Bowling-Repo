-- Lane Log — a battle: one member against another, bowled apart.
--
-- Everything else in the crew is a comparison of seasons. A battle is an
-- agreement between exactly two people about one game each, and the point of
-- it is that they do not have to be at the same alley on the same evening:
-- somebody bowls Tuesday, somebody else bowls Friday, and the higher score
-- wins. That is the whole shape.
--
-- **A score here is stored, and every other number in the social layer is
-- derived.** That is a deliberate exception rather than an oversight. A
-- challenge stores no progress because progress *is* the shared games and a
-- second copy would be a second definition of what a strike is. A battle score
-- is not a summary of anything: it is a declaration — "this is the game I am
-- putting up" — which is the same category as `Game.note`, somebody's own
-- statement rather than a computation. Nothing can derive which of a bowler's
-- games they meant to enter, so nothing tries.
--
-- **Two tables rather than two score columns**, and the reason is the policy.
-- A single row carrying `challenger_score` and `opponent_score` needs an UPDATE
-- policy that lets each of two people change one column, and RLS is row-level:
-- there is no way to say it that does not also let either of them overwrite the
-- other's score. Split out, the policy is `profile_id = auth.uid()` and there
-- is nothing to get wrong. `event_replies` in 0005 has exactly this shape for
-- exactly this reason.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is safe to run twice.

-- ── The agreement ──────────────────────────────────────────────────────────

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  challenger_id uuid not null references public.profiles on delete cascade,
  opponent_id uuid not null references public.profiles on delete cascade,
  name text not null check (length(name) between 1 and 80),
  -- When entering closes. Without it a battle where one side never bowls sits
  -- open for ever, and "waiting on Kenji" is not a result.
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Bowling against yourself is not a battle, and the winner would be a tie
  -- with itself.
  check (challenger_id <> opponent_id)
);

create index if not exists battles_group_idx on public.battles (group_id, ends_at desc);

alter table public.battles enable row level security;

-- The crew sees them, because the winner being announced to the crew is half
-- the point. Two people bowling in private is a phone call.
drop policy if exists battles_read on public.battles;
create policy battles_read on public.battles for select
  using (public.is_member(group_id));

-- You may only start a battle you are in, and only against somebody in the
-- same crew. The second half matters: without it the opponent could be any
-- profile id in the database, and a member would find themselves in a battle
-- inside a crew they have never joined.
drop policy if exists battles_insert on public.battles;
create policy battles_insert on public.battles for insert
  with check (
    challenger_id = auth.uid()
    and public.is_member(group_id)
    and exists (
      select 1 from public.memberships m
      where m.group_id = battles.group_id and m.profile_id = opponent_id
    )
  );

-- Nobody edits a battle. Renaming it or moving the deadline once somebody has
-- entered a score changes the terms of a bet that is already running, and the
-- honest move is to call it off and start another.

-- Called off by whoever started it or by whoever it was aimed at — turning one
-- down has to be possible, and deleting it is the only way to say no — but
-- **only while it is still running**. Once the deadline has passed the battle
-- is a record, and a bowler who can delete the ones they lost makes the
-- battles-won figure on every profile mean nothing: `battleRecord` counts
-- settled battles precisely because they cannot change any more, and this is
-- what makes that true.
--
-- After that it is the crew's owner alone — `is_group_owner`, not `is_owner`.
-- A moderator taking down a post is moderation, and a result two people bowled
-- for is not a post. Same reading as migration 0004 and as the challenges in
-- 0005.
drop policy if exists battles_delete on public.battles;
create policy battles_delete on public.battles for delete
  using (
    public.is_group_owner(group_id)
    or ((challenger_id = auth.uid() or opponent_id = auth.uid()) and ends_at > now())
  );

-- ── What each side put up ──────────────────────────────────────────────────

create table if not exists public.battle_entries (
  battle_id uuid not null references public.battles on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  score integer not null check (score between 0 and 300),
  -- The rolls behind it, so the battle can draw the frames rather than take a
  -- number on trust. Same shape and same bounds as `shared_games.rolls`;
  -- empty when the score was typed rather than picked out of a season.
  rolls smallint[] not null default '{}' check (array_length(rolls, 1) is null or array_length(rolls, 1) between 1 and 21),
  -- When they bowled it, which is the part that lets the two sides be days
  -- apart. Not `created_at`: entering a game on Friday that was bowled on
  -- Tuesday is the normal case here.
  played_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- One entry each. Bowling twice is not two entries, it is changing your mind
  -- about which game you are putting up, and that is an update.
  primary key (battle_id, profile_id)
);

alter table public.battle_entries enable row level security;

-- Through the battle, because an entry does not carry a group — the same way
-- `event_replies` reads through `crew_events` and `reactions` through
-- `shared_games`.
drop policy if exists battle_entries_read on public.battle_entries;
create policy battle_entries_read on public.battle_entries for select
  using (exists (
    select 1 from public.battles b
    where b.id = battle_id and public.is_member(b.group_id)
  ));

-- Only your own, and only into a battle you are actually in. A crewmate
-- entering a score for either side would decide somebody else's result.
drop policy if exists battle_entries_write on public.battle_entries;
create policy battle_entries_write on public.battle_entries for insert
  with check (profile_id = auth.uid() and exists (
    select 1 from public.battles b
    where b.id = battle_id
      and (b.challenger_id = auth.uid() or b.opponent_id = auth.uid())
  ));

-- Putting up a different game is the normal case while the battle runs — that
-- is what the week is for — and stops dead at the deadline, or the loser
-- simply edits their score upward after seeing the winner's.
drop policy if exists battle_entries_update on public.battle_entries;
create policy battle_entries_update on public.battle_entries for update
  using (profile_id = auth.uid() and exists (
    select 1 from public.battles b where b.id = battle_id and b.ends_at > now()
  ))
  with check (profile_id = auth.uid());

-- Taking your game back out, while there is still time to put another up.
-- Bounded by the deadline for the same reason the battle is: after it, pulling
-- your entry would turn a loss into a walkover *against the winner*, which is
-- worse than deleting the battle outright.
drop policy if exists battle_entries_delete on public.battle_entries;
create policy battle_entries_delete on public.battle_entries for delete
  using (profile_id = auth.uid() and exists (
    select 1 from public.battles b where b.id = battle_id and b.ends_at > now()
  ));
