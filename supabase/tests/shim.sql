-- What Supabase gives a project that a bare Postgres does not. None of this is
-- part of the migrations; it is the ground they are written to stand on.
create extension if not exists pgcrypto;
create schema if not exists auth;

-- The real auth.users, as far as 0001's trigger reads it.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

-- Supabase grants these by default; without them every policy is unreachable
-- behind a plain "permission denied", which is not what is being tested.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
