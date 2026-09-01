import { pinRows, type StripFrame } from '../lib/framestrip';
import { t } from '../lib/i18n';

/**
 * The ten frames, two rows of five.
 *
 * Each cell carries a pin diagram of what that frame took down, which is the
 * whole reason to draw the strip rather than a row of numbers: ten diagrams
 * side by side show where the misses are, and a 9 with the 10-pin left looks
 * nothing like a 9 with the headpin left.
 *
 * Cells are not tappable. Undo walks back a ball at a time, and a saved game
 * has a proper frame editor behind "Correct it" — a tap here that silently
 * discarded the frames after it would be the one destructive gesture on the
 * screen, sitting right next to the pins.
 */
export function FrameStrip({ frames }: { frames: StripFrame[] }) {
  return (
    <div className="strip" role="table" aria-label={t('Frames')}>
      {frames.map((frame) => (
        <div
          key={frame.number}
          className={[
            'strip__cell',
            frame.isCurrent ? 'strip__cell--now' : '',
            !frame.isCurrent && !frame.isComplete ? 'strip__cell--todo' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="row"
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
      ))}
    </div>
  );
}
