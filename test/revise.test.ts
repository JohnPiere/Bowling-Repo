import { describe, expect, it } from 'vitest';
import { fromInputs, toDateInput, toTimeInput } from '../src/lib/datetime';

/**
 * Moving a game to the day it was actually bowled.
 *
 * The date is the easiest field on the finishing step to walk past — it is
 * already filled in, and it is filled in with *today* — so the first thing
 * somebody wants after saving a game they wrote up the next morning is to move
 * it. `reviseGame` has always taken a `playedAt`; nothing ever passed one.
 *
 * These cover the round trip the correction form does, because a form that
 * quietly wrote a different instant than the one on screen would silently
 * refile games under the wrong night, and the history screen groups by night.
 */

describe('the correction form round trip', () => {
  it('gives back the instant it was given', () => {
    const at = new Date(2026, 5, 15, 19, 30, 0, 0).getTime();
    expect(fromInputs(toDateInput(at), toTimeInput(at))).toBe(at);
  });

  it('round-trips a game bowled just before midnight', () => {
    // The one that decides which *night* a game belongs to.
    const at = new Date(2026, 0, 1, 23, 59, 0, 0).getTime();
    expect(fromInputs(toDateInput(at), toTimeInput(at))).toBe(at);
  });

  it('round-trips a game bowled just after it', () => {
    const at = new Date(2026, 0, 2, 0, 1, 0, 0).getTime();
    expect(fromInputs(toDateInput(at), toTimeInput(at))).toBe(at);
  });

  it('refuses a half-typed date rather than inventing one', () => {
    // The form leaves `playedAt` alone when this is null, so a game being
    // edited keeps its own date while somebody is still typing the new one.
    expect(fromInputs('2026-06', '19:30')).toBeNull();
    expect(fromInputs('', '19:30')).toBeNull();
    expect(fromInputs('2026-06-15', '25:00')).toBeNull();
  });

  it('refuses a day the calendar does not have', () => {
    // Left to itself `new Date` rolls the 31st of June into the 1st of July,
    // which would move the game a day without saying so.
    expect(fromInputs('2026-06-31', '19:30')).toBeNull();
    expect(fromInputs('2026-02-30', '19:30')).toBeNull();
  });

  it('takes a date with no time, at midday', () => {
    // Plenty of people know they bowled on Tuesday and not what time. Midday
    // keeps it on that day whatever a timezone does to it later.
    const at = fromInputs('2026-06-15', '');
    expect(at).not.toBeNull();
    expect(new Date(at!).getHours()).toBe(12);
    expect(toDateInput(at!)).toBe('2026-06-15');
  });
});
