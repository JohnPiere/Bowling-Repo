/**
 * Crews, chat and shared games.
 *
 * Everything here needs the network and an account; nothing else in the app
 * does. The split is deliberate — a paused project or an alley with no signal
 * costs you the crew screens and not your season.
 *
 * The async half talks to Supabase. The pure half below it turns rows into the
 * shapes the screens already render, and is where the arithmetic lives: an
 * average is computed here and nowhere else, so the board and the profile
 * cannot disagree about what somebody is bowling.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { backend } from './backend';
import type { Member } from './leaderboard';
import { scoreGame } from './scoring';
import { formatDay, formatMonthYear, formatTime } from './datetime';

// ── The shapes the screens render ──────────────────────────────────────────
//
// These used to live in `src/data/` alongside a fictional Tuesday Crew, which
// was the right home while there was nothing behind them. There is now, so the
// shapes live with the code that fills them and the fiction is gone.

export interface Group {
  id: string;
  name: string;
  initials: string;
  homeAlley?: string;
  /** Invite-only is the only mode that ships; open doors are "Soon". */
  isOpen: boolean;
  doorsOpen: boolean;
  inviteCode: string;
  codeExpiresInDays: number;
  yourRole: 'owner' | 'moderator' | 'member';
  members: Member[];
  unread: number;
  lastMessage: string;
  lastActivity: string;
  /** A warm tile sets this group apart in the list. */
  warmTile?: boolean;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  /** Their profile picture, when they have set one. */
  photo?: string | null;
  time: string;
  body: string;
  /** A game shared to the board; the chat carries a link to it. */
  sharedScore?: { score: number; strikes: number; spares: number; alley: string };
}

export interface SharedGame {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  /** Their profile picture, when they have set one. */
  photo?: string | null;
  /** The id the game has in its bowler's own store, for matching a local one. */
  localId: string;
  when: string;
  alley: string;
  score: number;
  strikes: number;
  spares: number;
  /** What the bowler wrote about it, if they shared that too. */
  note?: string;
  /** How many of the crew have hearted it, and whether you are one of them. */
  hearts: number;
  youHearted: boolean;
  /** Yours can be retracted; it stays in your own history either way. */
  isYours?: boolean;
  /**
   * The balls, and when they were thrown.
   *
   * Carried so a member's own page can count their season the same way the
   * analytics screen counts yours. Not `pinfalls` — leaves are not shared, and
   * a crew is not an audit — so a member's page can show frames and strikes
   * and never what they left.
   */
  rolls: number[];
  playedAt: number;
}

// ── Rows, as the database has them ─────────────────────────────────────────

export interface ProfileRow {
  id: string;
  name: string;
  initials: string;
  /**
   * A small square data URL, from migration 0003, or absent.
   *
   * Never selected in the joins that fetch a roster. It is read by
   * `loadAvatars` in a query of its own so that a database which has not had
   * 0003 applied loses the pictures rather than the crew screens — the same
   * call `loadSharedGames` makes about hearts.
   */
  avatar?: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  home_alley: string | null;
  invite_code: string;
  code_expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface MembershipRow {
  group_id: string;
  profile_id: string;
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
  profiles?: ProfileRow | null;
}

export interface SharedGameRow {
  id: string;
  group_id: string;
  profile_id: string;
  local_id: string;
  rolls: number[];
  total: number;
  house: string | null;
  note: string | null;
  played_at: string;
  created_at: string;
}

export interface ReactionRow {
  shared_game_id: string;
  profile_id: string;
  emoji: string;
}

export interface MessageRow {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  shared_game_id: string | null;
  created_at: string;
}

// ── Naming ─────────────────────────────────────────────────────────────────

/**
 * The two — or one — characters on an avatar.
 *
 * A name with no word break gets one character when it is written in a script
 * that does not use spaces, and two when it is Latin: ジョン is ジ, Madonna is
 * MA. Taking two of a Japanese given name reads as a fragment of a word rather
 * than as a monogram.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length > 1) return (words[0][0] + words[words.length - 1][0]).toUpperCase();

  const only = words[0];
  return /[A-Za-z]/.test(only) ? only.slice(0, 2).toUpperCase() : only.slice(0, 1);
}

// ── Turning shared games into a standing ───────────────────────────────────

/** How many recent games the rolling average and the improvement compare. */
const WINDOW = 10;

const mean = (scores: number[]) =>
  scores.length === 0 ? 0 : Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length);

