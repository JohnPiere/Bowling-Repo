import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import { GROUPS } from '../data/groups';
import { shareGame, type Game } from '../lib/db';
import { notifyGroup } from '../lib/push';
import { scoreGame } from '../lib/scoring';

interface Props {
  game: Game;
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
export function ShareScreen({ game, onShared, onCancel }: Props) {
  const alreadyIn = game.sharedTo ?? [];
  const available = GROUPS.filter((group) => !alreadyIn.includes(group.id));

  const [groupId, setGroupId] = useState(available[0]?.id ?? '');
  const [withSheet, setWithSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tellCrew, setTellCrew] = useState(true);

  const card = scoreGame(game.rolls);
  const hasPhoto = Boolean(game.sheetImage);

  async function share() {
    if (!groupId) return;
    setBusy(true);
    try {
      await shareGame(game.id, groupId, { withSheet: hasPhoto && withSheet });

      if (tellCrew) {
        const group = GROUPS.find((entry) => entry.id === groupId);
        // Deliberately not awaited for its success: the share is already done,
        // and a push server that is down must not look like a failed share.
        void notifyGroup({
          title: group?.name ?? 'Lane Log',
          body: `You posted a ${game.total} to the board.`,
          url: `/?screen=groups`,
          tag: `share-${groupId}`,
        });
      }

      onShared(groupId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <span className="hero__label">This game</span>
          <span className="tnum" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
            {game.total}
          </span>
        </div>
        <Scorecard scorecard={card} />
      </div>

      <h2 className="section-title">Which crew</h2>
      {available.length === 0 ? (
        <p className="empty">
          This game is already on every board you belong to.
        </p>
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
          Already shared with{' '}
          {alreadyIn
            .map((id) => GROUPS.find((g) => g.id === id)?.name ?? id)
            .join(', ')}
          .
        </p>
      )}

      <h2 className="section-title">What goes with it</h2>
      <button
        type="button"
        className={`choice${!withSheet || !hasPhoto ? ' choice--on' : ''}`}
        onClick={() => setWithSheet(false)}
      >
        <span className="choice__dot" aria-hidden="true" />
        <span className="grow">
          <span className="choice__label">Score sheet only</span>
          <span className="choice__note">
            The frames, marks and totals. A couple of kilobytes — instant, and it works offline.
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
            {!hasPhoto && <span className="pill" style={{ marginLeft: 8 }}>No photo</span>}
          </span>
          <span className="choice__note">
            {hasPhoto
              ? 'Sends the picture of the paper sheet too, so the crew can check a frame against it.'
              : 'Only games imported by scanning have a photo attached.'}
          </span>
        </span>
      </button>

      <h2 className="section-title">Tell the crew</h2>
      <div className="card">
        <div className="row row--between">
          <span className="grow">
            <span style={{ display: 'block', fontSize: 13 }}>Send a notification</span>
            <span className="muted">
              Members with notifications on get a nudge. Needs the push server running.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={tellCrew}
            aria-label="Send a notification"
            className={`switch${tellCrew ? ' switch--on' : ''}`}
            onClick={() => setTellCrew((v) => !v)}
          >
            <span className="switch__knob" />
          </button>
        </div>
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
        Not now
      </button>

      <p className="footnote">
        Sharing sends the score sheet, not your whole history. You can retract it from the group's
        shared games at any time and it stays in your own history.
      </p>
    </>
  );
}
