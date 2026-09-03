import { t } from '../lib/i18n';
import type { Tally } from '../lib/stats';

interface Props {
  lifetime: Tally;
  /** This calendar month, when there is one worth showing beside it. */
  month?: Tally;
  /** What the second column is called — the month's own name reads best. */
  monthLabel?: string;
}

/**
 * The numbers that only go up.
 *
 * Everything else in the analytics screen is a rate or an average: it moves
 * both ways and says how somebody is bowling *now*. These say how much has
 * been bowled, full stop, and nothing else in the app answers that — a season
 * is 40 games and an average of 148, and it is also eleven thousand pins.
 *
 * Two columns rather than two cards, because the comparison is the point: a
 * month beside a lifetime is the only thing that says whether this month is a
 * busy one. Drawn as a table on purpose — the handoff asks for a table behind
 * every chart, and here the table *is* the chart.
 */
export function TallyCard({ lifetime, month, monthLabel }: Props) {
  const rows: { label: string; all: number; now: number }[] = [
    { label: t('Games'), all: lifetime.games, now: month?.games ?? 0 },
    { label: t('Frames'), all: lifetime.frames, now: month?.frames ?? 0 },
    { label: t('Balls thrown'), all: lifetime.balls, now: month?.balls ?? 0 },
    { label: t('Pins knocked down'), all: lifetime.pins, now: month?.pins ?? 0 },
    { label: t('Strikes'), all: lifetime.strikes, now: month?.strikes ?? 0 },
    { label: t('Spares'), all: lifetime.spares, now: month?.spares ?? 0 },
    { label: t('Open frames'), all: lifetime.opens, now: month?.opens ?? 0 },
    { label: t('Gutters and misses'), all: lifetime.zeroBalls, now: month?.zeroBalls ?? 0 },
  ];

  return (
    <div className="card">
      <table className="tally">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" className="tally__head">
              {t('All time')}
            </th>
            {month && (
              <th scope="col" className="tally__head">
                {monthLabel ?? t('This month')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="tally__label">
                {row.label}
              </th>
              <td className="tally__value tnum">{row.all.toLocaleString()}</td>
              {month && <td className="tally__value tally__value--now tnum">{row.now.toLocaleString()}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Both of these have been got wrong by people reading a bowling app, and
          one of them is got wrong by the app next door: `Summary.totalPins` is
          a sum of scores. Saying which is meant costs two lines. */}
      <p className="footnote" style={{ marginBottom: 0 }}>
        {t(
          'Pins are pins knocked down, not score — a perfect game is 300 points and 120 pins. The tenth counts as three strikes when you throw three.',
        )}
      </p>
    </div>
  );
}
