/**
 * Reading a QR code out of a camera frame.
 *
 * The decoder is loaded on demand — scanning is a rare thing to do, and there
 * is no reason for everyone to download it. `scanFrames` polls rather than
 * decoding every frame: a phone camera delivers sixty a second and decoding
 * them all would heat the handset for no gain.
 */

/** How often to attempt a decode. Fast enough to feel instant. */
const INTERVAL_MS = 180;
/** Decoding a full-resolution frame is wasted work; a QR survives this. */
const MAX_EDGE = 640;

type Decoder = typeof import('jsqr').default;

let decoderPromise: Promise<Decoder> | null = null;

function loadDecoder(): Promise<Decoder> {
  if (!decoderPromise) {
    decoderPromise = import('jsqr').then((m) => m.default);
  }
  return decoderPromise;
}

/**
 * Watch a video element for a QR code.
 *
 * Calls `onFound` with the decoded text the first time one is read, then
 * stops. Returns a function that stops the watch early.
 */
export function scanFrames(
  video: HTMLVideoElement,
  onFound: (text: string) => void,
  onError?: (message: string) => void,
): () => void {
  let stopped = false;
  let timer: number | undefined;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    onError?.('This browser would not provide a drawing canvas.');
    return () => {};
  }

  void loadDecoder()
    .then((decode) => {
      const tick = () => {
        if (stopped) return;

        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width && height) {
          const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = decode(frame.data, frame.width, frame.height, {
            // A code shown on a screen may be inverted by a dark theme.
            inversionAttempts: 'attemptBoth',
          });

          if (found?.data) {
            stopped = true;
            onFound(found.data);
            return;
          }
        }

        timer = window.setTimeout(tick, INTERVAL_MS);
      };

      tick();
    })
    .catch(() => onError?.('The QR reader could not be loaded.'));

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/**
 * Pull an invite code out of whatever was scanned.
 *
 * A code may arrive as a bare six characters or inside a join URL, and a
 * scanner will happily read a QR that has nothing to do with Lane Log.
 */
export function inviteCodeFrom(scanned: string): string | null {
  const text = scanned.trim();

  try {
    const url = new URL(text);
    // A URL is only an invite if it says so. Falling back to reading the whole
    // string as a code would turn any QR into one: strip the punctuation out
    // of "https://example.com/page" and the first six characters look exactly
    // like a valid code.
    const fromQuery = url.searchParams.get('join');
    return fromQuery ? orNull(normalise(fromQuery)) : null;
  } catch {
    // Not a URL, so it may be a bare code.
  }

  return orNull(normalise(text));
}

function normalise(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** A code is exactly six characters; anything else is not one. */
function orNull(code: string): string | null {
  return code.length === 6 ? code : null;
}
