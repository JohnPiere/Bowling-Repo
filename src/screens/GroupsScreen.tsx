import { Avatar } from '../components/Avatar';
import { t, tf } from '../lib/i18n';
import { Icon } from '../components/Icon';
import type { Group } from '../data/groups';
import type { Session } from '../lib/session';

interface Props {
  session: Session;
  /** True while the stored account is still being worked out. */
  restoring?: boolean;
  crews: Group[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenGroup: (groupId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onLinkAccount: () => void;
}

/** The bowler's groups, or the reason there aren't any. */
export function GroupsScreen({
  session,
  restoring = false,
  crews,
  loading = false,
  error = null,
  onRetry,
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
            {t(
              'A group is shared with other people, so it cannot live only on this phone. Your games stay exactly where they are — linking an account does not move them.',
            )}
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

      {/* An error replaces nothing: whatever loaded last stays on screen under
          it, because a failed refresh should not cost you the list you were
          just reading. */}
      {error && (
        <div className="note note--bad">
          {error}
          {onRetry && (
            <button
              type="button"
              className="linkbtn"
              style={{ display: 'block', marginTop: 6 }}
              onClick={onRetry}
            >
              {t('Try again')}
            </button>
          )}
        </div>
      )}

      {loading && crews.length === 0 && <p className="empty">{t('Loading your crews…')}</p>}

      {!loading && !error && crews.length === 0 && (
        <p className="empty">
          {t('No crews yet. Create one, or join with a code somebody sent you.')}
        </p>
      )}

      {crews.map((group) => (
        <button
          key={group.id}
          type="button"
          className="game-row"
          onClick={() => onOpenGroup(group.id)}
        >
          <Avatar initials={group.initials} size={44} isMe square />

          <span className="grow">
            <span className="game-row__name" style={{ display: 'block' }}>
              {group.name}
            </span>
            <span className="game-row__sub" style={{ display: 'block' }}>
              {tf('{n} members', { n: group.members.length })}
              {group.homeAlley ? ` · ${group.homeAlley}` : ''}
            </span>
            {group.lastMessage && (
              <span className="game-row__sub" style={{ display: 'block', marginTop: 2 }}>
                {group.lastMessage}
              </span>
            )}
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
        {t(
          'Groups are invite-only. Nobody finds one by searching — you get in with a code or a QR somebody sent you.',
        )}
      </p>
    </>
  );
}

export { Avatar };