/**
 * A bowler's line on the board, from the games they have shared with the crew.
 *
 * Only shared games count, and that is the honest reading: the board is what
 * the crew has been shown, not what somebody has bowled. A season kept private
 * is still a season — it simply is not evidence in a competition nobody entered
 * it into.
 */
export function standingFor(
  profile: ProfileRow,
  membership: MembershipRow,
  games: SharedGameRow[],
  isMe: boolean,
  now = Date.now(),
): Member {
  // Oldest first, so "the first ten" and "the last ten" mean what they say.
  const played = [...games].sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at));
  const scores = played.map((game) => game.total);

  const recent = mean(scores.slice(-WINDOW));
  const baseline = mean(scores.slice(0, WINDOW));

  const month = new Date(now);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).getTime();

  return {
    id: profile.id,
    name: profile.name,
    initials: profile.initials || initialsOf(profile.name),
    photo: profile.avatar ?? null,
    role: membership.role,
    avg: recent,
    high: scores.length === 0 ? 0 : Math.max(...scores),
    // The month's total, which rewards showing up rather than peaking.
    pins: played
      .filter((game) => Date.parse(game.played_at) >= monthStart)
      .reduce((sum, game) => sum + game.total, 0),
    hdcp: handicap(recent),
    // Against their own start, not against the crew: somebody eight games in
    // has no baseline worth the name, so it reads as no movement rather than
    // as a wild swing.
    imp: played.length < WINDOW * 2 ? 0 : recent - baseline,
    games: played.length,
    since:
      played.length > 0
        ? formatMonthYear(Date.parse(played[0].played_at))
        : formatMonthYear(Date.parse(membership.joined_at)),
    isMe: isMe || undefined,
  };
}

/**
 * Average plus handicap, so a 150 bowler and a 200 bowler share one board.
 *
 * 90% of the gap to 220, which is the formula the design handoff names. Nobody
 * over the basis gets a negative handicap — it stops at their own average.
 */
export function handicap(average: number): number {
  if (average >= 220) return average;
  return average + Math.round((220 - average) * 0.9);
}

/** Days until an invite code stops working; 0 once it has. */
export function daysUntil(expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return 0;
  const left = Date.parse(expiresAt) - now;
  return left <= 0 ? 0 : Math.ceil(left / 86_400_000);
}

/** Every row a crew's screens need, assembled into the shape they render. */
export function toGroup(
  row: GroupRow,
  memberships: MembershipRow[],
  games: SharedGameRow[],
  me: string,
  unread: number,
  lastMessage: string,
  now = Date.now(),
): Group {
  const byProfile = new Map<string, SharedGameRow[]>();
  for (const game of games) {
    const list = byProfile.get(game.profile_id);
    if (list) list.push(game);
    else byProfile.set(game.profile_id, [game]);
  }

  const mine = memberships.find((m) => m.profile_id === me);

  return {
    id: row.id,
    name: row.name,
    initials: initialsOf(row.name),
    homeAlley: row.home_alley ?? undefined,
    // Open doors are still "Soon" in the design, and there is no column for it
    // — so this says the true thing rather than reserving a maybe.
    isOpen: false,
    doorsOpen: true,
    inviteCode: row.invite_code,
    codeExpiresInDays: daysUntil(row.code_expires_at, now),
    yourRole: mine?.role ?? 'member',
    members: memberships
      .filter((m) => m.profiles)
      .map((m) =>
        standingFor(
          m.profiles as ProfileRow,
          m,
          byProfile.get(m.profile_id) ?? [],
          m.profile_id === me,
          now,
        ),
      ),
    unread,
    lastMessage,
    lastActivity: mine?.role === 'owner' ? 'you own it' : 'member',
  };
}

