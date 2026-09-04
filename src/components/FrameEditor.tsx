import { useState } from 'react';
import { FrameStrip } from './FrameStrip';
import { PinRack } from './PinRack';
import { t, tf } from '../lib/i18n';
import { frameStrip } from '../lib/framestrip';
import { deckFor } from '../lib/pins';
import {
  editableFrames,
  frameBounds,
  frameMarks,
  nextRollCursor,
  replaceFrame,
  scoreGame,
} from '../lib/scoring';

interface Props {
  rolls: number[];
  /** Empty for a game entered on the pad or read off a sheet. */
  pinfalls: number[][];
  onChange: (next: { rolls: number[]; pinfalls: number[][] }) => void;
}

/**
 * Fixing a game that is already bowled, on the rack rather than in a text box.
 *
 * The correction used to be a line of marks — `X 9/ 72 …` — typed into an
 * input. That is a fast way to retype a whole game and a poor way to fix one
 * ball: you have to read your own game back out of a string, and it throws the
 * pin data away without saying so, because `pinfalls` is indexed by the roll
 * list and a frame that changes length slides every later ball against it.
 *
 * **The state is loaded, not started.** The strip shows the game as it stands,
 * with every frame's marks and pin diagram; tapping a finished frame re-throws
 * just that one, at the deck that frame actually had, and everything after it
 * stays exactly as bowled. `replaceFrame` splices both halves together so they
 * cannot come apart.
 *
 * A game with no pin data keeps none: tapping pins here is a way of saying
 * *how many* fell, and recording which ones for a single frame of a scanned
 * game would be inventing a leave nobody observed. The footnote says so, since
 * the rack cannot look any different while you are using it.
 */
export function FrameEditor({ rolls, pinfalls, onChange }: Props) {
  /** Which frame is being re-thrown, or null while the game is just on show. */
  const [frame, setFrame] = useState<number | null>(null);
  /** The balls entered so far for that frame, and their pins. */
  const [balls, setBalls] = useState<number[]>([]);
  const [ballPins, setBallPins] = useState<number[][]>([]);
  /** Pins marked down by the ball being entered, before it is committed. */
  const [pending, setPending] = useState<number[]>([]);

  const keepsPins = pinfalls.length === rolls.length && rolls.length > 0;

  // Everything before the frame being fixed, which is what its deck is built
  // from — the tenth re-racks mid-frame and only the real prefix knows that.
  const before = frame === null ? rolls.length : frameBounds(rolls)[frame].start;
  const prefixRolls = [...rolls.slice(0, before), ...balls];
  const prefixPins = keepsPins ? [...pinfalls.slice(0, before), ...ballPins] : [];

  const standing = deckFor(prefixRolls, prefixPins);
  const cursor = nextRollCursor(prefixRolls);
  // Done when the next ball would land in a later frame, or the game is over.
  const frameDone = frame !== null && (cursor === null || cursor.frame > frame);

  const shown = frame === null ? rolls : prefixRolls;
  const shownPins = frame === null ? pinfalls : prefixPins;
  const strip = frameStrip(shown, shownPins, pending, frame);

  function stop() {
    setFrame(null);
    setBalls([]);
    setBallPins([]);
    setPending([]);
  }

  function put(count: number, pins: number[]) {
    if (frame === null) return;

    const nextBalls = [...balls, count];
    const nextPins = [...ballPins, pins];
    const after = nextRollCursor([...rolls.slice(0, before), ...nextBalls]);

    if (after === null || after.frame > frame) {
      // The frame is full: splice it in and hand the whole game back.
      onChange(replaceFrame(rolls, keepsPins ? pinfalls : [], frame, nextBalls, nextPins));
      stop();
      return;
    }

    setBalls(nextBalls);
    setBallPins(nextPins);
    setPending([]);
  }

  if (frame === null) {
    const canEdit = editableFrames(rolls);
    return (
      <>
        <FrameStrip frames={strip} onPickFrame={setFrame} editable={canEdit} />
        <p className="footnote" style={{ margin: '8px 0 0' }}>
          {canEdit.length === 0
            ? t('Nothing to fix here yet.')
            : keepsPins
              ? t('Tap a frame to throw it again. The frames after it stay as they were.')
              : t(
                  'Tap a frame to throw it again. This game has no pin data, so the rack counts pins here rather than recording which ones.',
                )}
        </p>
      </>
    );
  }

  const swept = pending.length === standing.length && standing.length > 0;

  return (
    <>
      <FrameStrip frames={strip} />

      <div className="playline">
        <div>
          <div className="hero__label">{tf('Fixing frame {n}', { n: frame + 1 })}</div>
          <div className="playline__ball">
            {balls.length === 0
              ? t('First ball')
              : tf('Ball {n} — {pins} standing', { n: balls.length + 1, pins: standing.length })}
          </div>
        </div>
        {/* What this frame was, not what the game totals — the total is at the
            top of the card and repeating it here said "Was 151" beside a
            heading already reading 151. The marks are the context you actually
            want while re-throwing: you are here because one of them is wrong. */}
        <div style={{ textAlign: 'right' }}>
          <div className="hero__label">{t('Was')}</div>
          <div className="playline__total tnum" style={{ fontSize: 22, letterSpacing: '0.06em' }}>
            {frameMarks(scoreGame(rolls).frames[frame]).join(' ') || '—'}
          </div>
        </div>
      </div>

      <PinRack
        standing={standing}
        knocked={pending}
        onToggle={(pin) =>
          setPending((current) =>
            current.includes(pin) ? current.filter((p) => p !== pin) : [...current, pin],
          )
        }
      />

      <button type="button" className="btn-quick" onClick={() => put(standing.length, standing)}>
        <span className="btn-quick__mark">{standing.length === 10 ? 'X' : '/'}</span>
        {standing.length === 10 ? t('Strike — all ten') : t('Spare — everything left')}
      </button>

      <div className="play__commit">
        <button type="button" className="btn-lg btn-lg--narrow" onClick={stop}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="btn-lg btn-lg--primary grow"
          onClick={() => put(pending.length, pending)}
        >
          {swept && standing.length === 10
            ? t('Strike')
            : swept
              ? t('Spare')
              : tf('Ball down · {n}', { n: pending.length })}
        </button>
      </div>

      {/* Unreachable in practice — a frame is spliced in the moment its last
          ball lands — but a frame that somehow sat finished with no way out
          would be a screen you could not leave except by cancelling. */}
      {frameDone && (
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t('That frame is full.')}
        </p>
      )}
    </>
  );
}
