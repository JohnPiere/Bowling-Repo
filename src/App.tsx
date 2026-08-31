import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { findGroup } from './data/groups';
import { listGames, type Game } from './lib/db';
import { TAB_ROUTES, useNavigation, type Route, type RouteName } from './lib/navigation';
import { useSession } from './lib/session';
import { AuthScreen } from './screens/AuthScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CreateGroupScreen } from './screens/CreateGroupScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupSettingsScreen } from './screens/GroupSettingsScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JoinGroupScreen } from './screens/JoinGroupScreen';
import { MemberScreen } from './screens/MemberScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';

const TABS: { key: RouteName; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'play', label: 'Play', icon: 'play' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'stats', label: 'Stats', icon: 'stats' },
  { key: 'groups', label: 'Crew', icon: 'users' },
];

export function App() {
  const nav = useNavigation(initialRoute());
  const { session, signIn } = useSession();
  const [games, setGames] = useState<Game[]>([]);

  const refresh = useCallback(() => {
    void listGames().then(setGames);
  }, []);

  useEffect(refresh, [refresh]);

  const { route } = nav;
  const group = 'groupId' in route ? findGroup(route.groupId) : undefined;
  const { title, kicker, meta } = describe(route, group?.name);

  // The chat pins its composer, so it manages its own scrolling.
  const isChat = route.name === 'chat';

  return (
    <div className="app">
      <header className="appbar">
        {nav.canGoBack && (
          <button type="button" className="iconbtn" aria-label="Back" onClick={nav.back}>
            <Icon name="back" size={18} />
          </button>
        )}

        <div className="grow">
          <div className="appbar__kicker">{kicker}</div>
          <h1 className="appbar__title">{title}</h1>
          {meta && <div className="appbar__meta">{meta}</div>}
        </div>

        {route.name === 'group' && group && (
          <button
            type="button"
            className="iconbtn"
            aria-label="Group settings"
            onClick={() => nav.push({ name: 'groupSettings', groupId: group.id })}
          >
            <Icon name="settings" size={18} />
          </button>
        )}

        {/* Settings lives in the header rather than a sixth tab, per the handoff. */}
        {route.name !== 'settings' && (
          <button
            type="button"
            className="iconbtn"
            aria-label="Settings"
            onClick={() => nav.push({ name: 'settings' })}
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </header>

      <main
        className="screen"
        key={`${route.name}-${'groupId' in route ? route.groupId : ''}`}
        style={isChat ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}
      >
        {route.name === 'home' && (
          <HomeScreen
            games={games}
            onStartGame={() => nav.selectTab('play')}
            onOpenHistory={() => nav.selectTab('history')}
            onOpenGroup={() => nav.selectTab('groups')}
          />
        )}

        {route.name === 'play' && (
          <PlayScreen
            onSaved={() => {
              refresh();
              nav.selectTab('home');
            }}
            onScan={() => nav.push({ name: 'scan' })}
          />
        )}

        {route.name === 'scan' && (
          <ScanScreen
            onImported={() => {
              refresh();
              nav.selectTab('home');
            }}
          />
        )}

        {route.name === 'history' && <HistoryScreen games={games} />}
        {route.name === 'stats' && <StatsScreen games={games} />}

        {route.name === 'groups' && (
          <GroupsScreen
            session={session}
            onOpenGroup={(groupId) => nav.push({ name: 'group', groupId })}
            onCreate={() => nav.push({ name: 'createGroup' })}
            onJoin={() => nav.push({ name: 'joinGroup' })}
            onLinkAccount={() => nav.push({ name: 'auth' })}
          />
        )}

        {route.name === 'auth' && (
          <AuthScreen
            isLinking={session.isGuest}
            guestGames={games.length}
            onSignIn={(provider) => {
              signIn(provider);
              nav.back();
            }}
            onPlayAsGuest={nav.back}
          />
        )}

        {route.name === 'group' && group && (
          <GroupScreen
            group={group}
            onOpenMember={(memberId) => nav.push({ name: 'member', groupId: group.id, memberId })}
            onOpenChat={() => nav.push({ name: 'chat', groupId: group.id })}
            onOpenSettings={() => nav.push({ name: 'groupSettings', groupId: group.id })}
          />
        )}

        {route.name === 'chat' && group && <ChatScreen group={group} session={session} />}

        {route.name === 'member' && group && (
          <MemberScreen group={group} memberId={route.memberId} />
        )}

        {route.name === 'groupSettings' && group && (
          <GroupSettingsScreen group={group} onLeave={() => nav.returnTo('groups')} />
        )}

        {route.name === 'createGroup' && (
          <CreateGroupScreen
            onCancel={nav.back}
            onOpenGroup={(groupId) => nav.replace({ name: 'group', groupId })}
          />
        )}

        {route.name === 'joinGroup' && (
          <JoinGroupScreen onJoined={(groupId) => nav.replace({ name: 'group', groupId })} />
        )}

        {route.name === 'settings' && <SettingsScreen games={games} />}
      </main>

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="tabbar__item"
            aria-current={isTabActive(tab.key, route) ? 'page' : undefined}
            onClick={() => nav.selectTab(tab.key)}
          >
            <Icon name={tab.icon} size={19} />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** A tab stays lit while any screen pushed from it is showing. */
function isTabActive(tab: RouteName, route: Route): boolean {
  if (tab === route.name) return true;
  if (tab === 'groups') {
    return ['group', 'chat', 'member', 'groupSettings', 'createGroup', 'joinGroup'].includes(
      route.name,
    );
  }
  if (tab === 'play') return route.name === 'scan';
  return false;
}

function describe(route: Route, groupName?: string) {
  switch (route.name) {
    case 'home': return { title: 'Lane Log', kicker: 'Your season', meta: '' };
    case 'play': return { title: 'Play', kicker: 'Live scoring', meta: '' };
    case 'scan': return { title: 'Scan a sheet', kicker: 'Import', meta: '' };
    case 'history': return { title: 'History', kicker: 'Every game', meta: '' };
    case 'stats': return { title: 'Stats', kicker: 'Analytics', meta: '' };
    case 'settings': return { title: 'Settings', kicker: 'Preferences', meta: '' };
    case 'auth': return { title: 'Sign in', kicker: 'Account', meta: '' };
    case 'groups': return { title: 'Groups', kicker: 'Social', meta: '' };
    case 'group': return { title: groupName ?? 'Group', kicker: 'Group', meta: '' };
    case 'chat': return { title: 'Group chat', kicker: groupName ?? 'Group', meta: '' };
    case 'member': return { title: 'Member', kicker: groupName ?? 'Group', meta: '' };
    case 'groupSettings': return { title: 'Group settings', kicker: groupName ?? 'Group', meta: '' };
    case 'createGroup': return { title: 'Create a group', kicker: 'Groups', meta: '' };
    case 'joinGroup': return { title: 'Join a group', kicker: 'Invite', meta: '' };
  }
}

/** Home-screen shortcuts deep-link with ?screen=. */
function initialRoute(): Route {
  const requested = new URLSearchParams(window.location.search).get('screen');
  if (requested && (TAB_ROUTES as string[]).includes(requested)) {
    return { name: requested as RouteName } as Route;
  }
  if (requested === 'scan') return { name: 'scan' };
  return { name: 'home' };
}
