-- What the policies are supposed to stop, asserted rather than printed.
--
-- Every case here is a sentence from a migration's own comment. Migration 0004
-- exists because `is_owner()` means "owner *or moderator*" and two policies
-- wanted stricter — a moderator could delete a whole crew, and could set
-- anybody's role to owner, their own included. Nothing had exercised either,
-- because the settings screen was a mock. This is what exercises them.
--
-- Run through `npm run verify:sql`, which stands up a throwaway Postgres,
-- applies every migration to it and then runs this. A failure raises, so the
-- run stops on the first hole.

\set ON_ERROR_STOP on

create or replace function pg_temp.check(what text, got boolean, want boolean)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAILED: % — expected %, got %', what, want, got;
  end if;
  raise notice 'ok    %', what;
end;
$$;

/** True when a statement was refused by RLS, either silently or loudly. */
create or replace function pg_temp.refused(statement text)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then return true;
end;
$$;

-- ── Three people and a crew ────────────────────────────────────────────────
-- 0001 puts a trigger on auth.users that makes the profile, so these inserts
-- are the whole of signing up.

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com',     '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'moderator@example.com', '{"full_name":"Moderator"}'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.com',  '{"full_name":"Outsider"}'),
  -- In the crew and in nothing else: the bystander a battle needs, because
  -- "only the two in it may enter a score" is not tested by an outsider who
  -- cannot see the battle at all.
  ('44444444-4444-4444-4444-444444444444', 'bystander@example.com', '{"full_name":"Bystander"}')
on conflict do nothing;

insert into public.groups (id, name, invite_code, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', 'TCRW31',
          '11111111-1111-1111-1111-111111111111');

insert into public.memberships (group_id, profile_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'moderator'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'member');

insert into public.challenges (id, group_id, creator_id, name, metric, target, starts_at, ends_at)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', '100 strikes', 'strikes', 100,
          now(), now() + interval '30 days');

insert into public.crew_events (id, group_id, creator_id, title, house, starts_at)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'League night', 'Korona Bowl',
          now() + interval '3 days');

-- The owner has put a battle up against the moderator: two people, one game
-- each, days apart.
insert into public.battles (id, group_id, challenger_id, opponent_id, name, ends_at)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
          'Best game this week', now() + interval '7 days');

-- And one that is already over, with the moderator having lost it — the state
-- every rule about a settled battle is about.
insert into public.battles (id, group_id, challenger_id, opponent_id, name, ends_at)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
          'Last week', now() - interval '1 day');

insert into public.battle_entries (battle_id, profile_id, score, played_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', '11111111-1111-1111-1111-111111111111', 245, now() - interval '3 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', '22222222-2222-2222-2222-222222222222', 180, now() - interval '4 days');

-- Everything below runs as `authenticated`, which is what the app connects as.
set role authenticated;

-- ── A moderator, which is what 0004 is about ───────────────────────────────
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare gone int;
begin
  delete from public.groups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics gone = row_count;
  perform pg_temp.check('a moderator cannot delete the crew', gone > 0, false);

  update public.memberships set role = 'owner'
    where profile_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics gone = row_count;
  perform pg_temp.check('a moderator cannot make themselves owner', gone > 0, false);

  update public.groups set name = 'Mine now'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics gone = row_count;
  perform pg_temp.check('a moderator cannot rename the crew', gone > 0, false);

  delete from public.challenges where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  get diagnostics gone = row_count;
  perform pg_temp.check('a moderator cannot delete a challenge they did not set', gone > 0, false);

  delete from public.crew_events where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  get diagnostics gone = row_count;
  perform pg_temp.check('a moderator cannot call off a night they did not put up', gone > 0, false);
end;
$$;

do $$
begin
  perform pg_temp.check('a member can read the crew challenges',
    (select count(*) from public.challenges) = 1, true);
  perform pg_temp.check('a member can read the crew calendar',
    (select count(*) from public.crew_events) = 1, true);
end;
$$;

insert into public.event_replies (event_id, profile_id, status)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 'in');

do $$
begin
  perform pg_temp.check('a member can say they are coming',
    (select count(*) from public.event_replies) = 1, true);

  -- One answer each: saying yes for somebody else is not a thing.
  perform pg_temp.check('a member cannot answer for somebody else', pg_temp.refused($q$
    insert into public.event_replies (event_id, profile_id, status)
    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            '11111111-1111-1111-1111-111111111111', 'out')
  $q$), true);
end;
$$;

-- ── A battle, from inside it ───────────────────────────────────────────────
-- Still the moderator, who is the opponent in the battle seeded above.

insert into public.battle_entries (battle_id, profile_id, score, rolls, played_at)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
          30, array[10,10,10,10,10,10,10,10,10,10,10,10]::smallint[], now() - interval '2 days');

