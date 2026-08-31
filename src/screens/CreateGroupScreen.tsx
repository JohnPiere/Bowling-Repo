import { useState } from 'react';
import { Icon } from '../components/Icon';
import { QrCode, joinUrl } from '../components/QrCode';

interface Props {
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
export function CreateGroupScreen({ onOpenGroup, onCancel }: Props) {
  const [name, setName] = useState('');
  const [alley, setAlley] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('invite');
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const title = name.trim() || 'Tuesday Crew';
  const code = inviteCode(title);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
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
          <strong>{title}</strong> is live. Send this code to the people you want in it.
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div className="hero__label">Invite code</div>
          <div className="code" style={{ margin: '8px 0 4px' }}>
            {code}
          </div>
          <div className="muted">expires in 14 days</div>

          {showQr && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <QrCode value={joinUrl(code)} />
            </div>
          )}

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button type="button" className="btn-lg" onClick={copy}>
              {copied ? 'Code copied' : 'Copy code'}
            </button>
            <button type="button" className="btn-lg" onClick={() => setShowQr((v) => !v)}>
              {showQr ? 'Hide QR' : 'Show QR'}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn-lg btn-lg--primary"
          onClick={() => onOpenGroup('tuesday-crew')}
        >
          <Icon name="users" size={18} />
          Open the group
        </button>

        <p className="footnote">
          Rotating the code later cuts off anyone still holding this one. That is in group
          settings.
        </p>
      </>
    );
  }

  return (
    <>
      <label style={{ display: 'block', marginBottom: 11 }}>
        <span className="hero__label">Group name</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tuesday Crew"
          maxLength={40}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span className="hero__label">Home alley (optional)</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={alley}
          onChange={(e) => setAlley(e.target.value)}
          placeholder="Round One Kawasaki"
          maxLength={60}
        />
      </label>

      <h2 className="section-title">Who can get in</h2>
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
              {option.soon && <span className="pill" style={{ marginLeft: 8 }}>Soon</span>}
            </span>
            <span className="choice__note">{option.note}</span>
          </span>
        </button>
      ))}

      <button
        type="button"
        className="btn-lg btn-lg--primary"
        style={{ marginTop: 14 }}
        onClick={() => setCreated(true)}
      >
        Create the group
      </button>
      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCancel}>
        Cancel
      </button>
    </>
  );
}

/** A readable code derived from the name, so it is not a random string. */
function inviteCode(name: string): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');

  let sum = 0;
  for (const char of name) sum += char.charCodeAt(0);
  return `${letters}${String(sum % 100).padStart(2, '0')}`;
}
