import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { downloadHtml, gameSheetHtml } from '../lib/exporting';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import type { Group } from '../lib/social';
import { deleteGame, getSheetImage, reviseGame, unshareGame, type Game } from '../lib/db';
import { frameMarks, scoreGame } from '../lib/scoring';
import { tryParseMarks } from '../lib/marks';
import { formatBytes } from '../lib/storage';
import { formatDay } from '../lib/datetime';

interface Props {
  game: Game;
  /** The crews this bowler is in, for naming the ones it was shared to. */
  crews: Group[];
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
export function GameScreen({ game, crews, onShare, onChanged, onDeleted }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<number | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [house, setHouse] = useState(game.house ?? '');
  const [note, setNote] = useState(game.note ?? '');

  const card = scoreGame(game.rolls);
  const strikes = card.frames.filter((f) => f.isStrike).length;
  const spares = card.frames.filter((f) => f.isSpare).length;
  const opens = card.frames.filter((f) => f.isComplete && !f.isStrike && !f.isSpare).length;
  const sharedWith = (game.sharedTo ?? [])
    .map((id) => crews.find((group) => group.id === id))
    .filter(Boolean);

  // The photo lives in its own store and is fetched only here, which is the
  // point of keeping it out of the game record.
  useEffect(() => {
    if (!game.hasSheet) return;

    let url: string | null = null;
    let cancelled = false;

    getSheetImage(game.id).then(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setPhotoFailed(true);
          return;
        }
        url = URL.createObjectURL(blob);
        setPhoto(url);
        setPhotoSize(blob.size);
      },
      // Otherwise the screen says "Loading the photo…" for ever.
      () => !cancelled && setPhotoFailed(true),
    );

    return () => {
      cancelled = true;
      // Object URLs are not garbage collected on their own.
      if (url) URL.revokeObjectURL(url);
    };
  }, [game.id, game.hasSheet]);

  function startEditing() {
    // Seed the box from the game itself, so a correction starts from what is
    // stored rather than from whatever the scan happened to read.
    setDraft(
      scoreGame(game.rolls)
        .frames.map((frame) => frameMarks(frame).join(''))
        .join(' ')
        .trim(),
    );
    setHouse(game.house ?? '');
    setNote(game.note ?? '');
    setEditing(true);
  }

  async function saveEdit() {
    const parsed = tryParseMarks(draft);
    if ('error' in parsed) return;

    setBusy(true);
    try {
      await reviseGame(game.id, { rolls: parsed.rolls, house, note });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

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
    try {
      await unshareGame(game.id, groupId);
      onChanged();
    } catch {
      // Nothing has changed, so leaving the row as it was is the honest
      // outcome; the next attempt will either work or not.
    }
  }

  const edited = editing && draft.trim() ? tryParseMarks(draft) : null;
  const editedCard = edited && !('error' in edited) ? scoreGame(edited.rolls) : null;

  if (editing) {
    return (
      <>
        <div className="card">
          <div className="row row--between" style={{ marginBottom: 10 }}>
            <span className="hero__label">{t('Corrected game')}</span>
            <span className="tnum" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
              {editedCard ? editedCard.total : '—'}
            </span>
          </div>
          {editedCard && <Scorecard scorecard={editedCard} />}
        </div>

        {edited && 'error' in edited && <div className="note note--bad">{edited.error}</div>}
        {edited &&
          !('error' in edited) &&
          edited.warnings.map((warning) => (
            <div key={warning} className="note note--warn">
              {warning}
            </div>
          ))}

        <label style={{ display: 'block', marginBottom: 11 }}>
          <span className="hero__label">{t('Marks')}</span>
          <input
            className="input tnum"
            style={{ marginTop: 5, letterSpacing: '0.08em' }}
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <p className="muted" style={{ margin: '-6px 0 12px' }}>
          {t('One group a frame. X for a strike, / for a spare, - for a miss.')}
        </p>

        <label style={{ display: 'block', marginBottom: 11 }}>
          <span className="hero__label">{t('Where you bowled')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={house}
            onChange={(e) => setHouse(e.target.value)}
            placeholder="Rose Bowl Lanes"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 11 }}>
          <span className="hero__label">{t('Anything worth remembering')}</span>
          <textarea
            className="input"
            style={{ marginTop: 5, minHeight: 66 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('Lane 7, oily left, switched balls at the fifth')}
            rows={2}
          />
        </label>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          disabled={!editedCard || busy}
          onClick={saveEdit}
        >
          <Icon name="check" size={18} />
          {busy ? 'Saving…' : 'Save the correction'}
        </button>
        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: 11 }}
          onClick={() => setEditing(false)}
        >
          {t('Cancel')}
        </button>

        {game.hasSheet && photo && (
          <>
            <h2 className="section-title">{t('The sheet, for checking against')}</h2>
            <img className="shot" src={photo} alt="The scanned score sheet" />
          </>
        )}
      </>
    );
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
        {game.house && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {game.house}
          </div>
        )}
        <Scorecard scorecard={card} />
        {game.note && <p className="gamenote">{game.note}</p>}
      </div>

      <div className="quickstats">
        <Stat label="Strikes" value={strikes} />
        <Stat label="Spares" value={spares} />
        <Stat label="Open" value={opens} />
      </div>

      {game.hasSheet && (
        <>
          <h2 className="section-title">{t('The sheet it came from')}</h2>
          {photo ? (
            <>
              <img className="shot" src={photo} alt="The scanned score sheet" />
              <p className="footnote" style={{ marginTop: -4 }}>
                {formatBytes(photoSize)} · stored on this device only.
              </p>
            </>
          ) : photoFailed ? (
            <p className="empty">{t('The photo for this game could not be read.')}</p>
          ) : (
            <p className="empty">{t('Loading the photo…')}</p>
          )}
        </>
      )}

      <h2 className="section-title">{t('Keep a copy')}</h2>
      <button
        type="button"
        className="btn-lg"
        onClick={() =>
          downloadHtml(
            `lane-log-game-${new Date(game.playedAt).toISOString().slice(0, 10)}.html`,
            gameSheetHtml(game),
          )
        }
      >
        {t('Export this game')}
      </button>
      <p className="footnote">
        {t(
          'A printable score sheet, saved to this device. Open it and print to save it as a PDF — which is how a phone makes one.',
        )}
      </p>

      <h2 className="section-title">{t('Correct it')}</h2>
      <button type="button" className="btn-lg" onClick={startEditing}>
        {t('Fix a frame')}
      </button>
      <p className="footnote">
        {game.source === 'scan'
          ? 'A scan gets a frame wrong now and then. The photo stays, so you can check against it.'
          : 'Mis-tapped a ball? Put it right here.'}
      </p>

      <h2 className="section-title">{t('Sharing')}</h2>
      {sharedWith.length === 0 ? (
        <button type="button" className="btn-lg btn-lg--primary" onClick={onShare}>
          <Icon name="share" size={18} />
          {t('Share to a crew')}
        </button>
      ) : (
        <>
          {sharedWith.map((group) => (
            <div key={group!.id} className="card" style={{ padding: 12 }}>
              <div className="row row--between">
                <span style={{ fontSize: 13 }}>On {group!.name}'s board</span>
                <button type="button" className="chip" onClick={() => retract(group!.id)}>
                  {t('Unshare')}
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn-lg" onClick={onShare}>
            <Icon name="share" size={18} />
            {t('Share to another crew')}
          </button>
        </>
      )}

      <h2 className="section-title">{t('Delete')}</h2>
      {confirming ? (
        <>
          <div className="note note--bad">
            This game and {game.hasSheet ? 'its photo are' : 'it is'} removed from this device for
            good. {sharedWith.length > 0 && 'It also comes off the boards it was shared to. '}
            There is no backup unless you exported one.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn-lg" onClick={() => setConfirming(false)}>
              {t('Keep it')}
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
        <button type="button" className="btn-lg btn-lg--danger" onClick={() => setConfirming(true)}>
          {t('Delete this game')}
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
