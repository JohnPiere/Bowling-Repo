import { Icon } from '../components/Icon';
import { t } from '../lib/i18n';
import type { Game } from '../lib/db';
import { scoreGame } from '../lib/scoring';

interface Props {
  games: Game[];
  onStartGame: () => void;
  onOpenHistory: () => void;
  onOpenGroup: () => void;
  onShareGame: (gameId: string) => void;
}

/** Dashboard: how you are bowling, then the fastest way to bowl again. */
export function HomeScreen({ games, onStartGame, onOpenHistory, onOpenGroup, onShareGame }: Props) {
  const finished = games.filter((game) => game.isComplete);
  const average = finished.length
    ? Math.round(finished.reduce((sum, g) => sum + g.total, 0) / finished.length)
    : null;
  const high = finished.reduce((best, g) => Math.max(best, g.total), 0);
  const strikeRate = strikePercentage(finished);
  const latest = finished[0];

  return (
    <>
      <section className="hero-solo">
        <div className="orb" />
        <div className="hero__label">{t('Your average')}</div>
        {/* A 46px em-dash reads as a stray bar, so the empty state says the
            thing in words instead of showing a placeholder numeral. */}
        {average === null ? (
          <div style={{ fontSize: 19, marginTop: 4, color: 'var(--color-neutral-300)' }}>
            {t('Nothing bowled yet')}
          </div>
        ) : (
          <div className="hero__numeral tnum">{average}</div>
        )}
        <div className="hero__meta" style={{ marginTop: 6 }}>
          {latest
            ? `${finished.length} game${finished.length === 1 ? '' : 's'} · last played ${formatDay(latest.playedAt)}${
                latest.house ? ` · ${latest.house}` : ''
              }`
            : 'Bowl a game or scan a sheet and your average starts here.'}
        </div>
      </section>

      <div className="quickstats">
        <div className="quickstat">
          <div className="quickstat__value tnum">{average ?? '—'}</div>
          <div className="quickstat__label">{t('Average')}</div>
        </div>
        <div className="quickstat">
          <div className="quickstat__value tnum">{high || '—'}</div>
          <div className="quickstat__label">{t('High game')}</div>
        </div>
        <div className="quickstat">
          <div className="quickstat__value tnum">{strikeRate === null ? '—' : `${strikeRate}%`}</div>
          <div className="quickstat__label">{t('Strike rate')}</div>
        </div>
      </div>

      <button type="button" className="btn-lg btn-lg--primary" onClick={onStartGame}>
        <Icon name="play" size={18} />
        {t('Start a new game')}
      </button>

      <h2 className="section-title">{t('Recent games')}</h2>
      {finished.length === 0 ? (
        <p className="empty">{t('Nothing logged yet. Bowl a game or scan a sheet.')}</p>
      ) : (
        <>
          {finished.slice(0, 5).map((game) => (
            <GameRow key={game.id} game={game} onOpen={() => onShareGame(game.id)} />
          ))}
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={onOpenHistory}
          >
            {t('View all games')}
          </button>
        </>
      )}

      <h2 className="section-title">{t('Your crew')}</h2>
      <button type="button" className="btn-lg" onClick={onOpenGroup}>
        <Icon name="users" size={18} />
        Tuesday Crew
      </button>
    </>
  );
}

export function GameRow({ game, onOpen }: { game: Game; onOpen?: () => void }) {
  const card = scoreGame(game.rolls);
  const strikes = card.frames.filter((f) => f.isStrike).length;
  const spares = card.frames.filter((f) => f.isSpare).length;

  return (
    <button type="button" className="game-row" onClick={onOpen}>
      <span className="game-row__score tnum">{game.total}</span>
      <span className="grow">
        <span className="game-row__name" style={{ display: 'block' }}>
          {formatDay(game.playedAt)}
          {game.house ? ` · ${game.house}` : ''}
        </span>
        <span className="game-row__sub tnum">
          {strikes} strikes · {spares} spares
        </span>
      </span>

      {/* The frame shape at a glance: one bar per frame, height by contribution. */}
      <span className="spark" aria-hidden="true">
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

      {game.sharedTo && game.sharedTo.length > 0 ? (
        <span className="pill">{t('Shared')}</span>
      ) : (
        game.source === 'scan' && <span className="pill">{t('Scan')}</span>
      )}
    </button>
  );
}

/** Share of first balls that struck, across finished games. */
function strikePercentage(games: Game[]): number | null {
  let strikes = 0;
  let frames = 0;

  for (const game of games) {
    for (const frame of scoreGame(game.rolls).frames) {
      if (frame.rolls.length === 0) continue;
      frames += 1;
      if (frame.isStrike) strikes += 1;
    }
  }

  return frames === 0 ? null : Math.round((strikes / frames) * 100);
}

export function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
