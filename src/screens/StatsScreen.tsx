import { useMemo, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Achievements } from '../components/Achievements';
import { TallyCard } from '../components/TallyCard';
import { PinHeatMap } from '../components/PinHeatMap';
import { Goals } from '../components/Goals';
import { Icon } from '../components/Icon';
import { FirstBallChart } from '../components/charts/FirstBallChart';
import { OutcomeSplitChart } from '../components/charts/OutcomeSplitChart';
import { SpareAnalysis } from '../components/charts/SpareAnalysis';
import { StrikeRunsChart } from '../components/charts/StrikeRunsChart';
import { ScoreTrendChart } from '../components/charts/ScoreTrendChart';
import type { Game } from '../lib/db';
import {
  applyRange,
  ballOutcomes,
  bestStrikeRun,
  firstBallDistribution,
  houseStats,
  leaveRecords,
  conversionByType,
  dailySeries,
  dailyStats,
  METRICS,
  metricChange,
  metricSeries,
  personalRecords,
  pinHeat,
  positionStats,
  practiceTargets,
  RANGES,
  spareBreakdown,
  ballStats,
  conditionStats,
  consistency,
  laneStats,
  splitRecords,
  splitSummary,
  strikeRuns,
  summarise,
  tally,
  thisMonth,
  type GroupedStat,
  type MetricKey,
  type RangeKey,
} from '../lib/stats';
import { badgeStatuses } from '../lib/badges';
import { usePreferences } from '../lib/preferences';
import { formatDay, formatMonthYear } from '../lib/datetime';

/**
 * Analytics.
 *
 * Two selectors over one chart, which is the handoff's shape: the tabs choose
 * *what* is plotted and the chips choose *when*. Four separate charts would
 * take four times the screen to answer questions that share an axis and are
 * only ever asked one at a time.
 *
 * Everything below the chart reads the same range, so the screen never mixes
 * periods.
 */
