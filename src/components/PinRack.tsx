import { describeLeave, PIN_POSITIONS } from '../lib/pins';
import { t, tf } from '../lib/i18n';

interface Props {
  /** Pins still up before this ball. */
  standing: number[];
  /** Pins the bowler has marked as knocked down by this ball. */
  knocked: number[];
  onToggle: (pin: number) => void;
  /** Read-only, for showing a leave that has already been bowled. */
  readOnly?: boolean;
  /**
   * A fixed pixel size. Left off, the rack fills the width it is given, which
   * is what the entry screen wants: the whole point of tapping pins is hitting
   * the right one, and at 200px each pin's target is 50px with no dead space
   * between neighbours — aim a little off and you knock the wrong pin down.
   */
  size?: number;
}

/** Pin-width in SVG units; the rack is four wide and four rows deep. */
const UNIT = 10;
const RADIUS = 3.6;

/**
 * The rack, drawn as it stands on the deck.
 *
 * Tap a pin to knock it down. Pins already down before this ball are drawn
 * faintly rather than hidden, so the deck keeps its shape and the leave stays
 * recognisable — a 7-10 should look like a 7-10.
 */
export function PinRack({ standing, knocked, onToggle, readOnly = false, size }: Props) {
  const up = new Set(standing);
  const down = new Set(knocked);
  const remaining = standing.filter((pin) => !down.has(pin));

  const width = UNIT * 4;
  const height = UNIT * 4;

  return (
    <div className="rack">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={size}
        height={size}
        role="group"
        aria-label={t('Pin rack')}
        className={`rack__svg${size ? '' : ' rack__svg--fill'}`}
      >
        {Object.entries(PIN_POSITIONS).map(([key, pos]) => {
          const pin = Number(key);
          const isUp = up.has(pin);
          const isKnocked = down.has(pin);

          // Rows run back to front on the deck, so row 3 draws at the top.
          const cx = pos.x * UNIT + UNIT / 2;
          const cy = (3 - pos.row) * UNIT + UNIT / 2;

          const label = !isUp
            ? `Pin ${pin}, already down`
            : isKnocked
              ? `Pin ${pin}, knocked down — tap to stand it back up`
              : `Pin ${pin}, standing — tap to knock it down`;

          return (
            <g key={pin}>
              <circle
                cx={cx}
                cy={cy}
                r={RADIUS}
                className={[
                  'rack__pin',
                  !isUp ? 'rack__pin--gone' : '',
                  isKnocked ? 'rack__pin--knocked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <text x={cx} y={cy + 1.4} className="rack__number" textAnchor="middle">
                {pin}
              </text>
              {/* A generous hit target over the whole cell: a 3.6-unit circle
                  is far smaller than a thumb. */}
              {!readOnly && isUp && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={UNIT / 2}
                  fill="transparent"
                  className="rack__hit"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isKnocked}
                  aria-label={label}
                  onClick={() => onToggle(pin)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggle(pin);
                    }
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* describeLeave already says "split" where it is one, so there is no
          separate flag — two words for the same fact reads as a stutter.
          Nothing tapped yet is not a gutter ball, it is a ball not thrown, so
          the line waits rather than naming the full rack as a leave. */}
      <div className="rack__leave">
        {down.size === 0 ? (
          <span className="muted">{t('Tap the pins this ball took down')}</span>
        ) : (
          <>
            <span className="tnum" style={{ fontSize: 21 }}>
              {down.size}
            </span>{' '}
            <span className="muted">
              {down.size === 1 ? t('pin') : t('pins')}
              {remaining.length > 0 && ` · ${tf('leaves {leave}', { leave: describeLeave(remaining) })}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