/**
 * A stored message, as the chat draws it.
 *
 * `posts` is the group's board by row id, and it is what turns a message that
 * merely *points* at a shared game into one that shows it. Optional, and a
 * pointer to a game that is not in it draws as a plain message: a post can be
 * retracted while its line in the chat stays, and a card reading "0, no alley"
 * would be worse than the sentence that is already there.
 */
export function toMessage(
  row: MessageRow,
  authors: Map<string, ProfileRow>,
  me: string,
  posts?: Map<string, SharedGameRow>,
): ChatMessage {
  const author = authors.get(row.author_id);
  const name = row.author_id === me ? 'You' : (author?.name ?? 'Someone');
  const post = row.shared_game_id ? posts?.get(row.shared_game_id) : undefined;
  const card = post ? scoreGame(post.rolls) : null;

  return {
    id: row.id,
    authorId: row.author_id,
    author: name,
    initials: author ? initialsOf(author.name) : '?',
    photo: author?.avatar ?? null,
    time: formatTime(Date.parse(row.created_at)),
    body: row.body,
    sharedScore:
      post && card
        ? {
            score: post.total,
            strikes: card.frames.filter((frame) => frame.isStrike).length,
            spares: card.frames.filter((frame) => frame.isSpare).length,
            alley: post.house ?? '',
          }
        : undefined,
  };
}

/** The one reaction the app sends. The column takes more; nothing offers them. */
export const HEART = '♥';

export interface HeartCount {
  hearts: number;
  youHearted: boolean;
}

/**
 * Hearts per post, from the crew's reaction rows.
 *
 * Counted on the client rather than read back as a Postgres aggregate: the
 * board already fetches every post it draws, the reactions for those posts are
 * a few dozen rows, and a `count` per post would be one round trip each. It
 * also keeps the definition of "you hearted this" in the same place as the
 * definition of an average — one file, testable without a database.
 */
export function heartsBy(rows: ReactionRow[], me: string): Map<string, HeartCount> {
  const out = new Map<string, HeartCount>();

  for (const row of rows) {
    const seen = out.get(row.shared_game_id) ?? { hearts: 0, youHearted: false };
    seen.hearts += 1;
    // The primary key is (post, profile, emoji), so a person can only be in
    // here once per emoji and this cannot double-count them.
    if (row.profile_id === me) seen.youHearted = true;
    out.set(row.shared_game_id, seen);
  }

  return out;
}

/** A posted game, as the shared-games board draws it. */
export function toSharedGame(
  row: SharedGameRow,
  authors: Map<string, ProfileRow>,
  me: string,
  hearts: Map<string, HeartCount> = new Map(),
): SharedGame {
  const card = scoreGame(row.rolls);
  const author = authors.get(row.profile_id);
  const reaction = hearts.get(row.id);

  return {
    id: row.id,
    authorId: row.profile_id,
    author: row.profile_id === me ? 'You' : (author?.name ?? 'Someone'),
    initials: author ? initialsOf(author.name) : '?',
    photo: author?.avatar ?? null,
    localId: row.local_id,
    // Through `datetime.ts`, which reads the app's language. `toLocaleDateString`
    // with `undefined` follows the *browser*, so a phone set to English put
    // "Aug 31" in the middle of a Japanese board — the one thing the notes say
    // not to do, in the one place that had gone on doing it.
    when: formatDay(Date.parse(row.played_at)),
    alley: row.house ?? '',
    rolls: row.rolls,
    playedAt: Date.parse(row.played_at),
    score: row.total,
    strikes: card.frames.filter((frame) => frame.isStrike).length,
    spares: card.frames.filter((frame) => frame.isSpare).length,
    note: row.note ?? undefined,
    hearts: reaction?.hearts ?? 0,
    youHearted: reaction?.youHearted ?? false,
    isYours: row.profile_id === me || undefined,
  };
}

