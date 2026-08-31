/**
 * On-device recognition with Tesseract.js.
 *
 * Runs entirely in the browser: no server, no API key, no per-scan cost, and
 * the photo never leaves the phone. The trade-off is accuracy on handwriting,
 * which is why every scan lands on a review screen before it is imported.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { preprocessForOcr } from './preprocess';
import type { RecognitionResult, ScoreSheetRecogniser } from './types';

/**
 * A score sheet only ever holds these characters. Constraining the alphabet is
 * the single biggest accuracy win available — it stops "X" being read as "K"
 * and "0" as "O", which the mark parser would then have to guess at.
 */
const SHEET_ALPHABET = 'X0123456789/-';

export class TesseractRecogniser implements ScoreSheetRecogniser {
  readonly name = 'On-device (Tesseract)';

  private worker: Worker | null = null;
  /** Held so concurrent scans share one warm-up rather than racing. */
  private starting: Promise<Worker> | null = null;

  private async ready(): Promise<Worker> {
    if (this.worker) return this.worker;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: SHEET_ALPHABET,
        // A sheet is a grid of short marks, not prose: treat the image as
        // sparse text so Tesseract stops trying to find sentences in it.
        tessedit_pageseg_mode: '11' as never,
        preserve_interword_spaces: '1',
      });
      this.worker = worker;
      return worker;
    })();

    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async recognise(
    image: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<RecognitionResult> {
    onProgress?.(0.05);
    const prepared = await preprocessForOcr(image);

    onProgress?.(0.25);
    const worker = await this.ready();

    onProgress?.(0.4);
    const { data } = await worker.recognize(prepared);

    onProgress?.(1);
    return {
      text: data.text ?? '',
      // Tesseract reports 0..100; the interface is 0..1.
      confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
    };
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }
}
