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
  hesitationCount: number;      // Number of significant pauses (> 0.5s)
  fillerWordCount: number;      // Number of filler words (um, uh, etc)
  repeatCount: number;          // Number of repeated words (stutters)
  selfCorrectionCount: number;  // Number of self-corrections (positive indicator)
}

export type ErrorPatternType =
  | 'substitution'
  | 'phonetic'
  | 'initial_sound'
  | 'final_sound'
  | 'visual_similarity'
  | 'hesitation'        // Significant pauses before words
  | 'repetition'        // Repeated words (stutter)
  | 'self_correction'   // Student caught and corrected their error (positive!)
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
 * Severity level for the assessment
 */
export type SeverityLevel = 'excellent' | 'mild' | 'moderate' | 'significant';

/**
 * Pattern summary with actionable recommendations for teachers
 */
export interface PatternSummary {
  severity: SeverityLevel;
  primaryIssues: string[];
  recommendations: string[];
  strengths: string[];
  referralSuggestions: string[];  // Suggestions for specialist referrals
}

/**
 * Calculate all metrics from matching result
 * Now includes hesitation in prosody calculation
 * Uses actual reading time from word timestamps for accurate WPM
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
    repeatCount,
    selfCorrectionCount
  } = matchingResult;
  const totalWords = words.length;

  // Accuracy percentage
  const accuracy = totalWords > 0
    ? Math.round((correctCount / totalWords) * 100)
    : 0;

  // Calculate actual reading time from word timestamps
  // This is more accurate than using audioDuration which may include silence
  let actualReadingTime = audioDuration;

  // Find first and last word with valid timing
  const wordsWithTiming = words.filter(w => w.startTime > 0 || w.endTime > 0);
  if (wordsWithTiming.length >= 2) {
    const firstWord = wordsWithTiming[0];
    const lastWord = wordsWithTiming[wordsWithTiming.length - 1];

    // Reading time is from first word start to last word end
    const readingStart = firstWord.startTime;
    const readingEnd = lastWord.endTime;

    if (readingEnd > readingStart) {
      actualReadingTime = readingEnd - readingStart;
      console.log(`Using actual reading time: ${actualReadingTime.toFixed(2)}s (from ${readingStart.toFixed(2)}s to ${readingEnd.toFixed(2)}s)`);
    }
  } else if (wordsWithTiming.length === 1) {
    // Single word - use its duration
    const word = wordsWithTiming[0];
    actualReadingTime = word.endTime - word.startTime;
  }

  // Words per minute - using actual reading time
  const wordsRead = correctCount + matchingResult.misreadCount + matchingResult.substitutionCount;
  const minutesElapsed = actualReadingTime / 60;
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

  console.log(`Metrics: accuracy=${accuracy}%, wpm=${wordsPerMinute}, hesitations=${hesitationCount}, fillers=${fillerWordCount}, repeats=${repeatCount}, selfCorrections=${selfCorrectionCount}, prosody=${prosodyScore}`);

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
    selfCorrectionCount,
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

    // Track repetitions/stutters (even for correct words)
    if (word.isRepeat) {
      repetitionCount++;
      addPattern(
        'repetition',
        'repetition',
        'Word repeated (stutter)',
        word.expected,
        word.spoken || ''
      );
    }

    // Track self-corrections (positive indicator - student caught their own error)
    if (word.isSelfCorrection) {
      addPattern(
        'self_correction',
        'self_correction',
        'Self-corrected (caught own error)',
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

/**
 * Generate a pattern summary with actionable recommendations for teachers
 * Based on word-analyzer-v2 generatePatternSummary (concept map)
 *
 * Analyzes error patterns to identify:
 * - Primary issues (phonics, decoding, fluency)
 * - Specific recommendations for intervention
 * - Student strengths to build upon
 * - Referral suggestions when patterns indicate need for specialist evaluation
 */
