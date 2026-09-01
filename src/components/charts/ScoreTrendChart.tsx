import { useMemo } from 'react';
import type { MetricPoint } from '../../lib/stats';
import { DataTable } from './DataTable';
import { useHoverIndex } from './useHoverIndex';
import { useTweenedPoints } from './useTweenedPoints';

const W = 320;
const H = 150;
const PAD = { left: 30, right: 10, top: 12, bottom: 22 };

/** Dots crowd into a smear past this many games; the line alone reads better. */
const MAX_DOTS = 26;

/**
 * The rings are the curve's joints and belong on it however many games there
 * are, so they shrink rather than disappear. Below about two and a half pixels
 * a ring stops reading as a ring, and at that point the line alone is honest.
 */
function ringRadius(spacing: number): number {
  return Math.min(5, Math.max(0, spacing / 2.4));
}

interface Props {
  points: MetricPoint[];
  /** Drawn as a dashed rule across the plot — the lifetime figure to beat. */
  baseline?: number | null;
  /** Appended to every number shown, e.g. "%". */
  unit?: string;
  /** What the accented line is, and what the grey dots are. */
  subject?: string;
  context?: string;
  /** Axis bounds, when the metric has natural ones — a percentage is 0..100. */
  scale?: { min: number; max: number };
}

/**
 * One metric over time.
 *
 * An emphasis chart, not a two-series one: the rolling average is the story
 * and takes the accent, while individual games are context in the
 * de-emphasis grey. Both are the same measure on one scale — a second axis
 * would be the easiest way to make this chart lie.
 */
export function ScoreTrendChart({
  points,
  baseline = null,
  unit = '',
  subject = 'Rolling average',
  context = 'Each game',
  scale,
}: Props) {
  const hover = useHoverIndex(points.length, PAD.left, PAD.right);

  // Every hook runs on every render, so the scale is worked out before the
  // "not enough games yet" case rather than after it.
  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.flatMap((p) => [p.value, p.rolling]);
    const { min, max, ticks } = scale
      ? fixedScale(scale.min, scale.max)
      : niceScale(Math.min(...values), Math.max(...values));

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const step = plotW / (points.length - 1);

    return {
      ticks,
      plotH,
      x: (i: number) => PAD.left + i * step,
      y: (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH,
    };
  }, [points]);

  const rollingTarget = useMemo(
    () => (geometry ? points.map((p, i) => ({ x: geometry.x(i), y: geometry.y(p.rolling) })) : []),
    [points, geometry],
  );
  const scoreTarget = useMemo(
    () => (geometry ? points.map((p, i) => ({ x: geometry.x(i), y: geometry.y(p.value) })) : []),
    [points, geometry],
  );

  const rolling = useTweenedPoints(rollingTarget);
  const scores = useTweenedPoints(scoreTarget);

  if (!geometry || points.length < 2) {
    return <p className="empty">Two finished games and the trend starts here.</p>;
  }

  const { ticks, x, y, plotH } = geometry;
  const floor = PAD.top + plotH;

  const line = smoothPath(rolling);
  // The same line, closed down to the axis: the handoff fills under it, and the
  // fill is what makes a rise read as a rise rather than as a wandering line.
  const area = `${line} L${rolling[rolling.length - 1].x} ${floor} L${rolling[0].x} ${floor} Z`;

  const active = hover.index === null ? null : points[hover.index];
  const last = points[points.length - 1];
  const tip = rolling[rolling.length - 1];
  const radius = ringRadius((W - PAD.left - PAD.right) / Math.max(1, rolling.length - 1));

  return (
    <div className="viz">
      <svg
        ref={hover.ref}
        className="viz__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${subject} over ${points.length} games, ending at ${last.rolling}${unit}.`}
        onPointerMove={hover.onMove}
        onPointerLeave={hover.onLeave}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="viz__grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="viz__axis-text" x={PAD.left - 6} y={y(tick) + 3} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="viz-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-subject)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--viz-subject)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#viz-trend-fill)" stroke="none" />

        {/* The figure to beat, drawn flat across the plot. Dashed so it reads
            as a reference rather than as a second series. */}
        {baseline !== null && baseline >= 0 && (
          <line
            className="viz__baseline"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(baseline)}
            y2={y(baseline)}
          />
        )}

        {/* Context first, so the subject line sits above it. Keyed by position
            rather than by game: the marker for slot 3 has to be the same
            element from one range to the next, or React replaces it and it
            appears at its new home instead of travelling there. */}
        {points.length <= MAX_DOTS &&
          scores.map((p, i) => (
            <circle
              key={i}
              className="viz__dot"
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="var(--viz-context)"
            />
          ))}

        <path className="viz__line viz__line--draw" d={line} stroke="var(--viz-subject)" pathLength={1} />

        {/* Open rings on the line itself, big enough to tap. The handoff draws
            these rather than filled dots: a ring sits *on* the curve instead of
            hiding the piece of it underneath. */}
        {radius >= 2.5 &&
          rolling.map((p, i) => (
            <circle
              key={`r${i}`}
              className="viz__ring-dot"
              cx={p.x}
              cy={p.y}
              r={radius}
              strokeWidth={radius >= 4 ? 2 : 1.5}
            />
          ))}

        {/* The endpoint is always drawn, however many games there are. */}
        <circle
          className="viz__ring-dot viz__ring-dot--last"
          cx={tip.x}
          cy={tip.y}
          r={Math.max(4, radius + 0.5)}
        />

        {hover.index !== null && active && (
          <>
            <line
              className="viz__crosshair"
              x1={x(hover.index)}
              x2={x(hover.index)}
              y1={PAD.top}
              y2={PAD.top + plotH}
            />
            <circle
              className="viz__dot"
              cx={scores[hover.index]?.x ?? x(hover.index)}
              cy={scores[hover.index]?.y ?? y(active.value)}
              r={4}
              fill="var(--viz-context)"
            />
          </>
        )}

        <text className="viz__axis-text" x={PAD.left} y={H - 6}>
          {formatDate(points[0].playedAt)}
        </text>
        <text className="viz__axis-text" x={W - PAD.right} y={H - 6} textAnchor="end">
          {formatDate(last.playedAt)}
        </text>
      </svg>

      {hover.index !== null && active && (
        <div
          className="viz__tooltip"
          style={{
            left: `${(x(hover.index) / W) * 100}%`,
            top: `${(y(Math.max(active.value, active.rolling)) / H) * 100}%`,
            // Centring on the point pushes the box out of the card at either
            // end, so the anchor follows the edge it is near.
            transform: `translate(${anchorX(hover.index, points.length)}, -100%)`,
          }}
        >
          <div className="viz__tooltip-label">{formatDate(active.playedAt)}</div>
          <div className="tnum">
            {context} <strong>
              {active.value}
              {unit}
            </strong>
          </div>
          <div className="tnum" style={{ color: 'var(--color-accent-300)' }}>
            {subject} <strong>
              {active.rolling}
              {unit}
            </strong>
          </div>
        </div>
      )}

      <p className="footnote" style={{ margin: '6px 0 0' }}>
        Dashed line = lifetime average. Tap a point for detail.
      </p>

      <div className="viz__legend">
        <span className="viz__legend-item">
          <span className="viz__swatch viz__swatch--line" style={{ background: 'var(--viz-subject)' }} />
          {subject}
        </span>
        <span className="viz__legend-item">
          <span
            className="viz__swatch"
            style={{ background: 'var(--viz-context)', borderRadius: '50%', width: 8, height: 8 }}
          />
          {context}
        </span>
      </div>

      <DataTable
        caption={`${context} and ${subject.toLowerCase()} per game`}
        columns={['Date', context, subject]}
        rows={points.map((p) => [
          formatDate(p.playedAt),
          `${p.value}${unit}`,
          `${p.rolling}${unit}`,
        ])}
      />
    </div>
  );
}

