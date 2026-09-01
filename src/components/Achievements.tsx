import { useState } from 'react';
import { t } from '../lib/i18n';
import type { BadgeStatus } from '../lib/badges';
import { dateLocale, formatLongDate } from '../lib/datetime';

/**
 * The badge shelf.
 *
 * Tapping one opens what earns it and how it is judged, because an achievement
 * nobody can check is a decoration. Every badge is derived from the stored
 * games on each render rather than being awarded and remembered, so what it
 * says is always what the season actually holds.
 *
 * Locked ones are shown rather than hidden — a badge you cannot see is not a
 * goal — and carry how far along they are.
 */
export function Achievements({ badges }: { badges: BadgeStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const detail = badges.find((badge) => badge.key === open) ?? null;
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <>
      <div className="row row--between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {t('Achievements')} <span className="tnum badges__count">{earned} / {badges.length}</span>
        </h2>
        <span className="badges__hint">{t('Tap a badge to see exactly how it is measured.')}</span>
      </div>

      <div className="badges">
        {badges.map((badge) => (
          <button
            key={badge.key}
            type="button"
            className={`badge${badge.earned ? '' : ' badge--locked'}${
              open === badge.key ? ' badge--open' : ''
            }`}
            aria-expanded={open === badge.key}
            onClick={() => setOpen((current) => (current === badge.key ? null : badge.key))}
          >
            <span className="badge__glyph tnum">{badge.glyph}</span>
            <span className="badge__name">{badge.name}</span>
            {badge.earned ? (
              <span className="badge__meta tnum">
                {badge.earnedAt
                  ? new Date(badge.earnedAt).toLocaleDateString(dateLocale(), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Earned'}
              </span>
            ) : (
              <>
                <span className="badge__meta tnum">
                  {Math.round(badge.progress * 100)}% — {Math.max(1, Math.round((1 - badge.progress) * 100))}% to go
                </span>
                <span className="badge__progress">
                  <span style={{ width: `${Math.round(badge.progress * 100)}%` }} />
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      {detail && (
        <div className="badge-detail">
          <div className="row row--between" style={{ marginBottom: 8 }}>
            <span className="badge-detail__name">{detail.name}</span>
            <button type="button" className="badge-detail__close" onClick={() => setOpen(null)}>
              {t('Close')}
            </button>
          </div>

          <p className="badge-detail__crit">{detail.criterion}</p>

          <div className="hero__label" style={{ marginTop: 10 }}>
            {detail.earned ? 'Earned' : 'Progress'}
          </div>
          {detail.earned ? (
            <div className="tnum badge-detail__status">
              {detail.earnedAt
                ? formatLongDate(detail.earnedAt)
                : 'Yes'}
            </div>
          ) : (
            <>
              <div className="progress" style={{ marginTop: 5 }}>
                <div
                  className="progress__fill"
                  style={{ width: `${Math.round(detail.progress * 100)}%` }}
                />
              </div>
              <div className="tnum badge-detail__status">
                {Math.round(detail.progress * 100)}% of the way there
              </div>
            </>
          )}

          <p className="footnote" style={{ marginTop: 10 }}>
            {detail.how}
          </p>
        </div>
      )}
    </>
  );
}
