import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { t as translate, tf, useTranslation } from '../lib/i18n';
import {
  AVATARS,
  colourOf,
  DEFAULTS,
  PLAYER_COLOURS,
  savePreferences,
  usePreferences,
} from '../lib/preferences';
import { buildBackup, planRestore, type RestorePlan } from '../lib/backup';
import { AvatarError, dataUrlBytes, toAvatarDataUrl } from '../lib/avatar';
import { START_SCREENS } from '../lib/preferences';
import { housesPlayed as housesPlayedIn, valuesUsed } from '../lib/stats';
import { forgetLastSync, forgetGames } from '../lib/cloud';
import { anyFailed, failedSteps, runReset, type ResetStep } from '../lib/reset';
import { reloadClean } from '../lib/recover';
import { forgetGuest } from '../lib/session';
import { Avatar } from '../components/Avatar';
import { CloudBackup } from '../components/CloudBackup';
import { forgetReadMarks, initialsOf, leaveEverything, resetMyProfile, saveMyProfile } from '../lib/social';
import { clearAllGames, forgetPushSubscription, putGames, type Game } from '../lib/db';
import type { Session } from '../lib/session';
import {
  getInstallState,
  IOS_INSTALL_STEPS,
  promptInstall,
  subscribeToInstallState,
  type InstallState,
} from '../lib/install';
import {
  currentReach,
  pushAvailability,
  showLocalTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  type NotifyReach,
} from '../lib/push';
import {
  describeSaveFailure,
  estimateStorage,
  formatBytes,
  requestPersistence,
  STORAGE_WARN_AT,
  type StorageReport,
} from '../lib/storage';

/** What each reset step is called when it has to be reported as unfinished. */
const NAMES: Record<ResetStep, string> = {
  backup: 'the copy on the server',
  crews: 'your crews',
  profile: 'your crew profile',
  signOut: 'signing out',
  games: 'the games on this phone',
  push: 'notifications',
  preferences: 'your settings',
};

/**
 * Settings, which on this app is mostly the two things that make it feel like
 * an app at all: getting it onto the Home Screen and turning notifications on.
 */
