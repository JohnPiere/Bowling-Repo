/**
 * The box drawn around one game on a picked photo.
 *
 * The camera has a bar to line a row up inside; a photo already taken does not,
 * so the bowler draws the same shape themselves. Every edit to that box is a
 * pure function of the box, the pointer and the picture's bounds, which keeps
 * the dragging logic out of the component and under test — pointer maths is
 * exactly the kind of thing that is fiddly to get right and impossible to see
 * wrong by looking at it.
 */

import type { Rect, Size } from './cover';

export type Handle = 'nw' | 'ne' | 'sw' | 'se';

export interface Point {
  x: number;
  y: number;
}

/** The smallest box worth reading, in the picture's own pixels. */
const MIN_SIDE = 24;

/** The box two corners make, whichever way round they were dragged. */
export function boxFrom(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Pull a box back inside the picture, keeping its size if it will fit. */
export function clampBox(box: Rect, bounds: Size): Rect {
  const width = Math.min(box.width, bounds.width);
  const height = Math.min(box.height, bounds.height);

  return {
    x: Math.max(0, Math.min(box.x, bounds.width - width)),
    y: Math.max(0, Math.min(box.y, bounds.height - height)),
    width,
    height,
  };
}

export function moveBox(box: Rect, by: Point, bounds: Size): Rect {
  return clampBox({ ...box, x: box.x + by.x, y: box.y + by.y }, bounds);
}

/**
 * Drag one corner to `point`, leaving the opposite corner where it is.
 *
 * A box dragged past its own opposite corner keeps a minimum size rather than
 * inverting: a zero-width box is not a thing anyone meant to draw, and a
 * negative one crops nothing at all.
 */
export function resizeBox(box: Rect, handle: Handle, point: Point, bounds: Size): Rect {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  const x = Math.max(0, Math.min(point.x, bounds.width));
  const y = Math.max(0, Math.min(point.y, bounds.height));

  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';

  const nextLeft = west ? Math.min(x, right - MIN_SIDE) : left;
  const nextRight = west ? right : Math.max(x, left + MIN_SIDE);
  const nextTop = north ? Math.min(y, bottom - MIN_SIDE) : top;
  const nextBottom = north ? bottom : Math.max(y, top + MIN_SIDE);

  return clampBox(
    {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop,
    },
    bounds,
  );
}

/** True when a box is big enough to hold a game's row. */
export function isUsable(box: Rect): boolean {
  return box.width >= MIN_SIDE && box.height >= MIN_SIDE;
}

/**
 * A starting box, when nothing on the photo was recognised as a row.
 *
 * The same long shallow strip the camera's bar is, in the middle of the
 * picture — near enough to a row that adjusting it beats drawing one.
 */
export function defaultBox(bounds: Size): Rect {
  const width = bounds.width * 0.88;
  const height = Math.min(width / 7, bounds.height * 0.5);

  return {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height,
  };
}
