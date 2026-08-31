import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Scorecard } from '../components/Scorecard';
import {
  captureFrame,
  fileToCapture,
  startRearCamera,
  stopStream,
  supportsLiveCamera,
} from '../lib/camera';
import { importScannedGame, scanScoreSheet, type ScanReview } from '../lib/import';
import { tryParseMarks } from '../lib/marks';
import { scoreGame } from '../lib/scoring';
import { describeSaveFailure, isQuotaError } from '../lib/storage';

type Stage = 'choose' | 'framing' | 'reading' | 'review';

/**
 * Scan a paper score sheet into a game.
 *
 * The flow always ends at a review step, even for a confident read. OCR on
 * pencil marks is good enough to save typing and not good enough to trust
 * silently, and a wrong score quietly entering your average is worse than
 * having to check one.
 */
export function ScanScreen({ onImported }: { onImported: (gameId: string) => void }) {
  const [stage, setStage] = useState<Stage>('choose');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [review, setReview] = useState<ScanReview | null>(null);
  const [marks, setMarks] = useState('');
  const [house, setHouse] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // The camera must be released on every exit from this screen, not just the
  // happy path — a live rear camera drains the battery and holds the LED on.
  useEffect(() => () => stopStream(streamRef.current), []);

  async function openCamera() {
    setError(null);
    try {
      const stream = await startRearCamera();
      streamRef.current = stream;
      setStage('framing');
      // The element only exists after the stage renders.
      queueMicrotask(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('choose');
    }
  }

  function closeCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
  }

  async function read(image: Blob) {
    setStage('reading');
    setProgress(0);
    setError(null);

    try {
      const result = await scanScoreSheet(image, setProgress);
      setReview(result);
      setMarks(result.sheet ? result.sheet.frames.map((f) => f.join('')).join(' ') : '');
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('choose');
    }
  }

  async function shoot() {
    if (!videoRef.current) return;
    try {
      const shot = await captureFrame(videoRef.current);
      closeCamera();
      await read(shot.blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickFile(file: File) {
    try {
      const shot = await fileToCapture(file);
      await read(shot.blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // The review screen re-parses whatever is in the correction box, so a fixed
  // typo updates the card immediately.
  const corrected = marks.trim() ? tryParseMarks(marks) : null;

  async function commit() {
    if (!corrected || 'error' in corrected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await importScannedGame(corrected.rolls, {
        bowler: 'You',
        house: house.trim() || undefined,
        sheetImage: review?.image,
        keepPhoto: !dropPhoto,
      });
      reset();
      onImported(saved.id);
    } catch (err) {
      // The scored game is the valuable part; if the photo is what will not
      // fit, offer to drop it rather than lose the import.
      setSaveError(describeSaveFailure(err, { hasPhoto: Boolean(review?.image) && !dropPhoto }));
      if (isQuotaError(err)) setDropPhoto(true);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    closeCamera();
    setReview(null);
    setMarks('');
    setHouse('');
    setProgress(0);
    setSaveError(null);
    setDropPhoto(false);
    setStage('choose');
  }

  return (
    <>
      {error && <div className="note note--bad">{error}</div>}

      {stage === 'choose' && (
        <>
          <p className="muted" style={{ margin: '0 0 14px' }}>
            Photograph a finished sheet straight on, with the ten frames filling the frame. Lane Log
            reads the marks and shows you the game before anything is saved.
          </p>

          {supportsLiveCamera() && (
            <button type="button" className="btn-lg btn-lg--primary" onClick={openCamera}>
              <Icon name="camera" size={18} />
              Open the camera
            </button>
          )}

          <button
            type="button"
            className="btn-lg btn-lg--dashed"
            style={{ marginTop: 11 }}
            onClick={() => fileRef.current?.click()}
          >
            Use a photo instead
          </button>

          {/* `capture` opens the camera app directly on a phone; without it the
              same input still offers the photo roll, which is the fallback when
              a live stream is refused. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pickFile(file);
            }}
          />
        </>
      )}

      {stage === 'framing' && (
        <>
          <div className="viewfinder">
            <video ref={videoRef} className="viewfinder__video" playsInline muted />
            <div className="viewfinder__guide" />
            <div className="viewfinder__hint">Fill the guide with all ten frames</div>
          </div>
          <button type="button" className="btn-lg btn-lg--primary" onClick={shoot}>
            <Icon name="camera" size={18} />
            Take the photo
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={() => {
              closeCamera();
              setStage('choose');
            }}
          >
            Cancel
          </button>
        </>
      )}

      {stage === 'reading' && (
        <div className="card">
          <div className="hero__label" style={{ marginBottom: 8 }}>
            Reading the sheet
          </div>
          <div className="progress">
            <div className="progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Recognition runs on this device — the photo is not uploaded anywhere.
          </p>
        </div>
      )}

      {stage === 'review' && review && (
        <>
          {review.error ? (
            <div className="note note--bad">{review.error}</div>
          ) : (
            review.warnings.map((warning) => (
              <div key={warning} className="note note--warn">
                {warning}
              </div>
            ))
          )}

          {corrected && !('error' in corrected) && (
            <div className="card">
              <div className="row row--between" style={{ marginBottom: 10 }}>
                <span className="hero__label">Scanned game</span>
                <span className="tnum" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
                  {scoreGame(corrected.rolls).total}
                </span>
              </div>
              <Scorecard scorecard={scoreGame(corrected.rolls)} />
            </div>
          )}

          {corrected && 'error' in corrected && (
            <div className="note note--bad">{corrected.error}</div>
          )}

          {review.otherRows && review.otherRows.length > 0 && (
            <>
              <h2 className="section-title">Which row is yours</h2>
              {[review.rawText, ...review.otherRows].map((row, index) => {
                const parsed = tryParseMarks(row);
                const total = 'rolls' in parsed ? scoreGame(parsed.rolls).total : null;
                const isChosen = marks.replace(/\s/g, '') === row.replace(/\s/g, '');

                return (
                  <button
                    key={`${index}-${row}`}
                    type="button"
                    className={`choice${isChosen ? ' choice--on' : ''}`}
                    onClick={() => setMarks(row)}
                  >
                    <span className="choice__dot" aria-hidden="true" />
                    <span className="grow">
                      <span className="choice__label tnum">
                        {index === 0 ? 'Top row' : `Row ${index + 1}`}
                        {total !== null && ` · ${total}`}
                      </span>
                      <span className="choice__note tnum">{row || '(nothing read)'}</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">Marks — correct anything the scan got wrong</span>
            <input
              className="input tnum"
              style={{ marginTop: 5, letterSpacing: '0.08em' }}
              value={marks}
              onChange={(e) => setMarks(e.target.value.toUpperCase())}
              placeholder="X 9/ 72 X X 8- 9/ X XXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <p className="muted" style={{ margin: '-6px 0 12px' }}>
            One group a frame. X for a strike, / for a spare, - for a miss.
          </p>

          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">Where you bowled</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={house}
              onChange={(e) => setHouse(e.target.value)}
              placeholder="Rose Bowl Lanes"
            />
          </label>

          {saveError && <div className="note note--bad">{saveError}</div>}

          {dropPhoto && (
            <div className="note note--info">
              The photo will not be kept with this game. The score sheet itself is unaffected.
            </div>
          )}

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={!corrected || 'error' in corrected || saving}
            onClick={commit}
          >
            <Icon name="check" size={18} />
            {saving ? 'Saving…' : dropPhoto ? 'Save without the photo' : 'Save this game'}
          </button>

          <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={reset}>
            Scan a different sheet
          </button>

          <h2 className="section-title">What the scan read</h2>
          <pre className="rawtext">{review.rawText.trim() || '(nothing legible)'}</pre>
          <p className="footnote">
            {review.strategy === 'per-frame'
              ? 'Read frame by frame — the sheet’s own rules marked where each frame ends.'
              : 'Read as one image; no frame grid was found, so the marks were split on spacing.'}{' '}
            Confidence {Math.round(review.confidence * 100)}%. Recognition ran on this device; the
            photo is stored with the game and never uploaded.
          </p>
        </>
      )}
    </>
  );
}
