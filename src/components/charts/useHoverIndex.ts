import { useCallback, useRef, useState } from 'react';

/**
 * Map a pointer position onto the nearest of `count` evenly spaced marks.
 *
 * The SVG scales with the card, so client coordinates have to be converted
 * back through the element's own width rather than assumed to be viewBox
 * units. Touch is included: on a phone that is the only pointer there is.
 */
export function useHoverIndex(count: number, insetLeft = 0, insetRight = 0) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  const onMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = ref.current;
      if (!svg || count === 0) return;

      const box = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      // Element pixels -> viewBox units.
      const scale = viewBox.width / box.width;
      const x = (event.clientX - box.left) * scale;

      const span = viewBox.width - insetLeft - insetRight;
      const step = count > 1 ? span / (count - 1) : span;
      const nearest = Math.round((x - insetLeft) / step);

      setIndex(Math.max(0, Math.min(count - 1, nearest)));
    },
    [count, insetLeft, insetRight],
  );

  return { ref, index, onMove, onLeave: () => setIndex(null) };
}
