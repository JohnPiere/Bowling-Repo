/**
 * Dates and times: into the two `<input>` types, and back out onto a screen.
 *
 * All in local time on purpose. A game is bowled at a place, at a time on that
 * place's clock, and someone entering "19:30" for last night's league means
 * half seven where they were standing — not half seven UTC.
 *
 * Every screen formats through the helpers at the bottom rather than calling
 * `toLocaleDateString` itself, so that one setting decides the language of
 * every date in the app.
 */

import { currentLanguage } from './i18n';
import type { Language } from './preferences';

const pad = (value: number) => String(value).padStart(2, '0');

/** A timestamp as `YYYY-MM-DD`. */
export function toDateInput(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A timestamp as `HH:MM`. */
export function toTimeInput(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The two inputs back into a timestamp, or null if they do not make one.
 *
 * A missing time is not an error — plenty of people know they bowled on
 * Tuesday and not what time — so it falls back to midday rather than midnight,
 * which keeps the game on the day it was entered whatever the timezone does
 * to it later.
 */
export function fromInputs(date: string, time: string): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!day) return null;

  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  const hours = clock ? Number(clock[1]) : 12;
  const minutes = clock ? Number(clock[2]) : 0;

  if (hours > 23 || minutes > 59) return null;

  const at = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), hours, minutes, 0, 0);

  // A date the calendar does not have — the 31st of a 30-day month — rolls
  // over into the next one rather than failing, so check it came back the same.
  if (at.getMonth() !== Number(day[2]) - 1 || at.getDate() !== Number(day[3])) return null;

  return at.getTime();
}

/**
 * The locale dates and times are written in.
 *
 * Follows the app's own language setting, not the browser's. These read as
 * language rather than as data — "Aug 31", "Sunday" — so a Japanese screen
 * with English dates in it is the same defect as an untranslated heading.
 * `undefined` is deliberate for English: it means "whatever this phone is set
 * to", which gets a British bowler 31 Aug and an American one Aug 31.
 */
export function dateLocale(language: Language = currentLanguage()): string | undefined {
  return language === 'ja' ? 'ja-JP' : undefined;
}

/** "Aug 31" / "8月31日" — the short form a list row uses. */
export function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
}

/** "Sunday" / "日曜日". */
export function formatWeekday(at: number, length: 'long' | 'short' = 'long'): string {
  return new Date(at).toLocaleDateString(dateLocale(), { weekday: length });
}

/** "31 August 2026" / "2026年8月31日" — a heading, where there is room. */
export function formatLongDate(at: number): string {
  return new Date(at).toLocaleDateString(dateLocale(), { dateStyle: 'long' });
}

/** "Aug 2026" / "2026年8月". */
export function formatMonthYear(at: number): string {
  return new Date(at).toLocaleDateString(dateLocale(), { month: 'short', year: 'numeric' });
}

/**
 * "19:30" / "7:30 PM" — whichever clock the locale keeps.
 *
 * Two-digit on purpose: these are read down a column of games, and a mix of
 * "9:05" and "19:30" makes the column ragged. Japanese gets a 24-hour clock
 * from the locale itself.
 */
export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

/** Date and time together, for an exported sheet's header. */
export function formatDateTime(at: number): string {
  return new Date(at).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}
