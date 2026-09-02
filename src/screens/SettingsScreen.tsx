import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { tf, useTranslation } from '../lib/i18n';
import { AVATARS, colourOf, DEFAULTS, PLAYER_COLOURS, usePreferences } from '../lib/preferences';
import { buildBackup, planRestore, type RestorePlan } from '../lib/backup';
import { Avatar } from '../components/Avatar';
import { CloudBackup } from '../components/CloudBackup';
import { initialsOf } from '../lib/social';
import { clearAllGames, putGames, type Game } from '../lib/db';
import type { Session } from '../lib/session';
import {
  getInstallState,
  IOS_INSTALL_STEPS,
  promptInstall,
  subscribeToInstallState,
  type InstallState,
} from '../lib/install';
import {
  currentPushStatus,
  pushAvailability,
  showLocalTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '../lib/push';
import {
  describeSaveFailure,
  estimateStorage,
  formatBytes,
  requestPersistence,
  STORAGE_WARN_AT,
  type StorageReport,
} from '../lib/storage';

/**
 * Settings, which on this app is mostly the two things that make it feel like
 * an app at all: getting it onto the Home Screen and turning notifications on.
 */
export function SettingsScreen({
  games,
  session,
  onRestored,
  onReplayTour,
}: {
  games: Game[];
  /** Who is signed in, which is what decides whether a backup is offered. */
  session: Session;
  onRestored?: () => void;
  /** Runs the first-run tour again, without touching anything stored. */
  onReplayTour?: () => void;
}) {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();

  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  const [install, setInstall] = useState<InstallState>(getInstallState);
  const [push, setPush] = useState<PushStatus>('unavailable');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const backupRef = useRef<HTMLInputElement | null>(null);

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
    currentPushStatus().then(setPush, () => setPush('unavailable'));
  }, [install]);

  const availability = pushAvailability();

  async function toggleNotifications() {
    setBusy(true);
    setMessage(null);
    try {
      setPush(push === 'subscribed' ? await unsubscribeFromPush() : await subscribeToPush());
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
          />
          <span className="grow">
            <span className="profile__name">{preferences.playerName}</span>
            <span className="game-row__sub" style={{ display: 'block', marginTop: 2 }}>
              {t('This is what your crew sees.')}
            </span>
          </span>
        </div>

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

        <div className="hero__label" style={{ marginTop: 12 }}>
          {t('Profile icon')}
        </div>
        <div className="chips chips--wrap" role="group" aria-label={t('Profile icon')}>
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

        {onReplayTour && (
          <button type="button" className="btn-lg" style={{ marginTop: 14 }} onClick={onReplayTour}>
            {t('Show the tour again')}
          </button>
        )}
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
                <span style={{ display: 'block' }}>{t('Push notifications')}</span>
                <span className="muted">{describe(push)}</span>
              </span>
              <Icon name="bell" size={19} />
            </div>

            {push === 'denied' ? (
              <div className="note note--warn" style={{ marginBottom: 0 }}>
                Notifications are blocked for this site. Re-allow them in your browser settings —
                the app cannot ask again once they are denied.
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn-lg ${push === 'subscribed' ? '' : 'btn-lg--primary'}`}
                  onClick={toggleNotifications}
                  disabled={busy}
                >
                  {busy ? 'Working…' : push === 'subscribed' ? 'Turn off' : 'Turn on notifications'}
                </button>

                {push === 'subscribed' && (
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
        <p className="footnote" style={{ marginBottom: 0, marginTop: 10 }}>
          {t(
            'Lane Log scores, scans and keeps your season on this device, with no account and no signal. A copy on the server is something you switch on, and a file export works without one.',
          )}
        </p>
      </div>

      <CloudBackup session={session} games={games} onRestored={onRestored} />

      <h2 className="section-title">{t('Data')}</h2>
      <div className="card">
        <p className="muted" style={{ margin: '0 0 11px' }}>
          {t(
            'Removes every game and every scanned sheet on this device. Your preferences and this device’s notification setting are left alone.',
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

function describe(status: PushStatus): string {
  switch (status) {
    case 'subscribed':
      return 'On — this device will be notified.';
    case 'unsubscribed':
      return 'Off.';
    case 'denied':
      return 'Blocked in browser settings.';
    default:
      return 'Not available here.';
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
