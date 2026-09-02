import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { t, tf } from '../lib/i18n';
import { initialsOf } from '../lib/social';
import { AVATARS, colourOf, PLAYER_COLOURS, usePreferences } from '../lib/preferences';

interface Props {
  onDone: () => void;
  /** True when this is being replayed from settings rather than run once. */
  replay?: boolean;
}

interface Lesson {
  icon: IconName;
  title: string;
  body: string;
}

/**
 * The four things worth knowing before the first ball.
 *
 * Not a tour of every screen. A tutorial that names all fourteen is one nobody
 * finishes, and the app is mostly self-evident — what is *not* obvious is which
 * of two scoring modes to pick, that a sheet can be photographed at all, and
 * where the games live, which is the one with consequences.
 */
const LESSONS: Lesson[] = [
  {
    icon: 'target',
    title: 'Tap the pins, not a number',
    body: 'Scoring on the rack records which pins fell, so a 10-pin and a 7-10 show up in your stats as themselves. There is a number pad too, if you are just keeping up with a league.',
  },
  {
    icon: 'camera',
    title: 'Or photograph the sheet',
    body: 'Slide the paper until one game sits inside the bar, like scanning a barcode. It reads that row only, and you check every frame before it saves.',
  },
  {
    icon: 'users',
    title: 'A crew is opt-in, game by game',
    body: 'Nothing you bowl is shared until you say so. Sharing sends that one game to one crew, and you can take it back down.',
  },
  {
    icon: 'home',
    title: 'Your games live on this phone',
    body: 'No account needed, and they work with no signal at all. That also means a lost phone is a lost season — Settings has an export, and it is the only copy there is.',
  },
];

/**
 * First run: make yourself, then four cards.
 *
 * Deliberately before anything else, and deliberately short. The name and the
 * tile are what a crew sees, and picking them once at the start beats a
 * screenful of "You" that nobody thinks to go and change.
 */
export function OnboardingScreen({ onDone, replay = false }: Props) {
  const { preferences, update } = usePreferences();
  const [step, setStep] = useState<'you' | number>(replay ? 0 : 'you');

  const name = preferences.playerName === 'You' ? '' : preferences.playerName;
  const tint = colourOf(preferences.playerColour);

  function finish() {
    update({
      onboardedAt: Date.now(),
      // Somebody who skipped past the name keeps the default rather than an
      // empty tile; "You" is a real answer and reads fine on a board of one.
      playerName: preferences.playerName.trim() || 'You',
    });
    onDone();
  }

  if (step === 'you') {
    return (
      <div className="onboard">
        <section className="besthero">
          <div className="orb" />
          <div className="besthero__head">
            <Icon name="ball" size={16} />
            <span className="hero__label">{t('Welcome to Lane Log')}</span>
          </div>
          <div className="besthero__empty">{t('First, who are you?')}</div>
          <div className="besthero__meta">
            {t('This is the name and tile your crew sees. Both change later in settings.')}
          </div>
        </section>

        <div className="onboard__preview">
          <Avatar
            initials={preferences.playerIcon || initialsOf(name || 'You')}
            size={72}
            square
            tint={tint}
          />
          <div className="onboard__previewname">{name || t('You')}</div>
        </div>

        <label style={{ display: 'block' }}>
          <span className="hero__label">{t('Your name')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={name}
            onChange={(event) => update({ playerName: event.target.value })}
            placeholder={t('Bowler')}
            maxLength={40}
            autoFocus={!replay}
          />
        </label>

        <div className="hero__label" style={{ marginTop: 14 }}>
          {t('Your mark')}
        </div>
        <div className="chips chips--wrap" role="group" aria-label={t('Your mark')}>
          {AVATARS.map((glyph) => (
            <button
              key={glyph || 'initials'}
              type="button"
              className="chip"
              aria-pressed={preferences.playerIcon === glyph}
              onClick={() => update({ playerIcon: glyph })}
            >
              {glyph || t('Initials')}
            </button>
          ))}
        </div>

        <div className="hero__label" style={{ marginTop: 14 }}>
          {t('Your colour')}
        </div>
        <div className="swatches" role="group" aria-label={t('Your colour')}>
          {PLAYER_COLOURS.map((colour) => (
            <button
              key={colour.key}
              type="button"
              className="swatch"
              aria-pressed={preferences.playerColour === colour.key}
              aria-label={t(colour.label)}
              // Also `color`, because the selected ring is drawn with
              // `currentColor` — without it the ring inherits the page's text
              // colour and comes out black on a dark ground.
              style={{ background: colour.hex, color: colour.hex }}
              onClick={() => update({ playerColour: colour.key })}
            />
          ))}
        </div>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          style={{ marginTop: 18 }}
          onClick={() => setStep(0)}
        >
          {t('That’s me')}
        </button>
      </div>
    );
  }

  const lesson = LESSONS[step];
  const last = step === LESSONS.length - 1;

  return (
    <div className="onboard">
      <div className="onboard__dots" aria-hidden="true">
        {LESSONS.map((_, i) => (
          <span key={i} className={`onboard__dot${i === step ? ' onboard__dot--on' : ''}`} />
        ))}
      </div>

      <section className="card onboard__lesson">
        <span className="onboard__icon" style={{ color: tint }}>
          <Icon name={lesson.icon} size={26} />
        </span>
        <h2 className="onboard__title">{t(lesson.title)}</h2>
        <p className="onboard__body">{t(lesson.body)}</p>
      </section>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn-lg btn-lg--narrow"
          onClick={() => setStep(step === 0 ? 'you' : step - 1)}
        >
          {t('Back')}
        </button>
        <button
          type="button"
          className="btn-lg btn-lg--primary grow"
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {last
            ? t('Start bowling')
            : tf('Next · {n} of {total}', {
                n: step + 2,
                total: LESSONS.length,
              })}
        </button>
      </div>

      {/* Skippable, and not grudgingly. Somebody reinstalling has read this. */}
      <button type="button" className="linkbtn linkbtn--centred" onClick={finish}>
        {t('Skip the tour')}
      </button>
    </div>
  );
}
