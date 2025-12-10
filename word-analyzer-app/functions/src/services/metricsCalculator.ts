/**
 * Metrics Calculator
 * Calculates accuracy, WPM, prosody score, and error patterns
 * Ported from word-analyzer-v2 calculateProsodyMetrics (lines 2249-2281)
 */

import { AlignedWord, MatchingResult } from './wordMatching';

export interface Metrics {
  accuracy: number;
  wordsPerMinute: number;
  prosodyScore: number;
  prosodyGrade: string;
  totalWords: number;
  correctCount: number;
  errorCount: number;
  skipCount: number;
}

export interface ErrorPattern {
  type: 'substitution' | 'phonetic' | 'initial_sound' | 'final_sound' | 'visual_similarity';
  pattern: string;
  examples: Array<{ expected: string; spoken: string }>;
  count: number;
}

/**
 * Calculate all metrics from matching result
 */
export function calculateMetrics(
  matchingResult: MatchingResult,
  audioDuration: number
): Metrics {
  const { words, correctCount, errorCount, skipCount } = matchingResult;
  const totalWords = words.length;

  // Accuracy percentage
  const accuracy = totalWords > 0
    ? Math.round((correctCount / totalWords) * 100)
    : 0;

  // Words per minute
  const wordsRead = correctCount + matchingResult.misreadCount + matchingResult.substitutionCount;
  const minutesElapsed = audioDuration / 60;
  const wordsPerMinute = minutesElapsed > 0
    ? Math.round(wordsRead / minutesElapsed)
    : 0;

  // Prosody score calculation (from word-analyzer-v2 lines 2249-2281)
  // Component 1: Accuracy points (40% weight)
  let accuracyPoints: number;
  if (accuracy >= 98) accuracyPoints = 4;
  else if (accuracy >= 95) accuracyPoints = 3.5;
  else if (accuracy >= 90) accuracyPoints = 3;
  else if (accuracy >= 85) accuracyPoints = 2.5;
  else if (accuracy >= 75) accuracyPoints = 2;
  else accuracyPoints = 1.5;

  // Component 2: Rate points (30% weight)
  let ratePoints: number;
  if (wordsPerMinute >= 100 && wordsPerMinute <= 180) ratePoints = 4;
  else if (wordsPerMinute >= 80 && wordsPerMinute <= 200) ratePoints = 3.5;
  else if (wordsPerMinute >= 60 && wordsPerMinute <= 220) ratePoints = 3;
  else ratePoints = 2;

  // Component 3: Fluency points (30% weight)
  const errorRate = totalWords > 0 ? errorCount / totalWords : 0;
  let fluencyPoints: number;
  if (errorRate <= 0.02) fluencyPoints = 4;
  else if (errorRate <= 0.05) fluencyPoints = 3.5;
  else if (errorRate <= 0.10) fluencyPoints = 3;
  else if (errorRate <= 0.20) fluencyPoints = 2.5;
  else fluencyPoints = 2;

  // Final prosody score
  const prosodyScore = Math.round(
    (accuracyPoints * 0.4 + ratePoints * 0.3 + fluencyPoints * 0.3) * 10
  ) / 10;

  // Grade assignment
  let prosodyGrade: string;
  if (prosodyScore >= 3.8) prosodyGrade = 'Excellent';
  else if (prosodyScore >= 3.0) prosodyGrade = 'Proficient';
  else if (prosodyScore >= 2.0) prosodyGrade = 'Developing';
  else prosodyGrade = 'Needs Support';

  return {
    accuracy,
    wordsPerMinute,
    prosodyScore,
    prosodyGrade,
    totalWords,
    correctCount,
    errorCount,
    skipCount,
  };
}

/**
 * Analyze error patterns
 * Based on word-analyzer-v2 analyzeErrorPatterns (lines 2140-2165)
 */
export function analyzeErrorPatterns(words: AlignedWord[]): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];
  const patternMap = new Map<string, ErrorPattern>();

  for (const word of words) {
    if (word.status === 'correct' || !word.spoken) continue;

    const expected = word.expected.toLowerCase();
    const spoken = word.spoken.toLowerCase();

    // Initial sound errors
    if (expected[0] !== spoken[0]) {
      const key = 'initial_sound';
      const existing = patternMap.get(key);
      if (existing) {
        existing.examples.push({ expected: word.expected, spoken: word.spoken });
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'initial_sound',
          pattern: 'Initial consonant substitution',
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }

    // Final sound errors
    if (expected[expected.length - 1] !== spoken[spoken.length - 1]) {
      const key = 'final_sound';
      const existing = patternMap.get(key);
      if (existing) {
        existing.examples.push({ expected: word.expected, spoken: word.spoken });
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'final_sound',
          pattern: 'Final sound error',
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }

    // Visual similarity (b/d, p/q, m/n, u/n)
    const visualPairs = [['b', 'd'], ['p', 'q'], ['m', 'n'], ['u', 'n']];
    for (const [a, b] of visualPairs) {
      if ((expected.includes(a) && spoken.includes(b)) ||
          (expected.includes(b) && spoken.includes(a))) {
        const key = `visual_${a}_${b}`;
        const existing = patternMap.get(key);
        if (existing) {
          existing.examples.push({ expected: word.expected, spoken: word.spoken });
          existing.count++;
        } else {
          patternMap.set(key, {
            type: 'visual_similarity',
            pattern: `Visual confusion: ${a}/${b}`,
            examples: [{ expected: word.expected, spoken: word.spoken }],
            count: 1,
          });
        }
      }
    }

    // Substitution tracking
    if (word.status === 'substituted') {
      const key = `sub_${expected}_${spoken}`;
      const existing = patternMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'substitution',
          pattern: `"${word.expected}" → "${word.spoken}"`,
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }
  }

  // Convert map to array and sort by count
  for (const pattern of patternMap.values()) {
    patterns.push(pattern);
  }

  return patterns.sort((a, b) => b.count - a.count);
}
