/**
 * Word Matching Algorithm
 * Ported from word-analyzer-v2 app.js
 * Key functions: calculateWordSimilarity, findBestAlignment, analyzePronunciation
 */

import { arePhoneticEquivalents } from '../data/phoneticEquivalences';
import { WordTiming } from './speechToText';

export type WordStatus = 'correct' | 'misread' | 'substituted' | 'skipped';

export interface AlignedWord {
  expected: string;
  spoken: string | null;
  status: WordStatus;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface MatchingResult {
  words: AlignedWord[];
  correctCount: number;
  errorCount: number;
  skipCount: number;
  substitutionCount: number;
  misreadCount: number;
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
 */
function calculateWordSimilarity(word1: string, word2: string): number {
  const w1 = normalizeWord(word1);
  const w2 = normalizeWord(word2);

  if (!w1 || !w2) return 0;

  // Exact match
  if (w1 === w2) return 1.0;

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
  const distance = levenshteinDistance(w1, w2);
  const maxLen = Math.max(w1.length, w2.length);
  const similarity = 1 - (distance / maxLen);

  // Bonus for same length
  const lengthBonus = w1.length === w2.length ? 0.1 : 0;

  return Math.min(1, similarity + lengthBonus);
}

/**
 * Check if word is a filler word
 */
function isFillerWord(word: string): boolean {
  const fillers = ['um', 'uh', 'er', 'ah', 'like', 'so', 'well'];
  return fillers.includes(normalizeWord(word));
}

/**
 * Main word matching function using dynamic programming alignment
 * Based on word-analyzer-v2 analyzePronunciation (lines 2015-2137)
 */
export function matchWords(
  expectedWords: string[],
  spokenWords: WordTiming[]
): MatchingResult {
  // Filter out filler words from spoken
  const cleanSpoken = spokenWords.filter(w => !isFillerWord(w.word));

  if (expectedWords.length === 0) {
    return {
      words: [],
      correctCount: 0,
      errorCount: 0,
      skipCount: 0,
      substitutionCount: 0,
      misreadCount: 0,
    };
  }

  if (cleanSpoken.length === 0) {
    // All words skipped
    return {
      words: expectedWords.map(word => ({
        expected: word,
        spoken: null,
        status: 'skipped' as WordStatus,
        startTime: 0,
        endTime: 0,
        confidence: 0,
      })),
      correctCount: 0,
      errorCount: expectedWords.length,
      skipCount: expectedWords.length,
      substitutionCount: 0,
      misreadCount: 0,
    };
  }

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
        const similarity = calculateWordSimilarity(expectedWords[i], cleanSpoken[j].word);
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
      alignment.unshift({
        expected: expectedWords[pi],
        spoken: cleanSpoken[pj].word,
        status: status as WordStatus,
        startTime: cleanSpoken[pj].startTime,
        endTime: cleanSpoken[pj].endTime,
        confidence: cleanSpoken[pj].confidence,
      });
      i = pi;
      j = pj;
    } else if (status === 'skipped') {
      alignment.unshift({
        expected: expectedWords[pi],
        spoken: null,
        status: 'skipped',
        startTime: 0,
        endTime: 0,
        confidence: 0,
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

  return {
    words: alignment,
    correctCount,
    errorCount: skipCount + substitutionCount + misreadCount,
    skipCount,
    substitutionCount,
    misreadCount,
  };
}
