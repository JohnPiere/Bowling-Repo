import { describe, expect, it } from 'vitest';
import { fromInputs, toDateInput, toTimeInput } from '../src/lib/datetime';

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
