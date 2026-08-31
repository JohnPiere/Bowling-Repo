import { useState } from 'react';
import { QrCode } from '../components/QrCode';
import { GROUPS } from '../data/groups';

interface Props {
  onJoined: (groupId: string) => void;
}

const CODE_LENGTH = 6;

/** Join with a code somebody sent, or by scanning their QR. */
export function JoinGroupScreen({ onJoined }: Props) {
  const [tab, setTab] = useState<'code' | 'qr'>('code');
  const [raw, setRaw] = useState('');

  // Codes are typed off a screen or a scrap of paper, so normalise hard.
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  const match = GROUPS.find((group) => group.inviteCode === code);
  const isComplete = code.length === CODE_LENGTH;

  return (
    <>
      <div className="chips" role="group" aria-label="How to join">
        <button type="button" className="chip" aria-pressed={tab === 'code'} onClick={() => setTab('code')}>
          Invite code
        </button>
        <button type="button" className="chip" aria-pressed={tab === 'qr'} onClick={() => setTab('qr')}>
          QR code
        </button>
      </div>

      {tab === 'code' ? (
        <>
          <label style={{ display: 'block' }}>
            <span className="hero__label">Enter the six-character code</span>
            <input
              className="input code-input"
              style={{ marginTop: 6 }}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="TCRW31"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby="join-status"
            />
          </label>

          <div className="code-cells" aria-hidden="true">
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const char = code[i];
              const isNext = i === code.length;
              return (
                <span
                  key={i}
                  className={`code-cell${char ? ' code-cell--filled' : ''}${
                    isNext ? ' code-cell--next' : ''
                  }`}
                >
                  {char || '·'}
                </span>
              );
            })}
          </div>

          <p id="join-status" role="status" style={{ minHeight: 20 }}>
            {match && <span className="note note--good">{match.name} — invite valid.</span>}
            {isComplete && !match && (
              <span className="note note--bad">
                No group uses that code. Check it against the message you were sent — codes expire
                after 14 days.
              </span>
            )}
          </p>

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={!match}
            onClick={() => match && onJoined(match.id)}
          >
            Join {match ? match.name : 'the group'}
          </button>
        </>
      ) : (
        <>
          <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
            <QrCode value="TCRW31" size={180} />
          </div>
          <p className="muted">
            Point the camera at the QR the group owner shows you. Scanning is not wired up yet —
            the code tab works today.
          </p>
        </>
      )}

      <p className="footnote">
        Try <span className="tnum">TCRW31</span> against the sample data.
      </p>
    </>
  );
}
