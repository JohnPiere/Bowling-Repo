import type { BallOutcomes } from '../../lib/stats';
import { DataTable } from './DataTable';

/** Matches the handoff's ring: r=40 in a 100-square viewBox. */
const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * Spare conversion, as a ring that fills clockwise from twelve.
 *
 * One number against its own maximum, which is the one case a ring beats a bar:
 * the shape *is* the proportion, and the empty part of the track is the misses.
 * It is not used for anything with parts to compare — a ring cannot be read
 * against another ring, which is why the frame outcomes stay a stacked bar.
 *
 * Conversion counts only frames where a spare was possible. A strike is not a
 * missed spare, so including strikes would quietly reward striking twice and
 * make the number mean nothing.
 */
export function SpareRing({ outcomes }: { outcomes: BallOutcomes }) {
  const attempts = outcomes.spares + outcomes.opens;

  if (attempts === 0) {
    return <p className="empty">No spare attempts in this range — every frame was struck.</p>;
  }

  const share = outcomes.spares / attempts;
  const percent = Math.round(share * 100);

  return (
    <div className="viz">
      <div className="viz__ring-wrap">
        <svg
          className="viz__ring"
          viewBox="0 0 100 100"
          width="132"
          height="132"
          role="img"
          aria-label={`Spare conversion ${percent} percent, from ${attempts} attempts.`}
        >
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--viz-grid)" strokeWidth="9" />
          <circle
            className="viz__ring-value"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--viz-subject)"
            strokeWidth="9"
            strokeDasharray={CIRCUMFERENCE}
            style={
              {
                // The animation runs between these two, so the ring sweeps from
                // empty to wherever this reading lands.
                '--viz-sweep-from': CIRCUMFERENCE,
                '--viz-sweep-to': CIRCUMFERENCE * (1 - share),
                strokeDashoffset: CIRCUMFERENCE * (1 - share),
              } as React.CSSProperties
            }
          />
        </svg>

        <div className="viz__ring-label">
          <strong className="tnum">{percent}%</strong>
          <span className="tnum">
            {outcomes.spares} of {attempts}
          </span>
        </div>
      </div>

      <DataTable
        caption="Spare attempts and conversions"
        columns={['', 'Frames']}
        rows={[
          ['Spared', outcomes.spares],
          ['Left open', outcomes.opens],
          ['Attempts', attempts],
        ]}
      />
    </div>
  );
}
