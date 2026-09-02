import { useMemo } from 'react';
import { t, tf } from '../lib/i18n';
import { ScoreTrendChart } from '../components/charts/ScoreTrendChart';
import type { Game } from '../lib/db';
import { dayKey, groupByDay, sessionSpan } from '../lib/history';
import { scoreGame } from '../lib/scoring';
import { ballOutcomes, sessionSwing } from '../lib/stats';
import { formatLongDate, formatTime, formatWeekday } from '../lib/datetime';

/**
 * One night's bowling.
 *
 * The unit a league scores in is the series, not the game, and a session is
 * also how people remember bowling — "that Tuesday" rather than "game 47". So
 * the day gets its own screen: the series total, how the night went, and every
 * game in the order it was played.
 */
export function PlayDayScreen({
  games,
  day,
  onOpenGame,
  onExport,
}: {
  games: Game[];
  day: string;
  onOpenGame: (gameId: string) => void;
  onExport: () => void;
}) {
  const group = useMemo(
    () => groupByDay(games.filter((game) => dayKey(game.playedAt) === day))[0],
    [games, day],
  );

  const outcomes = useMemo(
    () => (group ? ballOutcomes(group.games.filter((g) => g.isComplete)) : null),
    [group],
  );

  // The session's own shape. Rolling equals the value here: over three or four
  // games a rolling average would flatten the very thing being looked at.
  const series = useMemo(
    () =>
      group
        ? group.games.map((game) => ({
            playedAt: game.playedAt,
            value: game.total,
            rolling: game.total,
          }))
        : [],
    [group],
  );

  if (!group) {
    return <p className="empty">{t('That day has no games on it.')}</p>;
  }

  const frames = outcomes ? outcomes.strikes + outcomes.spares + outcomes.opens : 0;
  const attempts = outcomes ? outcomes.spares + outcomes.opens : 0;
  // 150-160-170 and 170-160-150 have the same series and the same average, and
  // are not the same evening.
  const swing = sessionSwing(group.games.map((game) => game.total));

  return (
    <div className="stats">
      <div className="profile" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="profile__label">{formatWeekday(group.at)}</div>
          <div className="day__date">{formatLongDate(group.at)}</div>
          <div className="profile__meta tnum">
            {group.house ? `${group.house} · ` : ''}
            {sessionSpan(group)}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div className="day__label">{t('Series total')}</div>
          <div className="day__series tnum">{group.series}</div>
          <div className="profile__meta tnum">
            {group.games.length} game{group.games.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {swing !== null && (
        <p className="footnote" style={{ marginTop: 2 }}>
          {swing === 0
            ? t('Finished where you started.')
            : tf(swing > 0 ? 'Up {n} from the first game to the last.' : 'Down {n} from the first game to the last.', {
                n: Math.abs(swing),
              })}
        </p>
      )}

      <div className="daystats">
        <DayStat value={group.high} label="Best game" />
        <DayStat value={group.average} label="Average" />
        <DayStat value={outcomes?.strikes ?? 0} label="Strikes" />
        <DayStat value={outcomes?.spares ?? 0} label="Spares" />
        <DayStat value={outcomes?.opens ?? 0} label="Open frames" />
        <DayStat
          value={
            attempts === 0 ? '—' : `${Math.round(((outcomes?.spares ?? 0) / attempts) * 100)}%`
          }
          label="Spare rate"
        />
      </div>

      {group.games.length > 1 && (
        <>
          <h2 className="section-title">{t('Across the session')}</h2>
          <div className="card">
            <ScoreTrendChart
              points={series}
              subject={t('Score')}
              context={t('Game')}
              // One evening, so the axis wants clock times rather than the
              // same date written twice.
              xLabel={formatTime}
            />
          </div>
        </>
      )}

      <h2 className="section-title">{t('Per game')}</h2>
      {group.games.map((game, index) => (
        <button
          key={game.id}
          type="button"
          className="gameline"
          onClick={() => onOpenGame(game.id)}
          style={{ marginBottom: 7 }}
        >
          <span className="gameline__no">
            <span className="gameline__index">Game {index + 1}</span>
            <span className="gameline__time tnum">{formatTime(game.playedAt)}</span>
          </span>
          {/* The same shape the history rows show, so a game is recognisable
              from either list. */}
          <span className="spark grow" aria-hidden="true">
            {scoreGame(game.rolls).frames.map((frame, i, all) => {
              const previous = i === 0 ? 0 : (all[i - 1].score ?? 0);
              const gained = frame.score === null ? 0 : frame.score - previous;
              return (
                <span
                  key={frame.index}
                  className="spark__bar"
                  style={{ height: Math.max(2, (gained / 30) * 22) }}
                />
              );
            })}
          </span>
          {game.total === group.high && group.games.length > 1 && (
            <span className="tag tag--accent">{t('Best')}</span>
          )}
          <span
            className={`gameline__score tnum${game.total >= 200 ? ' gameline__score--big' : ''}`}
          >
            {game.total}
          </span>
        </button>
      ))}

      {group.games.some((game) => game.note) && (
        <div className="card" style={{ marginTop: 4 }}>
          <span className="hero__label">{t('What you wrote')}</span>
          {group.games.map((game, index) =>
            game.note ? (
              <p key={game.id} className="gamenote">
                <span className="muted">{tf('Game {n}', { n: index + 1 })}</span>
                {'\n'}
                {game.note}
              </p>
            ) : null,
          )}
        </div>
      )}

      <button type="button" className="btn-lg" style={{ marginTop: 4 }} onClick={onExport}>
        {t('Export this day')}
      </button>

      <p className="footnote">
        {frames} frame{frames === 1 ? '' : 's'} bowled. The export is a printable sheet of the
        session — scores, frames and marks — and it never leaves this device.
      </p>
    </div>
  );
}

function DayStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card daystats__card">
      <div className="daystats__value tnum">{value}</div>
      <div className="daystats__label">{label}</div>
    </div>
  );
}
