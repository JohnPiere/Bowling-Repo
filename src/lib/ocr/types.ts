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
  /**
   * How the sheet was read. 'per-frame' means the grid was found and each
   * frame was cropped and read on its own, which is markedly more reliable
   * than reading the whole sheet in one pass.
   */
  strategy?: 'per-frame' | 'whole-sheet';
  /** Frames that produced any marks, when read per-frame. */
  framesRead?: number;
  /**
   * Other bowlers found on the same sheet, if it carried more than one row.
   * A league sheet stacks four to six of them; the first is returned as
   * `text` and the rest live here for the bowler to choose from.
   */
  otherRows?: string[];
  /**
   * The running totals printed under the row, one per frame, where the sheet
   * prints them and they could be read.
   *
   * A sheet carries its own checksum: the marks say what was thrown and the
   * totals say what it came to, written by the same machine from the same
   * throw. Where the two agree the scan is worth trusting; where they do not,
   * the totals are usually the ones worth believing, because a column of
   * numbers is easier to read than a mark.
   */
  totals?: (number | null)[];
}

export interface ScoreSheetRecogniser {
  readonly name: string;
  recognise(image: Blob, onProgress?: (fraction: number) => void): Promise<RecognitionResult>;
  /** Release any workers or models held open. */
  dispose(): Promise<void>;
}

/** Below this, the scan is shown for correction rather than imported quietly. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;
