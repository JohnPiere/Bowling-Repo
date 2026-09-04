import { useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import { FrameStrip } from '../components/FrameStrip';
import { frameStrip } from '../lib/framestrip';
import type { Group } from '../lib/social';
import { describeBackendFailure } from '../lib/backend';
import { shareGame as shareLocally, type Game } from '../lib/db';
import { shareGame as postToCrew } from '../lib/social';
import { scoreGame } from '../lib/scoring';

interface Props {
  game: Game;
  /** The crews this bowler is in. */
  crews: Group[];
  /** Who is posting — the profile the row is written against. */
  me: string;
  onShared: (groupId: string) => void;
  onCancel: () => void;
}

/**
 * Share a finished game into a group.
 *
 * Sharing hands the group a reference, not a copy: the game stays yours, and
 * retracting it later only drops the reference. What travels is the score
 * sheet — and, for a scanned game, optionally the photo it came from.
 */
export function ShareScreen({ game, crews, me, onShared, onCancel }: Props) {
  const alreadyIn = game.sharedTo ?? [];
  const available = crews.filter((group) => !alreadyIn.includes(group.id));

  const [groupId, setGroupId] = useState(available[0]?.id ?? '');
  const [withSheet, setWithSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Off by default, and only offered when there is one. A note is written for
  // yourself — "oily left", "wrong ball" — and the crew reading it should be a
  // decision rather than a consequence of having kept one.
  const [shareNote, setShareNote] = useState(false);

  const card = scoreGame(game.rolls);
  const hasPhoto = Boolean(game.hasSheet);

  /*
   * The frames as they were bowled, pin diagrams and all — the same strip the
   * play screen draws, with no ball in flight.
   *
   * This screen showed the plain `Scorecard`: ten cells of marks and totals,
   * which is the right shape for a game with no pin record and the wrong one
   * for the game you have *just bowled on the rack*, where the leaves are the
   * part worth looking at before deciding to post it.
   *
   * Same fallback as the game record, and for the same reason: a game entered
   * on the pad has no pin data, and ten empty racks read as a bug rather than
   * as an absence.
   */
  const hasPins = (game.pinfalls?.length ?? 0) === game.rolls.length && game.rolls.length > 0;
  const strip = frameStrip(game.rolls, game.pinfalls ?? [], [], null);

  async function share() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      // The crew's copy first. If this fails there is nothing to undo, whereas
      // marking the game shared locally and then failing to post it would
      // leave a game that says it is on a board it never reached.
      await postToCrew({
        groupId,
        me,
        localId: game.id,
        rolls: game.rolls,
        total: game.total,
        house: game.house,
        note: shareNote ? game.note : undefined,
        playedAt: game.playedAt,
      });
      await shareLocally(game.id, groupId, { withSheet: hasPhoto && withSheet });

      onShared(groupId);
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <span className="hero__label">{t('This game')}</span>
          <span className="tnum" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
            {game.total}
          </span>
        </div>
        {hasPins ? <FrameStrip frames={strip} /> : <Scorecard scorecard={card} />}
      </div>

      <h2 className="section-title">{t('Which crew')}</h2>
      {available.length === 0 ? (
        <p className="empty">{t('This game is already on every board you belong to.')}</p>
      ) : (
        available.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`choice${group.id === groupId ? ' choice--on' : ''}`}
            onClick={() => setGroupId(group.id)}
          >
            <span className="choice__dot" aria-hidden="true" />
            <span className="grow">
              <span className="choice__label">{group.name}</span>
              <span className="choice__note">{group.members.length} members</span>
            </span>
          </button>
        ))
      )}

      {alreadyIn.length > 0 && (
        <p className="muted">
          {tf('Already shared with {crews}.', {
            // A crew you have since left still has the game; naming it by its
            // id would be worse than saying a crew you can no longer see.
            crews: alreadyIn
              .map((id) => crews.find((g) => g.id === id)?.name ?? t('a crew you have left'))
              .join(', '),
          })}
        </p>
      )}

      {error && <div className="note note--bad">{error}</div>}

      <h2 className="section-title">{t('What goes with it')}</h2>
      <button
        type="button"
        className={`choice${!withSheet || !hasPhoto ? ' choice--on' : ''}`}
        onClick={() => setWithSheet(false)}
      >
        <span className="choice__dot" aria-hidden="true" />
        <span className="grow">
          <span className="choice__label">{t('Score sheet only')}</span>
          <span className="choice__note">
            {t(
              'The frames, marks and totals. A couple of kilobytes — instant, and it works offline.',
            )}
          </span>
        </span>
      </button>

      <button
        type="button"
        className={`choice${withSheet && hasPhoto ? ' choice--on' : ''}`}
        disabled={!hasPhoto}
        onClick={() => setWithSheet(true)}
      >
        <span className="choice__dot" aria-hidden="true" />
        <span className="grow">
          <span className="choice__label">
            Score sheet and the photo
            {!hasPhoto && (
              <span className="pill" style={{ marginLeft: 8 }}>
                {t('No photo')}
              </span>
            )}
          </span>
          <span className="choice__note">
            {hasPhoto
              ? 'Sends the picture of the paper sheet too, so the crew can check a frame against it.'
              : 'Only games imported by scanning have a photo attached.'}
          </span>
        </span>
      </button>

      {game.note && (
        <div className="card" style={{ marginTop: 11 }}>
          <div className="row row--between">
            <span className="grow">
              <span style={{ display: 'block', fontSize: 13 }}>{t('Send your note too')}</span>
              <span className="muted">
                {t('Off by default — a note is written for you, not for the board.')}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={shareNote}
              aria-label={t('Send your note too')}
              className={`switch${shareNote ? ' switch--on' : ''}`}
              onClick={() => setShareNote((v) => !v)}
            >
              <span className="switch__knob" />
            </button>
          </div>
          {shareNote && <p className="gamenote">{game.note}</p>}
        </div>
      )}

      {/* This was a switch, and the switch did nothing. It said "needs the push
          server running" — and on a static host nothing is running, so it was
          a promise nobody could keep. Telling the crew is not a separate act
          from posting to their board anyway: the post *is* the telling, and
          whoever has notifications on is told as it lands. */}
      <h2 className="section-title">{t('Tell the crew')}</h2>
      <div className="card">
        <p style={{ margin: 0, fontSize: 13 }}>
          {t('Posting it is telling them.')}
        </p>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t(
            'Anyone in the crew with notifications on sees it arrive while they have Lane Log open.',
          )}
        </p>
      </div>

      <button
        type="button"
        className="btn-lg btn-lg--primary"
        style={{ marginTop: 14 }}
        disabled={!groupId || busy}
        onClick={share}
      >
        <Icon name="share" size={18} />
        {busy ? 'Sharing…' : 'Share to the board'}
      </button>
      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCancel}>
        {t('Not now')}
      </button>

      <p className="footnote">
        Sharing sends the score sheet, not your whole history. You can retract it from the group's
        shared games at any time and it stays in your own history.
      </p>
    </>
  );
}
