import { describe, expect, it } from 'vitest';
import {
  attendance,
  canManage,
  dayKeyOf,
  eventWhen,
  monthGrid,
  problemWithEvent,
  splitByWhen,
  type CrewEvent,
  type EventReply,
} from '../src/lib/events';

/**
 * The crew calendar.
 *
 * A month drawn as whole weeks is the only part of this with any thinking in
 * it, and every mistake it can make is the same mistake: a day from the month
 * either side that does not look like one, so next month's first Tuesday
 * becomes this month's league night.
 */

function event(id: string, at: number, over: Partial<CrewEvent> = {}): CrewEvent {
  return {
    id,
    groupId: 'g1',
    creatorId: 'kenji',
    title: 'League night',
    house: 'Korona Bowl',
    startsAt: at,
    note: '',
    createdAt: 0,
    ...over,
  };
}

describe('monthGrid', () => {
  // March 2026 starts on a Sunday and has 31 days.
  const march = () => monthGrid(2026, 2, [], new Date(2026, 2, 15).getTime());

  it('is always six whole weeks', () => {
    // A grid that changes height as you page through the year makes everything
    // under it jump, which on a phone moves what you were about to tap.
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(2026, month, [], Date.now());
      expect(grid).toHaveLength(6);
      for (const week of grid) expect(week).toHaveLength(7);
    }
  });

  it('opens on the day it was asked to', () => {
    expect(new Date(march()[0][0].at).getDay()).toBe(0);
    const mondayFirst = monthGrid(2026, 2, [], Date.now(), 1);
    expect(new Date(mondayFirst[0][0].at).getDay()).toBe(1);
  });

  it('marks the days either side as not in the month', () => {
    // February 2026 starts on a Sunday, so a Sunday-first grid has no lead —
    // but it still has trailing days, and they must not read as February.
    const grid = monthGrid(2026, 1, [], Date.now());
    const flat = grid.flat();
    expect(flat.filter((d) => d.inMonth)).toHaveLength(28);
    expect(flat.filter((d) => !d.inMonth).length).toBeGreaterThan(0);
    for (const day of flat.filter((d) => !d.inMonth)) {
      expect(new Date(day.at).getMonth()).not.toBe(1);
    }
  });

  it('covers every day of the month exactly once', () => {
    for (let month = 0; month < 12; month++) {
      const days = monthGrid(2026, month, [], Date.now())
        .flat()
        .filter((d) => d.inMonth)
        .map((d) => d.dayOfMonth);
      expect(new Set(days).size).toBe(days.length);
      expect(days[0]).toBe(1);
      expect(days).toEqual([...days].sort((a, b) => a - b));
    }
  });

  it('puts an event on its own day and nowhere else', () => {
    const at = new Date(2026, 2, 17, 19, 30).getTime();
    const grid = monthGrid(2026, 2, [event('e1', at)], Date.now());
    const withEvents = grid.flat().filter((d) => d.events.length > 0);
    expect(withEvents).toHaveLength(1);
    expect(withEvents[0].dayOfMonth).toBe(17);
  });

  it('orders two events on one day by time', () => {
    const early = event('e1', new Date(2026, 2, 17, 18, 0).getTime());
    const late = event('e2', new Date(2026, 2, 17, 21, 0).getTime());
    const grid = monthGrid(2026, 2, [late, early], Date.now());
    const day = grid.flat().find((d) => d.dayOfMonth === 17 && d.inMonth)!;
    expect(day.events.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('marks today, and only today', () => {
    const grid = monthGrid(2026, 2, [], new Date(2026, 2, 15, 3, 0).getTime());
    const today = grid.flat().filter((d) => d.isToday);
    expect(today).toHaveLength(1);
    expect(today[0].dayOfMonth).toBe(15);
  });

  it('crosses a year end without losing a day', () => {
    const grid = monthGrid(2025, 11, [], Date.now());
    const december = grid.flat().filter((d) => d.inMonth);
    expect(december).toHaveLength(31);
    expect(grid.flat().some((d) => new Date(d.at).getFullYear() === 2026)).toBe(true);
  });
});

describe('eventWhen', () => {
  const tonight = new Date(2026, 2, 17, 19, 0).getTime();

  it('is still today two hours after it started', () => {
    // A list that drops an event the moment it starts hides the thing you are
    // standing at.
    expect(eventWhen(event('e', tonight), new Date(2026, 2, 17, 21, 0).getTime())).toBe('today');
  });

  it('is past the next morning', () => {
    expect(eventWhen(event('e', tonight), new Date(2026, 2, 18, 9, 0).getTime())).toBe('past');
  });

  it('is upcoming the night before', () => {
    expect(eventWhen(event('e', tonight), new Date(2026, 2, 16, 23, 0).getTime())).toBe('upcoming');
  });
});

describe('splitByWhen', () => {
  it('puts what is next first and what has been in its own list', () => {
    const now = new Date(2026, 2, 17, 12, 0).getTime();
    const events = [
      event('past', new Date(2026, 2, 3).getTime()),
      event('soon', new Date(2026, 2, 20).getTime()),
      event('later', new Date(2026, 3, 4).getTime()),
      event('older', new Date(2026, 1, 3).getTime()),
    ];
    const { ahead, past } = splitByWhen(events, now);
    expect(ahead.map((e) => e.id)).toEqual(['soon', 'later']);
    // Most recent first: what happened last is what you want to see of the past.
    expect(past.map((e) => e.id)).toEqual(['past', 'older']);
  });
});

describe('attendance', () => {
  const roster = ['kenji', 'aya', 'sam', 'yui'];
  const replies: EventReply[] = [
    { eventId: 'e1', memberId: 'kenji', status: 'in' },
    { eventId: 'e1', memberId: 'aya', status: 'out' },
    { eventId: 'e2', memberId: 'sam', status: 'in' },
  ];

  it('separates the quiet from the noes', () => {
    // Six in the crew and two yeses tells you nothing until you know whether
    // the rest said no or are simply asleep.
    const a = attendance(replies, 'e1', roster, 'sam');
    expect(a.going).toEqual(['kenji']);
    expect(a.out).toEqual(['aya']);
    expect(a.quiet).toEqual(['sam', 'yui']);
    expect(a.yours).toBeNull();
  });

  it('ignores replies to a different event', () => {
    expect(attendance(replies, 'e1', roster, 'kenji').going).not.toContain('sam');
  });

  it('reports your own answer', () => {
    expect(attendance(replies, 'e1', roster, 'aya').yours).toBe('out');
  });
});

describe('problemWithEvent', () => {
  const ok = { title: 'League night', house: 'Korona Bowl', startsAt: Date.now(), note: '' };

  it('accepts a reasonable one', () => {
    expect(problemWithEvent(ok)).toBeNull();
  });

  it('wants a name', () => {
    expect(problemWithEvent({ ...ok, title: '  ' })).toBe('Give it a name.');
  });

  it('refuses a time that is not one', () => {
    expect(problemWithEvent({ ...ok, startsAt: Number.NaN })).toMatch(/not a date/);
  });

  it('lets an event be put up for a date that has passed', () => {
    // Writing up last Tuesday is a real thing to want, and refusing it would
    // only mean typing it as tomorrow and correcting it.
    expect(problemWithEvent({ ...ok, startsAt: new Date(2020, 0, 1).getTime() })).toBeNull();
  });
});

describe('canManage', () => {
  const e = event('e1', Date.now());
  it('is the creator or the owner, and nobody else', () => {
    expect(canManage(e, 'kenji', 'aya')).toBe(true);
    expect(canManage(e, 'aya', 'aya')).toBe(true);
    expect(canManage(e, 'sam', 'aya')).toBe(false);
  });
});

describe('dayKeyOf', () => {
  it('keys by local day, not by UTC', () => {
    // Eleven at night in Tokyo is the same calendar day as nine in the morning.
    const morning = new Date(2026, 2, 17, 9, 0).getTime();
    const night = new Date(2026, 2, 17, 23, 30).getTime();
    expect(dayKeyOf(morning)).toBe('2026-03-17');
    expect(dayKeyOf(night)).toBe('2026-03-17');
  });
});
