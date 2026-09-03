import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { t, tf } from '../lib/i18n';
import {
  dateLocale,
  formatLongDate,
  formatTime,
  fromInputs,
  toDateInput,
  toTimeInput,
} from '../lib/datetime';
import {
  attendance,
  canManage,
  createEvent,
  dayKeyOf,
  deleteEvent,
  eventWhen,
  loadEvents,
  monthGrid,
  problemWithEvent,
  reply,
  splitByWhen,
  updateEvent,
  type CrewEvent,
  type EventReply,
  type Rsvp,
} from '../lib/events';
import type { Group } from '../lib/social';

interface Props {
  group: Group;
  me: string;
}

const EMPTY_DRAFT = { title: '', house: '', day: '', time: '19:00', note: '' };

/**
 * When the crew is bowling.
 *
 * A month, then the nights themselves. The grid is for finding a date and the
 * list is for reading one, and they are both here because they answer different
 * questions: "are we free on the 20th" and "what is next".
 *
 * Everything the calendar knows is on the server, so this screen is one of the
 * few in the app that cannot work offline at all — which is why the crew tab it
 * sits under already says so.
 */
export function EventsScreen({ group, me }: Props) {
  const [events, setEvents] = useState<CrewEvent[]>([]);
  const [replies, setReplies] = useState<EventReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  /**
   * The day being read, or null for "everything coming up".
   *
   * Null to start with, deliberately. Opening on today means the first thing
   * the screen says is "nothing on this day" — on the very common day when
   * nothing is on — while two nights sit further down the month unmentioned.
   * The question somebody brings to a calendar is what is next; picking a date
   * is the deliberate act, so it is the one that takes a tap.
   */
  const [selected, setSelected] = useState<string | null>(null);

  /** The event being edited, '' for a new one, or null when the form is shut. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const refresh = useCallback(() => {
    setLoading(true);
    loadEvents(group.id).then(
      (loaded) => {
        setEvents(loaded.events);
        setReplies(loaded.replies);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [group.id]);

  useEffect(refresh, [refresh]);

  const memberIds = useMemo(() => group.members.map((member) => member.id), [group.members]);
  const owner = useMemo(
    () => group.members.find((member) => member.role === 'owner')?.id ?? null,
    [group.members],
  );
  const grid = useMemo(
    () => monthGrid(month.year, month.month, events),
    [month.year, month.month, events],
  );
  const { ahead, past } = useMemo(() => splitByWhen(events), [events]);

  /** The nights the list shows: the picked day, or everything still to come. */
  const listed = selected
    ? events.filter((event) => dayKeyOf(event.startsAt) === selected).sort((a, b) => a.startsAt - b.startsAt)
    : ahead;

  const asDraft = {
    title: draft.title,
    house: draft.house,
    startsAt: fromInputs(draft.day, draft.time) ?? Number.NaN,
    note: draft.note,
  };
  const problem = editing !== null ? problemWithEvent(asDraft) : null;

  function openFor(day: string | null) {
    setDraft({ ...EMPTY_DRAFT, day: day ?? toDateInput(Date.now()) });
    setEditing('');
    setError(null);
  }

  function openEdit(event: CrewEvent) {
    setDraft({
      title: event.title,
      house: event.house,
      day: toDateInput(event.startsAt),
      time: toTimeInput(event.startsAt),
      note: event.note,
    });
    setEditing(event.id);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateEvent(editing, asDraft);
      else await createEvent(group.id, me, asDraft);
      setEditing(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteEvent(id);
      setEvents((current) => current.filter((one) => one.id !== id));
      setEditing(null);
    } catch {
      // Unchanged, which is the honest outcome of a delete that did not happen.
    } finally {
      setBusy(false);
    }
  }

  async function answer(eventId: string, status: Rsvp | null) {
    // Applied on the screen first: an RSVP that waits for a round trip on alley
    // wifi looks like a tap that missed.
    setReplies((current) => {
      const without = current.filter((r) => !(r.eventId === eventId && r.memberId === me));
      return status ? [...without, { eventId, memberId: me, status }] : without;
    });

    try {
      await reply(eventId, me, status);
    } catch {
      refresh();
    }
  }

  const weekdays = useMemo(() => {
    // Sunday-first, which is what `monthGrid` lays out by default.
    const base = new Date(2026, 2, 1); // a Sunday
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2026, 2, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'narrow' }),
    ).map((label, i) => ({ label, key: i, at: base }));
  }, []);

  if (loading) return <p className="empty">{t('Loading…')}</p>;

  return (
    <>
      <div className="card">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="iconbtn"
            aria-label={t('Previous month')}
            onClick={() =>
              setMonth(({ year, month: m }) =>
                m === 0 ? { year: year - 1, month: 11 } : { year, month: m - 1 },
              )
            }
          >
            {/* One chevron in the icon set, pointing right. Back is the same
                glyph turned round rather than a second path to keep in step. */}
            <Icon name="chevron" size={18} className="icon--back" />
          </button>
          <span style={{ fontSize: 15 }}>
            {new Date(month.year, month.month, 1).toLocaleDateString(dateLocale(), {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            type="button"
            className="iconbtn"
            aria-label={t('Next month')}
            onClick={() =>
              setMonth(({ year, month: m }) =>
                m === 11 ? { year: year + 1, month: 0 } : { year, month: m + 1 },
              )
            }
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>

        <div className="calendar">
          {weekdays.map((day) => (
            <span key={day.key} className="calendar__weekday">
              {day.label}
            </span>
          ))}

          {grid.flat().map((day) => (
            <button
              key={day.key}
              type="button"
              className={[
                'calendar__day',
                day.inMonth ? '' : 'calendar__day--outside',
                day.isToday ? 'calendar__day--today' : '',
                selected === day.key ? 'calendar__day--picked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${formatLongDate(day.at)}${day.events.length ? `, ${day.events.length}` : ''}`}
              aria-pressed={selected === day.key}
              onClick={() => setSelected(selected === day.key ? null : day.key)}
            >
              <span className="tnum">{day.dayOfMonth}</span>
              {day.events.length > 0 && <span className="calendar__dot" />}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="linkbtn linkbtn--centred"
          onClick={() => setSelected(selected ? null : dayKeyOf(Date.now()))}
        >
          {selected ? t('Show everything coming up') : t('Show one day')}
        </button>
      </div>

      {editing === null && (
        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={() => openFor(selected)}
        >
          <Icon name="plus" size={18} />
          {t('Put a night up')}
        </button>
      )}

      {editing !== null && (
        <div className="card">
          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">{t('What is it')}</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={draft.title}
              onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
              placeholder={t('League night')}
              maxLength={80}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">{t('Where')}</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={draft.house}
              onChange={(event) => setDraft((d) => ({ ...d, house: event.target.value }))}
              placeholder="Korona Bowl"
              maxLength={80}
            />
          </label>

          <div className="row" style={{ gap: 11, marginBottom: 11 }}>
            <label className="grow">
              <span className="hero__label">{t('Date')}</span>
              <input
                className="input tnum"
                style={{ marginTop: 5 }}
                type="date"
                value={draft.day}
                onChange={(event) => setDraft((d) => ({ ...d, day: event.target.value }))}
              />
            </label>
            <label className="grow">
              <span className="hero__label">{t('Time')}</span>
              <input
                className="input tnum"
                style={{ marginTop: 5 }}
                type="time"
                value={draft.time}
                onChange={(event) => setDraft((d) => ({ ...d, time: event.target.value }))}
              />
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">{t('Anything to say about it')}</span>
            <textarea
              className="input"
              style={{ marginTop: 5, minHeight: 60 }}
              value={draft.note}
              onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
              placeholder={t('Two lanes booked from seven')}
              rows={2}
              maxLength={500}
            />
          </label>

          {(problem || error) && <div className="note note--bad">{problem ?? error}</div>}

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={busy || problem !== null}
            onClick={() => void save()}
          >
            {busy ? t('Saving…') : editing ? t('Save the change') : t('Put it up')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={() => setEditing(null)}
          >
            {t('Cancel')}
          </button>
        </div>
      )}

      <h2 className="section-title">
        {selected ? formatLongDate(new Date(`${selected}T12:00`).getTime()) : t('Coming up')}
      </h2>

      {listed.length === 0 && (
        <p className="empty">
          {selected
            ? t('Nothing on this day.')
            : t('Nothing arranged yet. Put a night up and the crew can say if they are in.')}
        </p>
      )}

      {listed.map((event) => {
        const who = attendance(replies, event.id, memberIds, me);
        const when = eventWhen(event);

        return (
          <div key={event.id} className="card">
            <div className="row row--between" style={{ marginBottom: 4 }}>
              <span className="grow">
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>
                  {event.title}
                </span>
                <span className="muted tnum">
                  {formatTime(event.startsAt)}
                  {event.house && ` · ${event.house}`}
                </span>
              </span>
              {when !== 'past' && (
                <span className={`pill${when === 'today' ? ' pill--on' : ''}`}>
                  {when === 'today' ? t('Tonight') : t('Coming up')}
                </span>
              )}
            </div>

            {event.note && <p className="muted" style={{ margin: '6px 0 10px' }}>{event.note}</p>}

            <div className="row" style={{ gap: 8, margin: '10px 0' }}>
              {who.going.map((id) => {
                const member = group.members.find((one) => one.id === id);
                return member ? (
                  <Avatar
                    key={id}
                    initials={member.initials}
                    size={26}
                    isMe={member.isMe}
                    photo={member.photo}
                  />
                ) : null;
              })}
              <span className="muted grow">
                {who.going.length === 0
                  ? t('Nobody has said yes yet.')
                  : tf('{n} coming', { n: who.going.length })}
                {who.out.length > 0 && tf(' · {n} out', { n: who.out.length })}
                {who.quiet.length > 0 && tf(' · {n} quiet', { n: who.quiet.length })}
              </span>
            </div>

            {/* Only for a night that has not happened. Answering an invitation
                to last Tuesday is not a thing anybody wants to do. */}
            {when !== 'past' && (
              <div className="row" style={{ gap: 11 }}>
                <button
                  type="button"
                  className={`btn-lg grow${who.yours === 'in' ? ' btn-lg--primary' : ''}`}
                  onClick={() => void answer(event.id, who.yours === 'in' ? null : 'in')}
                >
                  {who.yours === 'in' ? t('You are in') : t("I'm in")}
                </button>
                <button
                  type="button"
                  className={`btn-lg grow${who.yours === 'out' ? ' btn-lg--danger' : ''}`}
                  onClick={() => void answer(event.id, who.yours === 'out' ? null : 'out')}
                >
                  {who.yours === 'out' ? t('You are out') : t("Can't make it")}
                </button>
              </div>
            )}

            {canManage(event, me, owner) && (
              <div className="row" style={{ gap: 11, marginTop: 11 }}>
                <button
                  type="button"
                  className="linkbtn grow"
                  onClick={() => openEdit(event)}
                >
                  {t('Change it')}
                </button>
                <button
                  type="button"
                  className="linkbtn grow"
                  disabled={busy}
                  onClick={() => void remove(event.id)}
                >
                  {t('Call it off')}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!selected && past.length > 0 && (
        <>
          <h2 className="section-title">{t('Already been')}</h2>
          {past.slice(0, 5).map((event) => (
            <div key={event.id} className="row row--between" style={{ padding: '8px 0' }}>
              <span className="grow">
                <span style={{ display: 'block', fontSize: 13 }}>{event.title}</span>
                <span className="muted tnum">
                  {formatLongDate(event.startsAt)}
                  {event.house && ` · ${event.house}`}
                </span>
              </span>
              <span className="tnum muted">
                {tf('{n} came', {
                  n: attendance(replies, event.id, memberIds, me).going.length,
                })}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