export function generatePatternSummary(
  patterns: ErrorPattern[],
  metrics: Metrics
): PatternSummary {
  const primaryIssues: string[] = [];
  const recommendations: string[] = [];
  const strengths: string[] = [];
  const referralSuggestions: string[] = [];

  // Helper to count patterns by type
  const countByType = (type: ErrorPatternType): number => {
    const pattern = patterns.find(p => p.type === type);
    return pattern?.count || 0;
  };

  // Get counts for different pattern types
  const initialSoundErrors = countByType('initial_sound');
  const finalSoundErrors = countByType('final_sound');
  const consonantBlendErrors = countByType('consonant_blend');
  const digraphErrors = countByType('digraph');
  const firstLetterGuessing = countByType('first_letter_guess');
  const rSoundErrors = countByType('r_sound');
  const thSoundErrors = countByType('th_sound');
  const vowelErrors = countByType('vowel_error');
  const visualErrors = countByType('visual_similarity');
  const omissionErrors = countByType('omission');
  const additionErrors = countByType('addition');
  const longWordErrors = countByType('word_length');
  const hesitationCount = metrics.hesitationCount;
  const repeatCount = metrics.repeatCount;

  // ============================================
  // ANALYZE PHONICS ISSUES
  // ============================================

  // Consonant blend difficulties (≥2 instances)
  if (consonantBlendErrors >= 2) {
    primaryIssues.push('Difficulty with consonant blends (bl, cl, fr, tr, str, etc.)');
    recommendations.push('Practice blending sounds together with word ladders and blend cards');
    recommendations.push('Use manipulatives to physically combine letter sounds');
  }

  // Digraph difficulties (≥2 instances)
  if (digraphErrors >= 2) {
    primaryIssues.push('Difficulty with digraphs (ch, sh, th, ph, wh)');
    recommendations.push('Focus on digraph recognition with flashcards and sorting activities');
    recommendations.push('Use mouth position mirrors to show how digraph sounds are made');
  }

  // Initial sound errors (≥3 instances)
  if (initialSoundErrors >= 3) {
    primaryIssues.push('Inconsistent initial sound recognition');
    recommendations.push('Practice initial sound isolation with picture sorts');
    recommendations.push('Use alliteration games and tongue twisters');
  }

  // Final sound errors (≥3 instances)
  if (finalSoundErrors >= 3) {
    primaryIssues.push('Difficulty with word endings');
    recommendations.push('Practice word families focusing on ending patterns (-at, -an, -ing)');
    recommendations.push('Use Elkonin boxes to segment sounds, emphasizing final sounds');
  }

  // Vowel confusion (≥2 instances)
  if (vowelErrors >= 2) {
    primaryIssues.push('Vowel sound confusion');
    recommendations.push('Review short vs long vowel sounds with visual cues');
    recommendations.push('Practice vowel teams and patterns (ea, ee, ai, ay)');
  }

  // ============================================
  // ANALYZE DECODING STRATEGIES
  // ============================================

  // First-letter guessing (≥2 instances)
  if (firstLetterGuessing >= 2) {
    primaryIssues.push('Relying on first-letter guessing instead of full decoding');
    recommendations.push('Encourage sounding out the ENTIRE word, not just the first letter');
    recommendations.push('Use finger-point reading to slow down and attend to all letters');
    recommendations.push('Practice with decodable texts at the student\'s level');
  }

  // Visual similarity errors (b/d, p/q confusion)
  if (visualErrors >= 2) {
    primaryIssues.push('Visual letter confusion (b/d, p/q, m/n)');
    recommendations.push('Use tactile letter formation practice (sand trays, playdough)');
    recommendations.push('Create anchor words for confused letters (b = bat, d = dog)');
    recommendations.push('Practice with color-coded highlighting of confused letters');
  }

  // Long word difficulties
  if (longWordErrors >= 3) {
    primaryIssues.push('Difficulty with multi-syllable words');
    recommendations.push('Teach syllable division rules (VC/CV, V/CV patterns)');
    recommendations.push('Practice chunking longer words into manageable parts');
    recommendations.push('Use word building with prefixes, roots, and suffixes');
  }

  // Omission errors (leaving out sounds)
  if (omissionErrors >= 2) {
    primaryIssues.push('Omitting sounds or syllables when reading');
    recommendations.push('Slow down reading pace to attend to all word parts');
    recommendations.push('Use finger tracking under each syllable');
  }

  // Addition errors (adding extra sounds)
  if (additionErrors >= 2) {
    primaryIssues.push('Adding extra sounds or syllables');
    recommendations.push('Practice careful, precise word reading');
    recommendations.push('Record and playback reading to build self-monitoring');
  }

  // ============================================
  // ANALYZE FLUENCY ISSUES
  // ============================================

  // Excessive hesitation
  const hesitationRate = metrics.totalWords > 0 ? hesitationCount / metrics.totalWords : 0;
  if (hesitationRate > 0.15) {
    primaryIssues.push('Frequent hesitation interrupting reading flow');
    recommendations.push('Increase exposure to high-frequency words through repeated reading');
    recommendations.push('Practice phrase-cued reading to build fluent word groups');
    recommendations.push('Use readers theater or echo reading for fluency modeling');
  } else if (hesitationRate > 0.08) {
    primaryIssues.push('Occasional hesitation affecting fluency');
    recommendations.push('Build sight word automaticity with flashcard practice');
    recommendations.push('Re-read familiar texts to build confidence and speed');
  }

  // Excessive repetition (self-correction attempts)
  const repeatRate = metrics.totalWords > 0 ? repeatCount / metrics.totalWords : 0;
  if (repeatRate > 0.10) {
    primaryIssues.push('Frequent word repetitions disrupting flow');
    recommendations.push('Praise self-correction but work on "getting it right the first time"');
    recommendations.push('Preview difficult words before reading');
  }

  // ============================================
  // SPEECH PATTERN REFERRALS
  // ============================================

  // R-sound issues (potential speech concern)
  if (rSoundErrors >= 3) {
    primaryIssues.push('Consistent R → W sound substitution');
    referralSuggestions.push('Consider speech-language evaluation for R sound production');
    recommendations.push('Note: This may be developmental in younger students (K-1) but warrants monitoring');
  }

  // TH-sound issues (potential speech concern)
  if (thSoundErrors >= 3) {
    primaryIssues.push('Consistent TH sound substitution (th → d, t, or f)');
    referralSuggestions.push('Consider speech-language evaluation for TH sound production');
    recommendations.push('Practice tongue placement for TH sounds with mirror feedback');
  }

  // ============================================
  // IDENTIFY STRENGTHS
  // ============================================

  if (metrics.accuracy >= 95) {
    strengths.push('Excellent word recognition accuracy');
  } else if (metrics.accuracy >= 90) {
    strengths.push('Strong word recognition accuracy');
  }

  if (metrics.wordsPerMinute >= 100 && metrics.wordsPerMinute <= 180) {
    strengths.push('Appropriate reading rate for fluent comprehension');
  } else if (metrics.wordsPerMinute >= 80) {
    strengths.push('Developing reading rate');
  }

  if (hesitationRate <= 0.05) {
    strengths.push('Smooth, confident reading with minimal hesitation');
  }

  if (initialSoundErrors === 0 && metrics.totalWords >= 20) {
    strengths.push('Consistent initial sound recognition');
  }

  if (consonantBlendErrors === 0 && metrics.totalWords >= 20) {
    strengths.push('Good handling of consonant blends');
  }

  if (digraphErrors === 0 && metrics.totalWords >= 20) {
    strengths.push('Solid digraph recognition');
  }

  if (firstLetterGuessing === 0 && metrics.totalWords >= 20) {
    strengths.push('Uses full decoding strategies rather than guessing');
  }

  if (repeatCount <= 1 && metrics.totalWords >= 20) {
    strengths.push('Confident first attempts with minimal self-correction needed');
  }

  // ============================================
  // DETERMINE OVERALL SEVERITY
  // ============================================

  let severity: SeverityLevel;
  const totalIssues = primaryIssues.length;
  const hasReferralConcerns = referralSuggestions.length > 0;

  if (totalIssues === 0 && metrics.accuracy >= 95) {
    severity = 'excellent';
    if (strengths.length === 0) {
      strengths.push('Strong overall reading performance');
    }
  } else if (totalIssues <= 2 && !hasReferralConcerns && metrics.accuracy >= 85) {
    severity = 'mild';
    if (recommendations.length === 0) {
      recommendations.push('Continue current instruction with targeted practice on identified areas');
    }
  } else if (totalIssues <= 4 && metrics.accuracy >= 70) {
    severity = 'moderate';
    recommendations.push('Consider small group intervention targeting primary issues');
  } else {
    severity = 'significant';
    recommendations.push('Recommend intensive intervention with progress monitoring');
    if (metrics.accuracy < 70) {
      recommendations.push('Text level may be too difficult - consider using easier materials');
    }
  }

  // Add general recommendation if no specific ones were generated
  if (recommendations.length === 0 && primaryIssues.length > 0) {
    recommendations.push('Focus instruction on the identified areas during guided reading');
  }

  console.log(`Pattern summary: severity=${severity}, issues=${totalIssues}, strengths=${strengths.length}`);

  return {
    severity,
    primaryIssues,
    recommendations,
    strengths,
    referralSuggestions,
  };
}
