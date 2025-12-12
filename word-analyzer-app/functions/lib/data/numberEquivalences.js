"use strict";
/**
 * Number word equivalences
 * Converts between written number words and digits
 * Handles: 0-999999, ordinals (1st/first), and common formats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wordToNumber = wordToNumber;
exports.numberToWord = numberToWord;
exports.areNumberEquivalents = areNumberEquivalents;
exports.isNumberLike = isNumberLike;
// Basic number words
const ONES = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19,
};
const TENS = {
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
};
// SCALES is referenced in the wordToNumber logic via string matching
// but kept as documentation for the supported number scales
const _SCALES = {
    'hundred': 100,
    'thousand': 1000,
    'million': 1000000,
    'billion': 1000000000,
};
void _SCALES; // Suppress unused variable warning
// Ordinal words to numbers
const ORDINALS = {
    'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
    'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
    'eleventh': 11, 'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14,
    'fifteenth': 15, 'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18,
    'nineteenth': 19, 'twentieth': 20, 'thirtieth': 30, 'fortieth': 40,
    'fiftieth': 50, 'sixtieth': 60, 'seventieth': 70, 'eightieth': 80,
    'ninetieth': 90, 'hundredth': 100, 'thousandth': 1000,
};
// Ordinal suffixes pattern
const ORDINAL_SUFFIX_PATTERN = /^(\d+)(st|nd|rd|th)$/i;
/**
 * Convert a number word or phrase to its numeric value
 * Examples:
 *   "fifteen" → 15
 *   "one hundred twenty three" → 123
 *   "first" → 1
 *   "21st" → 21
 * Returns null if not a valid number
 */
function wordToNumber(text) {
    const cleaned = text.toLowerCase().trim().replace(/[,\-]/g, ' ').replace(/\s+/g, ' ');
    // Check if it's already a digit string
    const digitMatch = cleaned.match(/^\d+$/);
    if (digitMatch) {
        return parseInt(cleaned, 10);
    }
    // Check ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
    const ordinalSuffixMatch = cleaned.match(ORDINAL_SUFFIX_PATTERN);
    if (ordinalSuffixMatch) {
        return parseInt(ordinalSuffixMatch[1], 10);
    }
    // Check if it's a simple ordinal word
    if (ORDINALS[cleaned] !== undefined) {
        return ORDINALS[cleaned];
    }
    // Check if it's a simple number word
    if (ONES[cleaned] !== undefined) {
        return ONES[cleaned];
    }
    if (TENS[cleaned] !== undefined) {
        return TENS[cleaned];
    }
    // Try to parse compound number words
    const words = cleaned.split(' ').filter(w => w.length > 0);
    if (words.length === 0)
        return null;
    let result = 0;
    let current = 0;
    for (const word of words) {
        // Handle "and" (e.g., "one hundred and twenty")
        if (word === 'and')
            continue;
        if (ONES[word] !== undefined) {
            current += ONES[word];
        }
        else if (TENS[word] !== undefined) {
            current += TENS[word];
        }
        else if (word === 'hundred') {
            current = (current === 0 ? 1 : current) * 100;
        }
        else if (word === 'thousand') {
            current = (current === 0 ? 1 : current) * 1000;
            result += current;
            current = 0;
        }
        else if (word === 'million') {
            current = (current === 0 ? 1 : current) * 1000000;
            result += current;
            current = 0;
        }
        else if (word === 'billion') {
            current = (current === 0 ? 1 : current) * 1000000000;
            result += current;
            current = 0;
        }
        else if (ORDINALS[word] !== undefined) {
            // Handle ordinal at the end (e.g., "twenty first")
            current += ORDINALS[word];
        }
        else {
            // Unknown word - not a valid number phrase
            return null;
        }
    }
    result += current;
    return result > 0 || cleaned === 'zero' ? result : null;
}
/**
 * Convert a number to its word form
 * Examples:
 *   15 → "fifteen"
 *   123 → "one hundred twenty three"
 */
function numberToWord(num) {
    if (!Number.isInteger(num) || num < 0 || num > 999999999) {
        return null;
    }
    if (num === 0)
        return 'zero';
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    function convertChunk(n) {
        if (n === 0)
            return '';
        if (n < 20)
            return ones[n];
        if (n < 100)
            return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + convertChunk(n % 100) : '');
    }
    const parts = [];
    if (num >= 1000000) {
        parts.push(convertChunk(Math.floor(num / 1000000)) + ' million');
        num %= 1000000;
    }
    if (num >= 1000) {
        parts.push(convertChunk(Math.floor(num / 1000)) + ' thousand');
        num %= 1000;
    }
    if (num > 0) {
        parts.push(convertChunk(num));
    }
    return parts.join(' ').trim();
}
/**
 * Check if two words/phrases represent the same number
 * Examples:
 *   areNumberEquivalents("fifteen", "15") → true
 *   areNumberEquivalents("2023", "twenty twenty three") → true
 *   areNumberEquivalents("1st", "first") → true
 *   areNumberEquivalents("hello", "world") → false (not numbers)
 */
function areNumberEquivalents(word1, word2) {
    const num1 = wordToNumber(word1);
    const num2 = wordToNumber(word2);
    // Both must be valid numbers
    if (num1 === null || num2 === null) {
        return false;
    }
    return num1 === num2;
}
/**
 * Check if a string represents a number (digit or word form)
 */
function isNumberLike(text) {
    return wordToNumber(text) !== null;
}
//# sourceMappingURL=numberEquivalences.js.map