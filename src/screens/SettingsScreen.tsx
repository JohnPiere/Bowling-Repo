import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import type { Game } from '../lib/db';
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
  onOpenVideos,
}: {
  games: Game[];
  onOpenVideos?: () => void;
}) {
  const [install, setInstall] = useState<InstallState>(getInstallState);
  const [push, setPush] = useState<PushStatus>('unavailable');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);

  useEffect(() => subscribeToInstallState(setInstall), []);
  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, [games.length]);
  useEffect(() => {
    void currentPushStatus().then(setPush);
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

  return (
    <>
      <h2 className="section-title">Install</h2>
      <div className="card">
        {install.kind === 'installed' && (
          <p style={{ margin: 0 }}>
            <Icon name="check" size={16} /> Lane Log is installed on this device.
          </p>
        )}

        {install.kind === 'prompt-available' && (
          <>
            <p className="card__hint muted" style={{ marginTop: 0 }}>
              Add Lane Log to your Home Screen so it opens full-screen and works offline.
            </p>
            <button
              type="button"
              className="btn-lg btn-lg--primary"
              onClick={() => void promptInstall()}
            >
              Add to Home Screen
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
            This browser has not offered to install Lane Log. It still works as a normal page;
            notifications may not.
          </p>
        )}
      </div>

      <h2 className="section-title">Notifications</h2>
      <div className="card">
        {availability.state !== 'ready' ? (
          <div className={`note ${availability.state === 'needs-install' ? 'note--info' : 'note--warn'}`}
               style={{ marginBottom: 0 }}>
            {availability.reason}
          </div>
        ) : (
          <>
            <div className="row row--between" style={{ marginBottom: 11 }}>
              <span>
                <span style={{ display: 'block' }}>Push notifications</span>
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
                    Send a test notification
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

      <h2 className="section-title">Clips</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Video is not built yet — it is the one feature that needs a backend.
        </p>
        <button type="button" className="btn-lg" onClick={onOpenVideos}>
          What it would take
        </button>
      </div>

      <h2 className="section-title">Storage</h2>
      <div className="card">
        <div className="row row--between">
          <span className="muted">Games on this device</span>
          <span className="tnum">{games.length}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="muted">Scanned sheets kept</span>
          <span className="tnum">{games.filter((g) => g.hasSheet).length}</span>
        </div>

        {storage?.usage !== null && storage !== null && (
          <>
            <div className="row row--between" style={{ marginTop: 6 }}>
              <span className="muted">Used</span>
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
                    background:
                      storage.fraction >= STORAGE_WARN_AT ? 'var(--negative)' : undefined,
                  }}
                />
              </div>
            )}

            {storage.fraction !== null && storage.fraction >= STORAGE_WARN_AT && (
              <div className="note note--warn" style={{ marginTop: 11, marginBottom: 0 }}>
                Storage is nearly full. Export your games, then delete some older ones — scanned
                sheets take by far the most room.
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
              Ask the browser to keep this data
            </button>
            <p className="footnote" style={{ marginBottom: 0 }}>
              Without this, a browser short of space may clear your games. Installing the app
              usually makes the browser grant it.
            </p>
          </>
        )}

        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: 11 }}
          onClick={() => exportGames(games)}
        >
          <Icon name="share" size={18} />
          Export games as JSON
        </button>
        <p className="footnote" style={{ marginBottom: 0 }}>
          Everything is stored on this device only. There is no account and nothing is uploaded —
          export is currently the only backup.
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
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `lane-log-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
}
