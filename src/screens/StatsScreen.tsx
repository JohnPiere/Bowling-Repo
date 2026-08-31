import { useMemo, useState } from 'react';
import { FirstBallChart } from '../components/charts/FirstBallChart';
import { OutcomeSplitChart } from '../components/charts/OutcomeSplitChart';
import { ScoreTrendChart } from '../components/charts/ScoreTrendChart';
import type { Game } from '../lib/db';
import {
  applyRange,
  ballOutcomes,
  bestStrikeRun,
  firstBallDistribution,
  leaveRecords,
  RANGES,
  scoreTrend,
  splitSummary,
  summarise,
  type RangeKey,
} from '../lib/stats';

/**
 * Analytics.
 *
 * Every chart reads the same range selector, so the screen answers one
 * question at a time rather than mixing periods.
 */
export function StatsScreen({ games }: { games: Game[] }) {
  const [range, setRange] = useState<RangeKey>('all');

  const inRange = useMemo(() => applyRange(games, range), [games, range]);
  const summary = useMemo(() => summarise(inRange), [inRange]);
  const trend = useMemo(() => scoreTrend(inRange), [inRange]);
  const outcomes = useMemo(() => ballOutcomes(inRange.filter((g) => g.isComplete)), [inRange]);
  const firstBalls = useMemo(
    () => firstBallDistribution(inRange.filter((g) => g.isComplete)),
    [inRange],
  );
  const bestRun = useMemo(() => bestStrikeRun(inRange), [inRange]);
  const leaves = useMemo(() => leaveRecords(inRange), [inRange]);
  const splits = useMemo(() => splitSummary(inRange), [inRange]);

  if (summary.games === 0) {
    return (
      <>
        <RangePicker range={range} onChange={setRange} />
        <p className="empty">
          No finished games in this range. Bowl one, or widen the range above.
        </p>
      </>
    );
  }

  return (
    <>
      <RangePicker range={range} onChange={setRange} />

      {/* A KPI row, not a bar chart — these are headline numbers, not a series. */}
      <div className="quickstats">
        <Stat label="Average" value={summary.average} />
        <Stat label="High game" value={summary.high} />
        <Stat label="Strike rate" value={summary.strikeRate} suffix="%" />
      </div>
      <div className="quickstats">
        <Stat label="Games" value={summary.games} />
        <Stat label="Total pins" value={summary.totalPins?.toLocaleString()} />
        <Stat label="Best run" value={bestRun} suffix="×" />
      </div>

      <h2 className="section-title">Score trend</h2>
      <div className="card">
        <ScoreTrendChart points={trend} />
      </div>

      <h2 className="section-title">How frames finish</h2>
      <div className="card">
        <OutcomeSplitChart outcomes={outcomes} />
      </div>

      {leaves.length > 0 && (
        <>
          <h2 className="section-title">What you leave</h2>
          <div className="card">
            {splits.faced > 0 && (
              <div className="row row--between" style={{ marginBottom: 12 }}>
                <span className="grow">
                  <span style={{ display: 'block', fontSize: 13 }}>Splits</span>
                  <span className="muted tnum">
                    {splits.converted} of {splits.faced} picked up
                  </span>
                </span>
                <span className="tnum" style={{ fontSize: 21 }}>
                  {splits.rate}%
                </span>
              </div>
            )}

            {/* The handful worth looking at; the tail is noise. */}
            {leaves.slice(0, 6).map((leave) => {
              const rate = Math.round((leave.converted / leave.times) * 100);
              return (
                <div key={leave.pins.join('-')} className="leave-row">
                  <span className="grow">
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: leave.isSplit ? 'var(--negative)' : 'var(--color-text)',
                      }}
                    >
                      {leave.label}
                    </span>
                    <span className="muted tnum">
                      {leave.times} time{leave.times === 1 ? '' : 's'} · {leave.converted} picked up
                    </span>
                  </span>
                  {/* Bar length is the conversion rate, so a row that is
                      mostly empty is one to practise. */}
                  <span className="leave-row__bar">
                    <span
                      className="leave-row__fill"
                      style={{ width: `${Math.max(2, rate)}%` }}
                    />
                  </span>
                  <span className="tnum" style={{ fontSize: 13, minWidth: 34, textAlign: 'right' }}>
                    {rate}%
                  </span>
                </div>
              );
            })}

            <p className="footnote" style={{ marginBottom: 0 }}>
              From {splits.framesWithPins} frame{splits.framesWithPins === 1 ? '' : 's'} scored on
              the rack. Games entered by count, or imported from a sheet, know how many pins fell
              but not which.
            </p>
          </div>
        </>
      )}

      <h2 className="section-title">First ball</h2>
      <div className="card">
        <FirstBallChart counts={firstBalls} />
        <p className="footnote" style={{ marginBottom: 0 }}>
          Counts the ball thrown at a full rack in each frame. The tenth frame's bonus balls are
          left out — they would flatter the distribution.
        </p>
      </div>
    </>
  );
}

function RangePicker({ range, onChange }: { range: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="chips" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          className="chip"
          aria-pressed={r.key === range}
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
}) {
  return (
    <div className="quickstat">
      <div className="quickstat__value tnum">{value === null ? '—' : `${value}${suffix}`}</div>
      <div className="quickstat__label">{label}</div>
    </div>
  );
}
