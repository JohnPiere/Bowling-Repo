import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import type { CaptureResult } from '../lib/camera';
import { containFit, projectRect, unprojectPoint, type Rect, type Size } from '../lib/cover';
import { detectGameRows } from '../lib/ocr/rows';
import { uprightBitmap } from '../lib/ocr/preprocess';
import {
  boxFrom,
  clampBox,
  defaultBox,
  isUsable,
  moveBox,
  resizeBox,
  type Handle,
} from '../lib/region';

type Drag =
  | { kind: 'move'; from: { x: number; y: number }; box: Rect }
  | { kind: 'resize'; handle: Handle }
  | { kind: 'draw'; from: { x: number; y: number } };

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];

/**
 * Draw a box around one game on a photo already taken.
 *
 * The camera has a bar to line a row up inside; a picked photo has no camera to
 * move, so the bowler draws the same shape themselves. The box starts on
 * whichever row the detector is most sure of, which on a clean sheet means the
 * only thing left to do is check it — and when detection finds nothing, a
 * row-shaped strip in the middle is still a better start than an empty picture.
 */
export function RegionPicker({
  image,
  onPick,
  onCancel,
  onError,
}: {
  image: Blob;
  onPick: (shot: CaptureResult) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const [source, setSource] = useState<Size>({ width: 0, height: 0 });
  const [surface, setSurface] = useState<Size>({ width: 0, height: 0 });
  const [box, setBox] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);

  // Decode once, upright, into a canvas: it is both what is shown and what is
  // cropped, so there is no way for the two to disagree about which way up the
  // photograph is.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const bitmap = await uprightBitmap(image);
        if (!alive) {
          bitmap.close();
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        bitmap.close();

        canvasRef.current = canvas;
        setSource({ width: canvas.width, height: canvas.height });
        setBox(startingBox(canvas));
      } catch (err) {
        if (alive) onError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      alive = false;
    };
  }, [image, onError]);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;

    const measure = () => setSurface({ width: element.clientWidth, height: element.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo(() => containFit(source, surface), [source, surface]);

  const pointIn = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      if (!bounds) return { x: 0, y: 0 };
      return unprojectPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, fit);
    },
    [fit],
  );

  const onPointerDown = (event: React.PointerEvent, drag: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = drag;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !box) return;

    const at = pointIn(event);

    if (drag.kind === 'move') {
      setBox(moveBox(drag.box, { x: at.x - drag.from.x, y: at.y - drag.from.y }, source));
    } else if (drag.kind === 'resize') {
      setBox(resizeBox(box, drag.handle, at, source));
    } else {
      setBox(clampBox(boxFrom(drag.from, at), source));
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const pick = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !box || !isUsable(box)) return;

    setBusy(true);
    try {
      const width = Math.round(box.width);
      const height = Math.round(box.height);

      const cut = document.createElement('canvas');
      cut.width = width;
      cut.height = height;

      const context = cut.getContext('2d');
      if (!context) throw new Error('This browser would not provide a drawing canvas.');
      context.drawImage(
        canvas,
        Math.round(box.x),
        Math.round(box.y),
        width,
        height,
        0,
        0,
        width,
        height,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        cut.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('That crop could not be encoded.');

      onPick({ blob, width, height });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [box, onError, onPick]);

  const url = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const drawn = box ? projectRect(box, fit) : null;

  // What the crop will actually be, shown at full width. The picture itself is
  // small — a sheet is far wider than it is tall, so on a phone one row is a
  // few dozen pixels high and "is the box on the right game?" is genuinely hard
  // to see. This answers it. It is the same <img> scaled and offset by CSS
  // rather than a re-encoded crop, so it keeps up with the drag for free.
  const preview =
    box && surface.width > 0
      ? {
          scale: surface.width / box.width,
          height: (box.height * surface.width) / box.width,
        }
      : null;

  return (
    <>
      <p className="muted" style={{ margin: '0 0 11px' }}>
        {t('Drag a box around one game’s row. Only what is inside it is read.')}
      </p>

      <div
        className="picker"
        ref={surfaceRef}
        style={source.width > 0 ? { aspectRatio: pickerAspect(source) } : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => onPointerDown(event, { kind: 'draw', from: pointIn(event) })}
      >
        {/* The image is drawn by the browser rather than from the canvas: an
            <img> scales with far better filtering than a canvas blit, and the
            canvas is only ever needed to cut the crop out at full size. */}
        <img className="picker__photo" src={url} alt="The sheet you picked" draggable={false} />

        {drawn && (
          <div
            className="picker__box"
            style={{
              left: drawn.x,
              top: drawn.y,
              width: drawn.width,
              height: drawn.height,
            }}
            onPointerDown={(event) =>
              onPointerDown(event, {
                kind: 'move',
                from: pointIn(event),
                box: box!,
              })
            }
          >
            {HANDLES.map((handle) => (
              <span
                key={handle}
                className={`picker__handle picker__handle--${handle}`}
                onPointerDown={(event) => onPointerDown(event, { kind: 'resize', handle })}
              />
            ))}
          </div>
        )}
      </div>

      {box && preview && (
        <>
          <span className="hero__label">{t('What will be read')}</span>
          <div
            className="picker__preview"
            style={{ height: Math.min(preview.height, 140), marginTop: 5 }}
          >
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                width: source.width * preview.scale,
                maxWidth: 'none',
                marginLeft: -box.x * preview.scale,
                marginTop: -box.y * preview.scale,
              }}
            />
          </div>
        </>
      )}

      <button
        type="button"
        className="btn-lg btn-lg--primary"
        disabled={!box || !isUsable(box) || busy}
        onClick={() => void pick()}
      >
        <Icon name="camera" size={18} />
        {t('Read this game')}
      </button>

      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCancel}>
        {t('Cancel')}
      </button>
    </>
  );
}

