/**
 * Word Matching Algorithm
 * Ported from word-analyzer-v2 app.js
 * Key functions: calculateWordSimilarity, findBestAlignment, analyzePronunciation
 * Includes auto-detection of passage boundaries (first/last intended words)
 */

import { arePhoneticEquivalents } from '../data/phoneticEquivalences';
import { areNumberEquivalents } from '../data/numberEquivalences';
import { WordTiming } from './speechToText';

export type WordStatus = 'correct' | 'misread' | 'substituted' | 'skipped';

// Bounding box for word position on the image
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// OCR word with text and position
export interface OcrWordWithBox {
  text: string;
  boundingBox: BoundingBox;
}

export interface AlignedWord {
  expected: string;
  spoken: string | null;
  status: WordStatus;
  startTime: number;
  endTime: number;
  confidence: number;
  hesitation?: boolean;       // True if there was a significant pause before this word
  pauseDuration?: number;     // Duration of pause before this word in seconds
  isRepeat?: boolean;         // True if this word was repeated (stutter)
  isSelfCorrection?: boolean; // True if student self-corrected (said wrong word, then fixed it)
  isFillerWord?: boolean;     // True if a filler word was detected near this position
  boundingBox?: BoundingBox;  // Position of word on the image
}

export interface MatchingResult {
  words: AlignedWord[];
  correctCount: number;
  errorCount: number;
  skipCount: number;
  substitutionCount: number;
  misreadCount: number;
  hesitationCount: number;      // Number of significant pauses detected
  fillerWordCount: number;      // Number of filler words (um, uh, etc)
  repeatCount: number;          // Number of repeated words (stutters)
  selfCorrectionCount: number;  // Number of self-corrections (positive indicator)
}

/**
 * OCR character confusions - machine errors that should not penalize students
 * These are common OCR misreadings that look similar visually
 * Format: [OCR might read, actual character]
 */
const OCR_CONFUSIONS: Array<[string, string]> = [
  // Digit/letter confusions
  ['0', 'o'],   // zero ↔ letter o
  ['1', 'l'],   // one ↔ lowercase L
  ['1', 'i'],   // one ↔ letter i
  ['5', 's'],   // five ↔ letter s
  ['8', 'b'],   // eight ↔ letter b
  ['6', 'g'],   // six ↔ letter g
  // Letter combination confusions
  ['rn', 'm'],  // r+n looks like m
  ['cl', 'd'],  // c+l looks like d
  ['vv', 'w'],  // v+v looks like w
  ['li', 'h'],  // l+i can look like h
  ['ii', 'u'],  // i+i can look like u
  // Similar letter confusions
  ['c', 'e'],   // c ↔ e (open c)
  ['n', 'h'],   // n ↔ h
];

/**
 * Normalize OCR confusions in a word
 * Converts common OCR misreadings to their likely intended characters
 * This prevents false errors when OCR misreads the source text
 */
function normalizeOcrConfusions(word: string): string {
  let normalized = word.toLowerCase();

  // Apply OCR confusion normalization (prefer the second character in each pair)
  for (const [ocrChar, actualChar] of OCR_CONFUSIONS) {
    // Replace OCR confusion with the "actual" character for comparison
    normalized = normalized.replace(new RegExp(ocrChar, 'g'), actualChar);
  }

  return normalized;
}

/**
 * Normalize word for matching
 * - Lowercase
 * - Remove punctuation
 * - Expand contractions
 */
