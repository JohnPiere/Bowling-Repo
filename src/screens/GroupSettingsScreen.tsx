import { useState } from 'react';
import { t } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import type { Group } from '../data/groups';

interface Props {
  group: Group;
  onLeave: () => void;
}

type Role = 'owner' | 'moderator' | 'member';

/**
 * Group settings, for an owner or moderator.
 *
 * The destructive actions here are the ones a group needs when it goes wrong:
 * cut off an old invite, and remove someone. Both are confirmed, and neither
 * deletes what the person already posted — removing a member is not censorship.
 */
export function GroupSettingsScreen({ group, onLeave }: Props) {
  const [name, setName] = useState(group.name);
  const [alley, setAlley] = useState(group.homeAlley ?? '');
  const [doorsOpen, setDoorsOpen] = useState(group.doorsOpen);
  const [code, setCode] = useState(group.inviteCode);
  const [rotated, setRotated] = useState(false);
  const [copied, setCopied] = useState(false);

  const [roles, setRoles] = useState<Record<string, Role>>(() => ({ kenji: 'moderator' }));
  const [removed, setRemoved] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const isOwner = group.yourRole === 'owner';
  const roster = group.members.filter((m) => !removed.includes(m.id));

  function rotate() {
    // A new code has to invalidate the old one immediately, or rotating is
    // theatre — anyone holding the old code would still get in.
    setCode(nextCode(code));
    setRotated(true);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div className="note note--info">
        <strong>You are the {group.yourRole}.</strong>{' '}
        {isOwner
          ? 'Only you can delete this group or hand it over.'
          : 'You can moderate posts and members, but not delete the group.'}
      </div>

      <h2 className="section-title">{t('Details')}</h2>
      <label style={{ display: 'block', marginBottom: 11 }}>
        <span className="hero__label">{t('Group name')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 4 }}>
        <span className="hero__label">{t('Home alley')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={alley}
          onChange={(e) => setAlley(e.target.value)}
          disabled={!isOwner}
        />
      </label>

      <h2 className="section-title">{t('The doors')}</h2>
      <div className="card">
        <div className="row row--between">
          <span className="grow">
            <span style={{ display: 'block', fontSize: 13 }}>
              {doorsOpen ? 'Open — the code works' : 'Closed — nobody new can join'}
            </span>
            <span className="muted">
              {doorsOpen
                ? 'Anyone holding a valid code joins immediately. Rotate the code to cut off an old invite.'
                : 'The code is refused while the group is closed. Existing members are unaffected.'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={doorsOpen}
            aria-label={t('Doors open')}
            className={`switch${doorsOpen ? ' switch--on' : ''}`}
            onClick={() => setDoorsOpen((v) => !v)}
          >
            <span className="switch__knob" />
          </button>
        </div>
      </div>

      <h2 className="section-title">{t('Invite code')}</h2>
      <div className="card" style={{ textAlign: 'center' }}>
        <div
          className="code"
          style={{ color: doorsOpen ? '#cfc7ff' : 'var(--color-neutral-600)' }}
        >
          {code}
        </div>
        <div className="muted">
          {doorsOpen
            ? `expires in ${rotated ? 14 : group.codeExpiresInDays} days`
            : 'inactive while the doors are closed'}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button type="button" className="btn-lg" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn-lg" onClick={rotate}>
            {t('Rotate')}
          </button>
        </div>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {rotated
            ? 'Rotated. The old code stopped working immediately — resend the new one to anyone still waiting.'
            : 'Rotating replaces the code at once. Anyone who has the old one loses their way in.'}
        </p>
      </div>

      <h2 className="section-title">
        Members · {roster.length} of {group.members.length}
      </h2>

      {removed.length > 0 && (
        <div className="note note--warn">
          {removed.length} {removed.length === 1 ? 'member was' : 'members were'} removed. Their
          shared posts and messages stay unless you delete them — removing someone is not
          censorship.
        </div>
      )}

      {roster.map((member) => {
        const role: Role = member.isMe ? group.yourRole : (roles[member.id] ?? 'member');
        const canAct = !member.isMe && isOwner;
        const isOpen = expanded === member.id;

        return (
          <div key={member.id} className={`roster${isOpen ? ' roster--open' : ''}`}>
            <button
              type="button"
              className="roster__head"
              onClick={() => {
                if (!canAct) return;
                setExpanded(isOpen ? null : member.id);
                setConfirming(null);
              }}
              aria-expanded={canAct ? isOpen : undefined}
              style={{ cursor: canAct ? 'pointer' : 'default' }}
            >
              <Avatar initials={member.initials} size={34} isMe={member.isMe} />
              <span className="grow">
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {member.isMe ? 'You' : member.name}
                  </span>
                  {role !== 'member' && (
                    <span className="pill">{role === 'owner' ? 'Owner' : 'Moderator'}</span>
                  )}
                </span>
                <span className="muted tnum">
                  {member.games} games · avg {member.avg} · since {member.since}
                </span>
              </span>
              {canAct && <span className="muted">{isOpen ? '▾' : '▸'}</span>}
            </button>

            {isOpen && canAct && (
              <div className="roster__actions">
                <button
                  type="button"
                  className="btn-lg"
                  onClick={() =>
                    setRoles((current) => ({
                      ...current,
                      [member.id]: role === 'moderator' ? 'member' : 'moderator',
                    }))
                  }
                >
                  {role === 'moderator' ? 'Demote to member' : 'Make moderator'}
                </button>

                {confirming === member.id ? (
                  <>
                    <p className="note note--bad" style={{ marginTop: 11 }}>
                      {member.name} loses access to the chat, the board and every shared post. They
                      can be invited back with a new code.
                    </p>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn-lg"
                        onClick={() => setConfirming(null)}
                      >
                        {t('Keep them')}
                      </button>
                      <button
                        type="button"
                        className="btn-lg btn-lg--danger"
                        onClick={() => {
                          setRemoved((current) => [...current, member.id]);
                          setConfirming(null);
                          setExpanded(null);
                        }}
                      >
                        {t('Remove')}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-lg btn-lg--danger"
                    style={{ marginTop: 8 }}
                    onClick={() => setConfirming(member.id)}
                  >
                    {t('Remove from group')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <h2 className="section-title">{t('Leave')}</h2>
      <button type="button" className="btn-lg btn-lg--danger" onClick={onLeave}>
        {isOwner ? 'Hand over and leave' : 'Leave this group'}
      </button>
      <p className="footnote">
        {isOwner
          ? 'An owner has to pass the group to somebody else before leaving. Deleting a group outright is not built yet.'
          : 'Your shared games stay on the board unless you unshare them first.'}
      </p>
    </>
  );
}

/** Bump the numeric tail so a rotated code is visibly different. */
function nextCode(code: string): string {
  const letters = code.slice(0, 4);
  const digits = Number(code.slice(4)) || 0;
  return `${letters}${String((digits + 51) % 100).padStart(2, '0')}`;
}
