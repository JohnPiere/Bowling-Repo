import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { Group } from '../data/groups';
import { SAMPLE_SHARED } from '../data/groups';
import { gamesSharedWith, unshareGame, type Game } from '../lib/db';
import { scoreGame } from '../lib/scoring';
import { formatDay } from './HomeScreen';

/**
 * Games pushed to a crew.
 *
 * The bowler's own shares come from the local store so they can be retracted;
 * everyone else's are sample data until there is a group API.
 */
export function SharedGamesScreen({ group }: { group: Group }) {
  const [mine, setMine] = useState<Game[]>([]);

  const refresh = useCallback(() => {
    void gamesSharedWith(group.id).then(setMine);
  }, [group.id]);

  useEffect(refresh, [refresh]);

  const theirs = (SAMPLE_SHARED[group.id] ?? []).filter((post) => !post.isYours);

  async function retract(gameId: string) {
    await unshareGame(gameId, group.id);
    refresh();
  }

  return (
    <>
      <h2 className="section-title">Shared by you</h2>
      {mine.length === 0 ? (
        <p className="empty">
          Nothing of yours is on this board. Share a game from your history.
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
                {game.sharedWithSheet && <span className="pill">Photo</span>}
              </div>
              <button
                type="button"
                className="btn-lg btn-lg--danger"
                style={{ marginTop: 10 }}
                onClick={() => retract(game.id)}
              >
                Unshare
              </button>
            </div>
          );
        })
      )}

      <h2 className="section-title">Shared by the crew</h2>
      {theirs.length === 0 ? (
        <p className="empty">Nobody else has shared a game here yet.</p>
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
