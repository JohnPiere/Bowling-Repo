import { t, tf } from '../lib/i18n';
import type { Provider, SignInState } from '../lib/session';

interface Props {
  onSignIn: (provider: Provider) => void;
  onPlayAsGuest: () => void;
  /** True when a guest is linking rather than starting fresh. */
  isLinking?: boolean;
  guestGames?: number;
  /** Handing off to the provider, or having failed to. */
  state?: SignInState;
  error?: string | null;
  onDismissError?: () => void;
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
 *
 * There is no success state on this screen. Signing in leaves the page for the
 * provider and comes back as a fresh load, so the only outcome worth drawing
 * here is the failure to leave at all.
 */
export function AuthScreen({
  onSignIn,
  onPlayAsGuest,
  isLinking = false,
  guestGames = 0,
  state = 'idle',
  error = null,
  onDismissError,
}: Props) {
  if (state === 'redirecting') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div className="hero__label">{t('Handing over to your provider')}</div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {isLinking
            ? tf('Your {n} games stay on this device either way.', { n: guestGames })
            : t('This leaves Lane Log and comes back signed in.')}
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
          {t(
            'An account gets you groups, a shared board and cloud backup. Everything else works without one.',
          )}
        </p>
      </section>

      {error && (
        <div className="note note--bad" style={{ marginTop: 12 }}>
          {error}
          {onDismissError && (
            <button
              type="button"
              className="linkbtn"
              style={{ display: 'block', marginTop: 6 }}
              onClick={onDismissError}
            >
              {t('Try again')}
            </button>
          )}
        </div>
      )}

      <button type="button" className="btn-lg btn-lg--primary" onClick={() => onSignIn('google')}>
        {t('Continue with Google')}
      </button>
      <div className="rule-or">{t('or')}</div>

      <button type="button" className="btn-lg btn-lg--dashed" onClick={onPlayAsGuest}>
        {t('Play as a guest')}
      </button>

      <div className="note note--info" style={{ marginTop: 14 }}>
        <strong>{t('What a guest gives up')}</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {GUEST_LIMITS.map((limit) => (
            <li key={limit}>{t(limit)}</li>
          ))}
        </ul>
      </div>

      <p className="footnote">
        {t('Signing in never moves your games. They stay on this device either way.')}
      </p>
    </>
  );
}
