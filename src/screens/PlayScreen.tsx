import { useState } from 'react';
import { t, tf } from '../lib/i18n';
import { FrameStrip } from '../components/FrameStrip';
import { PinKeypad } from '../components/PinKeypad';
import { PinRack } from '../components/PinRack';
import { Icon } from '../components/Icon';
import { saveGame } from '../lib/db';
import { frameStrip } from '../lib/framestrip';
import { FULL_RACK, standingAfter } from '../lib/pins';
import {
  FRAMES_PER_GAME,
  isGameComplete,
  nextRollCursor,
  pinsAvailable,
  scoreGame,
} from '../lib/scoring';
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
 * The scoring step is built to fit one screen with nothing to scroll: the
 * strip, one line saying where you are, the rack, and the two buttons that
 * move the game on. Anything that made it taller — a house field, a full-width
 * discard button — belongs to finishing the game, not to bowling it, and waits
 * until the tenth is done.
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
  const strip = frameStrip(rolls, pinfalls, pending, cursor?.frame ?? null);

  function knockDown(pin: number) {
    setPending((current) =>
      current.includes(pin) ? current.filter((p) => p !== pin) : [...current, pin],
    );
  }

  /**
   * Everything still standing, in one tap, committed immediately.
   *
   * Not "select all then commit": a strike is one decision, and leaving it
   * pending would invite an eleventh tap to confirm what is already obvious.
   */
  function clearTheRack() {
    setRolls((current) => [...current, standing.length]);
    setPinfalls((current) => [...current, standing]);
    setPending([]);
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

  function discard() {
    setRolls([]);
    setPinfalls([]);
    setPending([]);
    setStarted(false);
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
        <h2 className="section-title">{t('How are you scoring this game?')}</h2>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={() => {
            setEntry('rack');
            setStarted(true);
          }}
        >
          <Icon name="play" size={18} />
          {t('Tap the pins you knocked down')}
        </button>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          {t(
            'Records which pins fell, so a 10-pin and a 7-10 show up later as themselves rather than as "9" and "8".',
          )}
        </p>

        <button
          type="button"
          className="btn-lg"
          onClick={() => {
            setEntry('pad');
            setStarted(true);
          }}
        >
          {t('Just count the pins')}
        </button>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          {t(
            'One tap a ball. Faster when you are keeping up with a league, but it cannot tell you what you left.',
          )}
        </p>

        <button type="button" className="btn-lg" onClick={onScan}>
          <Icon name="camera" size={18} />
          {t('Scan a paper score sheet')}
        </button>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {t(
            'Photograph a finished sheet and Lane Log reads the marks off it. Best for games already bowled — you check every frame before it is saved.',
          )}
        </p>
      </>
    );
  }

  // Finishing is its own step, and the only one allowed to scroll: the house
  // field and the save button replace the rack rather than sitting under it.
  if (complete) {
    return (
      <>
        <FrameStrip frames={strip} />

        <div className="note note--good" style={{ marginTop: 12 }}>
          {tf('Game finished — {n} pins. Add the house if you want it on the record.', {
            n: card.total,
          })}
        </div>

        <label className="field" style={{ display: 'block', marginBottom: 11 }}>
          <span className="hero__label">{t('Where you bowled')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={house}
            onChange={(e) => setHouse(e.target.value)}
            placeholder="Rose Bowl Lanes"
          />
        </label>
        {saveError && <div className="note note--bad">{saveError}</div>}

        <button type="button" className="btn-lg btn-lg--primary" onClick={save} disabled={saving}>
          <Icon name="check" size={18} />
          {saving ? t('Saving…') : t('Save this game')}
        </button>

        <button type="button" className="linkbtn linkbtn--centred" onClick={discard}>
          {t('Discard this game')}
        </button>
      </>
    );
  }

  if (entry === 'pad') {
    return (
      <>
        <FrameStrip frames={strip} />
        <div className="playline">
          <div>
            <div className="hero__label">
              {tf('Frame {n} of 10', { n: (cursor?.frame ?? 9) + 1 })}
            </div>
            <div className="playline__ball">
              {rollLabel(cursor?.rollInFrame ?? 0, standing.length)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="hero__label">{t('Running')}</div>
            <div className="playline__total tnum">{card.total}</div>
          </div>
        </div>

        <PinKeypad
          rolls={rolls}
          onRoll={(pins) => setRolls((current) => [...current, pins])}
          onUndo={() => setRolls((current) => current.slice(0, -1))}
        />

        <button type="button" className="linkbtn linkbtn--centred" onClick={discard}>
          {t('Discard this game')}
        </button>
      </>
    );
  }

  const swept = pending.length === standing.length && standing.length > 0;
  // The tenth's third box only exists once a mark earns it, which is not
  // obvious from an empty box. Said once, when the tenth is live — and the
  // column tightens by the line's own height so the note never costs the fold.
  const inTenth = cursor?.frame === FRAMES_PER_GAME - 1;

  return (
    <div className={`play${inTenth ? ' play--tenth' : ''}`}>
      <FrameStrip frames={strip} />

      {inTenth && (
        <p className="play__note">
          {t('The tenth keeps three boxes — the bonus ball is the accented one.')}
        </p>
      )}

      <div className="playline">
        <div>
          <div className="hero__label">
            {tf('Frame {n} of 10', { n: (cursor?.frame ?? 9) + 1 })}
          </div>
          <div className="playline__ball">
            {rollLabel(cursor?.rollInFrame ?? 0, standing.length)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="hero__label">{t('Running')}</div>
          <div className="playline__total tnum">{card.total}</div>
        </div>
      </div>

      <PinRack standing={standing} knocked={pending} onToggle={knockDown} />

      {/* The commonest ball in bowling is the one that takes everything, and
          tapping ten pins to say so is ten chances to hit the wrong one. This
          is the same action the rack performs, in one tap. */}
      <button type="button" className="btn-quick" onClick={clearTheRack}>
        <span className="btn-quick__mark">{standing.length === 10 ? 'X' : '/'}</span>
        {standing.length === 10 ? t('Strike — all ten') : t('Spare — everything left')}
      </button>

      <div className="play__commit">
        <button
          type="button"
          className="btn-lg btn-lg--narrow"
          onClick={undo}
          disabled={rolls.length === 0 && pending.length === 0}
        >
          {pending.length > 0 ? t('Clear') : t('Undo')}
        </button>
        {/* Says what the ball *was*, not how many pins it took: a cleared deck
            is a strike or a spare, and reading "10" back at someone who just
            struck is the app failing to notice. */}
        <button type="button" className="btn-lg btn-lg--primary grow" onClick={commitBall}>
          {swept && standing.length === 10
            ? t('Strike')
            : swept
              ? t('Spare')
              : tf('Ball down · {n}', { n: pending.length })}
        </button>
      </div>

      <button type="button" className="linkbtn linkbtn--centred" onClick={discard}>
        {t('Discard this game')}
      </button>
    </div>
  );
}

/**
 * Which ball this is, and what it is being thrown at.
 *
 * Deliberately not "tap the pins you knocked down" — the rack says that,
 * directly under the pins being tapped, and saying it twice made this line
 * wrap onto two at phone width for no new information.
 */
function rollLabel(rollInFrame: number, standingCount: number): string {
  if (rollInFrame === 0) return t('First ball');
  if (rollInFrame === 1) return tf('Second ball — {n} standing', { n: standingCount });
  return tf('Bonus ball — fresh rack, {n} pins', { n: standingCount });
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
