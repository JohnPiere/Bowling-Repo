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
import type { Group, ChatMessage, SharedGame } from '../data/groups';
import type { Member } from './leaderboard';
import { scoreGame } from './scoring';
import { formatMonthYear, formatTime } from './datetime';

// ── Rows, as the database has them ─────────────────────────────────────────

export interface ProfileRow {
  id: string;
  name: string;
  initials: string;
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

/** A stored message, as the chat draws it. */
export function toMessage(
  row: MessageRow,
  authors: Map<string, ProfileRow>,
  me: string,
): ChatMessage {
  const author = authors.get(row.author_id);
  const name = row.author_id === me ? 'You' : (author?.name ?? 'Someone');

  return {
    id: row.id,
    authorId: row.author_id,
    author: name,
    initials: author ? initialsOf(author.name) : '?',
    time: formatTime(Date.parse(row.created_at)),
    body: row.body,
  };
}

/** A posted game, as the shared-games board draws it. */
export function toSharedGame(
  row: SharedGameRow,
  authors: Map<string, ProfileRow>,
  me: string,
): SharedGame {
  const card = scoreGame(row.rolls);
  const author = authors.get(row.profile_id);

  return {
    id: row.id,
    authorId: row.profile_id,
    author: row.profile_id === me ? 'You' : (author?.name ?? 'Someone'),
    initials: author ? initialsOf(author.name) : '?',
    when: new Date(row.played_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    alley: row.house ?? '',
    score: row.total,
    strikes: card.frames.filter((frame) => frame.isStrike).length,
    spares: card.frames.filter((frame) => frame.isSpare).length,
    isYours: row.profile_id === me || undefined,
  };
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

  return toGroup(
    group.data as GroupRow,
    (roster.data ?? []) as unknown as MembershipRow[],
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
}

export async function loadMessages(groupId: string, me: string): Promise<Thread> {
  const db = await backend();
  const [messages, roster] = await Promise.all([
    db
      .from('messages')
      .select('id, group_id, author_id, body, shared_game_id, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(300),
    db.from('memberships').select('profiles(id, name, initials)').eq('group_id', groupId),
  ]);
  if (messages.error) throw messages.error;
  if (roster.error) throw roster.error;

  const authors = authorMap(roster.data);
  return {
    messages: ((messages.data ?? []) as unknown as MessageRow[]).map((row) =>
      toMessage(row, authors, me),
    ),
    authors,
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
  return ((games.data ?? []) as unknown as SharedGameRow[]).map((row) =>
    toSharedGame(row, authors, me),
  );
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
export async function shareGame(input: ShareInput): Promise<void> {
  const db = await backend();
  const { error } = await db.from('shared_games').upsert(
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
  );
  if (error) throw error;
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

/** PostgREST returns the joined profile nested; flatten it into a lookup. */
export function authorMap(rows: unknown): Map<string, ProfileRow> {
  const out = new Map<string, ProfileRow>();
  for (const row of (rows ?? []) as { profiles?: ProfileRow | null }[]) {
    if (row.profiles) out.set(row.profiles.id, row.profiles);
  }
  return out;
}
