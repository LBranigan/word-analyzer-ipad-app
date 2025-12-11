"use strict";
/**
 * Word Matching Algorithm
 * Ported from word-analyzer-v2 app.js
 * Key functions: calculateWordSimilarity, findBestAlignment, analyzePronunciation
 * Includes auto-detection of passage boundaries (first/last intended words)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchWords = matchWords;
const phoneticEquivalences_1 = require("../data/phoneticEquivalences");
/**
 * Normalize word for matching
 * - Lowercase
 * - Remove punctuation
 * - Expand contractions
 */
function normalizeWord(word) {
    let normalized = word.toLowerCase().replace(/[^a-z0-9']/g, '');
    // Expand contractions
    const contractions = {
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
function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
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
function calculateWordSimilarity(word1, word2) {
    const w1 = normalizeWord(word1);
    const w2 = normalizeWord(word2);
    if (!w1 || !w2)
        return 0;
    // Exact match
    if (w1 === w2)
        return 1.0;
    // Phonetic equivalents
    if ((0, phoneticEquivalences_1.arePhoneticEquivalents)(w1, w2))
        return 0.95;
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
function isFillerWord(word) {
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
 * Detect if there's a hesitation (significant pause) before a word
 * Based on word-analyzer-v2 detectHesitation (lines 2004-2012)
 *
 * @param currentWord Current word timing info
 * @param previousWord Previous word timing info
 * @returns Object with hesitation detected flag and pause duration
 */
function detectHesitation(currentWord, previousWord) {
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
 * Detect repeated words in the spoken word sequence
 * A word is considered repeated if the same or very similar word appears consecutively
 *
 * @param spokenWords Array of spoken word timings
 * @returns Set of indices that are repeated words
 */
function detectRepeatedWords(spokenWords) {
    const repeatedIndices = new Set();
    for (let i = 1; i < spokenWords.length; i++) {
        const current = normalizeWord(spokenWords[i].word);
        const previous = normalizeWord(spokenWords[i - 1].word);
        // Check if current word is a repeat of the previous word
        if (current === previous) {
            repeatedIndices.add(i);
        }
        // Also check for very similar words (partial repeats/stutters)
        else if (current.length >= 2 && previous.length >= 2) {
            // If they share the same first 2+ characters and one is a prefix of the other
            const minLen = Math.min(current.length, previous.length);
            const prefix = current.substring(0, Math.min(3, minLen));
            if (previous.startsWith(prefix) || current.startsWith(previous.substring(0, Math.min(3, minLen)))) {
                const similarity = calculateWordSimilarity(current, previous);
                if (similarity >= 0.85) {
                    repeatedIndices.add(i);
                }
            }
        }
    }
    return repeatedIndices;
}
/**
 * Build similarity matrix between spoken and OCR words
 */
function buildSimilarityMatrix(spoken, ocr) {
    const matrix = [];
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
function findSpokenRangeInOCR(spokenWords, ocrWords) {
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
        const dp = new Array(m + 1).fill(null).map(() => ({
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
function matchWords(ocrWords, spokenWords) {
    var _a, _b;
    // Count filler words BEFORE filtering
    const fillerWordCount = spokenWords.filter(w => isFillerWord(w.word)).length;
    console.log(`Detected ${fillerWordCount} filler words`);
    // Filter out filler words from spoken for matching
    const cleanSpoken = spokenWords.filter(w => !isFillerWord(w.word));
    // Detect repeated words in clean spoken words
    const repeatedIndices = detectRepeatedWords(cleanSpoken);
    const repeatCount = repeatedIndices.size;
    console.log(`Detected ${repeatCount} repeated words`);
    // Build hesitation map for clean spoken words
    const hesitationMap = new Map();
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
        };
    }
    // STEP 1: Auto-detect passage boundaries
    // Find which OCR words the student was trying to read
    const spokenWordStrings = cleanSpoken.map(w => w.word);
    const passageRange = findSpokenRangeInOCR(spokenWordStrings, ocrWords);
    // Extract the expected words with bounding boxes (the passage the student was reading)
    const expectedWords = ocrWords.slice(passageRange.firstIndex, passageRange.lastIndex + 1);
    console.log(`Detected passage: ${expectedWords.length} words (OCR indices ${passageRange.firstIndex}-${passageRange.lastIndex})`);
    console.log(`First expected: "${(_a = expectedWords[0]) === null || _a === void 0 ? void 0 : _a.text}", Last expected: "${(_b = expectedWords[expectedWords.length - 1]) === null || _b === void 0 ? void 0 : _b.text}"`);
    const m = expectedWords.length;
    const n = cleanSpoken.length;
    // DP table: dp[i][j] = best score aligning expected[0..i-1] with spoken[0..j-1]
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(-Infinity));
    const parent = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null).map(() => [-1, -1, '']));
    dp[0][0] = 0;
    // Fill DP table
    for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= n; j++) {
            if (dp[i][j] === -Infinity)
                continue;
            // Option 1: Match expected[i] with spoken[j]
            if (i < m && j < n) {
                const similarity = calculateWordSimilarity(expectedWords[i].text, cleanSpoken[j].word);
                let score;
                let status;
                if (similarity >= 0.95) {
                    score = 1.0;
                    status = 'correct';
                }
                else if (similarity >= 0.7) {
                    score = 0.5;
                    status = 'misread';
                }
                else if (similarity >= 0.4) {
                    score = 0.2;
                    status = 'substituted';
                }
                else {
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
    const alignment = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        const [pi, pj, status] = parent[i][j];
        if (pi === -1 && pj === -1)
            break;
        if (status === 'correct' || status === 'misread' || status === 'substituted') {
            // Get hesitation info for this spoken word
            const hesitationInfo = hesitationMap.get(pj) || { hesitation: false, pauseDuration: 0 };
            const isRepeat = repeatedIndices.has(pj);
            alignment.unshift({
                expected: expectedWords[pi].text,
                spoken: cleanSpoken[pj].word,
                status: status,
                startTime: cleanSpoken[pj].startTime,
                endTime: cleanSpoken[pj].endTime,
                confidence: cleanSpoken[pj].confidence,
                hesitation: hesitationInfo.hesitation,
                pauseDuration: hesitationInfo.pauseDuration,
                isRepeat,
                boundingBox: expectedWords[pi].boundingBox,
            });
            i = pi;
            j = pj;
        }
        else if (status === 'skipped') {
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
        }
        else if (status === 'extra') {
            // Extra spoken word - skip it in output
            j = pj;
        }
        else {
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
    // Count hesitations in the final alignment
    const alignmentHesitationCount = alignment.filter(w => w.hesitation).length;
    const alignmentRepeatCount = alignment.filter(w => w.isRepeat).length;
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
    };
}
//# sourceMappingURL=wordMatching.js.map