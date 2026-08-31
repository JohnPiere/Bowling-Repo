import { useState } from 'react';
import { PinKeypad } from '../components/PinKeypad';
import { PinRack } from '../components/PinRack';
import { Scorecard } from '../components/Scorecard';
import { Icon } from '../components/Icon';
import { saveGame } from '../lib/db';
import { FULL_RACK, standingAfter } from '../lib/pins';
import { isGameComplete, nextRollCursor, pinsAvailable, scoreGame } from '../lib/scoring';
import { describeSaveFailure } from '../lib/storage';

/**
 * How the bowler is entering the game.
 *
 * The rack records which pins fell, which is what makes a leave — a 10-pin, a
 * 7-10 — visible later; the pad records only how many, and is faster when you
 * are trying to keep up with a league.
 */
type Entry = 'rack' | 'pad';

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
  const [entry, setEntry] = useState<Entry>('rack');
  const [rolls, setRolls] = useState<number[]>([]);
  /** Which pins each ball took. Only kept while scoring on the rack. */
  const [pinfalls, setPinfalls] = useState<number[][]>([]);
  /** Pins marked as down by the ball being entered, before it is committed. */
  const [pending, setPending] = useState<number[]>([]);
  const [house, setHouse] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const card = scoreGame(rolls);
  const cursor = nextRollCursor(rolls);
  const complete = isGameComplete(rolls);

  // What is on the deck for the ball being entered. Derived from the pinfalls
  // so a re-rack after a mark happens on its own.
  const standing = deckFor(pinfalls, pinsAvailable(rolls));

  function knockDown(pin: number) {
    setPending((current) =>
      current.includes(pin) ? current.filter((p) => p !== pin) : [...current, pin],
    );
  }

  function commitBall() {
    setRolls((current) => [...current, pending.length]);
    setPinfalls((current) => [...current, pending]);
    setPending([]);
  }

  function undo() {
    if (pending.length > 0) {
      setPending([]);
      return;
    }
    setRolls((current) => current.slice(0, -1));
    setPinfalls((current) => current.slice(0, -1));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveGame({
        bowler: 'You',
        house: house.trim() || undefined,
        rolls,
        // Only when every ball was entered on the rack; a half-recorded game
        // would make the leave statistics quietly wrong.
        pinfalls: pinfalls.length === rolls.length ? pinfalls : undefined,
        total: card.total,
        isComplete: complete,
        source: 'manual',
        playedAt: Date.now(),
      });
      setRolls([]);
      setPinfalls([]);
      setPending([]);
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
          onClick={() => {
            setEntry('rack');
            setStarted(true);
          }}
        >
          <Icon name="play" size={18} />
          Tap the pins you knocked down
        </button>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          Records which pins fell, so a 10-pin and a 7-10 show up later as
          themselves rather than as "9" and "8".
        </p>

        <button
          type="button"
          className="btn-lg"
          onClick={() => {
            setEntry('pad');
            setStarted(true);
          }}
        >
          Just count the pins
        </button>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          One tap a ball. Faster when you are keeping up with a league, but it
          cannot tell you what you left.
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
      ) : entry === 'rack' ? (
        <>
          <PinRack standing={standing} knocked={pending} onToggle={knockDown} />

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn-lg"
              onClick={undo}
              disabled={rolls.length === 0 && pending.length === 0}
            >
              Undo
            </button>
            <button type="button" className="btn-lg btn-lg--primary" onClick={commitBall}>
              {pending.length === standing.length && standing.length === 10
                ? 'Strike'
                : pending.length === standing.length
                  ? 'Spare'
                  : `Ball down · ${pending.length}`}
            </button>
          </div>
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
          setPinfalls([]);
          setPending([]);
          setStarted(false);
        }}
      >
        Discard this game
      </button>
    </>
  );
}

/**
 * The pins on the deck for the next ball.
 *
 * Derived from what has been thrown rather than tracked separately, so a
 * re-rack after a strike or a spare — including the tenth frame's extra
 * balls — falls out of the scoring rules instead of being special-cased here.
 * `available` is the count the scorer says is on the deck, which is the
 * authority; the pinfalls only say which ones they are.
 */
function deckFor(pinfalls: number[][], available: number): number[] {
  if (available === FULL_RACK.length) return [...FULL_RACK];

  let standing = [...FULL_RACK];
  for (const ball of pinfalls) {
    standing = standingAfter(standing, ball);
    if (standing.length === 0) standing = [...FULL_RACK];
  }

  // If the two disagree — a game part-entered on the pad, say — trust the
  // scorer and show a plausible deck of the right size.
  return standing.length === available ? standing : standing.slice(0, available);
}
