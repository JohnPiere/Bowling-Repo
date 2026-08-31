/**
 * Recogniser selection.
 *
 * One shared instance, because spinning up a Tesseract worker costs a few
 * seconds and a scan-review-rescan loop would otherwise pay it every time.
 */

import { TesseractRecogniser } from './tesseract';
import type { ScoreSheetRecogniser } from './types';

let instance: ScoreSheetRecogniser | null = null;

export function getRecogniser(): ScoreSheetRecogniser {
  if (!instance) instance = new TesseractRecogniser();
  return instance;
}

/** Swap in a different recogniser — a cloud one, or a fake in tests. */
export function setRecogniser(recogniser: ScoreSheetRecogniser): void {
  instance = recogniser;
}

export async function disposeRecogniser(): Promise<void> {
  await instance?.dispose();
  instance = null;
}

export * from './types';
