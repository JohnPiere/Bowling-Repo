import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { captureRegion, grabGrayFrame, type CaptureResult, type Region } from '../lib/camera';
import { coverFit, projectRect, unprojectPoint, type Rect, type Size } from '../lib/cover';
import {
  detectGameRows,
  rowStrip,
  stableRows,
  trackRows,
  type TrackedRow,
} from '../lib/ocr/rows';
import { reticleFor, rowInReticle } from '../lib/reticle';

/** How often detection runs. Eight a second looks live and leaves the video alone. */
const DETECTIONS_PER_SECOND = 8;

/**
 * The camera, aimed at one game's row.
 *
 * A barcode reader, not a document scanner: a fixed bar sits in the middle of
 * the preview and the bowler slides the sheet until one row lies inside it.
 * Only that strip is captured. A house sheet stacks a row per game and some run
 * to six — reading them all at once means every row's frame grid has to survive
 * being projected on top of every other row's, which it does not, and it is not
 * what anyone asked for anyway, which is the game they just bowled.
 *
 * Detection still runs, but only to lock on: when a row is found lying in the
 * bar, the brackets snap to the row's own edges and the capture takes those
 * instead of the bar. That is what makes a barcode reader feel certain, and it
 * costs the bowler nothing when it fails — the bar is still there.
 */
export function RowFinder({
  onCapture,
  onCancel,
  onError,
  stream,
}: {
  stream: MediaStream;
  onCapture: (shot: CaptureResult) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const trackedRef = useRef<TrackedRow[]>([]);

  const [locked, setLocked] = useState<TrackedRow | null>(null);
  const [source, setSource] = useState<Size>({ width: 0, height: 0 });
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      /* Autoplay can be refused; the shutter still works off the same stream. */
    });
  }, [stream]);

  // The overlay is positioned in the element's own pixels, so it has to be
  // remeasured whenever the element changes size — rotating the phone, or the
  // address bar collapsing on scroll.
  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo(() => coverFit(source, box), [source, box]);

  /** The bar, in the element's own pixels. */
  const reticle = useMemo(() => reticleFor(box), [box]);

  /** …and the same bar in the frame's, which is where a capture is measured. */
  const reticleInFrame = useMemo((): Region => {
    const topLeft = unprojectPoint({ x: reticle.x, y: reticle.y }, fit);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: reticle.width / fit.scale,
      height: reticle.height / fit.scale,
    };
  }, [fit, reticle]);

  useEffect(() => {
    if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
    const scratch = scratchRef.current;

    let raf = 0;
    let last = 0;
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);

      if (now - last < 1000 / DETECTIONS_PER_SECOND) return;
      last = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const frame = grabGrayFrame(video, scratch);
      if (!frame) return;

      const found = detectGameRows(frame.gray, frame.width, frame.height);
      trackedRef.current = trackRows(trackedRef.current, found);

      setSource((was) =>
        was.width === frame.width && was.height === frame.height
          ? was
          : { width: frame.width, height: frame.height },
      );
      setLocked(rowInReticle(stableRows(trackedRef.current), reticleInFrame));
    };

    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [reticleInFrame]);

  // Where the brackets are drawn: on the row if one is locked, else on the bar.
  // A locked row is drawn as the strip it actually is — its own height, turned
  // through its own tilt — inside the upright box the detector reported.
  const strip = locked ? rowStrip(locked) : null;
  const around = locked ? projectRect(locked, fit) : reticle;
  const brackets: Rect = strip
    ? {
        x: around.x,
        y: around.y + (around.height - strip.height * fit.scale) / 2,
        width: around.width,
        height: strip.height * fit.scale,
      }
    : around;

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      // A locked row runs from the centre of one rule to the centre of the
      // next, so the crop has to be opened out to take the borders with it. The
      // bar needs far less: it is roomier than a row to begin with, and what
      // the bowler put inside it is already what they meant.
      const region = locked ?? reticleInFrame;
      onCapture(await captureRegion(video, region, source, locked ? 0.3 : 0.12));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [locked, onCapture, onError, reticleInFrame, source]);

  return (
    <>
      <div className="finder" ref={frameRef}>
        <video ref={videoRef} className="finder__video" playsInline muted />

        {/* Everything outside the strip is dimmed, so the part that will be
            read is the only part of the picture that looks live. It follows the
            lock rather than staying on the bar: what is dimmed should always be
            what is about to be thrown away. */}
        <div className="finder__shade" style={{ height: Math.max(0, brackets.y) }} />
        <div
          className="finder__shade"
          style={{ top: brackets.y + brackets.height, bottom: 0, height: 'auto' }}
        />

        <div
          className={`reticle${locked ? ' reticle--locked' : ''}`}
          style={{
            left: brackets.x,
            top: brackets.y,
            width: brackets.width,
            height: brackets.height,
            transform: strip ? `rotate(${strip.angle}rad)` : undefined,
          }}
        >
          <span className="reticle__corner reticle__corner--tl" />
          <span className="reticle__corner reticle__corner--tr" />
          <span className="reticle__corner reticle__corner--bl" />
          <span className="reticle__corner reticle__corner--br" />
        </div>

        <div className="finder__hint">
          {locked ? 'Row locked — hold still and scan' : 'Line one game’s row up inside the bar'}
        </div>
      </div>

      <button type="button" className="btn-lg btn-lg--primary" onClick={() => void shoot()}>
        <Icon name="camera" size={18} />
        {t('Scan this row')}
      </button>

      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCancel}>
        {t('Cancel')}
      </button>
    </>
  );
}
