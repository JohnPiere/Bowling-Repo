-- Lane Log — the social layer.
--
-- Scores are not here. They live in IndexedDB on the phone that bowled them,
-- work with no account and no network, and only reach this database when
-- somebody explicitly shares a game with a crew. What this schema holds is the
-- part that is inherently shared: who you are, which crews you are in, what was
-- said in them, and the games posted to them.
--
-- Every table has row-level security on, and RLS is the whole security model:
-- the anon key ships inside the client bundle of a public web app, so it
-- authenticates nothing. What stops one crew reading another's chat is the
-- policies below, and nothing else.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.

-- ── Who you are ────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'Bowler' check (length(name) between 1 and 60),
  -- Derived from the name on the client, because "one character for a name
  -- with no word break" is the right answer for a Japanese name and Postgres
  -- has no business knowing that.
  initials text not null default '' check (length(initials) <= 4),
  created_at timestamptz not null default now()
);

-- A profile row for every account, made by the database rather than the client.
-- A client-side insert can be skipped — a closed tab, a failed request — and
-- then the account exists with nothing to join a group with.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'Bowler'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Crews ──────────────────────────────────────────────────────────────────

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  home_alley text check (length(home_alley) <= 80),
  -- Upper-case and unique. Codes are typed in by hand off a message, so the
  -- client folds case before it gets here.
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  code_expires_at timestamptz,
  created_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  group_id uuid not null references public.groups on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create index if not exists memberships_profile_idx on public.memberships (profile_id);

-- ── What gets said, and what gets posted ───────────────────────────────────

create table if not exists public.shared_games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  -- The id the game has in the bowler's own IndexedDB. Sharing the same game
  -- twice updates the post rather than making a second one, and unsharing then
  -- re-sharing is not a new game to everybody else.
  local_id text not null check (length(local_id) between 1 and 64),
  rolls smallint[] not null check (array_length(rolls, 1) between 1 and 21),
  total smallint not null check (total between 0 and 300),
  house text check (length(house) <= 80),
  note text check (length(note) <= 500),
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (group_id, profile_id, local_id)
);

