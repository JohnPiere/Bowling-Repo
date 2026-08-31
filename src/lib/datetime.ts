/**
 * Local date and time, as the two `<input>` types want them.
 *
 * All in local time on purpose. A game is bowled at a place, at a time on that
 * place's clock, and someone entering "19:30" for last night's league means
 * half seven where they were standing — not half seven UTC.
 */

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
