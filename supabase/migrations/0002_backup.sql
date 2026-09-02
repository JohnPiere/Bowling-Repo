-- Lane Log — a copy of your games, for when the phone goes in the gutter.
--
-- The first migration says scores are not in this database, and that is still
-- the rule for the *social* layer: what a crew can see is what you shared with
-- it, one game at a time, in `shared_games`. This table is a different thing
-- with a different reader. Nobody but you can read a row of it — not a crew you
-- are in, not a crew you own — and its only job is to survive a lost phone.
--
-- Until now the only copy of a season was the export file in Settings, which
-- means the honest thing the app could say about a dropped phone was "there is
-- no backup unless you made one". People do not make one.
--
-- Photos are still not here. A season of scanned sheets is tens of megabytes on
-- a free tier meant for kilobytes, and the scores are the part that cannot be
-- reconstructed — the same call `lib/backup.ts` makes about the export file.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.game_backups (
  owner_id uuid not null references public.profiles on delete cascade,
  -- The id the game has in the phone's own IndexedDB. It is the identity of a
  -- game everywhere else in this app, and using it here means restoring onto a
  -- device that already has some of these games matches them up rather than
  -- doubling them.
  local_id text not null check (length(local_id) between 1 and 64),

  bowler text not null default 'You' check (length(bowler) between 1 and 60),
  rolls smallint[] not null check (array_length(rolls, 1) between 1 and 21),
  -- Which pins each ball took, when the game was scored on the rack. An array
  -- of arrays, which Postgres will not hold in a `smallint[][]` — that type is
  -- a rectangle, and these rows are ragged. jsonb, and the client checks its
  -- shape on the way back in, the same way it checks a restored file.
  pinfalls jsonb,
  total smallint not null check (total between 0 and 300),
  is_complete boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'scan')),
  house text check (length(house) <= 80),
  note text check (length(note) <= 500),
  played_at timestamptz not null,
  -- The client's own `updatedAt`, not `now()`. It is what decides a conflict
  -- between two phones, and a server clock would make "newest wins" mean
  -- "whichever synced last", which is not the same thing.
  updated_at timestamptz not null,
  primary key (owner_id, local_id)
);

-- Pulling a backup reads your rows newest first.
create index if not exists game_backups_owner_idx
  on public.game_backups (owner_id, updated_at desc);

alter table public.game_backups enable row level security;

-- Yours and nobody else's, on all four verbs. There is deliberately no crew
-- clause anywhere in this file: a crew sees what you shared with it, and a
-- backup is not sharing.
drop policy if exists game_backups_read on public.game_backups;
create policy game_backups_read on public.game_backups for select
  using (owner_id = auth.uid());

drop policy if exists game_backups_insert on public.game_backups;
create policy game_backups_insert on public.game_backups for insert
  with check (owner_id = auth.uid());

drop policy if exists game_backups_update on public.game_backups;
create policy game_backups_update on public.game_backups for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists game_backups_delete on public.game_backups;
create policy game_backups_delete on public.game_backups for delete
  using (owner_id = auth.uid());
