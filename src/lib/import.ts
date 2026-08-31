/**
 * Turning a photo into a saved game.
 *
 * The pipeline is: recognise -> parse marks -> score -> hand back for review.
 * Nothing is written to the database here; the bowler confirms first, because
 * an OCR mistake that silently becomes a 300 game is worse than no import.
 */

import { getRecogniser, REVIEW_CONFIDENCE_THRESHOLD } from './ocr';
import { tryParseMarks, type ParsedSheet } from './marks';
import { scoreGame, type Scorecard } from './scoring';
import { saveGame, type Game } from './db';
import { shrinkForStorage } from './storage';

export interface ScanReview {
  /** What OCR read, kept so the bowler can see what the app saw. */
  rawText: string;
  confidence: number;
  /** How the sheet was read — see RecognitionResult. */
  strategy?: 'per-frame' | 'whole-sheet';
  /** True when the scan is clean enough that we are not second-guessing it. */
  isConfident: boolean;
  sheet: ParsedSheet | null;
  scorecard: Scorecard | null;
  /** Set when the marks could not be made into a game at all. */
  error: string | null;
  warnings: string[];
  image: Blob;
}

export async function scanScoreSheet(
  image: Blob,
  onProgress?: (fraction: number) => void,
): Promise<ScanReview> {
  const { text, confidence, strategy } = await getRecogniser().recognise(image, onProgress);
  const parsed = tryParseMarks(text);

  if ('error' in parsed) {
    return {
      rawText: text,
      confidence,
      strategy,
      isConfident: false,
      sheet: null,
      scorecard: null,
      error: parsed.error,
      warnings: [],
      image,
    };
  }

  const scorecard = scoreGame(parsed.rolls);
  const warnings = [...parsed.warnings];

  if (confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    warnings.unshift(
      `The scan was only ${Math.round(confidence * 100)}% clear — check each frame before saving.`,
    );
  }

  return {
    rawText: text,
    confidence,
    strategy,
    isConfident: confidence >= REVIEW_CONFIDENCE_THRESHOLD && parsed.warnings.length === 0,
    sheet: parsed,
    scorecard,
    error: null,
    warnings,
    image,
  };
}

/** Commit a reviewed scan, with whatever corrections the bowler made. */
export async function importScannedGame(
  rolls: number[],
  meta: {
    bowler: string;
    house?: string;
    playedAt?: number;
    sheetImage?: Blob;
    /** Drop the photo — the way out when the device is out of room. */
    keepPhoto?: boolean;
  },
): Promise<Game> {
  const scorecard = scoreGame(rolls);
  const keepPhoto = meta.keepPhoto ?? true;

  // A camera original is several megabytes; a season of them would fill the
  // origin's quota on its own, and nothing downstream needs that resolution.
  const sheetImage =
    keepPhoto && meta.sheetImage ? await shrinkForStorage(meta.sheetImage) : undefined;

  return saveGame({
    bowler: meta.bowler,
    house: meta.house,
    rolls,
    total: scorecard.total,
    isComplete: scorecard.isComplete,
    source: 'scan',
    sheetImage,
    playedAt: meta.playedAt ?? Date.now(),
  });
}
