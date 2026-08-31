import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { listGames, type Game } from './lib/db';
import { GroupScreen } from './screens/GroupScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type ScreenKey = 'home' | 'play' | 'scan' | 'history' | 'group' | 'settings';

/** Title and kicker for the app bar, per screen. */
const SCREENS: Record<ScreenKey, { title: string; kicker: string; back?: ScreenKey }> = {
  home: { title: 'Lane Log', kicker: 'Your season' },
  play: { title: 'Play', kicker: 'Live scoring' },
  scan: { title: 'Scan a sheet', kicker: 'Import', back: 'play' },
  history: { title: 'History', kicker: 'Every game' },
  group: { title: 'Tuesday Crew', kicker: 'Group' },
  settings: { title: 'Settings', kicker: 'Preferences' },
};

const TABS: { key: ScreenKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'play', label: 'Play', icon: 'play' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'group', label: 'Crew', icon: 'users' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const [screen, setScreen] = useState<ScreenKey>(initialScreen);
  const [games, setGames] = useState<Game[]>([]);

  const refresh = useCallback(() => {
    void listGames().then(setGames);
  }, []);

  useEffect(refresh, [refresh]);

  const meta = SCREENS[screen];

  return (
    <div className="app">
      <header className="appbar">
        {meta.back && (
          <button
            type="button"
            className="iconbtn"
            aria-label="Back"
            onClick={() => setScreen(meta.back as ScreenKey)}
          >
            <Icon name="back" size={18} />
          </button>
        )}
        <div className="grow">
          <div className="appbar__kicker">{meta.kicker}</div>
          <h1 className="appbar__title">{meta.title}</h1>
        </div>
      </header>

      <main className="screen" key={screen}>
        {screen === 'home' && (
          <HomeScreen
            games={games}
            onStartGame={() => setScreen('play')}
            onOpenHistory={() => setScreen('history')}
            onOpenGroup={() => setScreen('group')}
          />
        )}
        {screen === 'play' && (
          <PlayScreen
            onSaved={() => {
              refresh();
              setScreen('home');
            }}
            onScan={() => setScreen('scan')}
          />
        )}
        {screen === 'scan' && (
          <ScanScreen
            onImported={() => {
              refresh();
              setScreen('home');
            }}
          />
        )}
        {screen === 'history' && <HistoryScreen games={games} />}
        {screen === 'group' && <GroupScreen />}
        {screen === 'settings' && <SettingsScreen games={games} />}
      </main>

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="tabbar__item"
            aria-current={tab.key === screen ? 'page' : undefined}
            onClick={() => setScreen(tab.key)}
          >
            <Icon name={tab.icon} size={19} />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Home-screen shortcuts deep-link with ?screen=. */
function initialScreen(): ScreenKey {
  const requested = new URLSearchParams(window.location.search).get('screen');
  return requested && requested in SCREENS ? (requested as ScreenKey) : 'home';
}