function normalizeWord(word: string): string {
  let normalized = word.toLowerCase().replace(/[^a-z0-9']/g, '');

  // Expand contractions
  const contractions: Record<string, string> = {
    "n't": ' not',
    "'re": ' are',
    "'ve": ' have',
    "'ll": ' will',
    "'d": ' would',
    "'m": ' am',
    "'s": '', // possessive or is - remove
  };

  for (const [contraction, expansion] of Object.entries(contractions)) {
    normalized = normalized.replace(contraction, expansion);
  }

  return normalized.trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity between two words (0-1)
 * Based on word-analyzer-v2 calculateWordSimilarity (lines 1510-1546)
 *
 * Enhanced with:
 * - OCR confusion handling (rn→m, 0→o, etc.) to prevent false errors from machine mistakes
 * - Number equivalence (fifteen = 15)
 * - Phonetic equivalence (homophones)
 */
function calculateWordSimilarity(word1: string, word2: string): number {
  const w1 = normalizeWord(word1);
  const w2 = normalizeWord(word2);

  if (!w1 || !w2) return 0;

  // Exact match
  if (w1 === w2) return 1.0;

  // OCR confusion check - handle machine OCR errors
  // Normalize both words for OCR confusions and compare
  const w1Ocr = normalizeOcrConfusions(w1);
  const w2Ocr = normalizeOcrConfusions(w2);
  if (w1Ocr === w2Ocr) {
    // Words match when OCR confusions are normalized - this is a machine error, not student error
    return 1.0;
  }

  // Number equivalents (e.g., "fifteen" = "15", "first" = "1st")
  // Check this BEFORE phonetic equivalents since numbers are a special case
  if (areNumberEquivalents(word1, word2)) return 1.0;

  // Phonetic equivalents
  if (arePhoneticEquivalents(w1, w2)) return 0.95;

  // Prefix matching (same first 3+ characters)
  const minLen = Math.min(w1.length, w2.length);
  if (minLen >= 3) {
    const prefixLen = Math.min(3, minLen);
    if (w1.substring(0, prefixLen) === w2.substring(0, prefixLen)) {
      const lengthRatio = Math.min(w1.length, w2.length) / Math.max(w1.length, w2.length);
      return 0.6 + (0.35 * lengthRatio);
    }
  }

  // Levenshtein-based similarity
  // Also check OCR-normalized Levenshtein for better matching
  const distance = levenshteinDistance(w1, w2);
  const ocrDistance = levenshteinDistance(w1Ocr, w2Ocr);
  const bestDistance = Math.min(distance, ocrDistance); // Use better match

  const maxLen = Math.max(w1.length, w2.length);
  const similarity = 1 - (bestDistance / maxLen);

  // Bonus for same length
  const lengthBonus = w1.length === w2.length ? 0.1 : 0;

  return Math.min(1, similarity + lengthBonus);
}

/**
 * Check if word is a filler word
 */
function isFillerWord(word: string): boolean {
  const fillers = ['um', 'uh', 'er', 'ah', 'like', 'so', 'well', 'hmm', 'mm', 'erm'];
  return fillers.includes(normalizeWord(word));
}

/**
 * Hesitation threshold in seconds
 * Based on word-analyzer-v2 detectHesitation function
 * A pause > 0.5 seconds between words indicates hesitation
 */
const HESITATION_THRESHOLD = 0.5;

/**
 * Pattern to detect punctuation at the end of a word that indicates a natural pause
 * Includes: . , ; : ! ? - — –
 * Does NOT include: apostrophe ('), quotation marks (used in contractions/possessives)
 */
const NATURAL_PAUSE_PUNCTUATION = /[.,;:!?\-—–]$/;

/**
 * Detect if there's a hesitation (significant pause) before a word
 * Based on word-analyzer-v2 detectHesitation (lines 2004-2012)
 *
 * @param currentWord Current word timing info
 * @param previousWord Previous word timing info
 * @returns Object with hesitation detected flag and pause duration
 */
function detectHesitation(
  currentWord: WordTiming,
  previousWord: WordTiming | null
): { hesitation: boolean; pauseDuration: number } {
  if (!previousWord) {
    return { hesitation: false, pauseDuration: 0 };
  }

  const currentStart = currentWord.startTime;
  const previousEnd = previousWord.endTime;

  const pauseDuration = currentStart - previousEnd;
  const hesitation = pauseDuration > HESITATION_THRESHOLD;

  return { hesitation, pauseDuration };
}

/**
 * Result of repeat/self-correction detection
 */
interface RepeatDetectionResult {
  repeatedIndices: Set<number>;      // Indices of repeated/stuttered words
  selfCorrectionIndices: Set<number>; // Indices where student self-corrected
}

/**
 * Detect repeated words and self-corrections in the spoken word sequence
 *
 * Stutters: Same or very similar word repeated (error pattern)
 *   - "the the quick" → "the" at index 1 is a stutter
 *
 * Self-corrections: Different word followed by a correction attempt (positive indicator)
 *   - "house... home" where student changed their answer mid-word
 *   - Detected when consecutive words share a prefix but are different
 *
 * @param spokenWords Array of spoken word timings
 * @returns Object with sets of repeated and self-corrected word indices
 */
function detectRepeatedWords(spokenWords: WordTiming[]): RepeatDetectionResult {
  const repeatedIndices = new Set<number>();
  const selfCorrectionIndices = new Set<number>();

  for (let i = 1; i < spokenWords.length; i++) {
    const current = normalizeWord(spokenWords[i].word);
    const previous = normalizeWord(spokenWords[i - 1].word);

    if (!current || !previous) continue;

    // Check if current word is an exact repeat of the previous word (stutter)
    if (current === previous) {
      repeatedIndices.add(i);
      continue;
    }

    // Check for very similar words (partial repeats/stutters OR self-corrections)
    if (current.length >= 2 && previous.length >= 2) {
      const minLen = Math.min(current.length, previous.length);
      const currentPrefix = current.substring(0, Math.min(3, minLen));
      const previousPrefix = previous.substring(0, Math.min(3, minLen));

      // Words share a prefix (student started the same way)
      if (currentPrefix === previousPrefix || previous.startsWith(currentPrefix) || current.startsWith(previousPrefix)) {
        const similarity = calculateWordSimilarity(current, previous);

        if (similarity >= 0.85) {
          // Very similar - this is a stutter/repeat
          repeatedIndices.add(i);
        } else if (similarity >= 0.4 && similarity < 0.85) {
          // Moderately similar with same prefix - likely a self-correction
          // Student started saying one word, then changed to another
          // e.g., "thr-... three" or "house... home" or "wen-... went"
          selfCorrectionIndices.add(i);
          console.log(`Self-correction detected: "${previous}" → "${current}" (similarity: ${similarity.toFixed(2)})`);
        }
      }

      // Also check for self-corrections where student abandons mid-word
      // Detected by a very short previous word that's a prefix of current
      if (previous.length <= 3 && current.startsWith(previous)) {
        // Previous was likely an abandoned attempt: "th" → "three"
        selfCorrectionIndices.add(i);
        console.log(`Self-correction (abandoned start): "${previous}" → "${current}"`);
      }
    }

    // Check for quick succession (words spoken rapidly = possible correction)
    const timeBetween = spokenWords[i].startTime - spokenWords[i - 1].endTime;
    if (timeBetween < 0.2 && timeBetween >= 0) {
      // Very quick follow-up - might be a correction
      // Only flag as self-correction if words are somewhat different
      const similarity = calculateWordSimilarity(current, previous);
      if (similarity >= 0.3 && similarity < 0.7) {
        // Different enough to not be a stutter, similar enough to be related
        if (!repeatedIndices.has(i) && !selfCorrectionIndices.has(i)) {
          selfCorrectionIndices.add(i);
          console.log(`Self-correction (quick follow-up): "${previous}" → "${current}" (${timeBetween.toFixed(2)}s gap)`);
        }
      }
    }
  }

  return { repeatedIndices, selfCorrectionIndices };
}

/**
 * Build similarity matrix between spoken and OCR words
 */
function buildSimilarityMatrix(spoken: string[], ocr: string[]): number[][] {
  const matrix: number[][] = [];
  for (let s = 0; s < spoken.length; s++) {
    matrix[s] = [];
    for (let o = 0; o < ocr.length; o++) {
      matrix[s][o] = calculateWordSimilarity(spoken[s], ocr[o]);
    }
  }
  return matrix;
}

/**
 * Find where in the OCR text the student started and stopped reading
 * Uses dynamic programming alignment to find best matching range
 * Based on word-analyzer-v2 findSpokenRangeInOCR and findBestAlignment
 */
function findSpokenRangeInOCR(
  spokenWords: string[],
  ocrWords: OcrWordWithBox[]
): { firstIndex: number; lastIndex: number; matchedCount: number } {
  // Clean spoken words
  const cleanSpoken = spokenWords
    .filter(w => w && !isFillerWord(w))
    .map(w => normalizeWord(w))
    .filter(w => w.length > 0);

  // Clean OCR words (extract text)
  const cleanOCR = ocrWords.map(w => normalizeWord(w.text));

  if (cleanSpoken.length === 0 || cleanOCR.length === 0) {
    return { firstIndex: 0, lastIndex: ocrWords.length - 1, matchedCount: 0 };
  }

  const similarityMatrix = buildSimilarityMatrix(cleanSpoken, cleanOCR);

  const m = cleanSpoken.length;
  const n = cleanOCR.length;

  const MATCH_THRESHOLD = 0.55;
  const SKIP_PENALTY = 0.3;
  const GAP_PENALTY = 0.4;

  let bestScore = 0;
  let bestEndOCR = -1;
  let bestStartOCR = -1;
  let bestMatchCount = 0;

  // Try different starting positions in OCR
  for (let startOCR = 0; startOCR < n; startOCR++) {
    interface DPState {
      score: number;
      matchCount: number;
      lastOCR: number;
      firstOCR: number;
    }

    const dp: DPState[] = new Array(m + 1).fill(null).map(() => ({
      score: 0,
      matchCount: 0,
      lastOCR: startOCR - 1,
      firstOCR: -1
    }));

    for (let s = 0; s < m; s++) {
      const prevState = dp[s];

      for (let o = prevState.lastOCR + 1; o < n; o++) {
        const sim = similarityMatrix[s][o];

        if (sim >= MATCH_THRESHOLD) {
          const skippedOCR = o - prevState.lastOCR - 1;
          const skipPenalty = skippedOCR * SKIP_PENALTY;
          const newScore = prevState.score + sim - skipPenalty;

          if (newScore > dp[s + 1].score) {
            dp[s + 1] = {
              score: newScore,
              matchCount: prevState.matchCount + 1,
              lastOCR: o,
              firstOCR: prevState.firstOCR === -1 ? o : prevState.firstOCR
            };
          }
        }
      }

      // Allow skipping spoken words
      if (dp[s].score - GAP_PENALTY > dp[s + 1].score) {
        dp[s + 1] = {
          score: dp[s].score - GAP_PENALTY,
          matchCount: dp[s].matchCount,
          lastOCR: dp[s].lastOCR,
          firstOCR: dp[s].firstOCR
        };
      }
    }

    const finalState = dp[m];
    if (finalState.matchCount >= 2 && finalState.score > bestScore) {
      bestScore = finalState.score;
      bestEndOCR = finalState.lastOCR;
      bestStartOCR = finalState.firstOCR;
      bestMatchCount = finalState.matchCount;
    }
  }

  // If no good alignment found, use fallback: full OCR range
  if (bestStartOCR === -1 || bestEndOCR === -1) {
    console.log('Passage detection: No clear match found, using full OCR text');
    return { firstIndex: 0, lastIndex: ocrWords.length - 1, matchedCount: 0 };
  }

  console.log(`Passage detection: words ${bestStartOCR} to ${bestEndOCR} (${bestMatchCount} matched)`);
  return {
    firstIndex: bestStartOCR,
    lastIndex: bestEndOCR,
    matchedCount: bestMatchCount
  };
}

/**
 * Main word matching function using dynamic programming alignment
 * Based on word-analyzer-v2 analyzePronunciation (lines 2015-2137)
 *
 * First detects passage boundaries (which OCR words the student was trying to read)
 * Then matches spoken words to expected words within that range
 * Includes hesitation detection, filler word tracking, and repeated word detection
 */
export function matchWords(
  ocrWords: OcrWordWithBox[],
  spokenWords: WordTiming[]
): MatchingResult {
  // Count filler words BEFORE filtering
  const fillerWordCount = spokenWords.filter(w => isFillerWord(w.word)).length;
  console.log(`Detected ${fillerWordCount} filler words`);

  // Filter out filler words from spoken for matching
  const cleanSpoken = spokenWords.filter(w => !isFillerWord(w.word));

  // Detect repeated words and self-corrections in clean spoken words
  const { repeatedIndices, selfCorrectionIndices } = detectRepeatedWords(cleanSpoken);
  const repeatCount = repeatedIndices.size;
  const selfCorrectionCount = selfCorrectionIndices.size;
  console.log(`Detected ${repeatCount} repeated words, ${selfCorrectionCount} self-corrections`);

  // Build hesitation map for clean spoken words
  const hesitationMap = new Map<number, { hesitation: boolean; pauseDuration: number }>();
  for (let i = 0; i < cleanSpoken.length; i++) {
    const prevWord = i > 0 ? cleanSpoken[i - 1] : null;
    hesitationMap.set(i, detectHesitation(cleanSpoken[i], prevWord));
  }
  const hesitationCount = Array.from(hesitationMap.values()).filter(h => h.hesitation).length;
  console.log(`Detected ${hesitationCount} hesitations`);

  if (ocrWords.length === 0) {
    return {
      words: [],
      correctCount: 0,
      errorCount: 0,
      skipCount: 0,
      substitutionCount: 0,
      misreadCount: 0,
      hesitationCount: 0,
      fillerWordCount,
      repeatCount: 0,
      selfCorrectionCount: 0,
    };
  }

  if (cleanSpoken.length === 0) {
    // All words skipped - but we don't know which ones were intended
    // Return empty since we can't determine passage without spoken words
    return {
      words: [],
      correctCount: 0,
      errorCount: 0,
      skipCount: 0,
      substitutionCount: 0,
      misreadCount: 0,
      hesitationCount: 0,
      fillerWordCount,
      repeatCount: 0,
      selfCorrectionCount: 0,
    };
  }

  // STEP 1: Auto-detect passage boundaries
  // Find which OCR words the student was trying to read
  const spokenWordStrings = cleanSpoken.map(w => w.word);
  const passageRange = findSpokenRangeInOCR(spokenWordStrings, ocrWords);

  // Extract the expected words with bounding boxes (the passage the student was reading)
  const expectedWords = ocrWords.slice(passageRange.firstIndex, passageRange.lastIndex + 1);

  console.log(`Detected passage: ${expectedWords.length} words (OCR indices ${passageRange.firstIndex}-${passageRange.lastIndex})`);
  console.log(`First expected: "${expectedWords[0]?.text}", Last expected: "${expectedWords[expectedWords.length - 1]?.text}"`);

  const m = expectedWords.length;
  const n = cleanSpoken.length;

  // DP table: dp[i][j] = best score aligning expected[0..i-1] with spoken[0..j-1]
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(-Infinity));
  const parent: [number, number, string][][] = Array(m + 1).fill(null).map(() =>
    Array(n + 1).fill(null).map(() => [-1, -1, ''] as [number, number, string])
  );

  dp[0][0] = 0;

  // Fill DP table
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (dp[i][j] === -Infinity) continue;

      // Option 1: Match expected[i] with spoken[j]
      if (i < m && j < n) {
        const similarity = calculateWordSimilarity(expectedWords[i].text, cleanSpoken[j].word);
        let score: number;
        let status: string;

        if (similarity >= 0.95) {
          score = 1.0;
          status = 'correct';
        } else if (similarity >= 0.7) {
          score = 0.5;
          status = 'misread';
        } else if (similarity >= 0.4) {
          score = 0.2;
          status = 'substituted';
        } else {
          score = -0.5;
          status = 'substituted';
        }

        if (dp[i][j] + score > dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = dp[i][j] + score;
          parent[i + 1][j + 1] = [i, j, status];
        }
      }

      // Option 2: Skip expected word (not spoken)
      if (i < m) {
        const skipPenalty = -1.0;
        if (dp[i][j] + skipPenalty > dp[i + 1][j]) {
          dp[i + 1][j] = dp[i][j] + skipPenalty;
          parent[i + 1][j] = [i, j, 'skipped'];
        }
      }

      // Option 3: Extra spoken word (insertion) - skip it
      if (j < n) {
        const insertPenalty = -0.3;
        if (dp[i][j] + insertPenalty > dp[i][j + 1]) {
          dp[i][j + 1] = dp[i][j] + insertPenalty;
          parent[i][j + 1] = [i, j, 'extra'];
        }
      }
    }
  }

  // Backtrack to find alignment
  const alignment: AlignedWord[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    const [pi, pj, status] = parent[i][j];

    if (pi === -1 && pj === -1) break;

    if (status === 'correct' || status === 'misread' || status === 'substituted') {
      // Get hesitation info for this spoken word
      const hesitationInfo = hesitationMap.get(pj) || { hesitation: false, pauseDuration: 0 };
      const isRepeat = repeatedIndices.has(pj);

      // Filter out hesitations after punctuation (natural pauses)
      // If this word follows a word ending with punctuation, the pause is natural
      let adjustedHesitation = hesitationInfo.hesitation;

      // Check if the expected word BEFORE current (pi-1) ends with punctuation
      // A pause after punctuation is natural and shouldn't count as hesitation
      if (adjustedHesitation && pi > 0) {
        const previousExpectedText = expectedWords[pi - 1].text;
        if (NATURAL_PAUSE_PUNCTUATION.test(previousExpectedText)) {
          adjustedHesitation = false; // Natural pause after punctuation
          console.log(`Filtered hesitation after punctuation: "${previousExpectedText}" → "${expectedWords[pi].text}"`);
        }
      }

      // Check if this is a self-correction
      const isSelfCorrection = selfCorrectionIndices.has(pj);

      alignment.unshift({
        expected: expectedWords[pi].text,
        spoken: cleanSpoken[pj].word,
        status: status as WordStatus,
        startTime: cleanSpoken[pj].startTime,
        endTime: cleanSpoken[pj].endTime,
        confidence: cleanSpoken[pj].confidence,
        hesitation: adjustedHesitation,
        pauseDuration: hesitationInfo.pauseDuration,
        isRepeat,
        isSelfCorrection,
        boundingBox: expectedWords[pi].boundingBox,
      });
      i = pi;
      j = pj;
    } else if (status === 'skipped') {
      alignment.unshift({
        expected: expectedWords[pi].text,
        spoken: null,
        status: 'skipped',
        startTime: 0,
        endTime: 0,
        confidence: 0,
        hesitation: false,
        pauseDuration: 0,
        isRepeat: false,
        boundingBox: expectedWords[pi].boundingBox,
      });
      i = pi;
    } else if (status === 'extra') {
      // Extra spoken word - skip it in output
      j = pj;
    } else {
      break;
    }
  }

  // Count results
  let correctCount = 0;
  let skipCount = 0;
  let substitutionCount = 0;
  let misreadCount = 0;

  for (const word of alignment) {
    switch (word.status) {
      case 'correct':
        correctCount++;
        break;
      case 'skipped':
        skipCount++;
        break;
      case 'substituted':
        substitutionCount++;
        break;
      case 'misread':
        misreadCount++;
        break;
    }
  }

  // Count hesitations, repeats, and self-corrections in the final alignment
  const alignmentHesitationCount = alignment.filter(w => w.hesitation).length;
  const alignmentRepeatCount = alignment.filter(w => w.isRepeat).length;
  const alignmentSelfCorrectionCount = alignment.filter(w => w.isSelfCorrection).length;

  return {
    words: alignment,
    correctCount,
    errorCount: skipCount + substitutionCount + misreadCount,
    skipCount,
    substitutionCount,
    misreadCount,
    hesitationCount: alignmentHesitationCount,
    fillerWordCount,
    repeatCount: alignmentRepeatCount,
    selfCorrectionCount: alignmentSelfCorrectionCount,
  };
}