do $$
begin
  perform pg_temp.check('a bowler can put a game up in a battle they are in',
    (select count(*) from public.battle_entries
      where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 1, true);

  -- The reason the scores are their own table: one row with two score columns
  -- has no row-level policy that lets each side write one of them.
  perform pg_temp.check('a bowler cannot enter a score for their opponent', pg_temp.refused($q$
    insert into public.battle_entries (battle_id, profile_id, score, played_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '11111111-1111-1111-1111-111111111111', 300, now())
  $q$), true);

  -- The opponent has to be somebody already in the crew, or a member would
  -- find themselves in a battle inside a crew they have never joined.
  perform pg_temp.check('a battle cannot be aimed at somebody outside the crew', pg_temp.refused($q$
    insert into public.battles (group_id, challenger_id, opponent_id, name, ends_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333', 'Gatecrash', now() + interval '1 day')
  $q$), true);

  perform pg_temp.check('a battle cannot be started in somebody else name', pg_temp.refused($q$
    insert into public.battles (group_id, challenger_id, opponent_id, name, ends_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            '44444444-4444-4444-4444-444444444444', 'Not mine', now() + interval '1 day')
  $q$), true);
end;
$$;

-- ── A battle that is over stays over ───────────────────────────────────────
-- Still the moderator, who lost the closed one 180 to 245. Every way out of
-- that is a way to make the battles-won figure on a profile meaningless, which
-- is why `battleRecord` counts settled battles and why these are closed off.

do $$
declare gone int;
begin
  delete from public.battles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bowler cannot delete a battle they lost', gone > 0, false);

  update public.battle_entries set score = 300
    where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bowler cannot improve a score after the deadline', gone > 0, false);

  -- Pulling it would turn a loss into a walkover against the winner, which is
  -- worse than deleting the battle outright.
  delete from public.battle_entries
    where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bowler cannot withdraw a game after the deadline', gone > 0, false);

  -- What is still allowed, so the checks above are not passing because
  -- everything is refused.
  update public.battle_entries set score = 220
    where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bowler can put up a better game while it runs', gone > 0, true);
end;
$$;

-- ── A crewmate who is not in the battle ────────────────────────────────────
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

do $$
begin
  -- Reading is the whole point: the winner is announced to the crew.
  perform pg_temp.check('the crew can watch a battle it is not in',
    (select count(*) from public.battles) = 2, true);
  perform pg_temp.check('the crew can see the scores put up',
    (select count(*) from public.battle_entries
      where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 1, true);

  perform pg_temp.check('a bystander cannot enter a score in a battle', pg_temp.refused($q$
    insert into public.battle_entries (battle_id, profile_id, score, played_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '44444444-4444-4444-4444-444444444444', 300, now())
  $q$), true);
end;
$$;

-- Watching is not refereeing.
do $$
declare gone int;
begin
  delete from public.battles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bystander cannot call off a battle', gone > 0, false);

  update public.battle_entries set score = 0
    where battle_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics gone = row_count;
  perform pg_temp.check('a bystander cannot rewrite a score', gone > 0, false);
end;
$$;

-- ── Somebody who is not in the crew ────────────────────────────────────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
begin
  perform pg_temp.check('an outsider cannot read the challenges',
    (select count(*) from public.challenges) = 0, true);
  perform pg_temp.check('an outsider cannot read the calendar',
    (select count(*) from public.crew_events) = 0, true);
  perform pg_temp.check('an outsider cannot read who is coming',
    (select count(*) from public.event_replies) = 0, true);
  perform pg_temp.check('an outsider cannot read the battles',
    (select count(*) from public.battles) = 0, true);
  perform pg_temp.check('an outsider cannot read what was put up',
    (select count(*) from public.battle_entries) = 0, true);

  perform pg_temp.check('an outsider cannot put a night in the calendar', pg_temp.refused($q$
    insert into public.crew_events (group_id, creator_id, title, starts_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '33333333-3333-3333-3333-333333333333', 'Gatecrash', now())
  $q$), true);

  perform pg_temp.check('an outsider cannot set a challenge', pg_temp.refused($q$
    insert into public.challenges (group_id, creator_id, name, metric, target, starts_at, ends_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '33333333-3333-3333-3333-333333333333', 'Mine', 'games', 5,
            now(), now() + interval '1 day')
  $q$), true);
end;
$$;

-- ── The owner, who may ─────────────────────────────────────────────────────
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare gone int;
begin
  delete from public.challenges where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  get diagnostics gone = row_count;
  perform pg_temp.check('the owner can delete a challenge', gone > 0, true);

  delete from public.crew_events where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  get diagnostics gone = row_count;
  perform pg_temp.check('the owner can call off a night', gone > 0, true);

  -- Somebody has to be able to tidy one away, and the owner is the only person
  -- with nothing to gain from it.
  delete from public.battles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc';
  get diagnostics gone = row_count;
  perform pg_temp.check('the owner can take down a settled battle', gone > 0, true);
end;
$$;

-- ── The backup is nobody else's business ───────────────────────────────────
insert into public.game_backups (owner_id, local_id, rolls, total, is_complete, source, played_at, updated_at)
  values ('11111111-1111-1111-1111-111111111111', 'g1', array[10,10,10]::smallint[], 30, false, 'manual', now(), now());

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  -- Sharing a game is a deliberate act per game. This table is a safe, and its
  -- only reader is the account that filled it — crewmate or not.
  perform pg_temp.check('a crewmate cannot read your backup',
    (select count(*) from public.game_backups) = 0, true);
end;
$$;

-- Turning a battle down has to be possible, and deleting it is the only way
-- to say no — so the person it was aimed at is on the delete policy too.
do $$
declare gone int;
begin
  delete from public.battles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics gone = row_count;
  perform pg_temp.check('the person a battle is aimed at can turn it down', gone > 0, true);
end;
$$;
