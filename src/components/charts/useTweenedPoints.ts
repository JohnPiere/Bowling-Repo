import { useEffect, useRef, useState } from 'react';

export interface Point {
  x: number;
  y: number;
}

/**
 * The handoff's motion table gives charts 500–900ms. Nearer the top of that
 * range: switching metric moves the whole plot, and at half a second that much
 * travel reads as a jump rather than a move.
 */
const DURATION = 720;

/**
 * Ease the chart's geometry to its new shape instead of redrawing it.
 *
 * The handoff asks for `transition: d .5s` on the paths and `cx/cy .5s` on the
 * markers, so that changing the range slides the chart rather than flashing a
 * new one. Neither is dependable in Safari — CSS-animated `d` is not supported,
 * and the geometry properties only became animatable recently — and this app is
 * opened on an iPhone more than anything else. So the interpolation happens
 * here, on numbers, and every browser gets the same motion.
 *
 * A changed range also changes how *many* points there are. Rather than snap in
 * that case, which is the whole thing being avoided, the shape being left is
 * resampled to the new length first: every point then has somewhere to travel
 * from, and the line appears to stretch or compress into its new span.
 */
export function useTweenedPoints(target: Point[], duration = DURATION): Point[] {
  const [frame, setFrame] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target.length === 0) {
      setFrame(target);
      return;
    }

    // Respect the setting rather than the media query alone: someone who has
    // asked for less motion wants the answer, not the journey.
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (still) {
      fromRef.current = target;
      setFrame(target);
      return;
    }

    fromRef.current = resample(fromRef.current, target.length);
    startRef.current = 0;

    const step = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - (1 - t) ** 3;

      setFrame(
        target.map((to, i) => {
          const from = fromRef.current[i] ?? to;
          return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
        }),
      );

      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return frame.length === target.length ? frame : target;
}

/**
 * Stretch a run of points to a different length, sampling along it.
 *
 * Not a resampling of the *data* — this only ever produces the starting shape
 * of an animation, and a frame later it has been replaced by real values.
 */
export function resample(points: Point[], length: number): Point[] {
  if (points.length === length) return points;
  if (points.length === 0 || length === 0) return new Array(length).fill({ x: 0, y: 0 });
  if (points.length === 1) return new Array(length).fill(points[0]);

  const out: Point[] = [];
  for (let i = 0; i < length; i++) {
    const at = (i / (length - 1)) * (points.length - 1);
    const low = Math.floor(at);
    const high = Math.min(points.length - 1, low + 1);
    const f = at - low;
    out.push({
      x: points[low].x + (points[high].x - points[low].x) * f,
      y: points[low].y + (points[high].y - points[low].y) * f,
    });
  }
  return out;
}
