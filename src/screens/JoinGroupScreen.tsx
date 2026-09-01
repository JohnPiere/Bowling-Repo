import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { QrCode, joinUrl } from '../components/QrCode';
import { describeBackendFailure } from '../lib/backend';
import { joinGroup } from '../lib/social';
import { startRearCamera, stopStream, supportsLiveCamera } from '../lib/camera';
import { inviteCodeFrom, scanFrames } from '../lib/qr';

interface Props {
  onJoined: (groupId: string) => void;
  /** A code carried in by a ?join= link, so the field starts filled. */
  initialCode?: string;
}

const CODE_LENGTH = 6;

/** Join with a code somebody sent, or by scanning their QR. */
export function JoinGroupScreen({ onJoined, initialCode = '' }: Props) {
  const [tab, setTab] = useState<'code' | 'qr'>('code');
  const [raw, setRaw] = useState(initialCode);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [ignored, setIgnored] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);

  function stopScanning() {
    stopScanRef.current?.();
    stopScanRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setScanning(false);
  }

  // The camera must be released however the screen is left, not only when the
  // scan succeeds.
  useEffect(() => stopScanning, []);

  async function startScanning() {
    setScanError(null);
    setIgnored(false);
    try {
      const stream = await startRearCamera();
      streamRef.current = stream;
      setScanning(true);

      queueMicrotask(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        // scanFrames stops at the first code it reads. A QR that is not one of
        // ours is not a reason to give up, so the handler starts it again —
        // pointing a camera at a table of codes should keep looking.
        const watch = () => {
          stopScanRef.current = scanFrames(
            video,
            (text) => {
              const code = inviteCodeFrom(text);
              if (!code) {
                setIgnored(true);
                watch();
                return;
              }
              setRaw(code);
              stopScanning();
              setTab('code');
            },
            setScanError,
          );
        };

        watch();
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    }
  }

  // Codes are typed off a screen or a scrap of paper, so normalise hard.
  const code = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
  const isComplete = code.length === CODE_LENGTH;

  /**
   * Try the code. There is no checking it first.
   *
   * A "is this code real?" endpoint would be an endpoint for discovering
   * crews one guess at a time, which is the thing invite-only is for. So the
   * only way to find out is to join, and a wrong code and an expired one come
   * back as the same sentence on purpose — telling them apart would confirm
   * that a code was once real.
   */
  async function join() {
    if (!isComplete || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      onJoined(await joinGroup(code));
    } catch (err) {
      setJoinError(describeBackendFailure(err));
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <div className="chips" role="group" aria-label={t('How to join')}>
        <button
          type="button"
          className="chip"
          aria-pressed={tab === 'code'}
          onClick={() => {
            stopScanning();
            setTab('code');
          }}
        >
          {t('Invite code')}
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={tab === 'qr'}
          onClick={() => setTab('qr')}
        >
          {t('QR code')}
        </button>
      </div>

      {tab === 'code' ? (
        <>
          <label style={{ display: 'block' }}>
            <span className="hero__label">{t('Enter the six-character code')}</span>
            <input
              className="input code-input"
              style={{ marginTop: 6 }}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="TCRW31"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby="join-status"
            />
          </label>

          <div className="code-cells" aria-hidden="true">
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const char = code[i];
              const isNext = i === code.length;
              return (
                <span
                  key={i}
                  className={`code-cell${char ? ' code-cell--filled' : ''}${
                    isNext ? ' code-cell--next' : ''
                  }`}
                >
                  {char || '·'}
                </span>
              );
            })}
          </div>

          <p id="join-status" role="status" style={{ minHeight: 20 }}>
            {joinError && <span className="note note--bad">{joinError}</span>}
          </p>

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={!isComplete || joining}
            onClick={join}
          >
            {joining ? t('Joining…') : t('Join the crew')}
          </button>
        </>
      ) : (
        <>
          {scanError && <div className="note note--bad">{scanError}</div>}
          {ignored && (
            <div className="note note--warn">
              {t('That QR is not a Lane Log invite. Still looking.')}
            </div>
          )}

          {scanning ? (
            <>
              <div className="viewfinder">
                <video ref={videoRef} className="viewfinder__video" playsInline muted />
                <div className="viewfinder__guide" />
                <div className="viewfinder__hint">{t("Point at the group's QR code")}</div>
              </div>
              <button type="button" className="btn-lg" onClick={stopScanning}>
                {t('Stop scanning')}
              </button>
            </>
          ) : (
            <>
              {supportsLiveCamera() ? (
                <button type="button" className="btn-lg btn-lg--primary" onClick={startScanning}>
                  <Icon name="camera" size={18} />
                  {t('Scan a QR code')}
                </button>
              ) : (
                <div className="note note--warn">
                  {t('This browser will not give the app a camera. Use the invite code instead.')}
                </div>
              )}

              <h2 className="section-title">{t('Or show yours')}</h2>
              <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
                <QrCode value={joinUrl('TCRW31')} size={180} />
                <p
                  className="muted"
                  style={{ marginTop: 12, marginBottom: 0, textAlign: 'center' }}
                >
                  {t(
                    "This one opens Tuesday Crew. A phone's own camera app reads it too — it is a link, not just a code.",
                  )}
                </p>
              </div>
            </>
          )}
        </>
      )}

      <p className="footnote">
        {t('Try')} <span className="tnum">TCRW31</span> against the sample data.
      </p>
    </>
  );
}
