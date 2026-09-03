-- Lane Log — the two things only an owner may do.
--
-- `is_owner()` in 0001 is really "owner or moderator": it returns true for
-- `role in ('owner', 'moderator')`. That is the right test for moderation —
-- taking a post down, removing a member, rotating a code — and it is the wrong
-- test for the two policies below, which it was also wired to.
--
-- Nothing had exercised either of them: the settings screen was a mock, so no
-- moderator ever had a button that deleted a crew. Wiring that screen up is
-- what makes this matter, and there are two holes in it:
--
--   * `groups_delete` let a moderator delete the whole crew — the chat, the
--     board, the roster — while the screen told them, correctly as designed and
--     incorrectly as built, "you can moderate posts and members, but not delete
--     the group".
--   * `memberships_update` let a moderator set anybody's role, including their
--     own, including to 'owner'. That is a privilege escalation with a
--     one-line query behind it.
--
-- So: a second, stricter function, and those policies moved onto it. Renaming
-- goes with them, because the settings screen has always disabled the name
-- field for anybody but the owner. The rest keep `is_owner` — taking a post
-- down, removing a member, rotating a code — because moderating is what a
-- moderator is for.
--
-- Apply this in the Supabase dashboard: SQL Editor → New query → paste → Run.

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where group_id = gid and profile_id = auth.uid() and role = 'owner'
  );
$$;

-- Deleting a crew is not moderation. Everything under it cascades away, and
-- there is no undo anywhere in this app.
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete
  using (public.is_group_owner(id));

-- Handing out roles is not moderation either — it is handing out this.
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));

-- Renaming the crew is the third. The settings screen has always disabled the
-- name and alley fields for anybody but the owner, so this is the database
-- catching up with what the screen already said. Rotating the code is
-- unaffected: `rotate_invite_code` is a definer function that does its own
-- `is_owner` check, and moderators keep it.
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (public.is_group_owner(id)) with check (public.is_group_owner(id));
