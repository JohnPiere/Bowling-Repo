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

export interface GrayFrame {
  gray: Uint8Array;
  width: number;
  height: number;
}

/**
 * The current preview frame as a small grey buffer.
 *
 * Small on purpose: row detection runs on every frame it is given, and a
 * 1920-wide buffer costs ten times what a 320-wide one does to find exactly the
 * same rules. The scratch canvas is passed in rather than made here so the loop
 * is not allocating a canvas several times a second.
 */
export function grabGrayFrame(
  video: HTMLVideoElement,
  scratch: HTMLCanvasElement,
  maxWidth = 320,
): GrayFrame | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }

  const context = scratch.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    // Rec. 601 luma. Rules are printed in colour on some sheets and a plain
    // channel average washes a red rule out into the paper.
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  return { gray, width, height };
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Capture one region of the frame at full resolution.
 *
 * `region` is in the coordinates of whatever buffer found it — usually the
 * small detection frame — and `foundIn` says how wide that buffer was, so the
 * region can be scaled back up to the sensor's own pixels. Cropping at capture
 * rather than after means the row arrives at OCR filling its own image, which
 * is the shape the rest of the pipeline is written for.
 */
export async function captureRegion(
  video: HTMLVideoElement,
  region: Region,
  foundIn: { width: number; height: number },
  padding = 0.3,
): Promise<CaptureResult> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('The camera has not produced a frame yet — try again in a moment.');
  }

  const scale = sourceWidth / foundIn.width;

  // Pad on all four sides, measured off the row's height: a row is far wider
  // than it is tall, so a share of its width would be enormous. The row's own
  // borders are what the reader finds the frame grid from, and an edge that
  // clips the outermost vertical rule shifts every cell along by a fraction of
  // a frame.
  const padY = region.height * scale * padding;
  const padX = region.height * scale * padding * 0.8;

  const x = Math.max(0, Math.round(region.x * scale - padX));
  const y = Math.max(0, Math.round(region.y * scale - padY));
  const width = Math.min(sourceWidth - x, Math.round(region.width * scale + padX * 2));
  const height = Math.min(sourceHeight - y, Math.round(region.height * scale + padY * 2));

  if (width < 8 || height < 8) {
    throw new Error('That row came out too small to read — move closer and try again.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser would not provide a drawing canvas.');
  context.drawImage(video, x, y, width, height, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('The photo could not be encoded.');

  return { blob, width, height };
}
