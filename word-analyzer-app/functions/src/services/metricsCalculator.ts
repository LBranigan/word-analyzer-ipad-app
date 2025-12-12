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
  | 'word_length'       // Errors on long/short words
  | 'consonant_blend'   // Difficulty with bl, cl, fr, tr, etc
  | 'digraph'           // Difficulty with ch, sh, th, ph, wh
  | 'first_letter_guess' // Guessing based on first letter only
  | 'r_sound'           // R → W substitution (common in young readers)
  | 'th_sound'          // TH → D, T, or F substitution
  | 'vowel_error';      // Vowel sound confusions

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

// Consonant blends - two or more consonants that blend together
const CONSONANT_BLENDS = [
  // L-blends
  'bl', 'cl', 'fl', 'gl', 'pl', 'sl',
  // R-blends
  'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr',
  // S-blends
  'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw',
  // 3-letter blends
  'scr', 'spl', 'spr', 'str', 'squ',
  // Ending blends
  'nd', 'nt', 'mp', 'ft', 'lt', 'lk', 'ct', 'pt',
];

// Digraphs - two letters that make one sound
const DIGRAPHS = ['ch', 'sh', 'th', 'ph', 'wh', 'ck', 'ng', 'gh'];

/**
 * Calculate Levenshtein distance for similarity comparison
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
 * Analyze error patterns including hesitation and repetition
 * Based on word-analyzer-v2 analyzeErrorPatterns (lines 2140-2165)
 * Enhanced with:
 * - Consonant blend errors (bl, cl, fr, tr, etc)
 * - Digraph errors (ch, sh, th, ph, wh)
 * - First-letter guessing detection
 * - Speech patterns (R→W, TH substitutions)
 * - Vowel confusion errors
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

    // ============================================
    // CONSONANT BLEND ERRORS
    // Detects when student struggles with consonant clusters
    // ============================================
    for (const blend of CONSONANT_BLENDS) {
      if (expected.includes(blend) && !spoken.includes(blend)) {
        // Check if they simplified the blend (e.g., "street" → "seet", "play" → "pay")
        const blendSimplified = blend.length === 2 &&
          (spoken.includes(blend[0]) || spoken.includes(blend[1]));

        if (blendSimplified || spoken.length < expected.length) {
          addPattern(
            `blend_${blend}`,
            'consonant_blend',
            `Consonant blend difficulty: "${blend}"`,
            word.expected,
            word.spoken
          );
        }
      }
    }

    // ============================================
    // DIGRAPH ERRORS
    // Detects when student struggles with digraphs (ch, sh, th, ph, wh)
    // ============================================
    for (const digraph of DIGRAPHS) {
      if (expected.includes(digraph)) {
        // Check if digraph is missing or substituted in spoken word
        if (!spoken.includes(digraph)) {
          // Common digraph substitutions
          const digraphSubstitutions: Record<string, string[]> = {
            'ch': ['sh', 'k', 'c', 'tch'],
            'sh': ['ch', 's', 'ss'],
            'th': ['d', 't', 'f', 'v', 'z'],  // "the" → "da", "three" → "free"
            'ph': ['f', 'p'],
            'wh': ['w', 'h'],
            'ck': ['k', 'c'],
            'ng': ['n', 'g'],
            'gh': ['g', 'f'],
          };

          const possibleSubs = digraphSubstitutions[digraph] || [];
          const wasSubstituted = possibleSubs.some(sub => spoken.includes(sub));

          if (wasSubstituted || spoken.length < expected.length) {
            addPattern(
              `digraph_${digraph}`,
              'digraph',
              `Digraph difficulty: "${digraph}"`,
              word.expected,
              word.spoken
            );
          }
        }
      }
    }

    // ============================================
    // FIRST-LETTER GUESSING
    // Student uses first letter to guess but doesn't decode the rest
    // Detected when: same first letter + low overall similarity
    // ============================================
    if (expected[0] === spoken[0] && expected.length > 2 && spoken.length > 2) {
      const maxLen = Math.max(expected.length, spoken.length);
      const distance = levenshteinDistance(expected, spoken);
      const similarity = 1 - (distance / maxLen);

      // Same first letter but very different word (similarity < 0.5)
      if (similarity < 0.5) {
        addPattern(
          'first_letter_guess',
          'first_letter_guess',
          'First-letter guessing (needs to decode full word)',
          word.expected,
          word.spoken
        );
      }
    }

    // ============================================
    // R-SOUND ISSUES (R → W substitution)
    // Common in young readers: "rabbit" → "wabbit", "red" → "wed"
    // ============================================
    if (expected.includes('r')) {
      // Check for R → W substitution
      const expectedRPositions: number[] = [];
      for (let i = 0; i < expected.length; i++) {
        if (expected[i] === 'r') expectedRPositions.push(i);
      }

      for (const pos of expectedRPositions) {
        // Check if corresponding position in spoken has 'w' instead of 'r'
        if (pos < spoken.length && spoken[pos] === 'w') {
          addPattern(
            'r_to_w',
            'r_sound',
            'R → W substitution',
            word.expected,
            word.spoken
          );
          break;
        }
      }

      // Also check if 'r' is completely missing and 'w' appears
      if (!spoken.includes('r') && spoken.includes('w') && !expected.includes('w')) {
        addPattern(
          'r_to_w',
          'r_sound',
          'R → W substitution',
          word.expected,
          word.spoken
        );
      }
    }

    // ============================================
    // TH-SOUND ISSUES
    // Common substitutions: "the" → "da", "three" → "free", "think" → "tink"
    // ============================================
    if (expected.includes('th')) {
      const thSubstitutes = ['d', 't', 'f', 'v', 'z'];

      // Check if 'th' was replaced with a single consonant
      if (!spoken.includes('th')) {
        for (const sub of thSubstitutes) {
          // Look for the substitute in positions where 'th' should be
          const thIndex = expected.indexOf('th');
          if (thIndex !== -1 && thIndex < spoken.length) {
            if (spoken[thIndex] === sub || spoken.includes(sub)) {
              addPattern(
                `th_to_${sub}`,
                'th_sound',
                `TH → ${sub.toUpperCase()} substitution`,
                word.expected,
                word.spoken
              );
              break;
            }
          }
        }
      }
    }

    // ============================================
    // VOWEL ERRORS
    // Confusion between similar vowel sounds
    // ============================================
    const vowelPairs = [
      ['a', 'e'], ['e', 'i'], ['i', 'e'], ['o', 'u'], ['a', 'o'],
      ['ea', 'ee'], ['ie', 'ei'], ['ou', 'ow'], ['ai', 'ay'],
    ];

    for (const [v1, v2] of vowelPairs) {
      if ((expected.includes(v1) && spoken.includes(v2) && !expected.includes(v2)) ||
          (expected.includes(v2) && spoken.includes(v1) && !expected.includes(v1))) {
        addPattern(
          `vowel_${v1}_${v2}`,
          'vowel_error',
          `Vowel confusion: ${v1}/${v2}`,
          word.expected,
          word.spoken
        );
      }
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