export function SettingsScreen({
  games,
  session,
  onSignOut,
  onRestored,
}: {
  games: Game[];
  /** Who is signed in, which is what decides whether a backup is offered. */
  session: Session;
  /**
   * Disconnect the account.
   *
   * There was no way to do this at all: signing in was a one-way door, because
   * `useSession` has always returned a `signOut` and nothing ever called it.
   */
  onSignOut?: () => void;
  onRestored?: () => void;
}) {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  // Offered under the alley field, so it is a pick rather than typing for
  // anybody who already has a game in their season.
  const housesPlayed = useMemo(() => housesPlayedIn(games), [games]);
  const ballsUsed = useMemo(() => valuesUsed(games, (game) => game.ball), [games]);

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const [profileSync, setProfileSync] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetFailures, setResetFailures] = useState<ResetStep[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  const [install, setInstall] = useState<InstallState>(getInstallState);
  const [reach, setReach] = useState<NotifyReach>('none');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const backupRef = useRef<HTMLInputElement | null>(null);

  /**
   * Take a picked photograph and put it on the tile.
   *
   * Re-encoded to a small square here rather than stored as picked — a phone
   * photograph is megabytes and the tile is 192 pixels. The write is checked
   * because preferences are saved as one object: a picture that overflowed the
   * quota would take the name and the language with it, and silently.
   */
  /**
   * Keep the crew's copy of the profile in step with this one.
   *
   * Nothing wrote `profiles` before this: the name a crew saw was whatever the
   * provider handed over at sign-up, and everything on this card was local.
   * A picture makes that indefensible — there would be no way to send one — so
   * the name and the initials go up with it.
   *
   * Debounced, because the name field fires on every keystroke and the crew
   * does not need to watch somebody type. Guests have nowhere to send it.
   */
  useEffect(() => {
    if (session.isGuest) return;

    const timer = setTimeout(() => {
      setProfileSync('saving');
      saveMyProfile(session.id, {
        name: preferences.playerName,
        initials: initialsOf(preferences.playerName),
        avatar: preferences.playerPhoto,
      }).then(
        () => setProfileSync('saved'),
        // Not a banner: the profile on this device is unchanged and correct,
        // and the crew will get it on the next edit or the next open.
        () => setProfileSync('failed'),
      );
    }, 900);

    return () => clearTimeout(timer);
  }, [session.id, session.isGuest, preferences.playerName, preferences.playerPhoto]);

  /**
   * Put the whole account back to nothing.
   *
   * The order and the keep-going rules live in `lib/reset.ts`; this supplies
   * the work. The remote four are omitted for a guest, which is what makes the
   * screen report three steps rather than seven that were never going to run.
   */
  async function resetEverything() {
    setResetting(true);
    setResetFailures(null);

    const outcomes = await runReset({
      ...(session.isGuest
        ? {}
        : {
            backup: () => forgetGames(session.id),
            crews: () => leaveEverything(session.id),
            profile: () => resetMyProfile(session.id),
            signOut: async () => onSignOut?.(),
          }),
      games: () => clearAllGames(),
      push: async () => {
        // Both halves: the browser's subscription and this device's record of
        // it. Leaving the record would have the next install think it is
        // already subscribed to a push service that has forgotten it.
        await unsubscribeFromPush().catch(() => undefined);
        await forgetPushSubscription();
      },
      preferences: async () => {
        forgetReadMarks();
        forgetLastSync();
        forgetGuest();
        // Written but deliberately not announced. `onboardedAt` going to null
        // is the gate the first-run screen is behind, and firing the change
        // event here would unmount this screen the instant the reset landed —
        // taking the report of what happened with it, which on the one screen
        // that can half-fail is the part worth reading.
        savePreferences(DEFAULTS);
      },
    });

    setResetting(false);
    setConfirmReset(false);
    setResetFailures(anyFailed(outcomes) ? failedSteps(outcomes) : []);
    onRestored?.();
  }

  async function readPhoto(file: File) {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const photo = await toAvatarDataUrl(file);
      if (!update({ playerPhoto: photo })) {
        update({ playerPhoto: null });
        setPhotoError(
          'This browser would not store the picture — it is out of room, or set to block site data.',
        );
      }
    } catch (err) {
      setPhotoError(
        err instanceof AvatarError ? err.message : 'That picture could not be read.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function readBackup(file: File) {
    setRestoreError(null);
    setRestored(null);
    try {
      setPlan(planRestore(await file.text(), games));
    } catch (err) {
      setPlan(null);
      setRestoreError(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyRestore() {
    if (!plan) return;
    setRestoreError(null);
    try {
      await putGames(plan.toAdd);
      setRestored(plan.toAdd.length);
      setPlan(null);
      onRestored?.();
    } catch (err) {
      // Restoring a season onto a nearly full device is exactly when this
      // fails, and a Restore button that silently does nothing is the worst
      // way to find out.
      setRestoreError(describeSaveFailure(err));
    }
  }

  useEffect(() => subscribeToInstallState(setInstall), []);
  useEffect(() => {
    estimateStorage().then(setStorage, () => setStorage(null));
  }, [games.length]);
  useEffect(() => {
    currentReach().then(setReach, () => setReach('none'));
  }, [install]);

  const availability = pushAvailability();

  async function toggleNotifications() {
    setBusy(true);
    setMessage(null);
    try {
      if (reach === 'none') {
        setReach(await subscribeToPush());
      } else {
        await unsubscribeFromPush();
        setReach('none');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearEverything() {
    setBusy(true);
    setMessage(null);
    try {
      const removed = await clearAllGames();
      // Including who you were. "Clear all data" that kept your name, tile and
      // colour would be the app holding on to a piece of somebody who asked to
      // be gone — and the next screen is the one that asks for them again.
      update({
        playerName: DEFAULTS.playerName,
        playerIcon: DEFAULTS.playerIcon,
        // The photograph above all: it is the only thing here that is a picture
        // of somebody, and it arrived after this list was written.
        playerPhoto: DEFAULTS.playerPhoto,
        playerColour: DEFAULTS.playerColour,
        onboardedAt: null,
      });
      setCleared(removed);
      setConfirmClear(false);
      onRestored?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="section-title">{t('Language')}</h2>
      <div className="card">
        <div className="chips" role="group" aria-label={t('Language')}>
          {(['en', 'ja'] as const).map((code) => (
            <button
              key={code}
              type="button"
              className="chip"
              aria-pressed={preferences.language === code}
              onClick={() => update({ language: code })}
            >
              {code === 'en' ? 'English' : '日本語'}
            </button>
          ))}
        </div>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t('Titles and navigation switch instantly.')}
        </p>
      </div>

      <h2 className="section-title">{t('Player profile')}</h2>
      <div className="card">
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <Avatar
            initials={preferences.playerIcon || initialsOf(preferences.playerName)}
            size={52}
            square
            tint={colourOf(preferences.playerColour)}
            photo={preferences.playerPhoto}
          />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="profile__name">{preferences.playerName}</span>
            <span className="game-row__sub" style={{ display: 'block', marginTop: 2 }}>
              {t('This is what your crew sees.')}
            </span>
          </span>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="btn-lg grow"
            disabled={photoBusy}
            onClick={() => photoRef.current?.click()}
          >
            <Icon name="camera" size={17} />
            {photoBusy
              ? t('Shrinking it…')
              : preferences.playerPhoto
                ? t('Change the photo')
                : t('Use a photo')}
          </button>
          {preferences.playerPhoto && (
            <button
              type="button"
              className="btn-lg btn-lg--narrow"
              onClick={() => {
                setPhotoError(null);
                update({ playerPhoto: null });
              }}
            >
              {t('Remove')}
            </button>
          )}
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared before the await, so picking the same file twice in a row
            // still fires a change.
            event.target.value = '';
            if (file) void readPhoto(file);
          }}
        />

        {photoError && (
          <div className="note note--bad" style={{ marginTop: -4 }}>
            {photoError}
          </div>
        )}

        <p className="footnote" style={{ margin: '-6px 0 12px' }}>
          {preferences.playerPhoto
            ? tf('Cropped square and shrunk to {n} on this device. The mark below is hidden while a photo is set.', {
                n: formatBytes(dataUrlBytes(preferences.playerPhoto)),
              })
            : t('Cropped to a square and shrunk on this device before it is stored anywhere.')}
        </p>

        <label style={{ display: 'block' }}>
          <span className="hero__label">{t('Player name')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={preferences.playerName}
            onChange={(event) => update({ playerName: event.target.value })}
            maxLength={40}
          />
        </label>

        {!session.isGuest && profileSync !== 'idle' && (
          <p className="footnote" style={{ margin: '0 0 8px' }}>
            {profileSync === 'saving'
              ? t('Sending it to your crew…')
              : profileSync === 'saved'
                ? t('Your crew sees this too.')
                : t('Your crew has not got this yet — it will go with the next change.')}
          </p>
        )}

        <div
          className="hero__label"
          style={{ marginTop: 12, opacity: preferences.playerPhoto ? 0.45 : 1 }}
        >
          {t('Profile icon')}
        </div>
        <div
          className="chips chips--wrap"
          role="group"
          aria-label={t('Profile icon')}
          // Still choosable, because it is what comes back when the photo is
          // removed — but dimmed, since nothing on screen is showing it.
          style={{ opacity: preferences.playerPhoto ? 0.45 : 1 }}
        >
          {AVATARS.map((glyph) => (
            <button
              key={glyph}
              type="button"
              className="chip"
              aria-pressed={preferences.playerIcon === glyph}
              onClick={() => update({ playerIcon: glyph })}
            >
              {glyph || t('Initials')}
            </button>
          ))}
        </div>

        <div className="hero__label" style={{ marginTop: 12 }}>
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
      </div>

      {/* Three settings, and each one removes something paid every time rather
          than adding a switch for its own sake: a tap on the tab bar at every
          launch, the same answer to the same question at every game, and the
          name of the alley typed on a phone at the end of one. */}
      <h2 className="section-title">{t('Make it yours')}</h2>
      <div className="card">
        <span className="hero__label">{t('Open on')}</span>
        <div className="chips" role="group" aria-label={t('Open on')} style={{ marginTop: 5 }}>
          {START_SCREENS.map((screen) => (
            <button
              key={screen.key}
              type="button"
              className="chip"
              aria-pressed={preferences.startScreen === screen.key}
              onClick={() => update({ startScreen: screen.key })}
            >
              {t(screen.label)}
            </button>
          ))}
        </div>
        <p className="footnote">
          {t('Which screen Lane Log opens on. A link with a screen in it still wins.')}
        </p>

        <span className="hero__label">{t('Scoring a game')}</span>
        <div className="chips" role="group" aria-label={t('Scoring a game')} style={{ marginTop: 5 }}>
          {(
            [
              ['ask', 'Ask each time'],
              ['rack', 'Tap the pins'],
              ['pad', 'Count the pins'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={preferences.scoringEntry === key}
              onClick={() => update({ scoringEntry: key })}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <p className="footnote">
          {t(
            'Skips the question at the start of every game. You can still switch before the first ball.',
          )}
        </p>

        <label style={{ display: 'block' }}>
          <span className="hero__label">{t('Usual alley')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={preferences.homeHouse}
            onChange={(event) => update({ homeHouse: event.target.value })}
            maxLength={60}
            placeholder="Rose Bowl Lanes"
            // Whatever this season was actually bowled at, so it is a pick
            // rather than a piece of typing for anybody with a game already.
            list="settings-houses"
          />
        </label>
        <datalist id="settings-houses">
          {housesPlayed.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="footnote">
          {t(
            'Filled in when you finish a game, and editable there. It is what per-house averages are made of.',
          )}
        </p>

        <label style={{ display: 'block' }}>
          <span className="hero__label">{t('Usual ball')}</span>
          <input
            className="input"
            style={{ marginTop: 5 }}
            value={preferences.defaultBall}
            onChange={(event) => update({ defaultBall: event.target.value })}
            maxLength={60}
            placeholder={t('Storm Phaze II')}
            list="settings-balls"
          />
        </label>
        <datalist id="settings-balls">
          {ballsUsed.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t(
            'Pre-filled the same way. Per-ball averages are only worth having if the field gets filled in.',
          )}
        </p>
      </div>

      <h2 className="section-title">{t('Sharing')}</h2>
      <div className="card">
        <div className="row row--between" style={{ gap: 12 }}>
          <span className="grow" id="auto-share-label">
            {t('Share finished games with your crew')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.autoShare}
            aria-labelledby="auto-share-label"
            className={`switch${preferences.autoShare ? ' switch--on' : ''}`}
            onClick={() => update({ autoShare: !preferences.autoShare })}
          >
            <span className="switch__knob" />
          </button>
        </div>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {t(
            'Off by default. Turn it on and every game you save is posted to the crew as soon as it is finished.',
          )}
        </p>
      </div>

      <h2 className="section-title">{t('Install')}</h2>
      <div className="card">
        {install.kind === 'installed' && (
          <p style={{ margin: 0 }}>
            <Icon name="check" size={16} /> {t('Lane Log is installed on this device.')}
          </p>
        )}

        {install.kind === 'prompt-available' && (
          <>
            <p className="card__hint muted" style={{ marginTop: 0 }}>
              {t('Add Lane Log to your Home Screen so it opens full-screen and works offline.')}
            </p>
            <button
              type="button"
              className="btn-lg btn-lg--primary"
              onClick={() => void promptInstall()}
            >
              {t('Add to Home Screen')}
            </button>
          </>
        )}

        {install.kind === 'manual-ios' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              iOS has no install button — Safari does it from the Share sheet:
            </p>
            <ol className="muted" style={{ paddingLeft: 18, margin: 0 }}>
              {IOS_INSTALL_STEPS.map((step) => (
                <li key={step} style={{ marginBottom: 4 }}>
                  {step}
                </li>
              ))}
            </ol>
          </>
        )}

        {install.kind === 'unavailable' && (
          <p className="muted" style={{ margin: 0 }}>
            {t(
              'This browser has not offered to install Lane Log. It still works as a normal page; notifications may not.',
            )}
          </p>
        )}
      </div>

      <h2 className="section-title">{t('Notifications')}</h2>
      <div className="card">
        {availability.state !== 'ready' ? (
          <div
            className={`note ${availability.state === 'needs-install' ? 'note--info' : 'note--warn'}`}
            style={{ marginBottom: 0 }}
          >
            {availability.reason}
          </div>
        ) : (
          <>
            <div className="row row--between" style={{ marginBottom: 11 }}>
              <span>
                <span style={{ display: 'block' }}>{t('Notifications')}</span>
                <span className="muted">{describe(reach)}</span>
              </span>
              <Icon name="bell" size={19} />
            </div>

            {Notification.permission === 'denied' ? (
              <div className="note note--warn" style={{ marginBottom: 0 }}>
                Notifications are blocked for this site. Re-allow them in your browser settings —
                the app cannot ask again once they are denied.
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn-lg ${reach === 'none' ? 'btn-lg--primary' : ''}`}
                  onClick={toggleNotifications}
                  disabled={busy}
                >
                  {busy
                    ? t('Working…')
                    : reach === 'none'
                      ? t('Turn on notifications')
                      : t('Turn off')}
                </button>

                {reach === 'alerts' && (
                  <p className="footnote" style={{ marginTop: 11, marginBottom: 0 }}>
                    {t(
                      'Waking a closed app needs a server to send the notification, and this build is served from static hosting with none. What you get is the crew’s activity while the app is running.',
                    )}
                  </p>
                )}

                {reach !== 'none' && (
                  <button
                    type="button"
                    className="btn-lg"
                    style={{ marginTop: 11 }}
                    onClick={() => void showLocalTestNotification()}
                  >
                    {t('Send a test notification')}
                  </button>
                )}
              </>
            )}

            {message && (
              <div className="note note--bad" style={{ marginTop: 11, marginBottom: 0 }}>
                {message}
              </div>
            )}
          </>
        )}
      </div>

      <h2 className="section-title">{t('About')}</h2>
      <div className="card">
        <div className="row row--between">
          <span className="muted">{t('Version')}</span>
          <span className="tnum">{__APP_VERSION__}</span>
        </div>

        {/* The lever for when the automatic path has not worked. Clearing the
            cached build and reloading is the same thing the boot guard does
            when the app cannot start at all — it is the copy of the *program*
            that goes, never the games. */}
        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: 11 }}
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void reloadClean();
          }}
        >
          {checking ? t('Looking…') : t('Check for updates')}
        </button>
        <p className="footnote">
          {t(
            'Clears this device’s copy of the app and loads it again. Your games, settings and crews are not touched.',
          )}
        </p>
        <p className="footnote" style={{ marginBottom: 0, marginTop: 10 }}>
          {t(
            'Lane Log scores, scans and keeps your season on this device, with no account and no signal. A copy on the server is something you switch on, and a file export works without one.',
          )}
        </p>
      </div>

      {!session.isGuest && onSignOut && (
        <>
          <h2 className="section-title">{t('Account')}</h2>
          <div className="card">
            <div className="row" style={{ gap: 12 }}>
              <Avatar initials={initialsOf(session.name)} size={40} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13 }}>{session.name}</span>
                <span className="game-row__sub" style={{ display: 'block' }}>
                  {session.email ?? t('Signed in with Google')}
                </span>
              </span>
            </div>

            {confirmSignOut ? (
              <>
                <div className="note note--warn" style={{ marginTop: 11 }}>
                  {t(
                    'Your games stay on this phone — signing out does not touch them, and it does not delete the copy on the server either. What goes is the crews, the chat and the boards, until you sign in again.',
                  )}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn-lg" onClick={() => setConfirmSignOut(false)}>
                    {t('Stay signed in')}
                  </button>
                  <button
                    type="button"
                    className="btn-lg btn-lg--danger"
                    onClick={() => {
                      setConfirmSignOut(false);
                      onSignOut();
                    }}
                  >
                    {t('Sign out')}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn-lg"
                style={{ marginTop: 11 }}
                onClick={() => setConfirmSignOut(true)}
              >
                {t('Disconnect this account')}
              </button>
            )}

            <p className="footnote" style={{ marginBottom: 0 }}>
              {t(
                'To remove Lane Log’s access at Google’s end as well, take it off your Google account’s third-party app list.',
              )}
            </p>
          </div>
        </>
      )}

      <CloudBackup session={session} games={games} onRestored={onRestored} />

      <h2 className="section-title">{t('Data')}</h2>
      <div className="card">
        <p className="muted" style={{ margin: '0 0 11px' }}>
          {t(
            'Removes every game and every scanned sheet on this device, and the name, tile and photo you set. Your crews, the copy on the server and this device’s notification setting are left alone — the full reset below takes those too.',
          )}
        </p>

        {cleared === null ? (
          <button
            type="button"
            className="btn-lg btn-lg--danger"
            onClick={() => setConfirmClear(true)}
            disabled={games.length === 0}
          >
            {t('Clear all data')}
          </button>
        ) : (
          <div className="note note--info" style={{ marginBottom: 0 }}>
            {tf('{n} games removed. Nothing is left to undo it with.', { n: cleared })}
          </div>
        )}

        {games.length === 0 && cleared === null && (
          <p className="footnote" style={{ marginBottom: 0 }}>
            {t('There is nothing stored on this device yet.')}
          </p>
        )}
      </div>

      {/* A second step rather than a confirm(): the browser dialog cannot say
          what is about to go, and this is the one action in the app that
          nothing can undo. */}
      {confirmClear && (
        <div className="card card--danger">
          <div className="hero__label" style={{ marginBottom: 6 }}>
            {t('Clear all data?')}
          </div>
          <p style={{ margin: '0 0 4px' }}>
            {tf('{n} games and {sheets} scanned sheets will be deleted from this device.', {
              n: games.length,
              sheets: games.filter((game) => game.hasSheet).length,
            })}
          </p>
          <p className="footnote">
            {t(
              'There is no account and no server, so this cannot be undone. Export a backup first if you want one.',
            )}
          </p>

          <button
            type="button"
            className="btn-lg btn-lg--danger"
            disabled={busy}
            onClick={() => void clearEverything()}
          >
            {busy ? t('Clearing…') : t('Yes, delete everything')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 9 }}
            onClick={() => setConfirmClear(false)}
          >
            {t('Keep my games')}
          </button>
        </div>
      )}

      <h2 className="section-title">{t('Start over')}</h2>
      <div className="card">
        <p className="muted" style={{ margin: '0 0 11px' }}>
          {session.isGuest
            ? t(
                'Everything on this phone: the games, the sheets, the name and tile, the notification setting. You end up back at the first screen.',
              )
            : t(
                'Everything, everywhere: the games on this phone and the copy on the server, every crew, the name and picture your crews see, and the notification setting. You are signed out and end up back at the first screen.',
              )}
        </p>

        {resetFailures === null ? (
          <button
            type="button"
            className="btn-lg btn-lg--danger"
            onClick={() => setConfirmReset(true)}
          >
            {t('Reset this account')}
          </button>
        ) : (
          <>
            {resetFailures.length === 0 ? (
              <div className="note note--good">{t('Done. Nothing of yours is left.')}</div>
            ) : (
              <div className="note note--warn">
                {tf(
                  'This phone is clear, but {what} could not be reached. Sign in again on a better connection and reset once more to finish it.',
                  { what: resetFailures.map((step) => t(NAMES[step])).join(', ') },
                )}
              </div>
            )}

            {/* The reset is already written; this only announces it, which is
                what swaps the app to the first-run screen. Doing that
                automatically would have hidden the note above. */}
            <button
              type="button"
              className="btn-lg btn-lg--primary"
              onClick={() => window.dispatchEvent(new Event('lane-log:preferences'))}
            >
              {t('Start again')}
            </button>
          </>
        )}

        {!session.isGuest && (
          <p className="footnote" style={{ marginBottom: 0 }}>
            {t(
              'Your Google account itself is not touched — this app has no key that could, and should not have one. Remove its access from your Google account’s third-party app list.',
            )}
          </p>
        )}
      </div>

      {confirmReset && (
        <div className="card card--danger">
          <div className="hero__label" style={{ marginBottom: 6 }}>
            {t('Reset this account?')}
          </div>

          {/* Named one at a time. This is the only screen in the app where a
              vague sentence would cost somebody a season and a crew. */}
          <ul className="resetlist">
            <li>
              {tf(games.length === 1 ? '{n} game on this phone' : '{n} games on this phone', {
                n: games.length,
              })}
            </li>
            {games.some((game) => game.hasSheet) && (
              <li>
                {tf(
                  games.filter((game) => game.hasSheet).length === 1
                    ? '{n} scanned sheet'
                    : '{n} scanned sheets',
                  { n: games.filter((game) => game.hasSheet).length },
                )}
              </li>
            )}
            <li>{t('Your name, tile, photo, language and every other setting')}</li>
            <li>{t('This device’s notifications')}</li>
            {!session.isGuest && (
              <>
                <li>{t('The copy of your season on the server')}</li>
                <li>
                  {t(
                    'Every crew: you leave the ones you joined, and the ones you own are deleted for everybody in them',
                  )}
                </li>
                <li>{t('The name and picture your crews see')}</li>
              </>
            )}
          </ul>

          <p className="footnote">
            {t(
              'Nothing here can be undone. If you want your games afterwards, export them first — the button is above.',
            )}
          </p>

          <button
            type="button"
            className="btn-lg btn-lg--danger"
            disabled={resetting}
            onClick={() => void resetEverything()}
          >
            {resetting ? t('Resetting…') : t('Yes, reset everything')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 9 }}
            disabled={resetting}
            onClick={() => setConfirmReset(false)}
          >
            {t('Keep my account')}
          </button>
        </div>
      )}

      <h2 className="section-title">{t('Storage')}</h2>
      <div className="card">
        <div className="row row--between">
          <span className="muted">{t('Games on this device')}</span>
          <span className="tnum">{games.length}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="muted">{t('Scanned sheets kept')}</span>
          <span className="tnum">{games.filter((g) => g.hasSheet).length}</span>
        </div>

        {storage?.usage !== null && storage !== null && (
          <>
            <div className="row row--between" style={{ marginTop: 6 }}>
              <span className="muted">{t('Used')}</span>
              <span className="tnum">
                {formatBytes(storage.usage)}
                {storage.quota ? ` of ${formatBytes(storage.quota)}` : ''}
              </span>
            </div>

            {storage.fraction !== null && (
              <div className="progress" style={{ marginTop: 8 }}>
                <div
                  className="progress__fill"
                  style={{
                    width: `${Math.min(100, Math.round(storage.fraction * 100))}%`,
                    background: storage.fraction >= STORAGE_WARN_AT ? 'var(--negative)' : undefined,
                  }}
                />
              </div>
            )}

            {storage.fraction !== null && storage.fraction >= STORAGE_WARN_AT && (
              <div className="note note--warn" style={{ marginTop: 11, marginBottom: 0 }}>
                {t(
                  'Storage is nearly full. Export your games, then delete some older ones — scanned sheets take by far the most room.',
                )}
              </div>
            )}
          </>
        )}

        {storage && !storage.persisted && (
          <>
            <button
              type="button"
              className="btn-lg"
              style={{ marginTop: 11 }}
              onClick={async () => {
                const granted = await requestPersistence();
                setStorage(await estimateStorage());
                setMessage(
                  granted
                    ? null
                    : 'The browser would not promise to keep this data. It still works, but it can be cleared under storage pressure.',
                );
              }}
            >
              {t('Ask the browser to keep this data')}
            </button>
            <p className="footnote" style={{ marginBottom: 0 }}>
              {t(
                'Without this, a browser short of space may clear your games. Installing the app usually makes the browser grant it.',
              )}
            </p>
          </>
        )}

        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: 11 }}
          onClick={() => exportGames(games)}
          disabled={games.length === 0}
        >
          <Icon name="share" size={18} />
          Export {games.length} game{games.length === 1 ? '' : 's'}
        </button>

        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: 11 }}
          onClick={() => backupRef.current?.click()}
        >
          {t('Restore from a file')}
        </button>
        <input
          ref={backupRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void readBackup(file);
          }}
        />

        {restoreError && (
          <div className="note note--bad" style={{ marginTop: 11, marginBottom: 0 }}>
            {restoreError}
          </div>
        )}

        {restored !== null && (
          <div className="note note--good" style={{ marginTop: 11, marginBottom: 0 }}>
            Restored {restored} game{restored === 1 ? '' : 's'}.
          </div>
        )}

        {/* Nothing is written until this is confirmed: a restore that quietly
            doubled a season would be worse than one that failed. */}
        {plan && (
          <div className="note note--info" style={{ marginTop: 11, marginBottom: 0 }}>
            <strong>
              {plan.toAdd.length} game{plan.toAdd.length === 1 ? '' : 's'} to add
            </strong>
            <p style={{ margin: '4px 0 0' }}>
              {plan.alreadyHere > 0 &&
                `${plan.alreadyHere} already on this device and left alone. `}
              {plan.duplicatedInFile > 0 && `${plan.duplicatedInFile} repeated within the file. `}
              {plan.rejected.length > 0 &&
                `${plan.rejected.length} could not be read (${plan.rejected[0].reason}). `}
              Nothing is changed until you say so.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn-lg" onClick={() => setPlan(null)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="btn-lg btn-lg--primary"
                onClick={applyRestore}
                disabled={plan.toAdd.length === 0}
              >
                {t('Restore')}
              </button>
            </div>
          </div>
        )}

        <p className="footnote" style={{ marginBottom: 0 }}>
          A file works with no account and no network, and it is the one backup a guest can make.
          Scanned photos are not included either way; the scores are the part that cannot be bowled
          again.
        </p>
      </div>
    </>
  );
}

/**
 * How far notifications reach, said plainly.
 *
 * The middle case is the one that matters and the one the old wording had no
 * way to express: permission is granted and the app can raise a notification,
 * but nothing can wake it once it is closed, because there is no server
 * holding a key to push with. "On" would have been a lie and "off" would have
 * been a different one.
 */
function describe(reach: NotifyReach): string {
  switch (reach) {
    case 'push':
      return translate('On, even when Lane Log is closed.');
    case 'alerts':
      return translate('On while Lane Log is open. Nothing can wake it when it is closed.');
    default:
      return Notification.permission === 'denied'
        ? translate('Blocked in browser settings.')
        : translate('Off.');
  }
}

/**
 * Download the archive.
 *
 * Photos are not included: they live in their own store and JSON is the wrong
 * place for tens of megabytes of base64.
 */
function exportGames(games: Game[]): void {
  const blob = new Blob([JSON.stringify(buildBackup(games), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `lane-log-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  // Revoking immediately can pull the blob out from under a download the
  // browser has not started reading yet. One frame is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
