/**
 * The contract between "a photo of a score sheet" and "a game we can import".
 *
 * Recognition is deliberately behind an interface. The on-device recogniser
 * ships first because it costs nothing, needs no server and keeps photos on the
 * phone; a cloud vision model reads messy handwriting far better and can be
 * dropped in here without the scan or import screens noticing.
 */

export interface RecognitionResult {
  /** Raw text as read off the sheet, before any bowling meaning is applied. */
  text: string;
  /** 0..1, how sure the recogniser is. Drives whether we warn before import. */
  confidence: number;
}

export interface ScoreSheetRecogniser {
  readonly name: string;
  recognise(image: Blob, onProgress?: (fraction: number) => void): Promise<RecognitionResult>;
  /** Release any workers or models held open. */
  dispose(): Promise<void>;
}

/** Below this, the scan is shown for correction rather than imported quietly. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;
