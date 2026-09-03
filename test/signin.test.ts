import { describe, expect, it } from 'vitest';
import { shouldAnnounceSignIn, toSession, type Session } from '../src/lib/session';

/**
 * When the app says "signed in".
 *
 * Signing in is the only thing here that leaves the page, so the only evidence
 * it worked is a query parameter that the SDK deletes as soon as it has used
 * it. Every way of getting this wrong is invisible until somebody is holding
 * the phone: too eager and the dialogue greets them on every launch, twice and
 * one sign-in is congratulated twice, too keen and a guest is told they have
 * an account.
 */

const account: Session = {
  id: 'acc_1',
  isGuest: false,
  provider: 'google',
  name: 'Kenji',
  email: 'kenji@example.com',
  createdAt: 0,
};

const guest: Session = { id: 'g_1', isGuest: true, name: 'You', createdAt: 0 };

describe('shouldAnnounceSignIn', () => {
  it('announces an account that arrived on the way back from the provider', () => {
    expect(shouldAnnounceSignIn(true, false, account)).toBe(true);
  });

  it('says nothing on an ordinary launch', () => {
    // The session restored from storage every time the app opens is the same
    // shape as the one that just arrived. Only the landing tells them apart.
    expect(shouldAnnounceSignIn(false, false, account)).toBe(false);
  });

  it('announces once, not once per delivery', () => {
    // `getSession` and `onAuthStateChange` both hand over the same session on
    // a redirect landing.
    expect(shouldAnnounceSignIn(true, true, account)).toBe(false);
  });

  it('never congratulates a guest', () => {
    // A code exchange that failed leaves a guest and a `?code=` in the URL.
    expect(shouldAnnounceSignIn(true, false, guest)).toBe(false);
  });
});

describe('what the dialogue is given to say', () => {
  it('takes the name the provider gave', () => {
    const session = toSession({
      user: {
        id: 'acc_2',
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: 'Yui Nakamura' },
        email: 'yui@example.com',
        created_at: '2026-01-02T03:04:05Z',
      },
    } as never);

    expect(session.name).toBe('Yui Nakamura');
    expect(session.email).toBe('yui@example.com');
    expect(session.isGuest).toBe(false);
  });

  it('falls back to the address when the provider sent no name', () => {
    // Better than "Bowler" on a dialogue whose whole job is to say who you are.
    const session = toSession({
      user: { id: 'acc_3', app_metadata: {}, user_metadata: {}, email: 'sam@example.com' },
    } as never);

    expect(session.name).toBe('sam');
  });
});
