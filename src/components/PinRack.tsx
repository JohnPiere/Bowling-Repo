import { describeLeave } from '../lib/pins';
import { rackRows } from '../lib/framestrip';
import { t, tf } from '../lib/i18n';

interface Props {
  /** Pins still up before this ball. */
  standing: number[];
  /** Pins the bowler has marked as knocked down by this ball. */
  knocked: number[];
  onToggle: (pin: number) => void;
  /** Read-only, for showing a leave that has already been bowled. */
  readOnly?: boolean;
}

/**
 * The rack, drawn as it stands on the deck.
 *
 * Real buttons in rows rather than circles in an SVG. The rack is the thing
 * being aimed at on a phone, and buttons get the browser's own hit testing,
 * focus ring and press feedback for free — an SVG needs all three rebuilt, and
 * the version that did had its targets abutting with no dead space between
 * them, so a thumb aimed at the 5 could take the 8.
 *
 * Each pin is 46px painted with a 10px gutter, which is 44px to the thumb with
 * room to miss into rather than a neighbour to hit.
 *
 * Pins already down before this ball are drawn faintly rather than hidden, so
 * the deck keeps its shape and the leave stays recognisable — a 7-10 should
 * look like a 7-10.
 */
export function PinRack({ standing, knocked, onToggle, readOnly = false }: Props) {
  const up = new Set(standing);
  const down = new Set(knocked);
  const remaining = standing.filter((pin) => !down.has(pin));
  const swept = standing.length > 0 && remaining.length === 0;

  return (
    <div className="rack">
      <div className="rack__deck" role="group" aria-label={t('Pin rack')}>
        {rackRows().map((row, i) => (
          <div key={i} className="rack__row">
            {row.map((pin) => {
              const isUp = up.has(pin);
              const isKnocked = down.has(pin);

              const label = !isUp
                ? tf('Pin {n}, already down', { n: pin })
                : isKnocked
                  ? tf('Pin {n}, knocked down — tap to stand it back up', { n: pin })
                  : tf('Pin {n}, standing — tap to knock it down', { n: pin });

              return (
                <button
                  key={pin}
                  type="button"
                  className={[
                    'rack__pin',
                    !isUp ? 'rack__pin--gone' : '',
                    isKnocked ? 'rack__pin--knocked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isUp ? isKnocked : undefined}
                  aria-label={label}
                  disabled={readOnly || !isUp}
                  onClick={() => onToggle(pin)}
                >
                  {pin}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rack__legend" aria-hidden="true">
        <span>
          <i className="rack__key rack__key--standing" />
          {t('standing')}
        </span>
        <span>
          <i className="rack__key rack__key--knocked" />
          {t('knocked')}
        </span>
        <span>
          <i className="rack__key rack__key--gone" />
          {t('down')}
        </span>
      </div>

      {/*
        One slot under the rack, holding whichever of the two has something to
        say. The shout used to sit *above* the legend as its own element,
        appearing when the deck cleared — which pushed the legend, the leave
        line and both buttons 32px down at the exact moment the last pin went
        down, measured, and tipped the screen into scrolling. A button that
        moves as you complete the tap that summons it is the one thing the
        scoring step must not do.

        Swapping them rather than reserving room for both is what costs
        nothing, and it loses nothing either: a swept deck has no leave, so
        this line was already reading "10 down" directly under a shout saying
        STRIKE. The prototype drew the shout higher up; the fixed height here
        is the rule about the screen not moving, which wins.

        describeLeave already says "split" where it is one, so there is no
        separate flag — two words for the same fact reads as a stutter.
        Nothing tapped yet is not a gutter ball, it is a ball not thrown, so
        the line waits rather than naming the full rack as a leave.
      */}
      <div className="rack__say">
        {swept ? (
          <span className="rack__shout">{standing.length === 10 ? t('STRIKE') : t('SPARE')}</span>
        ) : down.size === 0 ? (
          <span className="rack__leave muted">{t('Tap the pins this ball took down')}</span>
        ) : (
          <span className="rack__leave muted">
            {tf('{n} down', { n: down.size })}
            {remaining.length > 0 &&
              ` · ${tf('leaves {leave}', { leave: describeLeave(remaining) })}`}
          </span>
        )}
      </div>
    </div>
  );
}
