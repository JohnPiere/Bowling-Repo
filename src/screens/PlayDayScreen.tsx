import { useMemo } from 'react';
import { ScoreTrendChart } from '../components/charts/ScoreTrendChart';
import type { Game } from '../lib/db';
import { dayKey, groupByDay, sessionSpan } from '../lib/history';
import { ballOutcomes } from '../lib/stats';

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
    return <p className="empty">That day has no games on it.</p>;
  }

  const frames = outcomes ? outcomes.strikes + outcomes.spares + outcomes.opens : 0;
  const attempts = outcomes ? outcomes.spares + outcomes.opens : 0;

  return (
    <div className="stats">
      <div className="profile" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="profile__label">
            {new Date(group.at).toLocaleDateString(undefined, { weekday: 'long' })}
          </div>
          <div className="day__date">
            {new Date(group.at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
          <div className="profile__meta tnum">
            {group.house ? `${group.house} · ` : ''}
            {sessionSpan(group)}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div className="day__label">Series total</div>
          <div className="day__series tnum">{group.series}</div>
          <div className="profile__meta tnum">
            {group.games.length} game{group.games.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="daystats">
        <DayStat value={group.high} label="Best game" />
        <DayStat value={group.average} label="Average" />
        <DayStat value={outcomes?.strikes ?? 0} label="Strikes" />
        <DayStat value={outcomes?.spares ?? 0} label="Spares" />
        <DayStat value={outcomes?.opens ?? 0} label="Open frames" />
        <DayStat
          value={attempts === 0 ? '—' : `${Math.round(((outcomes?.spares ?? 0) / attempts) * 100)}%`}
          label="Spare rate"
        />
      </div>

      {group.games.length > 1 && (
        <>
          <h2 className="section-title">Across the session</h2>
          <div className="card">
            <ScoreTrendChart points={series} subject="Score" context="Game" />
          </div>
        </>
      )}

      <h2 className="section-title">Per game</h2>
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
            <span className="gameline__time tnum">
              {new Date(game.playedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </span>
          <span className="grow" />
          {game.total === group.high && group.games.length > 1 && (
            <span className="tag tag--accent">Best</span>
          )}
          <span
            className={`gameline__score tnum${game.total >= 200 ? ' gameline__score--big' : ''}`}
          >
            {game.total}
          </span>
        </button>
      ))}

      <button type="button" className="btn-lg" style={{ marginTop: 4 }} onClick={onExport}>
        Export this day
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