export function StatsScreen({
  games,
  onOpenSettings,
}: {
  games: Game[];
  onOpenSettings?: () => void;
}) {
  const { preferences } = usePreferences();
  const [range, setRange] = useState<RangeKey>('all');
  const [metric, setMetric] = useState<MetricKey>('avg');

  const inRange = useMemo(() => applyRange(games, range), [games, range]);
  const summary = useMemo(() => summarise(inRange), [inRange]);
  const series = useMemo(() => metricSeries(inRange, metric), [inRange, metric]);
  const change = useMemo(() => metricChange(series), [series]);
  const records = useMemo(() => personalRecords(games), [games]);
  const spares = useMemo(() => spareBreakdown(inRange), [inRange]);
  const conversion = useMemo(() => conversionByType(inRange), [inRange]);
  const runs = useMemo(() => strikeRuns(inRange.filter((g) => g.isComplete)), [inRange]);
  const rackGames = useMemo(() => inRange.filter((g) => g.pinfalls).length, [inRange]);

  // The lifetime figure the range is measured against, drawn as a dashed rule.
  const lifetime = useMemo(() => {
    const all = metricSeries(games, metric);
    return all.length === 0 ? null : all[all.length - 1].rolling;
  }, [games, metric]);
  // Badges are lifetime, not per range: a 200 game does not stop counting
  // because the range moved past it.
  const badges = useMemo(() => badgeStatuses(games), [games]);

  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const outcomes = useMemo(() => ballOutcomes(inRange.filter((g) => g.isComplete)), [inRange]);
  const firstBalls = useMemo(
    () => firstBallDistribution(inRange.filter((g) => g.isComplete)),
    [inRange],
  );
  const bestRun = useMemo(() => bestStrikeRun(inRange), [inRange]);
  const days = useMemo(() => dailyStats(inRange), [inRange]);
  const daily = useMemo(() => dailySeries(days), [days]);
  const leaves = useMemo(() => leaveRecords(inRange), [inRange]);
  const splits = useMemo(() => splitSummary(inRange), [inRange]);
  const targets = useMemo(() => practiceTargets(inRange), [inRange]);
  const positions = useMemo(() => positionStats(inRange), [inRange]);
  const houses = useMemo(() => houseStats(inRange), [inRange]);
  const splitsLeft = useMemo(() => splitRecords(inRange, 8), [inRange]);
  const heat = useMemo(() => pinHeat(inRange), [inRange]);
  // Ranked by what it costs rather than by how often it happens, which is the
  // other question the same list answers.
  const balls = useMemo(() => ballStats(inRange), [inRange]);
  const lanes = useMemo(() => laneStats(inRange), [inRange]);
  const conditions = useMemo(() => conditionStats(inRange), [inRange]);
  const spread = useMemo(() => consistency(inRange), [inRange]);

  const worstSplit = useMemo(
    () => [...splitsLeft].sort((a, b) => b.missRate - a.missRate || b.times - a.times)[0],
    [splitsLeft],
  );
  // Counted over *everything*, deliberately ignoring the range picker above:
  // "how many balls have I thrown" is a lifetime question, and a range chip
  // silently cutting it to the last month would make it a different one.
  const counted = useMemo(() => tally(games), [games]);
  const countedThisMonth = useMemo(() => thisMonth(games), [games]);

  if (summary.games === 0) {
    return (
      <>
        <RangePicker range={range} onChange={setRange} />
        <p className="empty">
          {t('No finished games in this range. Bowl one, or widen the range above.')}
        </p>
      </>
    );
  }

  return (
    <div className="stats">
      {/* Who this season belongs to, and the one number that sums it up. */}
      <div className="profile">
        {/* Initials, the way the handoff draws it — unless a symbol was picked,
            or a photograph, which is the more specific answer to the same
            question and so wins over both. */}
        <div className="profile__mark">
          {preferences.playerPhoto ? (
            <img className="avatar__photo" src={preferences.playerPhoto} alt="" />
          ) : (
            preferences.playerIcon || initials(preferences.playerName)
          )}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="profile__name">{preferences.playerName}</span>
            {onOpenSettings && (
              <button
                type="button"
                className="profile__edit"
                onClick={onOpenSettings}
                aria-label={t('Settings')}
              >
                <Icon name="settings" size={13} />
              </button>
            )}
          </div>
          <div className="profile__meta tnum">
            {since(games)} · {summary.games} game{summary.games === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="profile__label">{t('Best')}</div>
          <div className="profile__best tnum">{records.high}</div>
        </div>
      </div>

      {/* Above the records, because a goal is what you are trying to do and a
          record is what you have already done. */}
      <h2 className="section-title">{t('Goals')}</h2>
      <Goals games={games} />

      <h2 className="section-title">{t('Personal records')}</h2>
      <div className="records">
        <Pr value={records.high} label={t('Highest game')} />
        <Pr value={records.recentAverage} label={t('Best 10-game average')} />
        <Pr value={records.longestStrikeRun} label={t('Longest strike streak')} />
        <Pr value={`${records.sparePercent}%`} label={t('Spare conversion')} />
      </div>

      {spread && (
        <>
          {/* Beside the records rather than in the charts, because it is a
              record of a kind: not how you are bowling but how reliably. */}
          <h2 className="section-title">{t('Consistency')}</h2>
          <div className="card">
            <div className="row row--between" style={{ marginBottom: 8 }}>
              <span className="grow">
                <span className="hero__label">{t('Typical game')}</span>
                <span className="metric__now tnum">
                  {spread.average} ± {spread.spread}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className="hero__label">{t('Steadiness')}</span>
                <span className="metric__now tnum">{spread.score}</span>
              </span>
            </div>
            <p className="footnote" style={{ marginBottom: 0 }}>
              {tf(
                'Half your games land between {low} and {high}. Two bowlers can average the same and be nothing alike — the spread is the part practice moves.',
                { low: spread.low, high: spread.high },
              )}
            </p>
          </div>
        </>
      )}

      {/* The tabs choose what is plotted; the chips choose over what. */}
      <div className="tabs" role="tablist" aria-label={t('Metric')}>
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === metric}
            className={`tabs__tab${m.key === metric ? ' tabs__tab--on' : ''}`}
            onClick={() => setMetric(m.key)}
          >
            {t(m.short)}
          </button>
        ))}
      </div>

      <RangePicker range={range} onChange={setRange} />

      <div className="card">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <span className="grow">
            <span className="hero__label">{t(active.label)}</span>
            <span className="metric__now tnum">
              {change ? change.now : '—'}
              {active.unit}
            </span>
          </span>
          {change && series.length > 1 && (
            <span className="grow" style={{ textAlign: 'right' }}>
              <span className="hero__label">{t('Change')}</span>
              <span
                className="metric__delta tnum"
                style={{
                  color: change.delta === 0 ? 'var(--color-neutral-400)' : undefined,
                }}
                data-direction={change.delta > 0 ? 'up' : change.delta < 0 ? 'down' : 'flat'}
              >
                {change.delta > 0 ? '+' : ''}
                {change.delta}
                {active.unit}
              </span>
            </span>
          )}
        </div>

        <ScoreTrendChart
          points={series}
          baseline={lifetime}
          unit={active.unit}
          subject={`${t(active.short)}`}
          // The grey dots are one game's own reading, whatever the metric is —
          // calling them "Average" would name the line, not them.
          context={t('Each game')}
          scale={active.unit === '%' ? { min: 0, max: 100 } : undefined}
        />
      </div>

      <div className="quickstats">
        <Stat label="Average" value={summary.average} />
        <Stat label="Games" value={summary.games} />
        <Stat label="Best run" value={bestRun} suffix="×" />
      </div>

      {days.length > 1 && (
        <>
          <h2 className="section-title">{t('Day by day')}</h2>
          <div className="card">
            {/* One dot a night, not one a game. A six-game Saturday and a
                single Wednesday are one reading each here, which is what makes
                the line answer "how do my nights go" rather than "how do my
                games go" — the chart above already answers that one. */}
            <ScoreTrendChart
              points={daily}
              baseline={lifetime}
              subject={t('Average of every day so far')}
              context={t('That day')}
              xLabel={formatDay}
              each="day"
            />

            {/* The nights themselves, newest first — the chart is the shape
                and this is the reading. */}
            <div className="days">
              <div className="days__row days__row--head">
                <span>{t('Day')}</span>
                <span />
                <span>{t('Average')}</span>
                <span>{t('Best')}</span>
              </div>
              {[...days].reverse().map((day) => (
                <div className="days__row" key={day.key}>
                  <span className="days__when">{formatDay(day.at)}</span>
                  <span className="days__count">
                    {tf(day.games === 1 ? '{n} game' : '{n} games', { n: day.games })}
                  </span>
                  <span className="tnum">{day.average}</span>
                  <span className="days__high tnum">{day.high}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {positions.length > 1 && (
        <>
          <h2 className="section-title">{t('How a night goes')}</h2>
          <div className="card">
            {/* Bars against the best position, so the shape of an evening is
                the thing you see: rising means you warm up, falling means the
                last game is the one costing you. */}
            {positions.map((position) => (
              <div key={position.position} className="leave-row">
                <span className="grow">
                  <span style={{ display: 'block', fontSize: 13 }}>
                    {tf('Game {n} of the night', { n: position.position })}
                  </span>
                  <span className="muted tnum">
                    {tf(position.sessions === 1 ? '{n} night' : '{n} nights', {
                      n: position.sessions,
                    })}
                  </span>
                </span>
                <span className="leave-row__bar">
                  <span
                    className="leave-row__fill"
                    style={{
                      width: `${Math.max(
                        4,
                        Math.round(
                          (position.average / Math.max(...positions.map((p) => p.average))) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </span>
                <span className="tnum" style={{ fontSize: 13, minWidth: 34, textAlign: 'right' }}>
                  {position.average}
                </span>
              </div>
            ))}

            <p className="footnote" style={{ marginBottom: 0 }}>
              {t(
                'Averaged across your sessions. A position only two nights reached is left off — later games happen on league nights and good nights, which is not the same as an average evening.',
              )}
            </p>
          </div>
        </>
      )}

      <h2 className="section-title">{t('Spare analysis')}</h2>
      <SpareAnalysis breakdown={spares} conversion={conversion} games={rackGames} />

      <h2 className="section-title">{t('Strike streaks')}</h2>
      <div className="card">
        <StrikeRunsChart runs={runs} />
      </div>

      <h2 className="section-title">{t('How frames finish')}</h2>
      <div className="card">
        <OutcomeSplitChart outcomes={outcomes} />
      </div>

      {leaves.length > 0 && (
        <>
          <h2 className="section-title">{t('What you leave')}</h2>
          <div className="card">
            {splits.faced > 0 && (
              <div className="row row--between" style={{ marginBottom: 12 }}>
                <span className="grow">
                  <span style={{ display: 'block', fontSize: 13 }}>{t('Splits')}</span>
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
                    <span className="leave-row__fill" style={{ width: `${Math.max(2, rate)}%` }} />
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

      {splits.framesWithPins > 0 && (
        <>
          {/* Before the leave list rather than after it: the diagram is the
              summary and the list is the detail, and a reader who only looks
              at one should get the summary. */}
          <h2 className="section-title">{t('What keeps standing up')}</h2>
          <PinHeatMap heat={heat} frames={splits.framesWithPins} />
        </>
      )}

      {splitsLeft.length > 0 && (
        <>
          {/* Splits get their own section rather than a colour in the list
              above: that list is ranked by how often a leave happens, so it is
              headed by the ten pin and the head pin and a split rarely reaches
              it. Which split keeps happening to you is a question the list
              cannot answer. */}
          <h2 className="section-title">{t('Splits')}</h2>
          <div className="card">
            {splitsLeft.map((split) => (
              <div key={split.pins.join('-')} className="leave-row">
                <span className="grow">
                  <span style={{ display: 'block', fontSize: 13 }}>{split.label}</span>
                  <span className="muted tnum">
                    {tf('left {n}×, picked up {c}×', { n: split.times, c: split.converted })}
                  </span>
                </span>
                <span className="leave-row__bar">
                  <span
                    className="leave-row__fill"
                    style={{ width: `${Math.max(2, split.conversionRate)}%` }}
                  />
                </span>
                <span className="tnum" style={{ fontSize: 13, minWidth: 34, textAlign: 'right' }}>
                  {split.conversionRate}%
                </span>
              </div>
            ))}

            {/* The bar is the chance of clearing it. This is the other half of
                the same number, and it is the half that decides what to
                practise — nobody works on the split they already convert. */}
            <p className="footnote" style={{ marginBottom: 0 }}>
              {tf('Your worst is the {label}: {miss}% of the time it costs you the frame.', {
                label: worstSplit.label,
                miss: worstSplit.missRate,
              })}
            </p>
          </div>
        </>
      )}

      {targets.length > 0 && (
        <>
          <h2 className="section-title">{t('What to work on')}</h2>
          <div className="card">
            {/* The list above is ordered by how often a leave comes up, which
                puts the head pin — converted every time — at the top. This one
                is ordered by what each is costing, so the row at the top is
                the one practice would pay for. */}
            <div className="row row--between" style={{ marginBottom: 6 }}>
              <span className="hero__label">{t('What was left')}</span>
              <span className="hero__label">{t('Pins lost')}</span>
            </div>

            {targets.map((target) => (
              <div key={target.pins.join('-')} className="leave-row">
                <span className="grow">
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      color: target.isSplit ? 'var(--negative)' : 'var(--color-text)',
                    }}
                  >
                    {target.label}
                  </span>
                  <span className="muted tnum">
                    {tf('Missed {missed} of {times} · {rate}% picked up', {
                      missed: target.missed,
                      times: target.times,
                      rate: target.rate,
                    })}
                  </span>
                </span>
                {/* Length is what this leave cost against the worst one, so
                    the longest bar is the one to take to practice. Coloured
                    away from the accent used elsewhere: on every other bar in
                    the app a long one is good news, and on this one it is
                    not. */}
                <span className="leave-row__bar">
                  <span
                    className="leave-row__fill leave-row__fill--cost"
                    style={{
                      width: `${Math.max(4, Math.round((target.pinsLost / targets[0].pinsLost) * 100))}%`,
                    }}
                  />
                </span>
                <span className="tnum" style={{ fontSize: 13, minWidth: 34, textAlign: 'right' }}>
                  {target.pinsLost}
                </span>
              </div>
            ))}

            <p className="footnote" style={{ marginBottom: 0 }}>
              {t(
                'Pins left standing, not points: a missed spare also costs the bonus ball, and what that was worth depends on the ball after it. This counts the part that is the same every time.',
              )}
            </p>
          </div>
        </>
      )}

      {houses.length > 1 && (
        <>
          <h2 className="section-title">{t('Your houses')}</h2>
          <div className="card">
            {/* Best average first, with the game count beside it — a house
                visited once is visibly that rather than a claim about the
                lanes. */}
            <div className="days">
              <div className="days__row days__row--head">
                <span>{t('Alley')}</span>
                <span />
                <span>{t('Average')}</span>
                <span>{t('Best')}</span>
              </div>
              {houses.map((house) => (
                <div className="days__row" key={house.house}>
                  <span className="days__when" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {house.house}
                  </span>
                  <span className="days__count">
                    {tf(house.games === 1 ? '{n} game' : '{n} games', { n: house.games })}
                  </span>
                  <span className="tnum">{house.average}</span>
                  <span className="days__high tnum">{house.high}</span>
                </div>
              ))}
            </div>

            <p className="footnote" style={{ marginBottom: 0 }}>
              {t('Only games that said where. Lanes differ, and so does the oil.')}
            </p>
          </div>
        </>
      )}

      <Achievements badges={badges} />

      {balls.length > 0 && (
        <>
          <h2 className="section-title">{t('By ball')}</h2>
          <CutTable
            rows={balls}
            what={t('Ball')}
            footnote={t('Only games that said which ball. The one you own an opinion about.')}
          />
        </>
      )}

      {conditions.length > 0 && (
        <>
          <h2 className="section-title">{t('By condition')}</h2>
          <CutTable
            rows={conditions}
            what={t('How it played')}
            footnote={t('Only games that said how the lane was playing.')}
          />
        </>
      )}

      {lanes.length > 1 && (
        <>
          <h2 className="section-title">{t('By lane')}</h2>
          <CutTable
            rows={lanes}
            what={t('Lane')}
            footnote={t('Small samples, mostly — the game count beside each one is the caveat.')}
          />
        </>
      )}

      <h2 className="section-title">{t('Counted up')}</h2>
      <TallyCard
        lifetime={counted}
        month={countedThisMonth}
        monthLabel={formatMonthYear(Date.now())}
      />

      <h2 className="section-title">{t('First ball')}</h2>
      <div className="card">
        <FirstBallChart counts={firstBalls} />
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t(
            "Counts the ball thrown at a full rack in each frame. The tenth frame's bonus balls are left out — they would flatter the distribution.",
          )}
        </p>
      </div>
    </div>
  );
}

function RangePicker({ range, onChange }: { range: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="chips" role="group" aria-label={t('Date range')}>
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          className="chip"
          aria-pressed={r.key === range}
          onClick={() => onChange(r.key)}
        >
          {t(r.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * Up to two initials from a name.
 *
 * Splits on whitespace, so "Marcus Vale" gives MV and "ジョン" gives ジ — a
 * Japanese name has no word break to split on and one character is the right
 * answer there rather than two.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The month a season started, for the profile line. */
function since(games: { playedAt: number }[]): string {
  if (games.length === 0) return t('No games yet');
  const first = Math.min(...games.map((g) => g.playedAt));
  return tf('Since {date}', { date: formatMonthYear(first) });
}

/**
 * A season cut by one thing written on a game.
 *
 * The houses table, generalised: ball, lane and condition ask the same
 * question of the same shape, and three copies of it would be three chances
 * for them to drift apart.
 */
function CutTable({
  rows,
  what,
  footnote,
}: {
  rows: GroupedStat[];
  what: string;
  footnote: string;
}) {
  return (
    <div className="card">
      <div className="days">
        <div className="days__row days__row--head">
          <span>{what}</span>
          <span />
          <span>{t('Average')}</span>
          <span>{t('Best')}</span>
        </div>
        {rows.map((row) => (
          <div className="days__row" key={row.name}>
            <span className="days__when" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {row.name}
            </span>
            <span className="days__count">
              {tf(row.games === 1 ? '{n} game' : '{n} games', { n: row.games })}
            </span>
            <span className="tnum">{row.average}</span>
            <span className="days__high tnum">{row.high}</span>
          </div>
        ))}
      </div>
      <p className="footnote" style={{ marginBottom: 0 }}>
        {footnote}
      </p>
    </div>
  );
}

function Pr({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card records__card">
      <div className="records__value tnum">{value}</div>
      <div className="records__label">{label}</div>
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
