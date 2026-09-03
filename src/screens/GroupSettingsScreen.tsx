import { useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { describeBackendFailure } from '../lib/backend';
import {
  deleteGroup,
  leaveGroup,
  removeMember,
  rotateInviteCode,
  setMemberRole,
  updateGroup,
  type Group,
} from '../lib/social';

interface Props {
  group: Group;
  me: string;
  /** Something on the roster or the crew changed; re-read it. */
  onChanged: () => void;
  /** This crew is no longer ours to show — go back to the list. */
  onGone: () => void;
}

/**
 * Group settings.
 *
 * Every control on this screen used to be local state. The name and the alley
 * were typed into a `useState` and never sent; rotating the invite code called
 * a `nextCode()` that added 51 to the last two digits, under a comment about
 * how a code that did not really rotate would be theatre; removing a member
 * pushed their id into an array; and "Leave" navigated back to the crew list
 * without leaving. The roles map was seeded `{ kenji: 'moderator' }`, which is
 * the last of the fictional Tuesday Crew.
 *
 * All of it goes through Postgres now. The screen re-reads the crew after every
 * write rather than keeping its own copy: what an owner does here is exactly
 * what other people's screens are about to show, and a settings page that
 * disagreed with the board would be the worst place in the app to be wrong.
 *
 * The doors switch is gone. There is no column for it — `toGroup` has always
 * had a comment saying so — and a switch that flips nothing is a promise the
 * database never made. Rotating the code does the job it was there for.
 */
export function GroupSettingsScreen({ group, me, onChanged, onGone }: Props) {
  const [name, setName] = useState(group.name);
  const [alley, setAlley] = useState(group.homeAlley ?? '');
  const [code, setCode] = useState(group.inviteCode);
  const [rotated, setRotated] = useState(false);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [ending, setEnding] = useState<'none' | 'leave' | 'delete'>('none');

  const isOwner = group.yourRole === 'owner';
  const owners = group.members.filter((member) => member.role === 'owner').length;

  /** Every write on this screen, wrapped in the same busy and error handling. */
  async function run(work: () => Promise<void>, after: 'reload' | 'gone' = 'reload') {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (after === 'gone') onGone();
      else onChanged();
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    setSaved(false);
    await run(async () => {
      await updateGroup(group.id, { name, homeAlley: alley });
      setSaved(true);
    });
  }

  async function rotate() {
    setCopied(false);
    await run(async () => {
      // The real thing: the RPC writes a new code and a new expiry, so the old
      // one stops working the moment this returns. That is the whole point of
      // the button — anyone still holding the old code loses their way in.
      setCode(await rotateInviteCode(group.id));
      setRotated(true);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Refused outside a secure context, or without permission. The code is
      // on screen in a large face for exactly this case.
      setCopied(false);
    }
  }

  const changed = name.trim() !== group.name || alley.trim() !== (group.homeAlley ?? '');

  return (
    <>
      <div className="note note--info">
        <strong>{tf('You are the {role}.', { role: group.yourRole })}</strong>{' '}
        {isOwner
          ? t('Only you can delete this crew or change who runs it.')
          : t('You can rotate the code and remove members, but not delete the crew.')}
      </div>

      {error && <div className="note note--bad">{error}</div>}

      <h2 className="section-title">{t('Details')}</h2>
      <label style={{ display: 'block', marginBottom: 11 }}>
        <span className="hero__label">{t('Group name')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          disabled={!isOwner || busy}
          maxLength={60}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 11 }}>
        <span className="hero__label">{t('Home alley')}</span>
        <input
          className="input"
          style={{ marginTop: 5 }}
          value={alley}
          onChange={(e) => {
            setAlley(e.target.value);
            setSaved(false);
          }}
          disabled={!isOwner || busy}
          maxLength={80}
        />
      </label>

      {isOwner && (
        <>
          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={!changed || busy || !name.trim()}
            onClick={saveDetails}
          >
            {busy ? t('Saving…') : t('Save these')}
          </button>
          {saved && !changed && (
            <p className="footnote">{t('Saved. Everyone in the crew sees the new name.')}</p>
          )}
        </>
      )}

      <h2 className="section-title">{t('Invite code')}</h2>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="code">{code}</div>
        <div className="muted">
          {tf('expires in {n} days', { n: rotated ? 14 : group.codeExpiresInDays })}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button type="button" className="btn-lg" onClick={copy}>
            {copied ? t('Copied') : t('Copy')}
          </button>
          <button type="button" className="btn-lg" onClick={rotate} disabled={busy}>
            {t('Rotate')}
          </button>
        </div>
        <p className="footnote" style={{ marginBottom: 0 }}>
          {rotated
            ? t('Rotated. The old code stopped working immediately — send the new one to anyone still waiting.')
            : t('Rotating replaces the code at once. Anyone holding the old one loses their way in.')}
        </p>
      </div>

      <h2 className="section-title">
        {tf('Members · {n}', { n: group.members.length })}
      </h2>

      {group.members.map((member) => {
        // Nobody may act on themselves here: an owner demoting themselves would
        // leave a crew nobody can administer, and leaving is its own button.
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
              <Avatar initials={member.initials} size={34} isMe={member.isMe} photo={member.photo} />
              <span className="grow">
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {member.isMe ? t('You') : member.name}
                  </span>
                  {member.role !== 'member' && (
                    <span className="pill">
                      {member.role === 'owner' ? t('Owner') : t('Moderator')}
                    </span>
                  )}
                </span>
                <span className="muted tnum">
                  {tf('{games} games · avg {avg} · since {since}', {
                    games: member.games,
                    avg: member.avg,
                    since: member.since,
                  })}
                </span>
              </span>
              {canAct && <span className="muted">{isOpen ? '▾' : '▸'}</span>}
            </button>

            {isOpen && canAct && (
              <div className="roster__actions">
                <span className="hero__label">{t('What they can do')}</span>
                {/* Owner is on the list because it has to be: the only owner
                    cannot leave without stranding the crew, so handing over is
                    the way out that is not deleting everything. */}
                <div className="chips" role="group" aria-label={t('What they can do')}>
                  {(['member', 'moderator', 'owner'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      className="chip"
                      aria-pressed={member.role === role}
                      disabled={busy || member.role === role}
                      onClick={() => run(() => setMemberRole(group.id, member.id, role))}
                    >
                      {role === 'owner'
                        ? t('Owner')
                        : role === 'moderator'
                          ? t('Moderator')
                          : t('Member')}
                    </button>
                  ))}
                </div>
                <p className="footnote" style={{ marginTop: 6 }}>
                  {t(
                    'A moderator can rotate the code and remove members. An owner can also rename the crew, hand it over and delete it.',
                  )}
                </p>

                {confirming === member.id ? (
                  <>
                    <p className="note note--bad" style={{ marginTop: 11 }}>
                      {tf(
                        '{name} loses the chat, the board and every shared post. What they already posted stays. They can be invited back with a new code.',
                        { name: member.name },
                      )}
                    </p>
                    <div className="row" style={{ gap: 8 }}>
                      <button type="button" className="btn-lg" onClick={() => setConfirming(null)}>
                        {t('Keep them')}
                      </button>
                      <button
                        type="button"
                        className="btn-lg btn-lg--danger"
                        disabled={busy}
                        onClick={async () => {
                          setConfirming(null);
                          setExpanded(null);
                          await run(() => removeMember(group.id, member.id));
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
      {ending === 'leave' ? (
        <>
          <div className="note note--bad">
            {isOwner && owners < 2
              ? t(
                  'You are the only owner. Leaving would leave the crew with nobody who can run it — make somebody else an owner first, or delete the crew below.',
                )
              : t('Your shared games come off the board. They stay in your own history.')}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn-lg" onClick={() => setEnding('none')}>
              {t('Stay')}
            </button>
            <button
              type="button"
              className="btn-lg btn-lg--danger"
              disabled={busy || (isOwner && owners < 2)}
              onClick={() => run(() => leaveGroup(group.id, me), 'gone')}
            >
              {t('Leave this crew')}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="btn-lg btn-lg--danger"
          onClick={() => setEnding('leave')}
        >
          {t('Leave this crew')}
        </button>
      )}

      {isOwner && (
        <>
          <h2 className="section-title">{t('Delete this crew')}</h2>
          {ending === 'delete' ? (
            <>
              <div className="note note--bad">
                {tf(
                  '{name} goes for everybody — the roster, the chat, the board and every shared game on it. Nobody loses a game they bowled: those live on their own phone and the board only ever held a reference. There is no undo.',
                  { name: group.name },
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn-lg" onClick={() => setEnding('none')}>
                  {t('Keep it')}
                </button>
                <button
                  type="button"
                  className="btn-lg btn-lg--danger"
                  disabled={busy}
                  onClick={() => run(() => deleteGroup(group.id), 'gone')}
                >
                  {busy ? t('Deleting…') : t('Delete for good')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn-lg btn-lg--danger"
              onClick={() => setEnding('delete')}
            >
              {t('Delete this crew')}
            </button>
          )}
        </>
      )}
    </>
  );
}
