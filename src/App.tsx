import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { daySheetHtml, downloadHtml } from './lib/exporting';
import { dayKey, groupByDay } from './lib/history';
import { listGames, type Game } from './lib/db';
import { TAB_ROUTES, useNavigation, type Route, type RouteName } from './lib/navigation';
import { translate, useTranslation } from './lib/i18n';
import type { Language } from './lib/preferences';
import { useSession } from './lib/session';
import { useCrews, useCrew } from './lib/crews';
import { AuthScreen } from './screens/AuthScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CreateGroupScreen } from './screens/CreateGroupScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupSettingsScreen } from './screens/GroupSettingsScreen';
import { GameScreen } from './screens/GameScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JoinGroupScreen } from './screens/JoinGroupScreen';
import { MemberScreen } from './screens/MemberScreen';
import { PlayDayScreen } from './screens/PlayDayScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShareScreen } from './screens/ShareScreen';
import { SharedGamesScreen } from './screens/SharedGamesScreen';
import { StatsScreen } from './screens/StatsScreen';
import { VideosScreen } from './screens/VideosScreen';

const TABS: { key: RouteName; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'play', label: 'Play', icon: 'play' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'stats', label: 'Stats', icon: 'stats' },
  { key: 'groups', label: 'Crew', icon: 'users' },
];

/** A code from a ?join= link, read once at startup. */
const invitedCode = new URLSearchParams(window.location.search).get('join') ?? '';

