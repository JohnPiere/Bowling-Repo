import { useEffect, useMemo, useState } from 'react';
import { GameRow } from './HomeScreen';
import type { Game } from '../lib/db';
// The same ranges the analytics screen offers, so the two agree on both the
// labels and what each one means.
import { applyRange, RANGES, type RangeKey } from '../lib/stats';

/**
 * How many games to render at once.
 *
 * A long season is hundreds of games, and each row draws a ten-bar spark from
 * a rescored card. Rendering them all costs a second of blank screen for rows
 * nobody has scrolled to yet.
 */
const PAGE = 40;

/** Every game, newest first, grouped by the day it was bowled. */
export function HistoryScreen({
  games,
  onShareGame,
}: {
  games: Game[];
  onShareGame: (gameId: string) => void;
}) {
  const [range, setRange] = useState<RangeKey>('all');
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => applyRange(games, range), [games, range]);

  // Changing the range starts the list again rather than keeping a scroll
  // position into a different set of games.
  useEffect(() => setShown(PAGE), [range, games.length]);

  const page = useMemo(() => filtered.slice(0, shown), [filtered, shown]);
  const sessions = useMemo(() => groupByDay(page), [page]);
  const remaining = filtered.length - page.length;

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
        <>
          {sessions.map(([day, dayGames]) => (
            <section key={day}>
              <h2 className="section-title">
                {day} · {dayGames.length} game{dayGames.length === 1 ? '' : 's'} · avg{' '}
                {Math.round(dayGames.reduce((sum, g) => sum + g.total, 0) / dayGames.length)}
              </h2>
              {dayGames.map((game) => (
                <GameRow key={game.id} game={game} onOpen={() => onShareGame(game.id)} />
              ))}
            </section>
          ))}

          {remaining > 0 && (
            <button
              type="button"
              className="btn-lg"
              style={{ marginTop: 11 }}
              onClick={() => setShown((current) => current + PAGE)}
            >
              Show {Math.min(PAGE, remaining)} more · {remaining} older
            </button>
          )}
        </>
      )}
    </>
  );
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
