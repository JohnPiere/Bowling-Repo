import { useState } from 'react';
import { DataTable } from './DataTable';

const W = 320;
const H = 130;
const PAD = { left: 24, right: 8, top: 10, bottom: 24 };
/** Cap the bar so a wide chart keeps air in the band rather than filling it. */
const MAX_BAR = 24;

/**
 * How many pins the first ball of a frame takes down.
 *
 * One hue for every column: bar height already carries the magnitude, so
 * colouring by value would spend the identity channel re-encoding it. The
 * buckets are the x-axis, not series.
 */
export function FirstBallChart({ counts }: { counts: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return <p className="empty">No frames in this range.</p>;
  }

  const max = Math.max(...counts);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / counts.length;
  const barW = Math.min(MAX_BAR, band - 4);

  return (
    <div className="viz">
      <svg
        className="viz__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`First-ball distribution across ${total} frames.`}
        onPointerLeave={() => setHover(null)}
      >
        <line
          className="viz__grid"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
        />

        {counts.map((count, pins) => {
          const height = max === 0 ? 0 : (count / max) * plotH;
          const x = PAD.left + pins * band + (band - barW) / 2;
          const y = PAD.top + plotH - height;
          const isStrike = pins === 10;

          return (
            <g key={pins} onPointerEnter={() => setHover(pins)}>
              {/* A full-height hit target: a 2px bar is impossible to hover. */}
              <rect
                x={PAD.left + pins * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
              />
              {count > 0 && (
                <path
                  className="viz__bar"
                  // Stagger so the bars arrive as a run rather than a block,
                  // left to right, the way the pins are counted.
                  style={{ animationDelay: `${pins * 24}ms` }}
                  d={columnPath(x, y, barW, Math.max(2, height))}
                  fill={isStrike ? 'var(--viz-step-1)' : 'var(--viz-subject)'}
                  opacity={hover === null || hover === pins ? 1 : 0.45}
                />
              )}
              <text
                className="viz__axis-text"
                x={PAD.left + pins * band + band / 2}
                y={H - 10}
                textAnchor="middle"
              >
                {isStrike ? 'X' : pins}
              </text>
            </g>
          );
        })}

        <text className="viz__axis-text" x={PAD.left - 6} y={PAD.top + 6} textAnchor="end">
          {max}
        </text>
      </svg>

      {hover !== null && (
        <div className="viz__tooltip" style={{ left: `${((hover + 0.5) / counts.length) * 100}%`, top: 0 }}>
          <div className="viz__tooltip-label">
            {hover === 10 ? 'Strike' : `${hover} pin${hover === 1 ? '' : 's'}`}
          </div>
          <div className="tnum">
            <strong>{counts[hover]}</strong> frames · {Math.round((counts[hover] / total) * 100)}%
          </div>
        </div>
      )}

      <DataTable
        caption="First-ball pin counts"
        columns={['First ball', 'Frames', 'Share']}
        rows={counts.map((count, pins) => [
          pins === 10 ? 'Strike' : String(pins),
          count,
          `${Math.round((count / total) * 100)}%`,
        ])}
      />
    </div>
  );
}

/**
 * A column with a rounded cap and a square foot.
 *
 * `rect rx` rounds all four corners, which turns a short bar into a pill and
 * lifts it off its own baseline. The radius also shrinks on a stubby column so
 * the cap never swallows the whole bar.
 */
function columnPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  return [
    `M${x} ${y + height}`,
    `L${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `L${x + width - r} ${y}`,
    `Q${x + width} ${y} ${x + width} ${y + r}`,
    `L${x + width} ${y + height}`,
    'Z',
  ].join(' ');
}
