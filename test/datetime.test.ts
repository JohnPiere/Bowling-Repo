import { describe, expect, it } from 'vitest';
import {
  dateLocale,
  formatDateTime,
  formatDay,
  formatLongDate,
  formatMonthYear,
  formatTime,
  formatWeekday,
  fromInputs,
  toDateInput,
  toTimeInput,
} from '../src/lib/datetime';

describe('toDateInput and toTimeInput', () => {
  it('formats a timestamp the way the inputs want it', () => {
    const at = new Date(2026, 7, 31, 19, 5).getTime();
    expect(toDateInput(at)).toBe('2026-08-31');
    expect(toTimeInput(at)).toBe('19:05');
  });

  it('pads single digits', () => {
    const at = new Date(2026, 0, 4, 9, 7).getTime();
    expect(toDateInput(at)).toBe('2026-01-04');
    expect(toTimeInput(at)).toBe('09:07');
  });
});

describe('fromInputs', () => {
  it('round-trips a timestamp through both fields', () => {
    const at = new Date(2026, 7, 31, 19, 5).getTime();
    expect(fromInputs(toDateInput(at), toTimeInput(at))).toBe(at);
  });

  it('puts a date with no time at midday', () => {
    const at = fromInputs('2026-08-31', '');
    expect(new Date(at!).getHours()).toBe(12);
    expect(toDateInput(at!)).toBe('2026-08-31');
  });

  it('refuses a date it cannot read', () => {
    expect(fromInputs('', '19:00')).toBeNull();
    expect(fromInputs('31/08/2026', '19:00')).toBeNull();
  });

  it('refuses a day the calendar does not have', () => {
    // Left to Date this becomes the 1st of March, silently.
    expect(fromInputs('2026-02-30', '19:00')).toBeNull();
  });

  it('refuses an impossible clock', () => {
    expect(fromInputs('2026-08-31', '25:00')).toBeNull();
    expect(fromInputs('2026-08-31', '19:75')).toBeNull();
  });
});

describe('dateLocale', () => {
  it('pins Japanese to a Japanese locale', () => {
    expect(dateLocale('ja')).toBe('ja-JP');
  });

  it('leaves English to the phone', () => {
    // `undefined` means "whatever this device is set to", which gets a British
    // bowler 31 Aug and an American one Aug 31 — both correct for them.
    expect(dateLocale('en')).toBeUndefined();
  });
});

describe('display formatting', () => {
  const at = new Date(2026, 7, 31, 19, 5).getTime();

  it('writes a short day for a list row', () => {
    expect(formatDay(at)).toMatch(/Aug/);
    expect(formatDay(at)).toMatch(/31/);
  });

  it('writes the weekday, long or short', () => {
    expect(formatWeekday(at)).toBe('Monday');
    expect(formatWeekday(at, 'short')).toBe('Mon');
  });

  it('writes a two-digit clock so a column of times lines up', () => {
    // Not "9:05" against "19:30": these are read down a column.
    expect(formatTime(new Date(2026, 7, 31, 9, 5).getTime())).toMatch(/09:05|09:05 AM/);
  });

  it('writes the month and year for a season heading', () => {
    expect(formatMonthYear(at)).toMatch(/Aug/);
    expect(formatMonthYear(at)).toMatch(/2026/);
  });

  it('writes a full date for a printed sheet', () => {
    expect(formatLongDate(at)).toMatch(/August/);
    expect(formatLongDate(at)).toMatch(/2026/);
  });

  it('writes date and time together for an export header', () => {
    expect(formatDateTime(at)).toMatch(/2026/);
    expect(formatDateTime(at)).toMatch(/7:05|19:05/);
  });
});
