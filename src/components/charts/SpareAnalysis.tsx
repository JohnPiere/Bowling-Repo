import type { ConversionByType, SpareBreakdown } from '../../lib/stats';
import { t } from '../../lib/i18n';
import { DataTable } from './DataTable';

const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** What the house expects of a decent bowler; the bars are read against it. */
const GOAL = 0.65;

/**
 * Where the spares came from, and how often each kind goes.
 *
 * Two questions, two shapes. The split between single-pin and multi-pin spares
 * is a part-to-whole, so it is a ring — one number against its own maximum,
 * where the shape *is* the proportion. The conversion rates are two
 * independent percentages measured against a shared goal, so they are bars: a
 * second ring could not be read against the first.
 */
export function SpareAnalysis({
  breakdown,
  conversion,
  games,
}: {
  breakdown: SpareBreakdown;
  conversion: ConversionByType;
  games: number;
}) {
  if (breakdown.total === 0) {
    return (
      <p className="empty">
        {t('No spares with pin data in this range. Score a game on the rack and the split appears here.')}
      </p>
    );
  }

  const singleShare = breakdown.single / breakdown.total;

  const rate = (bucket: { attempts: number; converted: number }) =>
    bucket.attempts === 0 ? null : bucket.converted / bucket.attempts;

  const single = rate(conversion.single);
  const multi = rate(conversion.multi);

  return (
    <>
      {/* `.viz` carries the dataviz palette; the ring's colours resolve to
          nothing outside it. */}
      <div className="card viz">
        <div className="spare">
          <svg
            className="viz__ring"
            viewBox="0 0 100 100"
            width="112"
            height="112"
            role="img"
            aria-label={`${Math.round(singleShare * 100)} percent of spares were taken from a single pin.`}
          >
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--viz-step-3)" strokeWidth="11" />
            <circle
              className="viz__ring-value"
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="var(--viz-step-1)"
              strokeWidth="11"
              strokeDasharray={CIRCUMFERENCE}
              style={
                {
                  '--viz-sweep-from': CIRCUMFERENCE,
                  '--viz-sweep-to': CIRCUMFERENCE * (1 - singleShare),
                  strokeDashoffset: CIRCUMFERENCE * (1 - singleShare),
                } as React.CSSProperties
              }
            />
          </svg>

          <div className="grow">
            <Legend
              swatch="var(--viz-step-1)"
              label="Single-pin spares"
              value={`${breakdown.single} · ${Math.round(singleShare * 100)}%`}
            />
            <Legend
              swatch="var(--viz-step-3)"
              label="Multi-pin spares"
              value={`${breakdown.multi} · ${Math.round((1 - singleShare) * 100)}%`}
            />
            <p className="footnote" style={{ margin: '8px 0 0' }}>
              {breakdown.total} spare{breakdown.total === 1 ? '' : 's'} converted across {games}{' '}
              game{games === 1 ? '' : 's'} scored on the rack.
            </p>
          </div>
        </div>
      </div>

      <div className="card viz">
        <div className="hero__label" style={{ marginBottom: 10 }}>
          Conversion rate vs {Math.round(GOAL * 100)}% goal
        </div>

        <GoalBar label="Single pin" rate={single} attempts={conversion.single.attempts} />
        <GoalBar label="Multi pin" rate={multi} attempts={conversion.multi.attempts} />

        <DataTable
          caption={t('Spare attempts and conversions by what was left')}
          columns={['Left', 'Attempts', 'Converted']}
          rows={[
            ['One pin', conversion.single.attempts, conversion.single.converted],
            ['Two or more', conversion.multi.attempts, conversion.multi.converted],
          ]}
        />
      </div>
    </>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="spare__row">
      <span className="viz__swatch" style={{ background: swatch }} />
      <span className="grow">{label}</span>
      <span className="tnum spare__value">{value}</span>
    </div>
  );
}

function GoalBar({
  label,
  rate,
  attempts,
}: {
  label: string;
  rate: number | null;
  attempts: number;
}) {
  return (
    <div className="goalbar">
      <span className="goalbar__label">{label}</span>
      <span className="goalbar__track">
        {rate !== null && (
          <span className="goalbar__fill" style={{ width: `${Math.round(rate * 100)}%` }} />
        )}
        {/* The goal, as a notch in the track rather than a number beside it. */}
        <span className="goalbar__goal" style={{ left: `${GOAL * 100}%` }} />
      </span>
      <span className="tnum goalbar__value">
        {rate === null ? '—' : `${Math.round(rate * 100)}%`}
      </span>
      <span className="goalbar__attempts tnum">
        {attempts} tr{attempts === 1 ? 'y' : 'ies'}
      </span>
    </div>
  );
}
