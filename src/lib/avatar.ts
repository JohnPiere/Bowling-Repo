/**
 * A photograph on the profile tile.
 *
 * The tile has always been initials on a colour, and the comment above it said
 * "no uploads, no broken image states" — which was the right call while there
 * was nowhere to put an upload. A picture is what people actually want beside
 * their name, so here is one, on terms that keep that comment's promise: the
 * image is re-encoded on the device before it is stored, it is bounded, and a
 * tile whose picture fails to draw still has the initials underneath it.
 *
 * ## Why it is a data URL and not a file
 *
 * 192 pixels square of WebP is ten kilobytes or so — smaller than this file.
 * That is small enough to live in `localStorage` beside the rest of the
 * profile, which means every avatar on every screen has it *synchronously* and
 * nothing flashes initials for a frame while a blob loads. It is also the exact
 * string that goes into the `profiles` row for the crew to see, so there is one
 * representation rather than a local one and a remote one.
 *
 * The bound is the load-bearing part. `savePreferences` writes the whole
 * preferences object at once, so a picture that overflowed the quota would take
 * the bowler's name and language down with it — silently, because that write is
 * in a try/catch that cannot do anything useful about failing. So the encoder
 * refuses to hand back anything over `MAX_DATA_URL`, and the caller checks that
 * the write actually stuck.
 */

/** How big the stored square is. Twice the largest tile the app draws (72px). */
export const AVATAR_PIXELS = 192;

/**
 * The most a stored avatar may weigh, as a data URL.
 *
 * About 21 KB of image. Chosen against the two things it has to fit inside: a
 * `localStorage` quota shared with the rest of the profile, and the length
 * check on `profiles.avatar`, which is set higher so a row written by a future
 * version with a bigger tile is not rejected outright.
 */
export const MAX_DATA_URL = 28_000;

/** The qualities tried, best first. The first one that fits is kept. */
const QUALITIES = [0.82, 0.7, 0.6, 0.5, 0.4];

/**
 * The largest centred square in a picture.
 *
 * Centre rather than top: a phone photograph of a person is usually a portrait
 * with the face somewhere in the middle third, and taking the top square of a
 * landscape shot crops to whatever was over their shoulder.
 */
export function squareCrop(
  width: number,
  height: number,
): { x: number; y: number; side: number } {
  const side = Math.max(0, Math.min(width, height));
  return {
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    side,
  };
}

/** Whether a data URL is small enough to store. */
export function withinBudget(dataUrl: string): boolean {
  return dataUrl.length <= MAX_DATA_URL;
}

/** Roughly how many bytes of image a data URL carries, for saying so on screen. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  // base64 is four characters to three bytes, less whatever padding is on it.
  const body = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body * 3) / 4) - padding);
}

export class AvatarError extends Error {}

/**
 * Decode a picked file.
 *
 * An `<img>` rather than `createImageBitmap`, for two reasons that only show up
 * on a phone: iOS hands back HEIC from the photo picker and only Safari's own
 * image decoding will touch it, and an `<img>` applies the EXIF orientation a
 * camera writes, so a picture taken sideways is not stored sideways.
 */
function decode(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AvatarError('That file could not be read as a picture.'));
    };

    image.src = url;
  });
}

/**
 * A picked file as a small square data URL.
 *
 * Re-encoded rather than stored as picked, which is the whole point: a phone
 * photograph is three or four megabytes and this has to be ten kilobytes. WebP
 * first because it is about a third smaller than JPEG at this size, and JPEG
 * when the browser will not make one — `toDataURL` silently gives back a PNG
 * for a type it does not know, and a PNG of a photograph is enormous, so the
 * result is checked rather than assumed.
 */
export async function toAvatarDataUrl(file: Blob, pixels = AVATAR_PIXELS): Promise<string> {
  const image = await decode(file);
  const crop = squareCrop(image.naturalWidth, image.naturalHeight);
  if (crop.side === 0) throw new AvatarError('That picture has no size to it.');

  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;

  const context = canvas.getContext('2d');
  if (!context) throw new AvatarError('This browser would not give us a canvas to draw on.');

  context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, pixels, pixels);

  const types = canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? ['image/webp', 'image/jpeg']
    : ['image/jpeg'];

  for (const type of types) {
    for (const quality of QUALITIES) {
      const url = canvas.toDataURL(type, quality);
      if (withinBudget(url)) return url;
    }
  }

  // Everything tried and none of it fit. Not a real outcome for a 192px
  // square, and it is still better to say so than to store something that
  // takes the rest of the profile down with it.
  throw new AvatarError('That picture would not compress small enough to keep.');
}
