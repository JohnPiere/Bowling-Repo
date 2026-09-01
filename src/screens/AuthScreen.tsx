import { useState } from 'react';
import { t } from '../lib/i18n';
import type { Provider } from '../lib/session';

interface Props {
  onSignIn: (provider: Provider) => void;
  onPlayAsGuest: () => void;
  /** True when a guest is linking rather than starting fresh. */
  isLinking?: boolean;
  guestGames?: number;
}

const GUEST_LIMITS = [
  'No groups, no chat, no shared games',
  'Nothing is backed up — a lost phone is a lost season',
  'Everything else works: scoring, scanning, history and analytics',
];

/**
 * Sign in, or don't.
 *
 * Guest play is the default entry and the dashed button is deliberately not a
 * lesser option — nothing asks for an account until the bowler touches shared
 * content.
 */
export function AuthScreen({ onSignIn, onPlayAsGuest, isLinking = false, guestGames = 0 }: Props) {
  const [pending, setPending] = useState<Provider | null>(null);

  function start(provider: Provider) {
    setPending(provider);
    // No OAuth is wired up yet; the delay stands in for the redirect so the
    // pending state is real rather than decorative.
    setTimeout(() => onSignIn(provider), 900);
  }

  if (pending) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div className="hero__label">Signing in with {pending === 'google' ? 'Google' : 'Apple'}</div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {isLinking
            ? `Linking this device's ${guestGames} game${guestGames === 1 ? '' : 's'} to the new account.`
            : 'Creating your profile and checking for existing groups.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="hero-solo">
        <div className="orb" />
        <h2 style={{ fontSize: 23, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0 }}>
          {t('Keep your games, or just start bowling.')}
        </h2>
        <p className="hero__meta" style={{ marginTop: 8, marginBottom: 0 }}>
          {t('An account gets you groups, a shared board and cloud backup. Everything else works without one.')}
</p>
      </section>

      <button type="button" className="btn-lg btn-lg--primary" onClick={() => start('google')}>
        {t('Continue with Google')}
      </button>
      <button
        type="button"
        className="btn-lg"
        style={{ marginTop: 11 }}
        onClick={() => start('apple')}
      >
        {t('Continue with Apple')}
      </button>

      <div className="rule-or">or</div>

      <button type="button" className="btn-lg btn-lg--dashed" onClick={onPlayAsGuest}>
        {t('Play as a guest')}
      </button>

      <div className="note note--info" style={{ marginTop: 14 }}>
        <strong>{t('What a guest gives up')}</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {GUEST_LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>

      <p className="footnote">
        {t('Neither provider is connected yet — signing in records the choice on this device so the rest of the flow can be built against it.')}
</p>
    </>
  );
}
