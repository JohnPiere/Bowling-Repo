import { Avatar } from '../components/Avatar';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { GROUPS } from '../data/groups';
import type { Session } from '../lib/session';

interface Props {
  session: Session;
  /** True while the stored account is still being worked out. */
  restoring?: boolean;
  onOpenGroup: (groupId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onLinkAccount: () => void;
}

/** The bowler's groups, or the reason there aren't any. */
export function GroupsScreen({
  session,
  restoring = false,
  onOpenGroup,
  onCreate,
  onJoin,
  onLinkAccount,
}: Props) {
  // Restoring a session can take a round trip to refresh its token, and until
  // it lands "guest" is a guess. Showing the sign-in card to somebody who is
  // already signed in, then snatching it away, is worse than a blank moment.
  if (restoring) {
    return <p className="empty">{t('Checking your account…')}</p>;
  }

  if (session.isGuest) {
    return (
      <>
        <div className="note note--info">
          <strong>{t('Groups need an account.')}</strong>
          <p style={{ margin: '6px 0 0' }}>
            A group is shared with other people, so it cannot live only on this phone. Your games
            stay exactly where they are — linking adds an account, it does not move anything.
          </p>
        </div>
        <button type="button" className="btn-lg btn-lg--primary" onClick={onLinkAccount}>
          {t('Link an account')}
        </button>
      </>
    );
  }

  return (
    <>
      <h2 className="section-title">{t('Your groups')}</h2>
      {GROUPS.map((group) => (
        <button
          key={group.id}
          type="button"
          className="game-row"
          onClick={() => onOpenGroup(group.id)}
        >
          <span
            className="avatar"
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              fontSize: 14,
              background: group.warmTile ? 'rgba(214, 0, 108, 0.10)' : 'var(--color-accent-900)',
              color: group.warmTile ? '#e6a5bf' : '#b5abfc',
              boxShadow: `inset 0 0 0 1px ${
                group.warmTile ? 'rgba(214, 0, 108, 0.30)' : 'var(--color-accent-700)'
              }`,
            }}
          >
            {group.initials}
          </span>

          <span className="grow">
            <span className="game-row__name" style={{ display: 'block' }}>
              {group.name}
            </span>
            <span className="game-row__sub" style={{ display: 'block' }}>
              {group.members.length} members · {group.lastActivity}
            </span>
            <span className="game-row__sub" style={{ display: 'block', marginTop: 2 }}>
              {group.lastMessage}
            </span>
          </span>

          {group.unread > 0 && <span className="unread tnum">{group.unread}</span>}
        </button>
      ))}

      <h2 className="section-title">{t('Add a group')}</h2>
      <button type="button" className="btn-lg btn-lg--primary" onClick={onJoin}>
        <Icon name="users" size={18} />
        {t('Join with a code')}
      </button>
      <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={onCreate}>
        {t('Create a group')}
      </button>

      <p className="footnote">
        {t('Groups are invite-only. Nobody finds one by searching — you get in with a code or a QR somebody sent you.')}
</p>
    </>
  );
}

export { Avatar };
