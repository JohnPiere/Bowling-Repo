import { useState } from 'react';
import { Icon } from './Icon';
import { t, tf } from '../lib/i18n';
import { describeBackendFailure, isBackendConfigured } from '../lib/backend';
import { forgetGames, pending, syncGames, type SyncResult } from '../lib/cloud';
import { clearTombstones, listTombstones, markSynced, putGames, type Game } from '../lib/db';
import { formatDateTime } from '../lib/datetime';
import type { Session } from '../lib/session';

/**
 * When this device last got its games onto the server.
 *
 * Per device and not per account, so it lives here rather than in Postgres: the
 * question it answers is "is this phone's season safe", and a second phone
 * syncing does not make the answer yes.
 */
const LAST_SYNC = 'lane-log.lastSync';

function lastSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function rememberSync(at: number): void {
  try {
    localStorage.setItem(LAST_SYNC, String(at));
  } catch {
    // A private window. The sync still happened; only the note about it is lost.
  }
}

/**
 * Backing a season up to the account.
 *
 * The card exists because the alternative sentence — the one Settings used to
 * have to say — was that a dropped phone is a dropped season unless you had
 * remembered to export a file. Nobody remembers to export a file.
 *
 * It is a button rather than a background sync on purpose, at least for now:
 * the app is built to work with no network and a bowling alley is a reliably
 * terrible place to have one, so a sync that ran on its own would mostly run at
 * the worst moment and fail quietly. One button, one clear outcome.
 */
export function CloudBackup({
  session,
  games,
  onRestored,
}: {
  session: Session;
  games: Game[];
  onRestored?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(() => lastSyncAt());

  const owed = pending(games).length;

  async function sync() {
    setBusy(true);
    setError(null);
    setForgotten(false);
    try {
      // Deletions this device made and could not report at the time. Without
      // them a sync is an undelete: the server still holds the row.
      const graves = await listTombstones();
      const outcome = await syncGames(session.id, games, graves.map((grave) => grave.id));

      // Write what came down first: a device that marked its own games synced
      // and then failed to store the server's would be back where it started
      // with nothing to show for it.
      if (outcome.toWrite.length > 0) await putGames(outcome.toWrite);
      await markSynced(outcome.sent.map((game) => ({ id: game.id, updatedAt: game.updatedAt })));
      await clearTombstones(outcome.deleted);

      const at = Date.now();
      rememberSync(at);
      setSyncedAt(at);
      setResult(outcome);
      if (outcome.toWrite.length > 0) onRestored?.();
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    setError(null);
    try {
      await forgetGames(session.id);
      setConfirmForget(false);
      setResult(null);
      setForgotten(true);
      setSyncedAt(null);
      rememberSync(0);
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isBackendConfigured()) return null;

  return (
    <>
      <h2 className="section-title">{t('Backup to your account')}</h2>

      {session.isGuest ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13 }}>
            {t('Sign in on the Crews tab and your games get a copy on the server.')}
          </p>
          <p className="footnote" style={{ marginBottom: 0 }}>
            {t(
              'Only you can read it — a crew sees what you shared with it, and a backup is not sharing.',
            )}
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="row row--between">
            <span className="grow">
              <span style={{ display: 'block', fontSize: 13 }}>
                {syncedAt
                  ? tf('Last backed up {when}', { when: formatDateTime(syncedAt) })
                  : t('Never backed up from this device')}
              </span>
              <span className="muted tnum">
                {owed === 0
                  ? t('Everything on this phone is on the server.')
                  : tf(owed === 1 ? '{n} game waiting to go up' : '{n} games waiting to go up', {
                      n: owed,
                    })}
              </span>
            </span>
          </div>

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            style={{ marginTop: 11 }}
            onClick={sync}
            disabled={busy}
          >
            <Icon name="check" size={18} />
            {busy ? t('Syncing…') : t('Back up now')}
          </button>

          {error && (
            <div className="note note--bad" style={{ marginTop: 11, marginBottom: 0 }}>
              {error}
            </div>
          )}

          {forgotten && (
            <div className="note note--good" style={{ marginTop: 11, marginBottom: 0 }}>
              {t('The copy on the server is gone. Your games are still on this phone.')}
            </div>
          )}

          {/* Both directions, said plainly: a sync that only reported what it
              sent would leave somebody restoring onto a new phone wondering
              whether anything arrived. */}
          {result && !error && (
            <div className="note note--good" style={{ marginTop: 11, marginBottom: 0 }}>
              {tf('{up} sent, {down} brought down.', {
                up: result.sent.length,
                down: result.toWrite.length,
              })}
              {result.rejected > 0 &&
                ` ${tf('{n} could not be read and were left alone.', { n: result.rejected })}`}
            </div>
          )}

          <p className="footnote">
            {t(
              'Scanned photos are not included — the scores are the part that cannot be bowled again. Where two phones changed the same game, the later change wins.',
            )}
          </p>

          {confirmForget ? (
            <>
              <div className="note note--bad" style={{ marginBottom: 11 }}>
                {t(
                  'This deletes the server’s copy of every game. Your games stay on this phone, and nothing is left to restore from if you lose it.',
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn-lg" onClick={() => setConfirmForget(false)}>
                  {t('Keep it')}
                </button>
                <button
                  type="button"
                  className="btn-lg btn-lg--danger"
                  onClick={forget}
                  disabled={busy}
                >
                  {t('Delete the backup')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="linkbtn linkbtn--centred"
              onClick={() => setConfirmForget(true)}
            >
              {t('Delete the backup')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
