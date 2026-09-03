/**
 * When the crew is bowling, and who is coming.
 *
 * The one thing a bowling crew actually organises. It is a calendar and a list
 * of names, and the only part with any thinking in it is the grid: a month has
 * to be drawn as whole weeks, which means days either side of it, and those
 * days have to be visibly not part of the month or the first Tuesday of next
 * month becomes this month's league night.
 *
 * Everything above the database half is pure. The rows come from Postgres;
 * nothing about laying out a month or counting who said yes belongs there.
 */

import { backend } from './backend';

export type Rsvp = 'in' | 'out';

export interface CrewEvent {
  id: string;
  groupId: string;
  creatorId: string;
  title: string;
  /** Where, as free text. The house field everywhere else in the app. */
  house: string;
  startsAt: number;
  /** What was said about it — lanes booked, bring your own shoes. */
  note: string;
  createdAt: number;
}

export interface EventReply {
  eventId: string;
  memberId: string;
  status: Rsvp;
}

export interface EventAttendance {
  /** Members who said they are coming, in the roster order given. */
  going: string[];
  /** Members who said they are not. */
  out: string[];
  /** Members who have not said either way — the ones worth chasing. */
  quiet: string[];
  /** What you said, or null if you have not. */
  yours: Rsvp | null;
}

/**
 * Who is coming, out of a roster.
 *
 * Three groups rather than two, because "has not answered" is the useful one:
 * a crew of six with two yeses tells you nothing until you know whether the
 * other four said no or are simply asleep.
 */
export function attendance(
  replies: EventReply[],
  eventId: string,
  memberIds: string[],
  me: string,
): EventAttendance {
  const byMember = new Map<string, Rsvp>();
  for (const reply of replies) {
    if (reply.eventId === eventId) byMember.set(reply.memberId, reply.status);
  }

  return {
    going: memberIds.filter((id) => byMember.get(id) === 'in'),
    out: memberIds.filter((id) => byMember.get(id) === 'out'),
    quiet: memberIds.filter((id) => !byMember.has(id)),
    yours: byMember.get(me) ?? null,
  };
}

export type EventWhen = 'past' | 'today' | 'upcoming';

/**
 * Past, today, or still to come.
 *
 * By *day*, not by instant: an event at seven this evening is still "today" at
 * eight, because somebody looking at the screen at eight wants to see it — it
 * is where they are — and a list that drops it the moment it starts is a list
 * that hides the thing you are at.
 */
export function eventWhen(event: CrewEvent, now = Date.now()): EventWhen {
  const day = startOfDay(event.startsAt);
  const today = startOfDay(now);
  if (day < today) return 'past';
  return day === today ? 'today' : 'upcoming';
}

export function startOfDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `YYYY-MM-DD` in local time, which is how a grid cell is keyed. */
export function dayKeyOf(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface CalendarDay {
  key: string;
  at: number;
  dayOfMonth: number;
  /** False for the days either side that fill the first and last weeks. */
  inMonth: boolean;
  isToday: boolean;
  events: CrewEvent[];
}

/**
 * A month as whole weeks.
 *
 * Always six rows. A month can span five or six depending on where its first
 * day falls, and a grid that changes height as you page through the year makes
 * everything under it jump — which on a phone means the thing you were about
 * to tap moves.
 *
 * `weekStartsOn` is Sunday by default rather than discovered: both of the app's
 * languages are read mostly on Sunday-first calendars (ja-JP and en-US), and
 * `Intl.Locale.weekInfo` is not carried by every browser this has to run in.
 * It is a parameter so that is a decision rather than an assumption.
 */
export function monthGrid(
  year: number,
  month: number,
  events: CrewEvent[],
  now = Date.now(),
  weekStartsOn: 0 | 1 = 0,
): CalendarDay[][] {
  const byDay = new Map<string, CrewEvent[]>();
  for (const event of events) {
    const key = dayKeyOf(event.startsAt);
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt - b.startsAt);

  const first = new Date(year, month, 1);
  // How far back the grid has to start to open on `weekStartsOn`.
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - lead);
  const todayKey = dayKeyOf(now);

  const weeks: CalendarDay[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: CalendarDay[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day);
      const key = dayKeyOf(date.getTime());
      row.push({
        key,
        at: date.getTime(),
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === month && date.getFullYear() === year,
        isToday: key === todayKey,
        events: byDay.get(key) ?? [],
      });
    }
    weeks.push(row);
  }

  return weeks;
}

/**
 * The events still to come, soonest first, then the ones that have been.
 *
 * Two lists rather than one sorted list: a crew opens this to find out what is
 * next, and putting last Tuesday above it because it sorts earlier is the
 * wrong answer to the question being asked.
 */