export function App() {
  const nav = useNavigation(initialRoute());
  const { session, restoring, signIn, signInState, signInError, dismissSignInError } = useSession();
  const { t, language } = useTranslation();
  const [games, setGames] = useState<Game[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listGames().then(
      (loaded) => {
        setGames(loaded);
        setStorageError(null);
      },
      (err: unknown) => {
        // Without this the app shows an empty season and says nothing — which
        // looks exactly like having lost one. A private window, or a browser
        // set to block site data, is the usual cause.
        setStorageError(
          err instanceof Error && err.message
            ? `Storage on this device is unavailable: ${err.message}`
            : 'Storage on this device is unavailable.',
        );
      },
    );
  }, []);

  useEffect(refresh, [refresh]);

  /**
   * A finished game goes straight to the share screen when there is a crew to
   * share it with; otherwise the bowler lands back on their season.
   */
  const finishGame = useCallback(
    (gameId: string) => {
      refresh();
      if (session.isGuest) nav.selectTab('home');
      else nav.replace({ name: 'shareGame', gameId });
    },
    [refresh, session.isGuest, nav],
  );

  const { route } = nav;
  const crews = useCrews(session);
  // The crew a nested screen is looking at. Fetched on its own rather than
  // picked out of the list: the list carries rosters but not the shared games
  // a board is drawn from, and a link opened cold has no list yet at all.
  const openCrew = useCrew('groupId' in route ? route.groupId : '', session);
  const group = 'groupId' in route ? (openCrew.data ?? undefined) : undefined;

  /**
   * Move focus to the new screen when navigating.
   *
   * Without this, the control that was tapped unmounts and focus falls back
   * to the document body — so a keyboard user starts again from the top of
   * the page, and a screen reader says nothing at all about where it went.
   * The first render is left alone: taking focus on load is its own rudeness.
   */
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [route]);
  const gameInView =
    route.name === 'shareGame' || route.name === 'game'
      ? games.find((g) => g.id === route.gameId)
      : undefined;
  const { title, kicker, meta } = describe(route, group?.name, language);

  // The chat pins its composer, so it manages its own scrolling.
  const isChat = route.name === 'chat';

  return (
    <div className="app">
      <header className="appbar">
        {nav.canGoBack && (
          <button type="button" className="iconbtn" aria-label={t('Back')} onClick={nav.back}>
            <Icon name="back" size={18} />
          </button>
        )}

        <div className="grow">
          <div className="appbar__kicker">{kicker}</div>
          <h1 className="appbar__title">{title}</h1>
          {meta && <div className="appbar__meta">{meta}</div>}
        </div>

        {/*
         * Settings lives in the header rather than a sixth tab, per the
         * handoff. The group dashboard is the exception: its hero card
         * already carries a settings button for the group itself, and two
         * identical gears in view at once is a coin toss for the reader.
         */}
        {route.name !== 'settings' && route.name !== 'group' && (
          <button
            type="button"
            className="iconbtn"
            aria-label={t('Settings')}
            onClick={() => nav.push({ name: 'settings' })}
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </header>

      {storageError && (
        <div style={{ padding: '10px var(--gutter) 0' }}>
          <div className="note note--bad" style={{ marginBottom: 0 }}>
            <strong>{storageError}</strong>
            <p style={{ margin: '6px 0 0' }}>
              {t(
                'Nothing has been deleted — Lane Log simply cannot read or write here. A private window, or a browser set to block site data, will do this.',
              )}
            </p>
          </div>
        </div>
      )}

      <main
        ref={mainRef}
        className="screen"
        key={`${route.name}-${'groupId' in route ? route.groupId : ''}`}
        // Focusable by script but not in the tab order, so the focus move on
        // navigation does not add a stop for everyone else.
        tabIndex={-1}
        aria-label={title}
        style={isChat ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}
      >
        {route.name === 'home' && (
          <HomeScreen
            games={games}
            crews={crews.data}
            onStartGame={() => nav.selectTab('play')}
            onOpenHistory={() => nav.selectTab('history')}
            onOpenStats={() => nav.selectTab('stats')}
            // Straight into the crew's board. The list of groups is a tab of
            // its own; a shortcut that only got you as far as the list would
            // not have saved anybody a tap.
            onOpenGroup={(groupId) => nav.push({ name: 'group', groupId })}
            onOpenGame={(gameId) => nav.push({ name: 'game', gameId })}
          />
        )}

        {route.name === 'play' && (
          <PlayScreen onSaved={finishGame} onScan={() => nav.push({ name: 'scan' })} />
        )}

        {route.name === 'scan' && <ScanScreen onImported={finishGame} />}

        {route.name === 'history' && (
          <HistoryScreen
            games={games}
            onOpenGame={(gameId) => nav.push({ name: 'game', gameId })}
            onOpenDay={(day) => nav.push({ name: 'day', day })}
          />
        )}

        {route.name === 'day' && (
          <PlayDayScreen
            games={games}
            day={route.day}
            onOpenGame={(gameId) => nav.push({ name: 'game', gameId })}
            onExport={() => {
              const [session] = groupByDay(games.filter((g) => dayKey(g.playedAt) === route.day));
              if (session) {
                downloadHtml(
                  `lane-log-${new Date(session.at).toISOString().slice(0, 10)}.html`,
                  daySheetHtml(session),
                );
              }
            }}
          />
        )}
        {route.name === 'stats' && (
          <StatsScreen games={games} onOpenSettings={() => nav.push({ name: 'settings' })} />
        )}

        {route.name === 'groups' && (
          <GroupsScreen
            session={session}
            restoring={restoring}
            crews={crews.data}
            loading={crews.loading}
            error={crews.error}
            onRetry={crews.reload}
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
            state={signInState}
            error={signInError}
            onDismissError={dismissSignInError}
            // No `nav.back()` here: signing in leaves the page for the
            // provider and returns as a fresh load, and navigating away first
            // would only flash a screen nobody sees.
            onSignIn={signIn}
            onPlayAsGuest={nav.back}
          />
        )}

        {'groupId' in route && !group && (
          <p className="empty">
            {openCrew.loading
              ? t('Loading the crew…')
              : (openCrew.error ?? t('That crew is not one of yours, or no longer exists.'))}
          </p>
        )}

        {route.name === 'group' && group && (
          <GroupScreen
            group={group}
            onOpenMember={(memberId) => nav.push({ name: 'member', groupId: group.id, memberId })}
            onOpenChat={() => nav.push({ name: 'chat', groupId: group.id })}
            onOpenSettings={() => nav.push({ name: 'groupSettings', groupId: group.id })}
            onOpenShared={() => nav.push({ name: 'sharedGames', groupId: group.id })}
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
            session={session}
            onCancel={nav.back}
            onOpenGroup={(groupId) => {
              crews.reload();
              nav.replace({ name: 'group', groupId });
            }}
          />
        )}

        {route.name === 'joinGroup' && (
          <JoinGroupScreen
            initialCode={invitedCode}
            onJoined={(groupId) => {
              crews.reload();
              nav.replace({ name: 'group', groupId });
            }}
          />
        )}

        {route.name === 'sharedGames' && group && <SharedGamesScreen group={group} />}

        {route.name === 'game' && gameInView && (
          <GameScreen
            game={gameInView}
            onShare={() => nav.push({ name: 'shareGame', gameId: gameInView.id })}
            onChanged={refresh}
            onDeleted={() => {
              refresh();
              nav.back();
            }}
          />
        )}

        {route.name === 'game' && !gameInView && (
          <p className="empty">{t('That game is no longer on this device.')}</p>
        )}

        {route.name === 'shareGame' && gameInView && (
          <ShareScreen
            crews={crews.data}
            me={session.id}
            game={gameInView}
            onCancel={nav.back}
            onShared={(groupId) => {
              refresh();
              nav.replace({ name: 'sharedGames', groupId });
            }}
          />
        )}

        {route.name === 'shareGame' && !gameInView && (
          <p className="empty">{t('That game is no longer on this device.')}</p>
        )}

        {route.name === 'videos' && <VideosScreen onScan={() => nav.push({ name: 'scan' })} />}

        {route.name === 'settings' && (
          <SettingsScreen
            games={games}
            onOpenVideos={() => nav.push({ name: 'videos' })}
            onRestored={refresh}
          />
        )}
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
            {t(tab.label)}
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
    return [
      'group',
      'chat',
      'member',
      'groupSettings',
      'createGroup',
      'joinGroup',
      'sharedGames',
    ].includes(route.name);
  }
  if (tab === 'play') return route.name === 'scan';
  return false;
}

function describe(route: Route, groupName: string | undefined, language: Language) {
  const s = (text: string) => translate(text, language);

  switch (route.name) {
    case 'home':
      return { title: s('Lane Log'), kicker: s('Dashboard'), meta: '' };
    case 'play':
      return { title: s('New game'), kicker: s('Frame entry'), meta: '' };
    case 'scan':
      return { title: s('Scan a sheet'), kicker: s('Import'), meta: '' };
    case 'history':
      return { title: s('Match history'), kicker: s('Archive'), meta: '' };
    case 'stats':
      return { title: s('Analytics'), kicker: s('Analytics'), meta: '' };
    case 'settings':
      return { title: s('Settings'), kicker: s('Preferences'), meta: '' };
    case 'day':
      return { title: s('Play day'), kicker: s('Session'), meta: '' };
    case 'videos':
      return { title: s('Video gallery'), kicker: s('Slow motion'), meta: '' };
    case 'auth':
      return { title: s('Sign in'), kicker: s('Account'), meta: '' };
    case 'groups':
      return { title: s('Groups'), kicker: s('Social'), meta: '' };
    case 'group':
      return { title: groupName ?? s('Group'), kicker: s('Group'), meta: '' };
    case 'chat':
      return { title: s('Group chat'), kicker: groupName ?? s('Group'), meta: '' };
    case 'member':
      return { title: s('Bowler'), kicker: groupName ?? s('Group'), meta: '' };
    case 'groupSettings':
      return { title: s('Group settings'), kicker: groupName ?? s('Group'), meta: '' };
    case 'createGroup':
      return { title: s('Create a group'), kicker: s('Groups'), meta: '' };
    case 'joinGroup':
      return { title: s('Join a group'), kicker: s('Invite'), meta: '' };
    case 'game':
      return { title: s('Game record'), kicker: s('Game record'), meta: '' };
    case 'shareGame':
      return { title: s('Share this game'), kicker: s('Game finished'), meta: '' };
    case 'sharedGames':
      return { title: s('Shared games'), kicker: groupName ?? s('Group'), meta: '' };
  }
}

/**
 * Home-screen shortcuts deep-link with ?screen=, and a scanned QR arrives as
 * ?join=CODE — which should open the join screen with the code already in.
 */
function initialRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  if (params.get('join')) return { name: 'joinGroup' };

  const requested = params.get('screen');
  if (requested && (TAB_ROUTES as string[]).includes(requested)) {
    return { name: requested as RouteName } as Route;
  }
  if (requested === 'scan') return { name: 'scan' };
  return { name: 'home' };
}
