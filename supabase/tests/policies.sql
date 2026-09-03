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
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.com',  '{"full_name":"Outsider"}')
on conflict do nothing;

insert into public.groups (id, name, invite_code, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', 'TCRW31',
          '11111111-1111-1111-1111-111111111111');

insert into public.memberships (group_id, profile_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'moderator');

insert into public.challenges (id, group_id, creator_id, name, metric, target, starts_at, ends_at)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', '100 strikes', 'strikes', 100,
          now(), now() + interval '30 days');

insert into public.crew_events (id, group_id, creator_id, title, house, starts_at)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'League night', 'Korona Bowl',
          now() + interval '3 days');

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
