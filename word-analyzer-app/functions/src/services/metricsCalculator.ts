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
  hesitationCount: number;   // Number of significant pauses (> 0.5s)
  fillerWordCount: number;   // Number of filler words (um, uh, etc)
  repeatCount: number;       // Number of repeated words
}

export type ErrorPatternType =
  | 'substitution'
  | 'phonetic'
  | 'initial_sound'
  | 'final_sound'
  | 'visual_similarity'
  | 'hesitation'        // Significant pauses before words
  | 'repetition'        // Repeated words
  | 'filler_word'       // Um, uh, er, etc
  | 'omission'          // Sounds/syllables omitted
  | 'addition'          // Extra sounds/syllables added
  | 'word_length';      // Errors on long/short words

export interface ErrorPattern {
  type: ErrorPatternType;
  pattern: string;
  examples: Array<{ expected: string; spoken: string }>;
  count: number;
}

/**
 * Calculate all metrics from matching result
 * Now includes hesitation in prosody calculation
 */
export function calculateMetrics(
  matchingResult: MatchingResult,
  audioDuration: number
): Metrics {
  const {
    words,
    correctCount,
    errorCount,
    skipCount,
    hesitationCount,
    fillerWordCount,
    repeatCount
  } = matchingResult;
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
  // NOW INCLUDES HESITATION PENALTY

  // Component 1: Accuracy points (35% weight - reduced from 40% to make room for hesitation)
  let accuracyPoints: number;
  if (accuracy >= 98) accuracyPoints = 4;
  else if (accuracy >= 95) accuracyPoints = 3.5;
  else if (accuracy >= 90) accuracyPoints = 3;
  else if (accuracy >= 85) accuracyPoints = 2.5;
  else if (accuracy >= 75) accuracyPoints = 2;
  else accuracyPoints = 1.5;

  // Component 2: Rate points (25% weight - reduced from 30%)
  let ratePoints: number;
  if (wordsPerMinute >= 100 && wordsPerMinute <= 180) ratePoints = 4;
  else if (wordsPerMinute >= 80 && wordsPerMinute <= 200) ratePoints = 3.5;
  else if (wordsPerMinute >= 60 && wordsPerMinute <= 220) ratePoints = 3;
  else ratePoints = 2;

  // Component 3: Fluency points (25% weight - reduced from 30%)
  const errorRate = totalWords > 0 ? errorCount / totalWords : 0;
  let fluencyPoints: number;
  if (errorRate <= 0.02) fluencyPoints = 4;
  else if (errorRate <= 0.05) fluencyPoints = 3.5;
  else if (errorRate <= 0.10) fluencyPoints = 3;
  else if (errorRate <= 0.20) fluencyPoints = 2.5;
  else fluencyPoints = 2;

  // Component 4: Smoothness points (15% weight - NEW for hesitation)
  // Based on hesitation rate, filler words, and repetitions
  const hesitationRate = totalWords > 0 ? hesitationCount / totalWords : 0;
  const fillerRate = totalWords > 0 ? fillerWordCount / totalWords : 0;
  const repeatRate = totalWords > 0 ? repeatCount / totalWords : 0;
  const disfluencyRate = hesitationRate + fillerRate + repeatRate;

  let smoothnessPoints: number;
  if (disfluencyRate <= 0.02) smoothnessPoints = 4;       // Very smooth reading
  else if (disfluencyRate <= 0.05) smoothnessPoints = 3.5; // Smooth with occasional pause
  else if (disfluencyRate <= 0.10) smoothnessPoints = 3;   // Some hesitation
  else if (disfluencyRate <= 0.20) smoothnessPoints = 2.5; // Noticeable hesitation
  else if (disfluencyRate <= 0.30) smoothnessPoints = 2;   // Frequent hesitation
  else smoothnessPoints = 1.5;                              // Very choppy reading

  // Final prosody score (weights: 35% accuracy + 25% rate + 25% fluency + 15% smoothness)
  const prosodyScore = Math.round(
    (accuracyPoints * 0.35 + ratePoints * 0.25 + fluencyPoints * 0.25 + smoothnessPoints * 0.15) * 10
  ) / 10;

  // Grade assignment
  let prosodyGrade: string;
  if (prosodyScore >= 3.8) prosodyGrade = 'Excellent';
  else if (prosodyScore >= 3.0) prosodyGrade = 'Proficient';
  else if (prosodyScore >= 2.0) prosodyGrade = 'Developing';
  else prosodyGrade = 'Needs Support';

  console.log(`Metrics: accuracy=${accuracy}%, wpm=${wordsPerMinute}, hesitations=${hesitationCount}, fillers=${fillerWordCount}, repeats=${repeatCount}, prosody=${prosodyScore}`);

  return {
    accuracy,
    wordsPerMinute,
    prosodyScore,
    prosodyGrade,
    totalWords,
    correctCount,
    errorCount,
    skipCount,
    hesitationCount,
    fillerWordCount,
    repeatCount,
  };
}

