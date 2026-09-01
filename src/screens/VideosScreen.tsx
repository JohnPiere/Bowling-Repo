import { Icon } from '../components/Icon';
import { t } from '../lib/i18n';
import { formatBytes } from '../lib/storage';

/**
 * Clips.
 *
 * A placeholder, deliberately. The handoff puts video out of scope for the
 * MVP, and the honest reason is storage: a single throw at 1080p is tens of
 * megabytes, which is a backend and a bill rather than a screen. This says so
 * plainly rather than showing a disabled shelf of fake thumbnails.
 */
export function VideosScreen({ onScan }: { onScan: () => void }) {
  // Roughly what a season would cost, to make the constraint concrete.
  const perThrow = 22 * 1024 * 1024;
  const throwsPerGame = 14;
  const gamesPerSeason = 40;

  return (
    <>
      <div className="note note--info">
        <strong>{t('Clips are not built yet.')}</strong>
        <p style={{ margin: '6px 0 0' }}>
          {t('Video is the one feature that cannot live on the device. This is where it will go.')}
        </p>
      </div>

      <h2 className="section-title">{t('Why it needs a backend first')}</h2>
      <div className="card">
        <div className="row row--between">
          <span className="muted">{t('One throw at 1080p')}</span>
          <span className="tnum">{formatBytes(perThrow)}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="muted">{t('A full game')}</span>
          <span className="tnum">{formatBytes(perThrow * throwsPerGame)}</span>
        </div>
        <div className="row row--between" style={{ marginTop: 6 }}>
          <span className="muted">A season of {gamesPerSeason} games</span>
          <span className="tnum">{formatBytes(perThrow * throwsPerGame * gamesPerSeason)}</span>
        </div>
        <p className="footnote" style={{ marginBottom: 0 }}>
          A phone will not hold that, and neither will a browser's storage quota. Clips need
          somewhere to live and something to pay for it — object storage and an account — which is
          why they come after the rest.
        </p>
      </div>

      <h2 className="section-title">{t('What works today')}</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          {t('Score sheets, though. Photograph a finished sheet and the frames are read off it — a few hundred kilobytes rather than a few hundred megabytes.')}
</p>
        <button type="button" className="btn-lg btn-lg--primary" onClick={onScan}>
          <Icon name="camera" size={18} />
          {t('Scan a score sheet')}
        </button>
      </div>
    </>
  );
}
