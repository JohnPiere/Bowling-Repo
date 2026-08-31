/**
 * Capturing a photo of a score sheet.
 *
 * Two paths, because one is not enough:
 *
 *  - `getUserMedia` gives a live preview, which matters when you are lining up
 *    a whole sheet and want to see the framing before you shoot.
 *  - A `capture`-annotated file input opens the system camera app. It is the
 *    reliable fallback: it works in iOS Safari when a live stream is refused,
 *    and it lets someone pick an existing photo of a sheet from the roll.
 */

export interface CaptureResult {
  blob: Blob;
  width: number;
  height: number;
}

export function supportsLiveCamera(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Open the rear camera. The caller owns the returned stream and must call
 * `stopStream` on it.
 */
export async function startRearCamera(): Promise<MediaStream> {
  if (!supportsLiveCamera()) {
    throw new Error('This browser will not give the app a live camera preview.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        // "environment" rather than { exact: 'environment' }: an exact
        // constraint throws outright on laptops with only a front camera.
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (err) {
    throw new Error(describeCameraError(err));
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Grab the current video frame as a JPEG. */
export async function captureFrame(video: HTMLVideoElement): Promise<CaptureResult> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('The camera has not produced a frame yet — try again in a moment.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser would not provide a drawing canvas.');
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    // Quality high enough that OCR still has crisp mark edges to work with.
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('The photo could not be encoded.');

  return { blob, width, height };
}

/** Read a file chosen from the camera app or the photo roll. */
export async function fileToCapture(file: File): Promise<CaptureResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, width: 0, height: 0 };

  const result = { blob: file, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Camera access was blocked. Allow the camera in your browser settings and try again.';
    case 'NotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is already in use by another app.';
    case 'SecurityError':
      return 'The camera needs a secure (https) connection.';
    default:
      return err instanceof Error ? err.message : 'The camera could not be opened.';
  }
}
