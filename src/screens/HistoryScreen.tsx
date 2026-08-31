import { useMemo, useState } from 'react';
import { GameRow } from './HomeScreen';
import type { Game } from '../lib/db';

const RANGES = [
  { key: 'g5', label: 'Last 5', games: 5 },
  { key: 'd30', label: '30 days', days: 30 },
  { key: 'd90', label: '90 days', days: 90 },
  { key: 'd180', label: '180 days', days: 180 },
  { key: 'all', label: 'All' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/** Every game, newest first, grouped by the day it was bowled. */
export function HistoryScreen({
  games,
  onShareGame,
}: {
  games: Game[];
  onShareGame: (gameId: string) => void;
}) {
  const [range, setRange] = useState<RangeKey>('all');

  const filtered = useMemo(() => applyRange(games, range), [games, range]);
  const sessions = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <>
      <div className="chips" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className="chip"
            aria-pressed={r.key === range}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No games in this range.</p>
      ) : (
        sessions.map(([day, dayGames]) => (
          <section key={day}>
            <h2 className="section-title">
              {day} · {dayGames.length} game{dayGames.length === 1 ? '' : 's'} · avg{' '}
              {Math.round(dayGames.reduce((sum, g) => sum + g.total, 0) / dayGames.length)}
            </h2>
            {dayGames.map((game) => (
              <GameRow key={game.id} game={game} onOpen={() => onShareGame(game.id)} />
            ))}
          </section>
        ))
      )}
    </>
  );
}

function applyRange(games: Game[], range: RangeKey): Game[] {
  const spec = RANGES.find((r) => r.key === range);
  if (!spec || spec.key === 'all') return games;
  if ('games' in spec && spec.games) return games.slice(0, spec.games);
  if ('days' in spec && spec.days) {
    const cutoff = Date.now() - spec.days * 24 * 60 * 60 * 1000;
    return games.filter((game) => game.playedAt >= cutoff);
  }
  return games;
}

/** Games arrive newest-first, so insertion order preserves that per day. */
function groupByDay(games: Game[]): [string, Game[]][] {
  const days = new Map<string, Game[]>();

  for (const game of games) {
    const day = new Date(game.playedAt).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const existing = days.get(day);
    if (existing) existing.push(game);
    else days.set(day, [game]);
  }

  return [...days.entries()];
}
