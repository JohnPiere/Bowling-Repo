import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { t } from '../lib/i18n';
import { initialsOf } from '../lib/social';
import { AVATARS, colourOf, PLAYER_COLOURS, usePreferences } from '../lib/preferences';

interface Props {
  onDone: () => void;
}

/**
 * First run: pick a language, then make yourself. That is all of it.
 *
 * There were four tour cards here — the two scoring modes, the scanner, how
 * sharing works, where the games live. They are gone. A first run is somebody
 * standing at a lane wanting to score a game, and four screens of explanation
 * before the first ball is four screens they will skip; what they actually
 * cannot get past is a name and a tile, so that is what is left.
 *
 * The language comes first because everything after it is written in one, and
 * asking somebody to read three screens in the wrong language before offering
 * to change it is the wrong way round. It is the one question on this screen
 * that has to be answered without reading anything: the two options are written
 * in their own languages and nothing else is on the step.
 */
export function OnboardingScreen({ onDone }: Props) {
  const { preferences, update } = usePreferences();
  const [step, setStep] = useState<'language' | 'you'>('language');

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

  if (step === 'language') {
    return (
      <div className="onboard">
        <section className="besthero">
          <div className="orb" />
          <div className="besthero__head">
            <Icon name="ball" size={16} />
            <span className="hero__label">Lane Log</span>
          </div>
          {/* Not run through `t`. Whichever language this renders in would be
              a guess until the button below is pressed, so both are printed. */}
          <div className="besthero__empty">Language / 言語</div>
        </section>

        <div className="onboard__languages" role="group" aria-label="Language">
          {(
            [
              { code: 'en', label: 'English' },
              { code: 'ja', label: '日本語' },
            ] as const
          ).map((choice) => (
            // Neither is drawn as chosen. English is what the preference
            // defaults to, and highlighting it would present a default nobody
            // picked as an answer they had already given.
            <button
              key={choice.code}
              type="button"
              className="btn-lg"
              onClick={() => {
                update({ language: choice.code });
                setStep('you');
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>

        {/* Both languages again: this is the step where one has not been
            picked, so a sentence in either would be a coin toss. */}
        <p className="footnote" style={{ textAlign: 'center' }}>
          Change it later in Settings · あとから設定で変更できます
        </p>
      </div>
    );
  }

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
          // The fallback goes through `t` like the name under it: a Japanese
          // screen showing あなた over a tile reading "YO" is two answers to
          // the same question.
          initials={preferences.playerIcon || initialsOf(name || t('You'))}
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
          autoFocus
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
        onClick={finish}
      >
        <Icon name="check" size={18} />
        {t('Start bowling')}
      </button>

      <button
        type="button"
        className="linkbtn linkbtn--centred"
        onClick={() => setStep('language')}
      >
        {t('Back')}
      </button>
    </div>
  );
}
