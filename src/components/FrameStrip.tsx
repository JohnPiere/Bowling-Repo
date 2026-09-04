import { pinRows, type StripFrame } from '../lib/framestrip';
import type React from 'react';
import { t, tf } from '../lib/i18n';

/**
 * The ten frames, two rows of five.
 *
 * Each cell carries a pin diagram of what that frame took down, which is the
 * whole reason to draw the strip rather than a row of numbers: ten diagrams
 * side by side show where the misses are, and a 9 with the 10-pin left looks
 * nothing like a 9 with the headpin left.
 *
 * **Cells are only tappable where something is listening.** On the play screen
 * nothing is: Undo walks back a ball at a time, and a tap here that silently
 * discarded the frames after it would be the one destructive gesture on the
 * screen, sitting right next to the pins. The frame editor passes
 * `onPickFrame` and `editable`, and there a tap re-throws that frame and keeps
 * everything after it — which is the opposite of destructive and is the whole
 * point of the screen.
 */
export function FrameStrip({
  frames,
  onPickFrame,
  editable,
}: {
  frames: StripFrame[];
  /** Given only where a tap means something. */
  onPickFrame?: (frame: number) => void;
  /** Which frames may be picked, 0-based. Anything else stays inert. */
  editable?: number[];
}) {
  const canPick = new Set(editable ?? []);

  return (
    <div className="strip" role="table" aria-label={t('Frames')}>
      {frames.map((frame) => {
        // `frame.number` is 1-based on the sheet; everything in `lib/` counts
        // frames from zero.
        const pickable = Boolean(onPickFrame) && canPick.has(frame.number - 1);

        return (
        <div
          key={frame.number}
          className={[
            'strip__cell',
            frame.isCurrent ? 'strip__cell--now' : '',
            !frame.isCurrent && !frame.isComplete ? 'strip__cell--todo' : '',
            pickable ? 'strip__cell--pickable' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...(pickable
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-label': tf('Fix frame {n}', { n: frame.number }),
                onClick: () => onPickFrame?.(frame.number - 1),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPickFrame?.(frame.number - 1);
                  }
                },
              }
            : { role: 'row' })}
        >
          <div className="strip__head">
            <span className="strip__num">{frame.number}</span>
            <span className="strip__total tnum">{frame.total ?? ''}</span>
          </div>

          <div className="strip__pins" aria-hidden="true">
            {pinRows(frame.down).map((row, i) => (
              <div key={i} className="strip__pinrow">
                {row.map((pin) => (
                  <span
                    key={pin.pin}
                    className={`strip__pin${pin.isDown ? ' strip__pin--down' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="strip__boxes">
            {frame.boxes.map((box, i) => (
              <span
                key={i}
                className={[
                  'strip__box',
                  box.isLive ? 'strip__box--live' : '',
                  box.isBonus ? 'strip__box--bonus' : '',
                  box.mark === 'X' || box.mark === '/' ? 'strip__box--mark' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="cell"
              >
                {box.mark}
              </span>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
