import { useEffect, useRef, useState } from 'react';

/** Long enough to read as a count rather than a flicker, short enough to end
 *  before anybody has finished looking at the card. */
const DURATION = 700;

/**
 * Count a number up from zero when it first appears.
 *
 * Only the hero numeral on the dashboard uses this, and only because the
 * number it shows is the one thing on the screen worth being pleased about.
 * Everything else on the app renders its value immediately: a number that
 * animates is a number you cannot read for half a second, which is the wrong
 * trade anywhere the value is being compared rather than admired.
 *
 * The count restarts when the target changes, which on this screen means a new
 * personal best — exactly the moment worth marking.
 */
export function useCountUp(target: number, duration = DURATION): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef(0);

  useEffect(() => {
    // Someone who has asked for less motion wants the number, not the count.
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (still || target === 0) {
      setValue(target);
      return;
    }

    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
