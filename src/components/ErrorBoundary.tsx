import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../lib/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken screen from taking the app with it.
 *
 * Everything here is stored on the device with no server copy, so an
 * unhandled render error unmounting the whole tree is worse than it looks: the
 * bowler is left staring at a blank page with a season they cannot reach and
 * no obvious way back. A screen that fails should cost that screen.
 *
 * This is a backstop, not a substitute for validating what goes into storage —
 * bad data is rejected at the door in lib/backup.ts. It exists because the
 * next bad record will be one nobody predicted.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry to send it to, so the console is where this goes.
    console.error('Lane Log hit an error it could not recover from:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app">
        <header className="appbar">
          <div className="grow">
            <div className="appbar__kicker">{t('Something broke')}</div>
            <h1 className="appbar__title">{t('Sorry')}</h1>
          </div>
        </header>

        <main className="screen">
          <div className="note note--bad">
            <strong>{t('This screen could not be drawn.')}</strong>
            <p style={{ margin: '6px 0 0' }}>
              {t('Your games are still on this device — nothing has been lost.')}
            </p>
          </div>

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            onClick={() => this.setState({ error: null })}
          >
            {t('Try again')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={() => {
              // Back to the start, in case the failing screen is the one that
              // will not open.
              window.location.href = '/';
            }}
          >
            {t('Go back to the start')}
          </button>

          <h2 className="section-title">{t('What happened')}</h2>
          <pre className="rawtext">{this.state.error.message}</pre>
          <p className="footnote">
            {t('If this keeps happening, export your games from Settings before doing anything else — that file is the only copy there is.')}
</p>
        </main>
      </div>
    );
  }
}