/**
 * Analyze error patterns including hesitation and repetition
 * Based on word-analyzer-v2 analyzeErrorPatterns (lines 2140-2165)
 * Enhanced with hesitation, repetition, omission, and addition detection
 */
export function analyzeErrorPatterns(words: AlignedWord[]): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];
  const patternMap = new Map<string, ErrorPattern>();

  // Helper to add/update pattern
  const addPattern = (
    key: string,
    type: ErrorPatternType,
    patternName: string,
    expected: string,
    spoken: string
  ) => {
    const existing = patternMap.get(key);
    if (existing) {
      // Only add unique examples
      const alreadyHas = existing.examples.some(
        e => e.expected === expected && e.spoken === spoken
      );
      if (!alreadyHas) {
        existing.examples.push({ expected, spoken });
      }
      existing.count++;
    } else {
      patternMap.set(key, {
        type,
        pattern: patternName,
        examples: [{ expected, spoken }],
        count: 1,
      });
    }
  };

  // Track hesitations and repetitions
  let hesitationCount = 0;
  let repetitionCount = 0;

  for (const word of words) {
    // Track hesitations (even for correct words)
    if (word.hesitation) {
      hesitationCount++;
      addPattern(
        'hesitation',
        'hesitation',
        'Hesitation before word (pause > 0.5s)',
        word.expected,
        word.spoken || '(paused)'
      );
    }

    // Track repetitions (even for correct words)
    if (word.isRepeat) {
      repetitionCount++;
      addPattern(
        'repetition',
        'repetition',
        'Word repeated/self-corrected',
        word.expected,
        word.spoken || ''
      );
    }

    // Skip further analysis for correct or skipped words
    if (word.status === 'correct' || !word.spoken) continue;

    const expected = word.expected.toLowerCase();
    const spoken = word.spoken.toLowerCase();

    // Initial sound errors
    if (expected[0] !== spoken[0]) {
      addPattern(
        'initial_sound',
        'initial_sound',
        'Initial consonant substitution',
        word.expected,
        word.spoken
      );
    }

    // Final sound errors
    if (expected[expected.length - 1] !== spoken[spoken.length - 1]) {
      addPattern(
        'final_sound',
        'final_sound',
        'Final sound error',
        word.expected,
        word.spoken
      );
    }

    // Visual similarity (b/d, p/q, m/n, u/n, w/v)
    const visualPairs = [['b', 'd'], ['p', 'q'], ['m', 'n'], ['u', 'n'], ['w', 'v']];
    for (const [a, b] of visualPairs) {
      if ((expected.includes(a) && spoken.includes(b)) ||
          (expected.includes(b) && spoken.includes(a))) {
        addPattern(
          `visual_${a}_${b}`,
          'visual_similarity',
          `Visual confusion: ${a}/${b}`,
          word.expected,
          word.spoken
        );
      }
    }

    // Omission (spoken word is shorter - sounds/syllables left out)
    if (spoken.length < expected.length - 1) {
      addPattern(
        'omission',
        'omission',
        'Sounds/syllables omitted',
        word.expected,
        word.spoken
      );
    }

    // Addition (spoken word is longer - extra sounds added)
    if (spoken.length > expected.length + 1) {
      addPattern(
        'addition',
        'addition',
        'Extra sounds/syllables added',
        word.expected,
        word.spoken
      );
    }

    // Word length errors (errors on long words 7+ chars)
    if (expected.length >= 7) {
      addPattern(
        'word_length_long',
        'word_length',
        'Difficulty with long words (7+ letters)',
        word.expected,
        word.spoken
      );
    }

    // Substitution tracking
    if (word.status === 'substituted') {
      addPattern(
        `sub_${expected}_${spoken}`,
        'substitution',
        `"${word.expected}" → "${word.spoken}"`,
        word.expected,
        word.spoken
      );
    }
  }

  // Convert map to array and sort by count
  for (const pattern of patternMap.values()) {
    patterns.push(pattern);
  }

  return patterns.sort((a, b) => b.count - a.count);
}
