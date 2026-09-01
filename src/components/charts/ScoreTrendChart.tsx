import { useMemo } from 'react';
import type { TrendPoint } from '../../lib/stats';
import { DataTable } from './DataTable';
import { useHoverIndex } from './useHoverIndex';
import { useTweenedPoints } from './useTweenedPoints';

const W = 320;
const H = 150;
const PAD = { left: 30, right: 10, top: 12, bottom: 22 };

/** Dots crowd into a smear past this many games; the line alone reads better. */
const MAX_DOTS = 26;

/**
 * Score over time.
 *
 * An emphasis chart, not a two-series one: the rolling average is the story
 * and takes the accent, while individual games are context in the
 * de-emphasis grey. Both are pin scores on one scale — a second axis would
 * be the easiest way to make this chart lie.
 */
export function ScoreTrendChart({ points }: { points: TrendPoint[] }) {
  const hover = useHoverIndex(points.length, PAD.left, PAD.right);

  // Every hook runs on every render, so the scale is worked out before the
  // "not enough games yet" case rather than after it.
  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.flatMap((p) => [p.score, p.rolling]);
    const { min, max, ticks } = niceScale(Math.min(...values), Math.max(...values));

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
    () => (geometry ? points.map((p, i) => ({ x: geometry.x(i), y: geometry.y(p.score) })) : []),
    [points, geometry],
  );

  const rolling = useTweenedPoints(rollingTarget);
  const scores = useTweenedPoints(scoreTarget);

  if (!geometry || points.length < 2) {
    return <p className="empty">Two finished games and the trend starts here.</p>;
  }

  const { ticks, x, y, plotH } = geometry;
  const baseline = PAD.top + plotH;

  const line = rolling.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  // The same line, closed down to the axis: the handoff fills under it, and the
  // fill is what makes a rise read as a rise rather than as a wandering line.
  const area = `${line} L${rolling[rolling.length - 1].x} ${baseline} L${rolling[0].x} ${baseline} Z`;

  const active = hover.index === null ? null : points[hover.index];
  const last = points[points.length - 1];
  const tip = rolling[rolling.length - 1];

  return (
    <div className="viz">
      <svg
        ref={hover.ref}
        className="viz__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Score trend over ${points.length} games. Rolling average ends at ${last.rolling}.`}
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

        {/* Only the endpoint is labelled — a number on every point goes unread. */}
        <circle className="viz__dot" cx={tip.x} cy={tip.y} r={4} fill="var(--viz-subject)" />

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
              cy={scores[hover.index]?.y ?? y(active.score)}
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
            top: `${(y(Math.max(active.score, active.rolling)) / H) * 100}%`,
            // Centring on the point pushes the box out of the card at either
            // end, so the anchor follows the edge it is near.
            transform: `translate(${anchorX(hover.index, points.length)}, -100%)`,
          }}
        >
          <div className="viz__tooltip-label">{formatDate(active.playedAt)}</div>
          <div className="tnum">
            Game <strong>{active.score}</strong>
          </div>
          <div className="tnum" style={{ color: 'var(--color-accent-300)' }}>
            Rolling avg <strong>{active.rolling}</strong>
          </div>
        </div>
      )}

      <div className="viz__legend">
        <span className="viz__legend-item">
          <span className="viz__swatch viz__swatch--line" style={{ background: 'var(--viz-subject)' }} />
          Rolling average
        </span>
        <span className="viz__legend-item">
          <span
            className="viz__swatch"
            style={{ background: 'var(--viz-context)', borderRadius: '50%', width: 8, height: 8 }}
          />
          Each game
        </span>
      </div>

      <DataTable
        caption="Score and rolling average per game"
        columns={['Date', 'Game', 'Rolling avg']}
        rows={points.map((p) => [formatDate(p.playedAt), p.score, p.rolling])}
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
