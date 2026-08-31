import { useState } from 'react';
import { PinKeypad } from '../components/PinKeypad';
import { Scorecard } from '../components/Scorecard';
import { Icon } from '../components/Icon';
import { saveGame } from '../lib/db';
import { isGameComplete, nextRollCursor, scoreGame } from '../lib/scoring';
import { describeSaveFailure } from '../lib/storage';

interface Props {
  /** Receives the saved game so the caller can offer to share it. */
  onSaved: (gameId: string) => void;
  onScan: () => void;
}

/**
 * Live scoring.
 *
 * Rolls are held in component state until the game is saved, so a mis-tap can
 * be undone without touching the database.
 */
export function PlayScreen({ onSaved, onScan }: Props) {
  const [started, setStarted] = useState(false);
  const [rolls, setRolls] = useState<number[]>([]);
  const [house, setHouse] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const card = scoreGame(rolls);
  const cursor = nextRollCursor(rolls);
  const complete = isGameComplete(rolls);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveGame({
        bowler: 'You',
        house: house.trim() || undefined,
        rolls,
        total: card.total,
        isComplete: complete,
        source: 'manual',
        playedAt: Date.now(),
      });
      setRolls([]);
      setHouse('');
      setStarted(false);
      onSaved(saved.id);
    } catch (err) {
      // Keep the rolls on screen: a failed save must not cost the game.
      setSaveError(describeSaveFailure(err));
    } finally {
      setSaving(false);
    }
  }

  if (!started) {
    return (
      <>
        <h2 className="section-title">How are you scoring this game?</h2>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={() => setStarted(true)}
        >
          <Icon name="play" size={18} />
          Enter pins by hand
        </button>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          Fastest while you bowl. One tap a ball, and the card fills in as you go.
        </p>

        <button type="button" className="btn-lg" onClick={onScan}>
          <Icon name="camera" size={18} />
          Scan a paper score sheet
        </button>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Photograph a finished sheet and Lane Log reads the marks off it. Best for games already
          bowled — you check every frame before it is saved.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <span className="hero__label">Frame {(cursor?.frame ?? 9) + 1}</span>
          <span className="tnum" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
            {card.total}
          </span>
        </div>
        <Scorecard scorecard={card} activeFrame={cursor?.frame ?? null} />
      </div>

      {complete ? (
        <>
          <div className="note note--good">
            Game finished — {card.total} pins. Add the house if you want it on the record.
          </div>
          <label className="field" style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">Where you bowled</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              placeholder="Rose Bowl Lanes"
            />
          </label>
          {saveError && <div className="note note--bad">{saveError}</div>}

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            onClick={save}
            disabled={saving}
          >
            <Icon name="check" size={18} />
            {saving ? 'Saving…' : 'Save this game'}
          </button>
        </>
      ) : (
        <PinKeypad
          rolls={rolls}
          onRoll={(pins) => setRolls((current) => [...current, pins])}
          onUndo={() => setRolls((current) => current.slice(0, -1))}
        />
      )}

      <button
        type="button"
        className="btn-lg"
        style={{ marginTop: 11 }}
        onClick={() => {
          setRolls([]);
          setStarted(false);
        }}
      >
        Discard this game
      </button>
    </>
  );
}
