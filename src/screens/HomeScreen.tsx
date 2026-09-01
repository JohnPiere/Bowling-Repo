import { Icon, type IconName } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { useCountUp } from '../components/useCountUp';
import { t, tf } from '../lib/i18n';
import { formatDay } from '../lib/datetime';
import { crewGlance, dashboard, gameShape } from '../lib/dashboard';
import type { Game } from '../lib/db';
import type { Group } from '../data/groups';

interface Props {
  games: Game[];
  /** The crews this bowler is in. Empty for a guest, and the card is not drawn. */
  crews: Group[];
  onStartGame: () => void;
  onOpenHistory: () => void;
  onOpenStats: () => void;
  /** Opens one group's dashboard directly, not the list of them. */
  onOpenGroup: (groupId: string) => void;
  onOpenGame: (gameId: string) => void;
}

/**
 * The dashboard.
 *
 * Reads top to bottom as one answer per block: your best game, how you are
 * bowling, what your crew is doing, what you last bowled. The two buttons are
 * at the foot because the tab bar already carries Play — a second route to the
 * same screen does not need to be the first thing on it.
 */
export function HomeScreen({
  games,
  crews,
  onStartGame,
  onOpenHistory,
  onOpenStats,
  onOpenGroup,
  onOpenGame,
}: Props) {
  const { best, average, strikeRate, played, recent } = dashboard(games);
  const crew = crewGlance(crews);

  return (
    <>
      <BestGameCard game={best} />

      <div className="quickstats">
        <QuickStat icon="trend" value={average === null ? '—' : average} label={t('Average')} />
        <QuickStat
          icon="target"
          value={strikeRate === null ? '—' : `${strikeRate}%`}
          label={t('Strike %')}
        />
        <QuickStat icon="grid" value={played.length} label={t('Games')} />
      </div>

      {crew && (
        <button type="button" className="crewcard" onClick={() => onOpenGroup(crew.group.id)}>
          <Avatar initials={crew.group.initials} size={38} isMe />
          <span className="grow">
            <span className="crewcard__name">{crew.group.name}</span>
            <span className="crewcard__sub tnum">
              {tf('You’re {rank} of {size}', { rank: ordinal(crew.rank), size: crew.size })}
              {crew.unread > 0 && ` · ${tf('{n} new messages', { n: crew.unread })}`}
            </span>
          </span>
          {crew.unread > 0 && <span className="crewcard__badge tnum">{crew.unread}</span>}
          <Icon name="chevron" size={17} />
        </button>
      )}

      <div className="row row--between" style={{ marginTop: 4 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {t('Last 5 games')}
        </h2>
        {played.length > 0 && (
          <button type="button" className="linkbtn" onClick={onOpenHistory}>
            {tf('All {n}', { n: played.length })}
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="empty">{t('Nothing logged yet. Bowl a game or scan a sheet.')}</p>
      ) : (
        <div className="gamecards">
          {recent.map((game) => (
            <GameRow key={game.id} game={game} onOpen={() => onOpenGame(game.id)} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn-lg btn-lg--primary"
        style={{ marginTop: 14 }}
        onClick={onStartGame}
      >
        <Icon name="plus" size={18} />
        {t('Start a new game')}
      </button>

      <button type="button" className="btn-lg" style={{ marginTop: 8 }} onClick={onOpenStats}>
        {t('View analytics')}
      </button>
    </>
  );
}

/**
 * The hero: your best game, not your average.
 *
 * The average is one of the three stats below and does not need saying twice.
 * The best game is the number a bowler actually wants to see when they open
 * the app, and it is the only one on the screen worth a 52px numeral.
 */
function BestGameCard({ game }: { game: Game | null }) {
  const shown = useCountUp(game?.total ?? 0);

  return (
    <section className="besthero">
      <div className="orb" />

      <div className="besthero__head">
        <Icon name="trophy" size={16} />
        <span className="hero__label">{t('Best game')}</span>
      </div>

      {game === null ? (
        // A 52px em-dash reads as a stray bar, so the empty state says the thing
        // in words rather than showing a placeholder numeral.
        <>
          <div className="besthero__empty">{t('Nothing bowled yet')}</div>
          <div className="besthero__meta">
            {t('Bowl a game or scan a sheet and it starts here.')}
          </div>
        </>
      ) : (
        <>
          <div className="besthero__row">
            <span className="besthero__numeral tnum">{shown}</span>
            <span className="besthero__of">{t('of 300')}</span>
          </div>
          <div className="besthero__meta">
            {formatDay(game.playedAt)}
            {game.house && (
              <>
                <span className="besthero__dot">·</span>
                {game.house}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function QuickStat({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: string | number;
  label: string;
}) {
  return (
    <div className="quickstat">
      <Icon name={icon} size={15} />
      <div className="quickstat__value tnum">{value}</div>
      <div className="quickstat__label">{label}</div>
    </div>
  );
}

/**
 * A recent game.
 *
 * Score on the right at 28px, because down a list of five the scores are the
 * column being read and the dates are only what tells them apart. 200 and over
 * takes the accent — the one number in bowling everybody recognises.
 */
export function GameRow({ game, onOpen }: { game: Game; onOpen?: () => void }) {
  const { strikes, spares, pins } = gameShape(game);

  return (
    <button type="button" className="gamecard" onClick={onOpen}>
      <span className="grow">
        <span className="gamecard__date">{formatDay(game.playedAt)}</span>
        <span className="gamecard__alley">{game.house || t('No alley recorded')}</span>
        <span className="gamecard__tags">
          <span className="tag tnum">{tf('{n} X', { n: strikes })}</span>
          <span className="tag tnum">{tf('{n} /', { n: spares })}</span>
          {game.source === 'scan' && <span className="tag">{t('Scan')}</span>}
          {game.sharedTo && game.sharedTo.length > 0 && <span className="tag">{t('Shared')}</span>}
        </span>
      </span>

      <span className="gamecard__right">
        <span className={`gamecard__score tnum${game.total >= 200 ? ' gamecard__score--hot' : ''}`}>
          {game.total}
        </span>
        <span className="gamecard__pins tnum">{tf('{n} pins', { n: pins })}</span>
      </span>
    </button>
  );
}

/**
 * "1st", "2nd" — and in Japanese, "1位".
 *
 * English suffixes are irregular enough to need the table; Japanese puts one
 * counter after every number, so the translated form takes a placeholder and
 * this only ever supplies the digits.
 */
function ordinal(rank: number): string {
  return tf('{n}{suffix}', { n: rank, suffix: englishOrdinalSuffix(rank) });
}

function englishOrdinalSuffix(rank: number): string {
  if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th';
}