/** Keep the tooltip inside the card by anchoring it away from a near edge. */
function anchorX(index: number, count: number): string {
  const position = count <= 1 ? 0.5 : index / (count - 1);
  if (position < 0.2) return '0%';
  if (position > 0.8) return '-100%';
  return '-50%';
}

/**
 * A curve through the points rather than a dogleg at each one.
 *
 * Catmull-Rom converted to cubic béziers: each control point is derived from
 * the neighbours, so the curve passes exactly through every reading and only
 * the path *between* them is smoothed. A spline that misses its own data
 * would be a drawing, not a chart.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

  let d = `M${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
  }

  return d;
}

/**
 * An axis with bounds the metric itself imposes.
 *
 * A percentage runs 0 to 100 whatever the data does. Letting it auto-scale
 * would turn a wobble between 61% and 64% into a mountain range, which is the
 * most common way a true chart tells a lie.
 */
function fixedScale(min: number, max: number) {
  const ticks: number[] = [];
  const stride = (max - min) / 4;
  for (let v = min; v <= max; v += stride) ticks.push(Math.round(v));
  return { min, max, ticks };
}

/** Round an axis out to clean numbers so the ticks are readable values. */
function niceScale(low: number, high: number) {
  const stepSize = 25;
  const min = Math.max(0, Math.floor(low / stepSize) * stepSize - stepSize);
  const max = Math.min(300, Math.ceil(high / stepSize) * stepSize + stepSize);

  const ticks: number[] = [];
  // At most five gridlines; more turns the plot into graph paper.
  const stride = Math.max(stepSize, Math.ceil((max - min) / 4 / stepSize) * stepSize);
  for (let v = min; v <= max; v += stride) ticks.push(v);

  return { min, max: Math.max(max, min + stride), ticks };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
