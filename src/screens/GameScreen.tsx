import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import { GROUPS } from '../data/groups';
import { deleteGame, getSheetImage, unshareGame, type Game } from '../lib/db';
import { scoreGame } from '../lib/scoring';
import { formatBytes } from '../lib/storage';
import { formatDay } from './HomeScreen';

interface Props {
  game: Game;
  onShare: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

/**
 * One game.
 *
 * Also where a game is deleted — which the storage warning tells people to do,
 * so it had better be possible.
 */
export function GameScreen({ game, onShare, onChanged, onDeleted }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const card = scoreGame(game.rolls);
  const strikes = card.frames.filter((f) => f.isStrike).length;
  const spares = card.frames.filter((f) => f.isSpare).length;
  const opens = card.frames.filter((f) => f.isComplete && !f.isStrike && !f.isSpare).length;
  const sharedWith = (game.sharedTo ?? [])
    .map((id) => GROUPS.find((group) => group.id === id))
    .filter(Boolean);

  // The photo lives in its own store and is fetched only here, which is the
  // point of keeping it out of the game record.
  useEffect(() => {
    if (!game.hasSheet) return;

    let url: string | null = null;
    let cancelled = false;

    void getSheetImage(game.id).then((blob) => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setPhoto(url);
      setPhotoSize(blob.size);
    });

    return () => {
      cancelled = true;
      // Object URLs are not garbage collected on their own.
      if (url) URL.revokeObjectURL(url);
    };
  }, [game.id, game.hasSheet]);

  async function remove() {
    setBusy(true);
    try {
      await deleteGame(game.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  async function retract(groupId: string) {
    await unshareGame(game.id, groupId);
    onChanged();
  }

  return (
    <>
      <div className="card">
        <div className="row row--between" style={{ marginBottom: 4 }}>
          <span className="hero__label">{formatDay(game.playedAt)}</span>
          <span className="tnum" style={{ fontSize: 34, letterSpacing: '-0.03em' }}>
            {game.total}
          </span>
        </div>
        {game.house && <div className="muted" style={{ marginBottom: 10 }}>{game.house}</div>}
        <Scorecard scorecard={card} />
      </div>

      <div className="quickstats">
        <Stat label="Strikes" value={strikes} />
        <Stat label="Spares" value={spares} />
        <Stat label="Open" value={opens} />
      </div>

      {game.hasSheet && (
        <>
          <h2 className="section-title">The sheet it came from</h2>
          {photo ? (
            <>
              <img className="shot" src={photo} alt="The scanned score sheet" />
              <p className="footnote" style={{ marginTop: -4 }}>
                {formatBytes(photoSize)} · stored on this device only.
              </p>
            </>
          ) : (
            <p className="empty">Loading the photo…</p>
          )}
        </>
      )}

      <h2 className="section-title">Sharing</h2>
      {sharedWith.length === 0 ? (
        <button type="button" className="btn-lg btn-lg--primary" onClick={onShare}>
          <Icon name="share" size={18} />
          Share to a crew
        </button>
      ) : (
        <>
          {sharedWith.map((group) => (
            <div key={group!.id} className="card" style={{ padding: 12 }}>
              <div className="row row--between">
                <span style={{ fontSize: 13 }}>On {group!.name}'s board</span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => retract(group!.id)}
                >
                  Unshare
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn-lg" onClick={onShare}>
            <Icon name="share" size={18} />
            Share to another crew
          </button>
        </>
      )}

      <h2 className="section-title">Delete</h2>
      {confirming ? (
        <>
          <div className="note note--bad">
            This game and {game.hasSheet ? 'its photo are' : 'it is'} removed from this device for
            good. {sharedWith.length > 0 && 'It also comes off the boards it was shared to. '}
            There is no backup unless you exported one.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn-lg" onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-lg btn-lg--danger"
              onClick={remove}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete for good'}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="btn-lg btn-lg--danger"
          onClick={() => setConfirming(true)}
        >
          Delete this game
        </button>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="quickstat">
      <div className="quickstat__value tnum">{value}</div>
      <div className="quickstat__label">{label}</div>
    </div>
  );
}
