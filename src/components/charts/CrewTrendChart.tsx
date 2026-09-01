import { useState } from 'react';
import { t, tf } from '../../lib/i18n';
import { crewWeeklyAverage, weeklyProgress, TREND_WEEKS, type Member } from '../../lib/leaderboard';
import { DataTable } from './DataTable';

const W = 320;
const H = 140;
const PAD = { left: 22, right: 24, top: 14, bottom: 32 };

/**
 * You against the crew, week by week.
 *
 * An emphasis chart: your line takes the accent and a glow, the crew's average
 * is grey context behind it, and a dashed rule marks your own average across
 * the window. Two lines and no second axis — both are pin averages on one
 * scale, and the whole question is the gap between them.
 *
 * Points are tappable rather than hover-only. This screen is opened on a phone
 * at a bowling alley, and a hover target is not reachable there; each point
 * carries a transparent 15px circle so the thing being hit is a thumb-sized
 * target rather than the 3px dot being aimed at.
 */
export function CrewTrendChart({ members }: { members: Member[] }) {
  const [chosen, setChosen] = useState<number | null>(null);

  const me = members.find((member) => member.isMe);
  if (!me || members.length < 2) return null;

  const mine = weeklyProgress(me);
  const crew = crewWeeklyAverage(members);

  const values = [...mine, ...crew];
  const low = Math.floor((Math.min(...values) - 6) / 10) * 10;
  const high = Math.ceil((Math.max(...values) + 6) / 10) * 10;
  const span = Math.max(1, high - low);

  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (TREND_WEEKS - 1);
  const y = (value: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (value - low) / span);
  const line = (series: number[]) =>
    series.map((value, i) => `${i ? 'L' : 'M'}${x(i)} ${y(value)}`).join(' ');

  const myAverage = Math.round(mine.reduce((sum, value) => sum + value, 0) / mine.length);
  const ticks = [0, 1, 2, 3].map((k) => Math.round(low + span * (k / 3)));

  const weekLabel = (i: number) =>
    i === TREND_WEEKS - 1 ? t('This week') : tf('Week {n}', { n: i + 1 });

  return (
    <div className="viz">
      <svg
        className="viz__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={tf('Your average against the crew over {n} weeks.', { n: TREND_WEEKS })}
      >
        <defs>
          <linearGradient id="crew-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-subject)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--viz-subject)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <line
            key={tick}
            className="viz__grid"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
          />
        ))}

        {/* Your own average across the window, so a week reads as above or
            below your usual rather than only against the crew. */}
        <line
          className="viz__baseline"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(myAverage)}
          y2={y(myAverage)}
        />

        <path
          d={`${line(mine)} L${x(TREND_WEEKS - 1)} ${y(low)} L${x(0)} ${y(low)} Z`}
          fill="url(#crew-trend-fill)"
          stroke="none"
        />

        <path className="crewline crewline--them" d={line(crew)} />
        <path className="crewline crewline--me viz__line--draw" d={line(mine)} pathLength={1} />

        {mine.map((value, i) => {
          const on = chosen === i;
          const last = i === TREND_WEEKS - 1;

          return (
            <g key={i} className="crewpt" style={{ animationDelay: `${(0.15 + i * 0.05).toFixed(2)}s` }}>
              <circle
                className="crewpt__dot"
                cx={x(i)}
                cy={y(value)}
                r={on ? 5.5 : last ? 4 : 2.6}
                fill={on ? 'var(--viz-subject)' : 'var(--color-bg)'}
                strokeWidth={on ? 3 : last ? 2.6 : 1.8}
              />
              {/* The target is a thumb, not the dot. */}
              <circle
                cx={x(i)}
                cy={y(value)}
                r={15}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => setChosen(on ? null : i)}
              />
              <text
                className="crewpt__label"
                x={x(i)}
                y={H - 14}
                textAnchor="middle"
                fill={on ? 'var(--color-accent-300)' : 'var(--color-neutral-600)'}
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {chosen !== null && (
        <div className="crewtip">
          <div className="crewtip__week">{weekLabel(chosen)}</div>
          <div className="row row--between">
            <span>{t('You')}</span>
            <span className="tnum">{mine[chosen]}</span>
          </div>
          <div className="row row--between" style={{ color: 'var(--color-neutral-400)' }}>
            <span>{t('Crew average')}</span>
            <span className="tnum">{crew[chosen]}</span>
          </div>
          <div
            className="row row--between crewtip__delta"
            data-direction={mine[chosen] >= crew[chosen] ? 'up' : 'down'}
          >
            <span>{t('Difference')}</span>
            <span className="tnum">
              {mine[chosen] - crew[chosen] > 0 ? '+' : ''}
              {mine[chosen] - crew[chosen]}
            </span>
          </div>
        </div>
      )}

      <div className="viz__legend">
        <span className="viz__legend-item">
          <span className="viz__swatch viz__swatch--line" style={{ background: 'var(--viz-subject)' }} />
          {t('You')}
        </span>
        <span className="viz__legend-item">
          <span className="viz__swatch viz__swatch--line" style={{ background: 'var(--viz-context)' }} />
          {t('Crew average')}
        </span>
      </div>

      <DataTable
        caption={t('Your average against the crew, week by week')}
        columns={[t('Week'), t('You'), t('Crew average')]}
        rows={mine.map((value, i) => [i + 1, value, crew[i]])}
      />
    </div>
  );
}