export interface Activity {
  text: string;
  time: string;
  tone: 'accent' | 'neutral' | 'down';
}

/**
 * What the crew has been doing, from what it has been shown.
 *
 * Derived rather than stored: an activity table would be a second record of
 * things the shared games already say, free to disagree with them the first
 * time a post is retracted. The consequence is that only sharing shows up
 * here — joining and leaving do not — which is the honest limit of deriving it
 * from one table, and better than a feed that has to be kept in step by hand.
 */
export function activityFrom(posts: SharedGame[], best = 0): Activity[] {
  return posts.slice(0, 6).map((post) => ({
    text:
      post.score >= best && best > 0
        ? `${post.author} shared a ${post.score} — crew record`
        : `${post.author} shared a ${post.score}`,
    time: post.when,
    tone: post.score >= 200 ? 'accent' : 'neutral',
  }));
}

// ── Unread, kept on the device ─────────────────────────────────────────────
//
// A read marker is per-person *and* per-device — a message read on a phone is
// not read on a tablet — and it changes every time a chat is opened. Putting it
// in Postgres would mean a write on every screen open for a number nobody else
// can see. localStorage is the right home for it.

const READ_KEY = 'lane-log.read';

function readMarks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function markRead(groupId: string, at = Date.now()): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({ ...readMarks(), [groupId]: at }));
  } catch {
    // A private window: every visit will simply look like it has unread mail.
  }
}

/** Forget every read marker on this device. Part of a full reset. */
export function forgetReadMarks(): void {
  try {
    localStorage.removeItem(READ_KEY);
  } catch {
    // Nothing stored, or nothing storable.
  }
}

export function lastReadAt(groupId: string): number {
  return readMarks()[groupId] ?? 0;
}

/** Messages posted by somebody else since this device last opened the chat. */
export function countUnread(rows: MessageRow[], groupId: string, me: string): number {
  const since = lastReadAt(groupId);
  return rows.filter((row) => row.author_id !== me && Date.parse(row.created_at) > since).length;
}

// ── Talking to the server ──────────────────────────────────────────────────

