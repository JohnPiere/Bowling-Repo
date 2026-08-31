/**
 * Where a video frame actually lands inside the box that shows it.
 *
 * The preview is `object-fit: cover`, so the frame is scaled up until it fills
 * the element and the overflow is cropped off — which means a point found at
 * (x, y) in the frame is somewhere else entirely on screen. Anything drawn over
 * the video has to undo that, or the marks sit beside the thing they mark.
 */

export interface Size {
  width: number;
  height: number;
}

export interface CoverFit {
  /** How much the source was scaled to fill the target. */
  scale: number;
  /** Where the source's origin sits in the target, usually negative. */
  x: number;
  y: number;
}

export function coverFit(source: Size, target: Size): CoverFit {
  if (source.width <= 0 || source.height <= 0) return { scale: 1, x: 0, y: 0 };

  const scale = Math.max(target.width / source.width, target.height / source.height);
  return {
    scale,
    x: (target.width - source.width * scale) / 2,
    y: (target.height - source.height * scale) / 2,
  };
}

/**
 * The other fit: scaled down until the whole frame is visible, with bars
 * beside it. What a picked photo wants — you cannot draw a box around a game
 * that has been cropped off the edge of the screen.
 */
export function containFit(source: Size, target: Size): CoverFit {
  if (source.width <= 0 || source.height <= 0) return { scale: 1, x: 0, y: 0 };

  const scale = Math.min(target.width / source.width, target.height / source.height);
  return {
    scale,
    x: (target.width - source.width * scale) / 2,
    y: (target.height - source.height * scale) / 2,
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle in source coordinates, placed in the target's. */
export function projectRect(rect: Rect, fit: CoverFit): Rect {
  return {
    x: rect.x * fit.scale + fit.x,
    y: rect.y * fit.scale + fit.y,
    width: rect.width * fit.scale,
    height: rect.height * fit.scale,
  };
}

/** A point in the target's coordinates, back in the source's. */
export function unprojectPoint(point: { x: number; y: number }, fit: CoverFit) {
  return {
    x: (point.x - fit.x) / fit.scale,
    y: (point.y - fit.y) / fit.scale,
  };
}
