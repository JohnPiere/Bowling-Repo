import { useEffect, useMemo, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { FrameStrip } from '../components/FrameStrip';
import { PinKeypad } from '../components/PinKeypad';
import { PinRack } from '../components/PinRack';
import { Icon } from '../components/Icon';
import { saveGame, type Game } from '../lib/db';
import { frameStrip } from '../lib/framestrip';
import { valuesUsed } from '../lib/stats';
import { deckFor } from '../lib/pins';
import { setBowling } from '../lib/updates';
import {
  FRAMES_PER_GAME,
  isGameComplete,
  nextRollCursor,
  scoreGame,
} from '../lib/scoring';
import { usePreferences } from '../lib/preferences';
import { describeSaveFailure } from '../lib/storage';
import { fromInputs, toDateInput, toTimeInput } from '../lib/datetime';

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
  /**
   * The season so far, only to offer back what has already been typed.
   *
   * Nothing on this screen reads a score out of it — a bowler naming their
   * ball for the fortieth time should be picking, not typing.
   */
  games: Game[];
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
export function PlayScreen({ onSaved, games }: Props) {
  const { preferences } = usePreferences();
  const suggestions = useMemo(
    () => ({
      houses: valuesUsed(games, (game) => game.house),
      balls: valuesUsed(games, (game) => game.ball),
      conditions: valuesUsed(games, (game) => game.condition),
    }),
    [games],
  );
  /**
   * Somebody who has settled on one of the two modes is not asked.
   *
   * Read once rather than watched: changing the setting from another screen
   * mid-game must not reach in and change how the game on screen is being
   * entered. It applies to the next game, which is when it is asked again.
   */
  const [chosen] = useState(() => preferences.scoringEntry);
  const skipChooser = chosen !== 'ask';

  const [started, setStarted] = useState(skipChooser);
  const [entry, setEntry] = useState<Entry>(chosen === 'pad' ? 'pad' : 'rack');
  const [rolls, setRolls] = useState<number[]>([]);
  /** Which pins each ball took. Only kept while scoring on the rack. */
  const [pinfalls, setPinfalls] = useState<number[][]>([]);
  /** Pins marked as down by the ball being entered, before it is committed. */
  const [pending, setPending] = useState<number[]>([]);
  // Seeded from the usual alley, and editable: most games are bowled in one
  // place, and the house is what per-house averages are made of.
  const [house, setHouse] = useState(() => preferences.homeHouse);
  // Same argument as the house: most people reach for the same ball most
  // nights, and the ball is what per-ball averages are made of.
  const [ball, setBall] = useState(() => preferences.defaultBall);
  const [lane, setLane] = useState('');
  const [condition, setCondition] = useState('');
  const [note, setNote] = useState('');
  // When it was bowled. Seeded from the clock and editable, because a game is
  // often written up afterwards — in the car, or the next morning — and filing
  // it under the moment it was typed puts it on the wrong day.
  const [day, setDay] = useState(() => toDateInput(Date.now()));
  const [time, setTime] = useState(() => toTimeInput(Date.now()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Null when the two fields do not make a date between them; the save button
  // goes off rather than quietly filing the game under today.
  const playedAt = fromInputs(day, time);

  const card = scoreGame(rolls);
  const cursor = nextRollCursor(rolls);
  const complete = isGameComplete(rolls);

  // What is on the deck for the ball being entered. Derived from the pinfalls
  // so a re-rack after a mark happens on its own.
  const standing = deckFor(rolls, pinfalls);
  const strip = frameStrip(rolls, pinfalls, pending, cursor?.frame ?? null);

  /**
   * Hold a waiting update back while there is a game on screen.
   *
   * These rolls are component state until the game is saved, so a reload here
   * is the one place in the app that loses something. Everywhere else it costs
   * a scroll position, which is why the update is taken immediately there.
   */
  useEffect(() => {
    setBowling(rolls.length > 0 || pending.length > 0);
  }, [rolls.length, pending.length]);

  // Clearing on the way out matters as much as setting it: leaving the play
  // screen mid-game would otherwise hold every future update for the life of
  // the tab. It has to be its own effect with no dependencies — as the cleanup
  // of the one above it ran on *every ball*, and a held update taken between
  // two frames is exactly the reload this is here to prevent.
  useEffect(() => () => setBowling(false), []);

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

  /**
   * The one link under the buttons, doing whichever job is worth doing.
   *
   * Before the first ball there is nothing to discard, and that is exactly when
   * somebody wants the other entry mode — so it switches modes until a ball is
   * down, and discards after. A swap rather than a second link, because the
   * scoring step fits one screen with nothing to scroll and a new line here
   * costs height the rack does not have to give. Switching before anything is
   * entered is free: there is nothing recorded to convert.
   *
   * Both entry modes draw it, from here rather than each having a copy: they
   * had one each, and the first version of this changed only the rack's.
   */
  function footLink() {
    if (rolls.length > 0 || pending.length > 0) {
      return (
        <button type="button" className="linkbtn linkbtn--centred" onClick={discard}>
          {t('Discard this game')}
        </button>
      );
    }

    return (
      <button
        type="button"
        className="linkbtn linkbtn--centred"
        onClick={() => setEntry(entry === 'rack' ? 'pad' : 'rack')}
      >
        {entry === 'rack' ? t('Just count the pins instead') : t('Tap the pins instead')}
      </button>
    );
  }

  function discard() {
    setRolls([]);
    setPinfalls([]);
    setPending([]);
    setStarted(skipChooser);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveGame({
        bowler: 'You',
        house: house.trim() || undefined,
        ball: ball.trim() || undefined,
        lane: lane.trim() || undefined,
        condition: condition.trim() || undefined,
        note: note.trim() || undefined,
        rolls,
        // Only when every ball was entered on the rack; a half-recorded game
        // would make the leave statistics quietly wrong.
        pinfalls: pinfalls.length === rolls.length ? pinfalls : undefined,
        total: card.total,
        isComplete: complete,
        source: 'manual',
        playedAt: playedAt ?? Date.now(),
      });
      setRolls([]);
      setPinfalls([]);
      setPending([]);
      setHouse(preferences.homeHouse);
      setBall(preferences.defaultBall);
      setLane('');
      setCondition('');
      setNote('');
      setDay(toDateInput(Date.now()));
      setTime(toTimeInput(Date.now()));
      setStarted(skipChooser);
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
          {tf('Game finished — {n} pins. Check when and where before saving.', {
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
            list="play-houses"
          />
        </label>

        {/* The three that used to be a sentence in the note. Free text, all of
            them, offering what has been typed before — the app has never had a
            table of alleys and does not want one of ball models either. */}
        <label style={{ display: 'block', marginBottom: 11 }}>
          <span className="hero__label">{t('Ball')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={ball}
            onChange={(e) => setBall(e.target.value)}
            placeholder={t('Storm Phaze II')}
            list="play-balls"
            maxLength={60}
          />
        </label>

        <div className="row" style={{ gap: 11, marginBottom: 11 }}>
          <label className="grow">
            <span className="hero__label">{t('Lane')}</span>
            <input
              className="input tnum"
              style={{ marginTop: 5 }}
              value={lane}
              onChange={(e) => setLane(e.target.value)}
              placeholder="7"
              inputMode="numeric"
              maxLength={12}
            />
          </label>
          <label className="grow">
            <span className="hero__label">{t('How it played')}</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder={t('Fresh')}
              list="play-conditions"
              maxLength={40}
            />
          </label>
        </div>

        <datalist id="play-houses">
          {suggestions.houses.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>
        <datalist id="play-balls">
          {suggestions.balls.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>
        <datalist id="play-conditions">
          {suggestions.conditions.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>

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

        <label className="field" style={{ display: 'block', marginBottom: 11 }}>
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
        <p className="footnote" style={{ margin: '-6px 0 12px' }}>
          {t('Optional, and searchable later. The numbers will not remember this part.')}
        </p>

        {playedAt === null && (
          <div className="note note--warn">
            {t('That date is not one the calendar has — check it before saving.')}
          </div>
        )}
        {saveError && <div className="note note--bad">{saveError}</div>}

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={save}
          disabled={saving || playedAt === null}
        >
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

        {footLink()}
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

      {footLink()}
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

