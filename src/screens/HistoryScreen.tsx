import { useEffect, useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import type { Game } from '../lib/db';
import { groupByDay, searchGames, SORTS, type SortKey } from '../lib/history';
import { scoreGame } from '../lib/scoring';

/**
 * How many sessions to render at once.
 *
 * A long season is hundreds of games, and every row rescores a card to draw
 * its marks. Rendering them all costs a second of blank screen for rows nobody
 * has scrolled to.
 */
const PAGE = 12;

/** The season, as the nights it was actually bowled. */
export function HistoryScreen({
  games,
  onOpenGame,
  onOpenDay,
}: {
  games: Game[];
  onOpenGame: (gameId: string) => void;
  onOpenDay: (day: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>('new');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const found = useMemo(() => searchGames(games, query), [games, query]);
  const days = useMemo(() => groupByDay(found, sort), [found, sort]);

  // A changed search or order starts the list again rather than keeping a
  // scroll position into a different set of days.
  useEffect(() => setShown(PAGE), [query, sort, games.length]);

  const page = days.slice(0, shown);
  const remaining = days.length - page.length;

  return (
    <div className="stats">
      <div className="chips" role="group" aria-label={t('Order')}>
        {SORTS.map((option) => (
          <button
            key={option.key}
            type="button"
            className="chip"
            aria-pressed={option.key === sort}
            onClick={() => setSort(option.key)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="search grow">
          <Icon name="history" size={15} />
          <input
            className="input search__field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search house or date')}
            aria-label={t('Search games')}
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <span className="muted tnum" style={{ whiteSpace: 'nowrap' }}>
          {found.length} game{found.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="footnote" style={{ margin: 0 }}>
        {t('Grouped by the day you bowled. Tap a day for the whole session.')}
      </p>

      {days.length === 0 ? (
        <p className="empty">
          {query ? `Nothing matches “${query}”.` : 'No games yet. Bowl one and it lands here.'}
        </p>
      ) : (
        <>
          {page.map((day) => (
            <section key={day.key} className="session">
              <button type="button" className="session__head" onClick={() => onOpenDay(day.key)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row" style={{ gap: 7, alignItems: 'baseline' }}>
                    <span className="session__date">
                      {new Date(day.at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="session__weekday">
                      {new Date(day.at).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                  </span>
                  <span className="session__meta">
                    {day.house ? `${day.house} · ` : ''}
                    {day.games.length} game{day.games.length === 1 ? '' : 's'}
                  </span>
                </span>

                <span style={{ textAlign: 'right', flex: 'none' }}>
                  <span className="session__label">{t('Series')}</span>
                  <span className="session__series tnum">{day.series}</span>
                </span>

                {/* Points into the day, so it is rotated rather than a second
                    near-identical glyph in the set. */}
                <Icon name="back" size={15} className="session__chevron" />
              </button>

              {day.games.map((game, index) => (
                <GameLine
                  key={game.id}
                  game={game}
                  number={index + 1}
                  isBest={game.total === day.high && day.games.length > 1}
                  onOpen={() => onOpenGame(game.id)}
                />
              ))}
            </section>
          ))}

          {remaining > 0 && (
            <button type="button" className="btn-lg" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, remaining)} more · {remaining} older
            </button>
          )}
        </>
      )}
    </div>
  );
}

function GameLine({
  game,
  number,
  isBest,
  onOpen,
}: {
  game: Game;
  number: number;
  isBest: boolean;
  onOpen: () => void;
}) {
  // The shape of the game, one bar a frame, height by what that frame added.
  // A row of marks says the same thing in more room and reads as a wall of
  // text at a glance, which is all a list row ever gets.
  const card = useMemo(() => scoreGame(game.rolls), [game.rolls]);

  return (
    <button type="button" className="gameline" onClick={onOpen}>
      <span className="gameline__no">
        <span className="gameline__index">Game {number}</span>
        <span className="gameline__time tnum">
          {new Date(game.playedAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </span>

      <span className="spark grow" aria-hidden="true">
        {card.frames.map((frame, i) => {
          const previous = i === 0 ? 0 : (card.frames[i - 1].score ?? 0);
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

      {isBest && <span className="tag tag--accent">{t('Best')}</span>}

      {/* A 200 game is the one score worth picking out of a column. */}
      <span className={`gameline__score tnum${game.total >= 200 ? ' gameline__score--big' : ''}`}>
        {game.total}
      </span>
    </button>
  );
}
