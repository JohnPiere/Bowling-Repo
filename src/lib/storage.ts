/**
 * Device storage.
 *
 * Scanned sheets are photographs, and a season of them is the only thing in
 * this app big enough to run a phone out of room. Two defences: keep a
 * reasonably sized copy rather than the camera's original, and tell the bowler
 * where they stand before the browser starts evicting things.
 */

export interface StorageReport {
  /** Bytes used by this origin, when the browser will say. */
  usage: number | null;
  /** Bytes available to this origin. */
  quota: number | null;
  /** 0..1, or null when unknown. */
  fraction: number | null;
  /** True once the browser has promised not to evict this origin. */
  persisted: boolean;
}

/** Above this the app starts warning rather than waiting to fail. */
export const STORAGE_WARN_AT = 0.85;

export async function estimateStorage(): Promise<StorageReport> {
  const persisted = (await navigator.storage?.persisted?.()) ?? false;

  // Not universally implemented, and Safari's numbers are approximate.
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const usage = estimate?.usage ?? null;
  const quota = estimate?.quota ?? null;

  return {
    usage,
    quota,
    fraction: usage !== null && quota ? usage / quota : null,
    persisted,
  };
}

/**
 * Ask the browser not to evict this origin under storage pressure.
 *
 * Chrome grants it silently for an installed app; Safari ties it to use. A
 * refusal is not an error — it just means the data is evictable, which is
 * worth telling the bowler rather than hiding.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Long edge for a stored sheet photo. Enough to re-read a disputed frame. */
const STORED_LONG_EDGE = 1400;

/**
 * Shrink a captured sheet before it is stored.
 *
 * A modern phone camera produces several megabytes an exposure. Keeping the
 * original would let a season of scans fill the origin's whole quota, and
 * nothing downstream needs that resolution — the OCR works at 1600px and a
 * human checking a frame needs far less.
 */
export async function shrinkForStorage(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, STORED_LONG_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && image.size < 600_000) {
      bitmap.close();
      return image;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return image;
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const shrunk = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );

    // Never hand back something larger than what came in.
    return shrunk && shrunk.size < image.size ? shrunk : image;
  } catch {
    return image;
  }
}

/** True when a failure was the browser refusing for lack of room. */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    // Firefox's older spelling.
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(error.message)
  );
}

/**
 * A message worth showing, for any save that failed.
 *
 * `hasPhoto` decides whether to offer dropping it — suggesting that for a
 * hand-scored game sends the bowler looking for a photo that does not exist.
 */
export function describeSaveFailure(
  error: unknown,
  options: { hasPhoto?: boolean } = {},
): string {
  if (isQuotaError(error)) {
    const wayOut = options.hasPhoto
      ? ' Export and delete some older games, or save this one without its photo.'
      : ' Export and delete some older games to make room — scanned sheets take by far the most.';
    return `This device is out of storage for Lane Log.${wayOut}`;
  }
  return error instanceof Error
    ? `The game could not be saved: ${error.message}`
    : 'The game could not be saved.';
}

/** Human-readable bytes. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
