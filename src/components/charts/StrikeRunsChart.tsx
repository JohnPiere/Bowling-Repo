import { DataTable } from './DataTable';
import { t } from '../../lib/i18n';

/**
 * How often each length of strike run happened.
 *
 * A run of four counts once, as a four — not as two threes. The question is
 * "how often did I string four together", and counting the overlaps inside a
 * longer run would answer a different one and inflate every short bar.
 *
 * Bars rather than a line: the lengths are separate buckets, not a series, and
 * there is nothing between 3X and 4X to interpolate.
 */
export function StrikeRunsChart({ runs }: { runs: number[] }) {
  // runs[0] is meaningless — a run of zero strikes is just a frame.
  const buckets = runs.slice(1);
  const peak = Math.max(...buckets, 0);

  if (peak === 0) {
    return <p className="empty">{t('No strikes in this range yet.')}</p>;
  }

  const longest = buckets.reduce((best, count, i) => (count > 0 ? i + 1 : best), 0);

  return (
    <div className="viz">
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <span className="hero__label">{t('Consecutive strikes')}</span>
        <span className="tnum" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>
          Longest: {longest}
        </span>
      </div>

      <div className="runs" role="img" aria-label={buckets
        .map((count, i) => `${i + 1} in a row, ${count} times`)
        .join('. ')}
      >
        {buckets.map((count, i) => (
          <div key={i} className="runs__col">
            <span className="runs__count tnum">{count || ''}</span>
            <span
              className="runs__bar"
              style={{
                // A floor, so a bucket with one occurrence is still visible
                // rather than a hairline nobody can see.
                height: `${count === 0 ? 3 : Math.max(8, (count / peak) * 100)}%`,
                animationDelay: `${i * 30}ms`,
                opacity: count === 0 ? 0.3 : 1,
              }}
            />
            <span className="runs__label tnum">{i + 1}X</span>
          </div>
        ))}
      </div>

      <p className="footnote">{t('Consecutive strikes per occurrence, across this range.')}</p>

      <DataTable
        caption={t('Strike runs by length')}
        columns={['Run', 'Times']}
        rows={buckets.map((count, i) => [`${i + 1} in a row`, count])}
      />
    </div>
  );
}
