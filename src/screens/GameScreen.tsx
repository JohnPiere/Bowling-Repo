import { useEffect, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { downloadHtml, gameSheetHtml } from '../lib/exporting';
import { shareScorecard } from '../lib/scorecard';
import { loadPreferences } from '../lib/preferences';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import { FrameStrip } from '../components/FrameStrip';
import { frameStrip } from '../lib/framestrip';
import { gameSummary } from '../lib/stats';
import type { Group } from '../lib/social';
import { deleteGame, getSheetImage, reviseGame, unshareGame, type Game } from '../lib/db';
import { frameMarks, scoreGame } from '../lib/scoring';
import { tryParseMarks } from '../lib/marks';
import { formatBytes } from '../lib/storage';
import { formatDay, fromInputs, toDateInput, toTimeInput } from '../lib/datetime';

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
  // When it was bowled, which until now could be set once and never again:
  // `reviseGame` has always taken a `playedAt` and nothing ever passed one, so
  // a game saved on the wrong day stayed on the wrong day for good. It is the
  // easiest field on the finishing step to walk past — it is already filled in,
  // and it is filled in with today.
  const [day, setDay] = useState(() => toDateInput(game.playedAt));
  const [time, setTime] = useState(() => toTimeInput(game.playedAt));
  const [cardState, setCardState] = useState<'idle' | 'working' | 'saved' | 'failed'>('idle');

  const card = scoreGame(game.rolls);
  const summary = gameSummary(game);
  // The play screen's strip, with no ball in flight: nothing is current and
  // nothing is pending, so every cell draws as a finished frame.
  const strip = frameStrip(game.rolls, game.pinfalls ?? [], [], null);
  // Only worth drawing when there are pins to draw. A game entered on the
  // number pad, or read off a sheet, would give ten empty racks — which looks
  // like a bug rather than like an absence.
  const hasPins = Boolean(game.pinfalls?.length);
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
    setDay(toDateInput(game.playedAt));
    setTime(toTimeInput(game.playedAt));
    setEditing(true);
  }

  async function saveEdit() {
    const parsed = tryParseMarks(draft);
    if ('error' in parsed) return;

    setBusy(true);
    try {
      // `playedAt` only when the two fields make a date. They cannot make a
      // worse one than the game already has: `undefined` leaves it alone.
      await reviseGame(game.id, {
        rolls: parsed.rolls,
        house,
        note,
        playedAt: fromInputs(day, time) ?? undefined,
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  /**
   * The game as a picture, into the share sheet.
   *
   * A score travels between people as an image — LINE, a group chat, a story —
   * and none of those will take the HTML sheet beside this button.
   */
  async function shareAsImage() {
    setCardState('working');
    try {
      const outcome = await shareScorecard(game, loadPreferences().playerName);
      // Backing out of the share sheet is not a failure, and saying so would be
      // telling somebody off for changing their mind.
      setCardState(outcome === 'saved' ? 'saved' : 'idle');
    } catch {
      setCardState('failed');
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

        <div className="row" style={{ gap: 11, marginBottom: 11 }}>
          <label className="grow">
            <span className="hero__label">{t('Date')}</span>
            <input
              className="input tnum"
              style={{ marginTop: 5 }}
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label className="grow">
            <span className="hero__label">{t('Time')}</span>
            <input
              className="input tnum"
              style={{ marginTop: 5 }}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        {fromInputs(day, time) === null && (
          <p className="note note--bad" style={{ marginTop: -4 }}>
            {t('That is not a date. The game keeps the one it has.')}
          </p>
        )}

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
        {hasPins ? <FrameStrip frames={strip} /> : <Scorecard scorecard={card} />}
        {game.note && <p className="gamenote">{game.note}</p>}
      </div>

      <div className="quickstats">
        <Stat label={t('Strikes')} value={summary.strikes} />
        <Stat label={t('Spares')} value={summary.spares} />
        <Stat label={t('Open')} value={summary.opens} />
      </div>

      <h2 className="section-title">{t('How it went')}</h2>
      <div className="daystats">
        <DayStat value={`${summary.strikePercent}%`} label={t('Strike %')} />
        <DayStat value={`${summary.sparePercent}%`} label={t('Spare %')} />
        <DayStat
          value={tf('{n} of {total}', { n: summary.clean, total: summary.framesBowled })}
          label={t('Clean frames')}
        />
        <DayStat value={summary.firstBallAverage} label={t('First ball')} />
        <DayStat value={summary.bestFrame} label={t('Best frame')} />
        <DayStat value={summary.longestStrikeRun} label={t('Longest run')} suffix="×" />
      </div>

      <p className="footnote" style={{ marginTop: 8 }}>
        {summary.splits
          ? tf(
              'Spare rate is over {n} attempts — a struck frame is not one. Splits: {converted} of {faced} picked up.',
              {
                n: summary.spareAttempts,
                converted: summary.splits.converted,
                faced: summary.splits.faced,
              },
            )
          : tf(
              'Spare rate is over {n} attempts — a struck frame is not one. This game was not scored on the rack, so it knows how many pins fell and not which.',
              { n: summary.spareAttempts },
            )}
      </p>

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
        className="btn-lg btn-lg--primary"
        onClick={shareAsImage}
        disabled={cardState === 'working'}
      >
        <Icon name="share" size={18} />
        {cardState === 'working' ? t('Drawing the card…') : t('Share as an image')}
      </button>
      <p className="footnote" style={{ marginBottom: 11 }}>
        {cardState === 'saved'
          ? t('Saved to this device — this browser will not hand a file to another app.')
          : cardState === 'failed'
            ? t('The card could not be drawn. The export below still works.')
            : t('A picture of the scorecard, for a chat that will not take a file.')}
      </p>

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
            If you back up to your account, the next backup takes it off the server as well.
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

function DayStat({
  value,
  label,
  suffix,
}: {
  value: number | string;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="card daystats__card">
      <div className="daystats__value tnum">
        {value}
        {suffix}
      </div>
      <div className="daystats__label">{label}</div>
    </div>
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