create index if not exists shared_games_group_idx on public.shared_games (group_id, played_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  -- A message may point at a shared game. Conversation about one game belongs
  -- on the game, but the chat carries the line that says it happened.
  shared_game_id uuid references public.shared_games on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists messages_group_idx on public.messages (group_id, created_at);

create table if not exists public.reactions (
  shared_game_id uuid not null references public.shared_games on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  emoji text not null default '♥' check (length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (shared_game_id, profile_id, emoji)
);

-- ── Membership tests ───────────────────────────────────────────────────────
--
-- `security definer`, and this is not optional. A policy on `memberships` that
-- selected from `memberships` to decide who may read `memberships` recurses,
-- and Postgres refuses the query rather than the row. Reading the table from
-- inside a definer function steps outside RLS and breaks the cycle.

create or replace function public.is_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where group_id = gid and profile_id = auth.uid()
  );
$$;

create or replace function public.is_owner(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where group_id = gid and profile_id = auth.uid() and role in ('owner', 'moderator')
  );
$$;

-- ── Row-level security ─────────────────────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.groups       enable row level security;
alter table public.memberships  enable row level security;
alter table public.shared_games enable row level security;
alter table public.messages     enable row level security;
alter table public.reactions    enable row level security;

-- Profiles: your own, plus anybody you share a crew with. Not the whole table —
-- a directory of every bowler who ever signed up is not something this app has
-- any use for.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.group_id = mine.group_id
      where mine.profile_id = auth.uid() and theirs.profile_id = public.profiles.id
    )
  );

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Groups: the ones you are in. Finding a group is done with a code through
-- join_group(), not by reading this table, which is what "invite-only" means.
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select
  using (public.is_member(id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (public.is_owner(id)) with check (public.is_owner(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete
  using (public.is_owner(id));

-- No insert policy: groups are made through create_group(), which also makes
-- the owner's membership. A bare insert here would leave a crew with nobody
-- in it and no way in.

-- Memberships: the roster of your own crews.
drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select
  using (public.is_member(group_id));

-- Leaving is your own business; removing somebody else is the owner's.
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete
  using (profile_id = auth.uid() or public.is_owner(group_id));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update
  using (public.is_owner(group_id)) with check (public.is_owner(group_id));

-- Shared games: readable by the crew, writable only as yourself.
drop policy if exists shared_games_read on public.shared_games;
create policy shared_games_read on public.shared_games for select
  using (public.is_member(group_id));

drop policy if exists shared_games_insert on public.shared_games;
create policy shared_games_insert on public.shared_games for insert
  with check (profile_id = auth.uid() and public.is_member(group_id));

drop policy if exists shared_games_update on public.shared_games;
create policy shared_games_update on public.shared_games for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Unsharing is the poster's; an owner can also take a post off their board.
drop policy if exists shared_games_delete on public.shared_games;
create policy shared_games_delete on public.shared_games for delete
  using (profile_id = auth.uid() or public.is_owner(group_id));

-- Messages: same shape. Editing is deliberately absent — a chat that can be
-- silently rewritten after the fact is a worse record than one that cannot.
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select
  using (public.is_member(group_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (author_id = auth.uid() and public.is_member(group_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete
  using (author_id = auth.uid() or public.is_owner(group_id));

-- Reactions: anybody in the crew, as themselves.
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select
  using (exists (
    select 1 from public.shared_games g
    where g.id = shared_game_id and public.is_member(g.group_id)
  ));

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert
  with check (profile_id = auth.uid() and exists (
    select 1 from public.shared_games g
    where g.id = shared_game_id and public.is_member(g.group_id)
  ));

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete
  using (profile_id = auth.uid());

-- ── The three things a policy cannot express ───────────────────────────────

-- Six characters, and deliberately not from the whole alphabet: these are read
-- off one phone screen and typed into another, so O/0 and I/1 are out.
create or replace function public.new_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- Making a crew and joining it are one act. Two statements from the client
-- could stop between them and leave a group with nobody in it — and because
-- `groups_read` needs a membership, nobody able to see it either.
create or replace function public.create_group(group_name text, alley text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  code text;
  tries int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a crew.' using errcode = '42501';
  end if;
  if coalesce(trim(group_name), '') = '' then
    raise exception 'A crew needs a name.' using errcode = '22023';
  end if;

  -- Six characters from 32 is a billion codes, so a collision is a surprise
  -- rather than a design problem — but it is one the loop survives.
  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      insert into public.groups (name, home_alley, invite_code, code_expires_at, created_by)
      values (
        trim(group_name),
        nullif(trim(coalesce(alley, '')), ''),
        code,
        now() + interval '14 days',
        auth.uid()
      )
      returning id into gid;
      exit;
    exception when unique_violation then
      if tries >= 10 then raise; end if;
    end;
  end loop;

  insert into public.memberships (group_id, profile_id, role)
  values (gid, auth.uid(), 'owner');

  return gid;
end;
$$;

-- Joining has to read a group you are not yet in, which `groups_read` forbids
-- and should: being able to select by invite code is exactly the ability to
-- enumerate crews. So the lookup happens in here, where the only thing that
-- escapes is a group you now belong to.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a crew.' using errcode = '42501';
  end if;

  select id into gid
  from public.groups
  where invite_code = upper(trim(code))
    and (code_expires_at is null or code_expires_at > now());

  -- One message for "no such code" and for "expired". Telling the difference
  -- apart would confirm that a code was real, which is the thing a code is
  -- supposed to keep quiet about.
  if gid is null then
    raise exception 'No crew uses that code.' using errcode = 'P0002';
  end if;

  insert into public.memberships (group_id, profile_id)
  values (gid, auth.uid())
  on conflict (group_id, profile_id) do nothing;

  return gid;
end;
$$;

-- Rotating cuts off anybody still holding the old code, which is the point.
create or replace function public.rotate_invite_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  tries int := 0;
begin
  if not public.is_owner(gid) then
    raise exception 'Only an owner can rotate the code.' using errcode = '42501';
  end if;

  loop
    tries := tries + 1;
    code := public.new_invite_code();
    begin
      update public.groups
      set invite_code = code, code_expires_at = now() + interval '14 days'
      where id = gid;
      exit;
    exception when unique_violation then
      if tries >= 10 then raise; end if;
    end;
  end loop;

  return code;
end;
$$;

revoke all on function public.create_group(text, text) from public;
revoke all on function public.join_group(text) from public;
revoke all on function public.rotate_invite_code(uuid) from public;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────
--
-- Only the chat. A leaderboard that moved while you were reading it would be
-- worse than one you pull down to refresh, and every subscription is a socket
-- held open on a phone in a bowling alley.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end;
$$;
