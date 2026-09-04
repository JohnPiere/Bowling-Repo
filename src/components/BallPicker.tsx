import { useState } from 'react';
import { Icon } from './Icon';
import { t, tf } from '../lib/i18n';

interface Props {
  /** The balls named for this game, in the order they were added. */
  value: string[];
  /** Balls named before, most-used first, for tapping rather than typing. */
  used: string[];
  onChange: (balls: string[]) => void;
}

const MAX_NAME = 60;
/** More than this and it is not a bag, it is a typo loop. */
const MAX_BALLS = 6;

/**
 * Which balls went into a game — usually two.
 *
 * Most people carry a strike ball and a plastic one for the ten pin, and a
 * single field made the second invisible: "my average with the Phaze II" meant
 * "games where the Phaze II is the one I happened to write down". So a game
 * names as many as it likes.
 *
 * Tapping beats typing, which is the whole reason `valuesUsed` exists — the
 * balls already named are chips, and the field is only there for a new one.
 * Nothing here is a list the app maintains: a ball is free text, as the house
 * and the lane condition are, because a table of ball models is a thing
 * somebody would then have to keep up to date for ever.
 */
export function BallPicker({ value, used, onChange }: Props) {
  const [typed, setTyped] = useState('');

  const has = (ball: string) => value.some((one) => one.toLowerCase() === ball.toLowerCase());
  const offer = used.filter((one) => !has(one));

  function add(ball: string) {
    const name = ball.trim().slice(0, MAX_NAME);
    if (!name || has(name) || value.length >= MAX_BALLS) return;
    onChange([...value, name]);
    setTyped('');
  }

  return (
    <div style={{ marginBottom: 11 }}>
      <span className="hero__label">{t('Balls')}</span>

      {value.length > 0 && (
        <div className="chips" style={{ marginTop: 5 }}>
          {value.map((ball) => (
            <button
              key={ball}
              type="button"
              className="chip"
              aria-pressed
              aria-label={tf('Remove {ball}', { ball })}
              onClick={() => onChange(value.filter((one) => one !== ball))}
            >
              {ball}
              {/* No `close` in the icon set, and `plus` turned 45 degrees is
                  the same two strokes — the pattern the goal list uses. */}
              <Icon name="plus" size={12} className="icon--close" />
            </button>
          ))}
        </div>
      )}

      {offer.length > 0 && value.length < MAX_BALLS && (
        <div className="chips" style={{ marginTop: 5 }}>
          {offer.slice(0, 8).map((ball) => (
            <button
              key={ball}
              type="button"
              className="chip"
              aria-label={tf('Add {ball}', { ball })}
              onClick={() => add(ball)}
            >
              <Icon name="plus" size={12} />
              {ball}
            </button>
          ))}
        </div>
      )}

      {value.length < MAX_BALLS && (
        <div className="row" style={{ gap: 8, marginTop: 5 }}>
          <input
            className="input grow"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t('Storm Phaze II')}
            maxLength={MAX_NAME}
            // Enter adds it rather than submitting whatever form it is in,
            // which on the finishing step would be saving the game.
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add(typed);
              }
            }}
          />
          <button
            type="button"
            className="btn-lg btn-lg--narrow"
            disabled={typed.trim() === ''}
            onClick={() => add(typed)}
          >
            {t('Add')}
          </button>
        </div>
      )}
    </div>
  );
}
