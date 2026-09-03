-- Lane Log — a photograph on the profile tile.
--
-- The tile has been initials on a colour since the first screen was drawn. This
-- adds the picture, and it goes in the `profiles` row rather than in Supabase
-- Storage: a 192-pixel square of WebP is about ten kilobytes, which is smaller
-- than several of the chat messages sitting next to it, and a bucket would mean
-- a second set of access rules to get right for no benefit at this size.
--
-- Nothing else is needed. `profiles_read` already says "you, plus anybody you
-- share a crew with", and `profiles_write` already says "your own row" — so the
-- picture is readable by exactly the people who can already see the name it
-- belongs to, and writable by exactly the person it is of.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.

alter table public.profiles
  add column if not exists avatar text;

-- Two checks, and both are about what a text column would otherwise accept.
--
-- The length cap is the real one: without it this column is an invitation to
-- store a megabyte of photograph per member and read all of it on every board
-- render. 40 000 characters is about 30 KB of image — comfortably above what
-- the client produces (~28 000) so that a future version with a larger tile is
-- not rejected outright, and far below anything that would hurt.
--
-- The prefix check is the cheap one: a column the client only ever renders into
-- an `<img src>` should not be able to hold a sentence, or a `javascript:` URL.
do $$
begin
  alter table public.profiles
    add constraint profiles_avatar_is_a_small_image
    check (
      avatar is null
      or (length(avatar) <= 40000 and avatar like 'data:image/%')
    );
exception
  when duplicate_object then null;
end;
$$;
