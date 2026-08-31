import type { BallOutcomes } from '../../lib/stats';
import { DataTable } from './DataTable';

/**
 * How frames finish: struck, spared, or left open.
 *
 * Part-to-whole, so a stacked bar. The three classes are a quality order
 * rather than three unrelated identities, so they take one hue in monotone
 * lightness steps — brighter is better — instead of three categorical hues
 * that would imply the classes are unrelated.
 */
export function OutcomeSplitChart({ outcomes }: { outcomes: BallOutcomes }) {
  const total = outcomes.strikes + outcomes.spares + outcomes.opens;

  if (total === 0) {
    return <p className="empty">No finished frames in this range.</p>;
  }

  const segments = [
    { key: 'Strikes', value: outcomes.strikes, fill: 'var(--viz-step-1)', ink: '#1b1830' },
    { key: 'Spares', value: outcomes.spares, fill: 'var(--viz-step-2)', ink: '#16131f' },
    { key: 'Open', value: outcomes.opens, fill: 'var(--viz-step-3)', ink: '#ece9ff' },
  ];

  return (
    <div className="viz">
      <div
        className="viz__stack"
        role="img"
        aria-label={segments
          .map((s) => `${s.key} ${Math.round((s.value / total) * 100)} percent`)
          .join(', ')}
      >
        {segments.map((segment) => {
          const share = segment.value / total;
          return (
            <div
              key={segment.key}
              className="viz__stack-seg"
              style={{
                flex: `1 1 ${share * 100}%`,
                background: segment.fill,
                // Ink is picked against the fill's own luminance, the one place
                // a label may wear a colour set by the data.
                color: segment.ink,
              }}
            >
              {/* Only label a segment wide enough to hold the text; a clipped
                  label is worse than none, and the table carries every value. */}
              {share >= 0.14 ? `${Math.round(share * 100)}%` : ''}
            </div>
          );
        })}
      </div>

      <div className="viz__legend">
        {segments.map((segment) => (
          <span key={segment.key} className="viz__legend-item">
            <span className="viz__swatch" style={{ background: segment.fill }} />
            {segment.key} <span className="tnum">{segment.value}</span>
          </span>
        ))}
      </div>

      <DataTable
        caption="Frame outcomes"
        columns={['Outcome', 'Frames', 'Share']}
        rows={segments.map((s) => [s.key, s.value, `${Math.round((s.value / total) * 100)}%`])}
      />
    </div>
  );
}