/**
 * The shape to show the picture in.
 *
 * A sheet is much wider than it is tall, and in a portrait box that leaves most
 * of the screen empty. Following the picture's own shape removes the dead
 * space — but only so far: past about three to one there is not enough height
 * left to get a finger on a corner.
 */
function pickerAspect(source: Size): number {
  return Math.min(Math.max(source.width / source.height, 0.75), 3);
}

/** Start on the row the detector likes best, or on a strip in the middle. */
function startingBox(canvas: HTMLCanvasElement): Rect {
  const bounds = { width: canvas.width, height: canvas.height };

  const width = Math.min(480, canvas.width);
  const height = Math.max(1, Math.round((canvas.height * width) / canvas.width));

  const small = document.createElement('canvas');
  small.width = width;
  small.height = height;

  const context = small.getContext('2d', { willReadFrequently: true });
  if (!context) return defaultBox(bounds);
  context.drawImage(canvas, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const [best] = detectGameRows(gray, width, height);
  if (!best) return defaultBox(bounds);

  // Open the box out past the row's own rules. The detected band runs from the
  // centre of one rule to the centre of the next, and the reader needs those
  // borders: they are what tells it where the frames begin, and a crop that
  // shaves them off leaves it nothing to measure the grid against.
  // Slack on all four sides, measured off the row's height because a row is
  // far wider than it is tall and a share of its width would be enormous. The
  // sides matter as much as the top and bottom: the grid is fitted across the
  // span between the outermost vertical rules, so an edge that clips one shifts
  // every cell along by a tenth of a frame and the marks start landing on the
  // boundaries between them.
  const scale = canvas.width / width;
  const padY = best.height * scale * 0.3;
  const padX = best.height * scale * 0.25;

  return clampBox(
    {
      x: best.x * scale - padX,
      y: best.y * scale - padY,
      width: best.width * scale + padX * 2,
      height: best.height * scale + padY * 2,
    },
    bounds,
  );
}
