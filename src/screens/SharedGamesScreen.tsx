import { useCallback, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import type { Group, SharedGame } from '../lib/social';
import { describeBackendFailure } from '../lib/backend';
import { loadSharedGames, unshareGame as retractFromCrew } from '../lib/social';
import { gamesSharedWith, unshareGame, type Game } from '../lib/db';
import { scoreGame } from '../lib/scoring';
import { formatDay } from '../lib/datetime';

/**
 * Games pushed to a crew.
 *
 * Your own come from the local store, because those are the ones that can be
 * retracted and the local record is what a retraction has to update. Everybody
 * else's come from the board.
 */
export function SharedGamesScreen({ group, me }: { group: Group; me: string }) {
  const [mine, setMine] = useState<Game[]>([]);
  const [theirs, setTheirs] = useState<SharedGame[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    gamesSharedWith(group.id).then(setMine, () => setMine([]));

    loadSharedGames(group.id, me).then(
      (posts) => {
        setTheirs(posts.filter((post) => !post.isYours));
        setError(null);
      },
      (err) => setError(describeBackendFailure(err)),
    );
  }, [group.id, me]);

  useEffect(refresh, [refresh]);

  async function retract(gameId: string) {
    try {
      // The crew's copy first: a local record that says "not shared" while the
      // board still shows it is the wrong way round to fail.
      await retractFromCrew(group.id, me, gameId);
      await unshareGame(gameId, group.id);
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      // Re-read either way: the list should show what is actually stored.
      refresh();
    }
  }

  return (
    <>
      {error && <div className="note note--bad">{error}</div>}

      <h2 className="section-title">{t('Shared by you')}</h2>
      {mine.length === 0 ? (
        <p className="empty">
          {t('Nothing of yours is on this board. Share a game from your history.')}
        </p>
      ) : (
        mine.map((game) => {
          const card = scoreGame(game.rolls);
          const strikes = card.frames.filter((f) => f.isStrike).length;
          const spares = card.frames.filter((f) => f.isSpare).length;

          return (
            <div key={game.id} className="card" style={{ padding: 12 }}>
              <div className="row">
                <span className="game-row__score tnum">{game.total}</span>
                <span className="grow">
                  <span style={{ display: 'block', fontSize: 13 }}>
                    {formatDay(game.playedAt)}
                    {game.house ? ` · ${game.house}` : ''}
                  </span>
                  <span className="game-row__sub tnum">
                    {strikes} strikes · {spares} spares
                  </span>
                </span>
                {game.sharedWithSheet && <span className="pill">{t('Photo')}</span>}
              </div>
              <button
                type="button"
                className="btn-lg btn-lg--danger"
                style={{ marginTop: 10 }}
                onClick={() => retract(game.id)}
              >
                {t('Unshare')}
              </button>
            </div>
          );
        })
      )}

      <h2 className="section-title">{t('Shared by the crew')}</h2>
      {theirs.length === 0 ? (
        <p className="empty">{t('Nobody else has shared a game here yet.')}</p>
      ) : (
        theirs.map((post) => (
          <div key={post.id} className="game-row" style={{ cursor: 'default' }}>
            <span className="game-row__score tnum">{post.score}</span>
            <span className="grow">
              <span className="game-row__name" style={{ display: 'block' }}>
                {post.author}
              </span>
              <span className="game-row__sub tnum">
                {post.when} · {post.alley} · {post.strikes} strikes
              </span>
            </span>
            <Avatar initials={post.initials} size={30} />
          </div>
        ))
      )}

      <p className="footnote">
        Sharing sends the score sheet only — video comes later. Unsharing retracts a game from the
        board; it stays in your own history either way.
      </p>
    </>
  );
}