/** The crews you are in, with just enough to draw the list. */
export async function listGroups(me: string): Promise<Group[]> {
  const db = await backend();
  const { data, error } = await db
    .from('memberships')
    .select('group_id, profile_id, role, joined_at, groups(*)')
    .eq('profile_id', me);
  if (error) throw error;

  const rows = (data ?? []) as unknown as (MembershipRow & { groups: GroupRow | null })[];
  const ids = rows.map((row) => row.group_id);
  if (ids.length === 0) return [];

  // One query for every crew's roster and one for their chat, rather than two
  // per crew: a list of five groups is otherwise eleven round trips on a phone.
  const [rosters, messages] = await Promise.all([
    db
      .from('memberships')
      .select('group_id, profile_id, role, joined_at, profiles(id, name, initials)')
      .in('group_id', ids),
    db
      .from('messages')
      .select('id, group_id, author_id, body, shared_game_id, created_at')
      .in('group_id', ids)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (rosters.error) throw rosters.error;
  if (messages.error) throw messages.error;

  const byGroup = groupBy((rosters.data ?? []) as unknown as MembershipRow[], (m) => m.group_id);
  const chat = groupBy((messages.data ?? []) as unknown as MessageRow[], (m) => m.group_id);

  return rows
    .filter((row) => row.groups)
    .map((row) => {
      const said = chat.get(row.group_id) ?? [];
      return toGroup(
        row.groups as GroupRow,
        byGroup.get(row.group_id) ?? [],
        [],
        me,
        countUnread(said, row.group_id, me),
        said[0]?.body ?? '',
      );
    });
}

/** One crew, with the roster and the games behind its board. */
export async function loadGroup(groupId: string, me: string): Promise<Group | null> {
  const db = await backend();
  const [group, roster, games, messages] = await Promise.all([
    db.from('groups').select('*').eq('id', groupId).maybeSingle(),
    db
      .from('memberships')
      .select('group_id, profile_id, role, joined_at, profiles(id, name, initials)')
      .eq('group_id', groupId),
    db.from('shared_games').select('*').eq('group_id', groupId),
    db
      .from('messages')
      .select('id, group_id, author_id, body, shared_game_id, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (group.error) throw group.error;
  if (roster.error) throw roster.error;
  if (games.error) throw games.error;
  if (messages.error) throw messages.error;
  if (!group.data) return null;

  const said = (messages.data ?? []) as unknown as MessageRow[];
  const roles = (roster.data ?? []) as unknown as MembershipRow[];

  // The pictures, patched onto the nested profiles the join came back with.
  const avatars = await loadAvatars(roles.map((row) => row.profile_id));
  for (const row of roles) {
    const avatar = row.profiles && avatars.get(row.profiles.id);
    if (avatar) row.profiles = { ...row.profiles!, avatar };
  }

  return toGroup(
    group.data as GroupRow,
    roles,
    (games.data ?? []) as unknown as SharedGameRow[],
    me,
    countUnread(said, groupId, me),
    said[0]?.body ?? '',
  );
}

/**
 * Make a crew and return it, invite code and all.
 *
 * The RPC hands back an id, and the screen that called it immediately needs
 * the code to show — so the read happens here rather than leaving every caller
 * to remember it. `loadGroup` cannot return null for a group this account just
 * created and is by definition the owner of.
 */
export async function createGroup(name: string, homeAlley?: string, me = ''): Promise<Group> {
  const db = await backend();
  const { data, error } = await db.rpc('create_group', {
    group_name: name,
    alley: homeAlley ?? null,
  });
  if (error) throw error;

  const group = await loadGroup(data as string, me);
  if (!group) throw new Error('The crew was created but could not be read back.');
  return group;
}

export async function joinGroup(code: string): Promise<string> {
  const db = await backend();
  const { data, error } = await db.rpc('join_group', { code });
  if (error) throw error;
  return data as string;
}

export async function rotateInviteCode(groupId: string): Promise<string> {
  const db = await backend();
  const { data, error } = await db.rpc('rotate_invite_code', { gid: groupId });
  if (error) throw error;
  return data as string;
}

/**
 * Rename a crew, or move its home alley.
 *
 * `groups_update` is the policy behind it, and it is the owner's — the settings
 * screen disables the fields for anybody else rather than letting Postgres
 * refuse a change that has already been typed.
 */
export async function updateGroup(
  groupId: string,
  changes: { name?: string; homeAlley?: string },
): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (changes.name !== undefined) patch.name = changes.name.trim().slice(0, 60);
  if (changes.homeAlley !== undefined) patch.home_alley = changes.homeAlley.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const db = await backend();
  const { error } = await db.from('groups').update(patch).eq('id', groupId);
  if (error) throw error;
}

/**
 * Delete a crew outright.
 *
 * Everything below it goes with it: the roster, the chat, the board and its
 * reactions are all `on delete cascade` from `groups`. Nobody's *games* go —
 * those live in each bowler's own IndexedDB and were only ever referenced from
 * here, which is the whole reason sharing was built to hand over a reference.
 *
 * Owner only, and that is enforced in the database rather than here; see
 * migration 0004, which had to be written because the check the original
 * policy used also let a moderator do this.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const db = await backend();
  const { error } = await db.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

/**
 * Change what somebody may do in the crew.
 *
 * Owner is offered too, and has to be: an owner who is the only owner cannot
 * leave without stranding the crew, so handing over is the way out that is not
 * deleting everything. Making a second owner does not unmake the first — they
 * can still demote whoever they promoted, right up until they leave.
 */
export async function setMemberRole(
  groupId: string,
  profileId: string,
  role: 'owner' | 'moderator' | 'member',
): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('memberships')
    .update({ role })
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

/**
 * Take somebody off the roster.
 *
 * Their posts and their messages stay. `shared_games` and `messages` cascade
 * from `profiles`, not from `memberships`, so removing a member is removing
 * their access and not editing the record of a season — which is the right way
 * round, and is what the screen says it does.
 */
export async function removeMember(groupId: string, profileId: string): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

/**
 * Get out of every crew.
 *
 * The ones you own are *deleted* rather than abandoned, and that is the honest
 * reading of leaving them: a crew whose only owner walks away is a board nobody
 * can rename, moderate or close. Anyone who would rather keep one hands it over
 * first — the settings screen has the button — and the confirmation says how
 * many crews this is about to end for everybody else.
 *
 * Keeps going past a failure and reports the totals: a crew that refuses to go
 * must not strand the rest of a reset half done.
 */
export async function leaveEverything(me: string): Promise<{ left: number; deleted: number }> {
  const groups = await listGroups(me);

  let left = 0;
  let deleted = 0;

  for (const group of groups) {
    try {
      if (group.yourRole === 'owner') {
        await deleteGroup(group.id);
        deleted += 1;
      } else {
        await leaveGroup(group.id, me);
        left += 1;
      }
    } catch {
      // Counted by omission. The caller reports what went, not what did not.
    }
  }

  return { left, deleted };
}

/**
 * Put the crew-facing profile back to nothing.
 *
 * The row itself stays: it hangs off `auth.users` and only the account holder's
 * own provider can remove that. What can go is everything anybody else ever saw
 * — the name and the picture.
 */
export async function resetMyProfile(me: string): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('profiles')
    .update({ name: 'Bowler', initials: '', avatar: null })
    .eq('id', me);
  if (error) throw error;
}

export async function leaveGroup(groupId: string, me: string): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', me);
  if (error) throw error;
}

// ── Chat ───────────────────────────────────────────────────────────────────

export interface Thread {
  messages: ChatMessage[];
  /**
   * The crew, by profile id.
   *
   * Handed back with the messages because a row arriving live carries an
   * author id and nothing else — without this the sender of every incoming
   * message reads as "Someone" until the screen is opened again.
   */
  authors: Map<string, ProfileRow>;
  /** The board, by row id, for the messages that point at a game. */
  posts: Map<string, SharedGameRow>;
}

export async function loadMessages(groupId: string, me: string): Promise<Thread> {
  const db = await backend();
  const [messages, roster, board] = await Promise.all([
    db
      .from('messages')
      .select('id, group_id, author_id, body, shared_game_id, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(300),
    db.from('memberships').select('profiles(id, name, initials)').eq('group_id', groupId),
    // The whole board rather than the posts these messages name: a crew's board
    // is tens of rows, the ids are only known after the messages come back, and
    // waiting for one query to start the other doubles the time to first paint.
    db.from('shared_games').select('*').eq('group_id', groupId),
  ]);
  if (messages.error) throw messages.error;
  if (roster.error) throw roster.error;
  if (board.error) throw board.error;

  const authors = authorMap(roster.data);
  withAvatars(authors, await loadAvatars([...authors.keys()]));

  const posts = new Map(
    ((board.data ?? []) as unknown as SharedGameRow[]).map((row) => [row.id, row]),
  );

  return {
    messages: ((messages.data ?? []) as unknown as MessageRow[]).map((row) =>
      toMessage(row, authors, me, posts),
    ),
    authors,
    posts,
  };
}

export async function sendMessage(
  groupId: string,
  me: string,
  body: string,
  sharedGameId?: string,
): Promise<void> {
  const db = await backend();
  const { error } = await db.from('messages').insert({
    group_id: groupId,
    author_id: me,
    body: body.trim(),
    shared_game_id: sharedGameId ?? null,
  });
  if (error) throw error;
}

/**
 * Live messages, for as long as the chat is open.
 *
 * Returns its own unsubscribe. Realtime respects the same policies as a query,
 * so a socket cannot deliver a row a `select` would have refused.
 */
export function watchMessages(groupId: string, onInsert: (row: MessageRow) => void): () => void {
  // Returns its unsubscribe synchronously, because a React effect cleanup
  // cannot wait for one — and the chat can be closed before the socket has
  // finished opening, which is exactly what `closed` is for.
  let closed = false;
  let channel: RealtimeChannel | null = null;

  void backend().then((db) => {
    if (closed) return;
    channel = db
      .channel(`messages:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload) => onInsert(payload.new as MessageRow),
      )
      .subscribe();
  });

  return () => {
    closed = true;
    if (channel) void backend().then((db) => db.removeChannel(channel as RealtimeChannel));
  };
}

/**
 * New posts on a crew's board, as they land.
 *
 * The twin of `watchMessages`, and it exists for the same reason: the crew
 * screens are the only part of the app that can be *told* something happened
 * rather than having to ask. What listens to it is the alerting in `App`,
 * which is the whole of what notifications can be without a push server.
 */
export function watchSharedGames(
  groupId: string,
  onInsert: (row: SharedGameRow) => void,
): () => void {
  let closed = false;
  let channel: RealtimeChannel | null = null;

  void backend().then((db) => {
    if (closed) return;
    channel = db
      .channel(`shared:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_games', filter: `group_id=eq.${groupId}` },
        (payload) => onInsert(payload.new as SharedGameRow),
      )
      .subscribe();
  });

  return () => {
    closed = true;
    if (channel) void backend().then((db) => db.removeChannel(channel as RealtimeChannel));
  };
}

// ── Shared games ───────────────────────────────────────────────────────────

export async function loadSharedGames(groupId: string, me: string): Promise<SharedGame[]> {
  const db = await backend();
  const [games, roster] = await Promise.all([
    db
      .from('shared_games')
      .select('*')
      .eq('group_id', groupId)
      .order('played_at', { ascending: false }),
    db.from('memberships').select('profiles(id, name, initials)').eq('group_id', groupId),
  ]);
  if (games.error) throw games.error;
  if (roster.error) throw roster.error;

  const authors = authorMap(roster.data);
  withAvatars(authors, await loadAvatars([...authors.keys()]));

  const rows = (games.data ?? []) as unknown as SharedGameRow[];

  // Reactions come second because the query needs the post ids, and they are
  // asked for by id rather than by group: `reactions` has no group column, and
  // its RLS policy joins through to one, so a filter it cannot see would be a
  // whole-table scan the policy then throws most of away.
  const reactions =
    rows.length === 0
      ? []
      : await db
          .from('reactions')
          .select('shared_game_id, profile_id, emoji')
          .in(
            'shared_game_id',
            rows.map((row) => row.id),
          )
          .then(({ data, error }) => {
            // A board that draws without its hearts is worth more than one
            // that fails to draw at all.
            if (error) return [] as ReactionRow[];
            return (data ?? []) as unknown as ReactionRow[];
          });

  const hearts = heartsBy(reactions, me);
  return rows.map((row) => toSharedGame(row, authors, me, hearts));
}

/**
 * Heart a post, or take it back.
 *
 * A delete of a row that is not there succeeds, and an insert of one that is
 * conflicts — so the caller's idea of the current state does not have to be
 * right for the outcome to be. `ignoreDuplicates` makes a second tap on an
 * already-hearted post a no-op rather than an error the screen has to explain.
 */
export async function setHeart(sharedGameId: string, me: string, on: boolean): Promise<void> {
  const db = await backend();

  if (!on) {
    const { error } = await db
      .from('reactions')
      .delete()
      .eq('shared_game_id', sharedGameId)
      .eq('profile_id', me)
      .eq('emoji', HEART);
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from('reactions')
    .upsert(
      { shared_game_id: sharedGameId, profile_id: me, emoji: HEART },
      { onConflict: 'shared_game_id,profile_id,emoji', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export interface ShareInput {
  groupId: string;
  me: string;
  /** The id the game has in this device's own store. */
  localId: string;
  rolls: number[];
  total: number;
  house?: string;
  note?: string;
  playedAt: number;
}

/**
 * Post a game to a crew.
 *
 * Upserts on (crew, bowler, local game): correcting a frame and sharing again
 * updates the post rather than putting the same night on the board twice.
 */
export async function shareGame(input: ShareInput): Promise<SharedGameRow> {
  const db = await backend();
  const { data, error } = await db
    .from('shared_games')
    .upsert(
      {
        group_id: input.groupId,
        profile_id: input.me,
        local_id: input.localId,
        rolls: input.rolls,
        total: input.total,
        house: input.house ?? null,
        note: input.note ?? null,
        played_at: new Date(input.playedAt).toISOString(),
      },
      { onConflict: 'group_id,profile_id,local_id' },
    )
    // Read the row back: the chat needs the id the board gave this post before
    // it can write a message pointing at it, and sharing the same game twice
    // has to give the same id both times.
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as SharedGameRow;
}

export async function unshareGame(groupId: string, me: string, localId: string): Promise<void> {
  const db = await backend();
  const { error } = await db
    .from('shared_games')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', me)
    .eq('local_id', localId);
  if (error) throw error;
}

// ── Small shared helpers ───────────────────────────────────────────────────

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * The crew's profile pictures, by profile id.
 *
 * A query of its own rather than another column on the roster join, and that is
 * deliberate. `avatar` arrives with migration 0003; a database that has not had
 * it applied would fail *every* roster query if the column were named in the
 * join, taking the boards, the chat and the member screens with it. Asked for
 * separately, a missing column costs the pictures and nothing else — the same
 * trade `loadSharedGames` makes for its hearts.
 */
export async function loadAvatars(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  try {
    const db = await backend();
    const { data, error } = await db.from('profiles').select('id, avatar').in('id', ids);
    if (error) return new Map();

    const out = new Map<string, string>();
    for (const row of (data ?? []) as { id: string; avatar: string | null }[]) {
      // Rendered straight into an `<img src>`, so anything that is not a data
      // URL for an image is dropped here as well as by the column's own check.
      if (row.avatar && row.avatar.startsWith('data:image/')) out.set(row.id, row.avatar);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Put the pictures onto the profiles a roster query came back with. */
export function withAvatars(
  authors: Map<string, ProfileRow>,
  avatars: Map<string, string>,
): Map<string, ProfileRow> {
  for (const [id, profile] of authors) {
    const avatar = avatars.get(id);
    if (avatar) authors.set(id, { ...profile, avatar });
  }
  return authors;
}

/**
 * Push this device's profile to the crew.
 *
 * Until now nothing wrote `profiles` at all: the name a crew saw was whatever
 * Google handed over at sign-up, and the name field in Settings was local only.
 * A picture makes that gap obvious — there would be no way to send one — so the
 * name and the initials go up with it.
 *
 * The retry is for a database still on migration 0002. Losing the picture on
 * one of those is expected; losing the name with it would not be.
 */
export async function saveMyProfile(
  me: string,
  profile: { name: string; initials: string; avatar: string | null },
): Promise<void> {
  const db = await backend();
  const named = { name: profile.name.trim().slice(0, 60) || 'Bowler', initials: profile.initials };

  const { error } = await db
    .from('profiles')
    .update({ ...named, avatar: profile.avatar })
    .eq('id', me);
  if (!error) return;

  const retry = await db.from('profiles').update(named).eq('id', me);
  if (retry.error) throw retry.error;
}

/** PostgREST returns the joined profile nested; flatten it into a lookup. */
export function authorMap(rows: unknown): Map<string, ProfileRow> {
  const out = new Map<string, ProfileRow>();
  for (const row of (rows ?? []) as { profiles?: ProfileRow | null }[]) {
    if (row.profiles) out.set(row.profiles.id, row.profiles);
  }
  return out;
}
