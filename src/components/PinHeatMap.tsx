import { rackRows } from '../lib/framestrip';
import { tf } from '../lib/i18n';
import type { PinHeat } from '../lib/stats';

interface Props {
  heat: PinHeat[];
  /** Frames with pin data behind it, for the footnote that has to say so. */
  frames: number;
}

/**
 * The rack, tinted by what keeps standing up.
 *
 * "What you leave" already knows all of this and says it as twelve rows of
 * names — "Baby split", "2-4-5", "Gutter". That is the right shape for reading
 * carefully and the wrong one for the question people actually bring to it,
 * which is *what keeps happening to me*. A diagram answers that before it is
 * read: most bowlers have a lopsided rack they recognise instantly as their own,
 * and the lopsidedness is the whole finding.
 *
 * Not a `PinRack`. That one is a grid of 44px buttons because it is aimed at
 * with a thumb, and none of that applies here — this is read, not tapped, so it
 * is drawn small and each pin carries its number and its count.
 *
 * The colour runs on `--negative` rather than the accent, following the same
 * rule as the practice list: on every other bar in the app a long one is good
 * news, and here a bright pin is a pin that keeps beating you.
 */
export function PinHeatMap({ heat, frames }: Props) {
  const byPin = new Map(heat.map((one) => [one.pin, one]));
  const worst = [...heat].sort((a, b) => b.times - a.times)[0];

  return (
    <div className="card">
      <div className="heatrack">
        {rackRows().map((row, i) => (
          <div className="heatrack__row" key={i}>
            {row.map((pin) => {
              const one = byPin.get(pin);
              const weight = one?.weight ?? 0;
              return (
                <span
                  key={pin}
                  className="heatrack__pin"
                  // The tint is the reading. A title rather than a tooltip
                  // component: this is a diagram, and the numbers under it are
                  // where the detail properly lives.
                  title={tf('{pin} pin: left {n}×', { pin, n: one?.times ?? 0 })}
                  style={{
                    // Floored so a pin that never stands is still a pin rather
                    // than a hole in the rack.
                    background: `rgba(224, 163, 182, ${0.08 + weight * 0.72})`,
                  }}
                >
                  <span className="heatrack__number tnum">{pin}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {worst && worst.times > 0 && (
        <p className="footnote" style={{ margin: '10px 0 0', textAlign: 'center' }}>
          {tf('The {pin} pin stands up most — {n} times, and you clear it {rate}% of the time.', {
            pin: worst.pin,
            n: worst.times,
            rate: worst.conversionRate ?? 0,
          })}
        </p>
      )}

      <p className="footnote" style={{ marginBottom: 0, textAlign: 'center' }}>
        {tf('From {n} frames scored on the rack.', { n: frames })}
      </p>
    </div>
  );
}