export function splitByWhen(
  events: CrewEvent[],
  now = Date.now(),
): { ahead: CrewEvent[]; past: CrewEvent[] } {
  const ahead: CrewEvent[] = [];
  const past: CrewEvent[] = [];

  for (const event of events) {
    if (eventWhen(event, now) === 'past') past.push(event);
    else ahead.push(event);
  }

  ahead.sort((a, b) => a.startsAt - b.startsAt);
  past.sort((a, b) => b.startsAt - a.startsAt);
  return { ahead, past };
}

export interface EventDraft {
  title: string;
  house: string;
  startsAt: number;
  note: string;
}

/** Why a draft is not an event yet, or null when it is. */
export function problemWithEvent(draft: EventDraft): string | null {
  if (!draft.title.trim()) return 'Give it a name.';
  if (draft.title.trim().length > 80) return 'That name is too long.';
  if (draft.house.length > 80) return 'That place name is too long.';
  if (draft.note.length > 500) return 'That note is too long.';
  if (!Number.isFinite(draft.startsAt)) return 'That is not a date and time.';
  return null;
}

/**
 * Who may change or cancel it.
 *
 * The person who put it up, or the crew's owner. Same reasoning as a
 * challenge: a night out with six people counting on it is not a post to be
 * moderated.
 */
export function canManage(event: CrewEvent, viewerId: string, ownerId: string | null): boolean {
  return viewerId === event.creatorId || viewerId === ownerId;
}

// ── The database half ──────────────────────────────────────────────────────

interface EventRow {
  id: string;
  group_id: string;
  creator_id: string;
  title: string;
  house: string;
  starts_at: string;
  note: string;
  created_at: string;
}

interface ReplyRow {
  event_id: string;
  profile_id: string;
  status: Rsvp;
}

function toEvent(row: EventRow): CrewEvent {
  return {
    id: row.id,
    groupId: row.group_id,
    creatorId: row.creator_id,
    title: row.title,
    house: row.house ?? '',
    startsAt: Date.parse(row.starts_at),
    note: row.note ?? '',
    createdAt: Date.parse(row.created_at),
  };
}

/**
 * A crew's calendar, and who has answered.
 *
 * One call for both, because a list of events with nobody's name against them
 * is not worth drawing — and empty on any failure, for the same reason
 * `loadChallenges` is: migration 0005 lands after crews already exist, and a
 * database still on 0004 must lose the calendar and nothing else.
 */
export async function loadEvents(
  groupId: string,
): Promise<{ events: CrewEvent[]; replies: EventReply[] }> {
  try {
    const db = await backend();
    const { data, error } = await db
      .from('crew_events')
      .select('*')
      .eq('group_id', groupId)
      .order('starts_at', { ascending: true });

    if (error) return { events: [], replies: [] };
    const events = (data as EventRow[]).map(toEvent);
    if (events.length === 0) return { events, replies: [] };

    // Allowed to fail on its own: a calendar that draws without its replies
    // beats one that does not draw. Same trade the board makes for hearts.
    const { data: rows } = await db
      .from('event_replies')
      .select('event_id, profile_id, status')
      .in(
        'event_id',
        events.map((event) => event.id),
      );

    const replies = ((rows ?? []) as ReplyRow[]).map((row) => ({
      eventId: row.event_id,
      memberId: row.profile_id,
      status: row.status,
    }));

    return { events, replies };
  } catch {
    return { events: [], replies: [] };
  }
}

export async function createEvent(
  groupId: string,
  me: string,
  draft: EventDraft,
): Promise<CrewEvent> {
  const problem = problemWithEvent(draft);
  if (problem) throw new Error(problem);

  const db = await backend();
  const { data, error } = await db
    .from('crew_events')
    .insert({
      group_id: groupId,
      creator_id: me,
      title: draft.title.trim(),
      house: draft.house.trim(),
      starts_at: new Date(draft.startsAt).toISOString(),
      note: draft.note.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return toEvent(data as EventRow);
}

/** Move a night, or rename it. What "when decided different" means. */
export async function updateEvent(id: string, draft: EventDraft): Promise<void> {
  const problem = problemWithEvent(draft);
  if (problem) throw new Error(problem);

  const db = await backend();
  const { error } = await db
    .from('crew_events')
    .update({
      title: draft.title.trim(),
      house: draft.house.trim(),
      starts_at: new Date(draft.startsAt).toISOString(),
      note: draft.note.trim(),
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await backend();
  const { error } = await db.from('crew_events').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Say whether you are coming, or take back having said.
 *
 * An upsert rather than an insert, because changing your mind is the normal
 * case: the table's primary key is (event, person) precisely so that saying yes
 * twice is not two people.
 */
export async function reply(eventId: string, me: string, status: Rsvp | null): Promise<void> {
  const db = await backend();

  if (status === null) {
    const { error } = await db
      .from('event_replies')
      .delete()
      .eq('event_id', eventId)
      .eq('profile_id', me);
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from('event_replies')
    .upsert(
      { event_id: eventId, profile_id: me, status, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,profile_id' },
    );
  if (error) throw error;
}
