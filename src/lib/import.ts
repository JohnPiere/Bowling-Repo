/**
 * Turning a photo into a saved game.
 *
 * The pipeline is: recognise -> parse marks -> score -> hand back for review.
 * Nothing is written to the database here; the bowler confirms first, because
 * an OCR mistake that silently becomes a 300 game is worse than no import.
 */

import { getRecogniser, REVIEW_CONFIDENCE_THRESHOLD } from './ocr';
import { tryParseMarks, type ParsedSheet } from './marks';
import { checkAgainstTotals, cleanTotals, repairFrames } from './reconcile';
import { scoreGame, type Scorecard } from './scoring';
import { saveGame, type Game } from './db';
import { shrinkForStorage } from './storage';

export interface ScanReview {
  /** What OCR read, kept so the bowler can see what the app saw. */
  rawText: string;
  confidence: number;
  /** How the sheet was read — see RecognitionResult. */
  strategy?: 'per-frame' | 'whole-sheet';
  /**
   * Other bowlers' rows found on the same sheet. A league sheet stacks
   * several, and only the bowler can say which one is theirs.
   */
  otherRows?: string[];
  /** True when the scan is clean enough that we are not second-guessing it. */
  isConfident: boolean;
  /**
   * True when the game matches every running total printed on the sheet. That
   * is a stronger thing than a confident read: two independent records of the
   * same game, agreeing.
   */
  matchesSheet: boolean;
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
  const read = await getRecogniser().recognise(image, onProgress);
  const { confidence, strategy, otherRows } = read;

  // The sheet's own running totals, where it prints them and they read.
  const totals = cleanTotals(read.totals ?? []);
  const { text, repaired } = fillFromTotals(read.text, totals);

  const parsed = tryParseMarks(text);

  if ('error' in parsed) {
    return {
      rawText: text,
      confidence,
      strategy,
      otherRows,
      isConfident: false,
      matchesSheet: false,
      sheet: null,
      scorecard: null,
      error: parsed.error,
      warnings: [],
      image,
    };
  }

  const scorecard = scoreGame(parsed.rolls);
  const warnings = [...parsed.warnings];

  const check = checkAgainstTotals(parsed.rolls, totals);
  // A game still waiting on its bonus balls has no total to compare in the
  // tenth, so agreeing everywhere else does not mean the sheet was read.
  const matchesSheet = check.agree >= 5 && check.differ === 0 && scorecard.isComplete;

  if (repaired.length > 0) {
    warnings.push(
      repaired.length === 1
        ? `Frame ${repaired[0] + 1} was filled in from the running total printed on the sheet.`
        : `Frames ${repaired.map((i) => i + 1).join(', ')} were filled in from the running totals printed on the sheet.`,
    );
  }

  if (check.differ > 0) {
    warnings.unshift(
      `This does not add up to the totals printed on the sheet — from frame ${check.firstWrong} on. Check those frames.`,
    );
  }

  // Only when there is nothing better to go on: a game that agrees with every
  // printed total has been checked, and how clear the photograph was stops
  // being the interesting question.
  if (!matchesSheet && confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    warnings.unshift(
      `The scan was only ${Math.round(confidence * 100)}% clear — check each frame before saving.`,
    );
  }

  if (otherRows && otherRows.length > 0) {
    warnings.push(
      `This sheet has ${otherRows.length + 1} bowlers on it. The row nearest the middle of the photo is shown — pick yours below if it is not.`,
    );
  }

  return {
    rawText: text,
    confidence,
    strategy,
    otherRows,
    // Agreeing with the sheet's own totals is worth more than the recogniser's
    // opinion of itself, and stands in for it.
    isConfident:
      matchesSheet || (confidence >= REVIEW_CONFIDENCE_THRESHOLD && parsed.warnings.length === 0),
    matchesSheet,
    sheet: parsed,
    scorecard,
    error: null,
    warnings,
    image,
  };
}

/**
 * Fill in frames the recogniser read short, using the totals beside them.
 *
 * Done on the mark text rather than on a parsed game, because a sheet that is
 * missing a ball often will not parse at all — and the whole point is to
 * recover the ball before anything gives up on it.
 */
function fillFromTotals(
  text: string,
  totals: (number | null)[],
): { text: string; repaired: number[] } {
  if (totals.every((total) => total === null)) return { text, repaired: [] };

  const frames = text
    .trim()
    .split(/\s+/)
    .map((frame) => frame.split(''));

  const { frames: filled, repaired } = repairFrames(frames, totals);
  if (repaired.length === 0) return { text, repaired };

  return { text: filled.map((frame) => frame.join('')).join(' '), repaired };
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
