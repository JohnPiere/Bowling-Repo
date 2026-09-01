import { useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { QrCode, joinUrl } from '../components/QrCode';
import { describeBackendFailure } from '../lib/backend';
import { createGroup } from '../lib/social';
import type { Group } from '../data/groups';
import type { Session } from '../lib/session';

interface Props {
  session: Session;
  onOpenGroup: (groupId: string) => void;
  onCancel: () => void;
}

type Visibility = 'invite' | 'listed';

const VISIBILITY: { key: Visibility; label: string; note: string; soon: boolean }[] = [
  {
    key: 'invite',
    label: 'Invite only',
    note: 'Nobody finds this group. People join with the code or the QR you send them.',
    soon: false,
  },
  {
    key: 'listed',
    label: 'Discoverable by link',
    note: 'Anyone with the link can request to join and you approve them. Not built yet — invite-only ships first.',
    soon: true,
  },
];

/** Name a group, keep it invite-only, hand over a code. */
export function CreateGroupScreen({ session, onOpenGroup, onCancel }: Props) {
  const [name, setName] = useState('');
  const [alley, setAlley] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('invite');
  /** The crew once the server has made it — and its real invite code. */
  const [created, setCreated] = useState<Group | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const title = name.trim();

  async function create() {
    if (!title || creating) return;
    setCreating(true);
    setError(null);
    try {
      setCreated(await createGroup(title, alley.trim() || undefined, session.id));
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteCode);
      setCopied(true);
    } catch {
      // Clipboard access is refused outside a secure context or without a
      // gesture the browser trusts; the code is on screen either way.
      setCopied(false);
    }
  }

  if (created) {
    return (
      <>
        <div className="note note--good">
          <strong>{created.name}</strong>{' '}
          {t('is live. Send this code to the people you want in it.')}
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div className="hero__label">{t('Invite code')}</div>
          <div className="code" style={{ margin: '8px 0 4px' }}>
            {created.inviteCode}
          </div>
          <div className="muted">{tf('expires in {n} days', { n: created.codeExpiresInDays })}</div>

          {showQr && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <QrCode value={joinUrl(created.inviteCode)} />
            </div>
          )}

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button type="button" className="btn-lg" onClick={copy}>
              {copied ? t('Code copied') : t('Copy code')}
            </button>
            <button type="button" className="btn-lg" onClick={() => setShowQr((v) => !v)}>
              {showQr ? t('Hide QR') : t('Show QR')}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={() => onOpenGroup(created.id)}
        >
          <Icon name="users" size={18} />
          {t('Open the group')}
        </button>

        <p className="footnote">
          {t(
            'Rotating the code later cuts off anyone still holding this one. That is in group settings.',
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <label style={{ display: 'block', marginBottom: 11 }}>
        <span className="hero__label">{t('Group name')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tuesday Crew"
          maxLength={40}
          required
        />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span className="hero__label">{t('Home alley (optional)')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={alley}
          onChange={(e) => setAlley(e.target.value)}
          placeholder="Round One Kawasaki"
          maxLength={60}
        />
      </label>

      <h2 className="section-title">{t('Who can get in')}</h2>
      {VISIBILITY.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`choice${visibility === option.key ? ' choice--on' : ''}`}
          disabled={option.soon}
          onClick={() => setVisibility(option.key)}
        >
          <span className="choice__dot" aria-hidden="true" />
          <span className="grow">
            <span className="choice__label">
              {option.label}
              {option.soon && (
                <span className="pill" style={{ marginLeft: 8 }}>
                  {t('Soon')}
                </span>
              )}
            </span>
            <span className="choice__note">{option.note}</span>
          </span>
        </button>
      ))}

      {error && <div className="note note--bad">{error}</div>}

      <button
        type="button"
        className="btn-lg btn-lg--primary"
        style={{ marginTop: 14 }}
        onClick={create}
        disabled={!title || creating}
      >
        {creating ? t('Creating…') : t('Create the group')}
      </button>
      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCancel}>
        {t('Cancel')}
      </button>
    </>
  );
}
