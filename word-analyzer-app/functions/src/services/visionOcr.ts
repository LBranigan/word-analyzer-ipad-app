import { ImageAnnotatorClient } from '@google-cloud/vision';
import { loadImage } from 'canvas';

const visionClient = new ImageAnnotatorClient();

export interface OcrWord {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrResult {
  fullText: string;
  words: OcrWord[];
  imageWidth: number;
  imageHeight: number;
}

/**
 * Check if a string is standalone punctuation (should not be treated as a word)
 * Examples: ".", ",", "!", "?", '"', "-", "—"
 * Does NOT match words with punctuation attached: "don't", "world."
 */
function isStandalonePunctuation(text: string): boolean {
  // Match strings that are ONLY punctuation/symbols (no letters or numbers)
  return /^[.,;:!?"""'''()[\]{}<>—–\-/\\@#$%^&*_+=|~`]+$/.test(text);
}

/**
 * Check if a string contains at least one alphanumeric character
 */
function isWordLike(text: string): boolean {
  return /[a-zA-Z0-9]/.test(text);
}

/**
 * Check if a token is a single letter (for patterns like A-frame, T-shirt, X-ray, D-Day)
 * Common single-letter prefixes: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z
 */
function isSingleLetter(text: string): boolean {
  return /^[A-Za-z]$/.test(text);
}

/**
 * Check if a token is a hyphen or dash character
 */
function isHyphenLike(text: string): boolean {
  return text === '-' || text === '—' || text === '–';
}

/**
 * Merge bounding boxes for multiple OCR words into one combined box
 */
function mergeBoundingBoxes(words: OcrWord[]): OcrWord['boundingBox'] {
  if (words.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  if (words.length === 1) {
    return { ...words[0].boundingBox };
  }

  const minX = Math.min(...words.map(w => w.boundingBox.x));
  const minY = Math.min(...words.map(w => w.boundingBox.y));
  const maxX = Math.max(...words.map(w => w.boundingBox.x + w.boundingBox.width));
  const maxY = Math.max(...words.map(w => w.boundingBox.y + w.boundingBox.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Merge hyphenated compound words that OCR split into separate tokens
 *
 * Handles these common patterns:
 *
 * 1. Single-letter prefixes (always merge on same line):
 *    - A-frame, A-list, A-bomb
 *    - B-school, C-note, D-Day
 *    - E-mail, F-word, G-string
 *    - H-bomb, I-beam, J-school
 *    - K-9, K-12, L-bracket
 *    - M-dash, N-word, O-Ring
 *    - P-Funk, Q-tips, R-value
 *    - S-curve, T-shirt, T-ball, T-bone, T-Rex
 *    - U-boat, U-turn, V-neck, V-Day
 *    - W-2, X-ray, Y-chromosome, Z-buffer
 *
 * 2. Common compound words:
 *    - well-known, old-fashioned, self-esteem
 *    - mother-in-law, father-in-law, etc.
 *    - twenty-one through ninety-nine
 *    - state-of-the-art, word-of-mouth
 *
 * 3. Hyphenated proper nouns:
 *    - D-Day, V-Day, etc.
 */
function mergeHyphenatedCompounds(words: OcrWord[]): OcrWord[] {
  const result: OcrWord[] = [];
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    const nextWord = words[i + 1];
    const thirdWord = words[i + 2];
    const fourthWord = words[i + 3];
    const fifthWord = words[i + 4];

    // Helper to check if tokens are on the same line
    const areSameLine = (w1: OcrWord, w2: OcrWord) => {
      const avgHeight = Math.max(w1.boundingBox.height, w2.boundingBox.height);
      return Math.abs(w1.boundingBox.y - w2.boundingBox.y) < avgHeight * 0.6;
    };

    // Case 1: Single letter + "-" + word (three tokens) - ALWAYS merge on same line
    // E.g., "D" "-" "Day" → "D-Day", "T" "-" "shirt" → "T-shirt"
    if (thirdWord &&
        isSingleLetter(word.text) &&
        isHyphenLike(nextWord.text) &&
        isWordLike(thirdWord.text) &&
        areSameLine(word, thirdWord)) {
      const mergedText = word.text + '-' + thirdWord.text;
      result.push({
        text: mergedText,
        boundingBox: mergeBoundingBoxes([word, nextWord, thirdWord]),
      });
      i += 3;
      continue;
    }

    // Case 2: word + "-" + word + "-" + word (five tokens for triple compounds)
    // E.g., "mother" "-" "in" "-" "law" → "mother-in-law"
    // E.g., "state" "-" "of" "-" "the" (partial, need to handle "state-of-the-art")
    if (fifthWord &&
        isWordLike(word.text) &&
        isHyphenLike(nextWord.text) &&
        isWordLike(thirdWord.text) &&
        isHyphenLike(fourthWord.text) &&
        isWordLike(fifthWord.text) &&
        areSameLine(word, fifthWord)) {
      const mergedText = word.text + '-' + thirdWord.text + '-' + fifthWord.text;
      result.push({
        text: mergedText,
        boundingBox: mergeBoundingBoxes([word, nextWord, thirdWord, fourthWord, fifthWord]),
      });
      i += 5;
      continue;
    }

    // Case 3: word + "-" + word (three tokens) - general compound words
    // E.g., "well" "-" "known" → "well-known"
    // E.g., "twenty" "-" "one" → "twenty-one"
    if (thirdWord &&
        isWordLike(word.text) &&
        isHyphenLike(nextWord.text) &&
        isWordLike(thirdWord.text) &&
        areSameLine(word, thirdWord)) {
      const mergedText = word.text + '-' + thirdWord.text;
      result.push({
        text: mergedText,
        boundingBox: mergeBoundingBoxes([word, nextWord, thirdWord]),
      });
      i += 3;
      continue;
    }

    // Case 4: "word-" + "word" (two tokens, hyphen attached to first, same line)
    // E.g., "D-" "Day" → "D-Day", "well-" "known" → "well-known"
    // But NOT line-break hyphens (those are handled separately below)
    if (nextWord &&
        word.text.endsWith('-') &&
        word.text.length > 1 &&
        isWordLike(word.text.slice(0, -1)) &&
        isWordLike(nextWord.text) &&
        !nextWord.text.startsWith('-')) {
      // Check if they're on the SAME line (not a line break)
      const currentBottom = word.boundingBox.y + word.boundingBox.height;
      const nextTop = nextWord.boundingBox.y;
      const lineGap = nextTop - currentBottom;
      const isNewLine = lineGap > word.boundingBox.height * 0.3;
      const nextWordStartsLeft = nextWord.boundingBox.x < word.boundingBox.x - 50;

      // If NOT a line break, merge as compound word
      if (!isNewLine && !nextWordStartsLeft) {
        const mergedText = word.text + nextWord.text;
        result.push({
          text: mergedText,
          boundingBox: mergeBoundingBoxes([word, nextWord]),
        });
        i += 2;
        continue;
      }
    }

    // Case 5: "word" + "-word" (two tokens, hyphen attached to second)
    // E.g., "D" "-Day" → "D-Day"
    if (nextWord &&
        isWordLike(word.text) &&
        !word.text.endsWith('-') &&
        nextWord.text.startsWith('-') &&
        nextWord.text.length > 1 &&
        isWordLike(nextWord.text.slice(1)) &&
        areSameLine(word, nextWord)) {
      const mergedText = word.text + nextWord.text;
      result.push({
        text: mergedText,
        boundingBox: mergeBoundingBoxes([word, nextWord]),
      });
      i += 2;
      continue;
    }

    // Default: keep word as-is
    result.push(word);
    i++;
  }

  return result;
}

/**
 * Post-process OCR words to fix common issues:
 * 1. Filter standalone punctuation (., , ! ? " etc.)
 * 2. Merge hyphenated compound words (D-Day, well-known)
 * 3. Split words merged by em-dashes ("2023—was" → ["2023", "was"])
 * 4. Merge words split by line-break hyphens (["entre-", "preneurs"] → ["entrepreneurs"])
 */
function postProcessOcrWords(words: OcrWord[]): OcrWord[] {
  // Step 1: Merge hyphenated compound words on the same line
  const afterHyphenMerge = mergeHyphenatedCompounds(words);

  // Step 2: Process remaining words
  const result: OcrWord[] = [];

  for (let i = 0; i < afterHyphenMerge.length; i++) {
    const word = afterHyphenMerge[i];

    // Filter out standalone punctuation
    if (isStandalonePunctuation(word.text)) {
      continue;
    }

    // Split words containing em-dashes or en-dashes
    // These connect separate words that should be distinct (e.g., "2023—was")
    if (word.text.includes('—') || word.text.includes('–')) {
      const parts = word.text.split(/[—–]+/).filter(p => p.length > 0 && !isStandalonePunctuation(p));

      if (parts.length > 1) {
        // Distribute bounding box proportionally based on character count
        const totalChars = parts.reduce((sum, p) => sum + p.length, 0);
        let xOffset = 0;

        for (const part of parts) {
          const ratio = part.length / totalChars;
          const partWidth = word.boundingBox.width * ratio;

          result.push({
            text: part,
            boundingBox: {
              x: word.boundingBox.x + xOffset,
              y: word.boundingBox.y,
              width: partWidth,
              height: word.boundingBox.height,
            },
          });
          xOffset += partWidth;
        }
        continue;
      }
    }

    // Merge hyphenated line-break words
    // Detect when a word ends with hyphen and next word is on a new line
    const nextWord = afterHyphenMerge[i + 1];
    const textWithoutTrailingPunct = word.text.replace(/[.,;:!?"')\]]+$/, '');

    if (textWithoutTrailingPunct.endsWith('-') && nextWord && !isStandalonePunctuation(nextWord.text)) {
      // Check if next word is on a new line by comparing Y coordinates
      const currentBottom = word.boundingBox.y + word.boundingBox.height;
      const nextTop = nextWord.boundingBox.y;
      const lineGap = nextTop - currentBottom;

      // If there's a significant vertical gap or next word starts far left, it's a line break
      const isNewLine = lineGap > word.boundingBox.height * 0.3;
      const nextWordStartsLeft = nextWord.boundingBox.x < word.boundingBox.x - 50;

      if (isNewLine || nextWordStartsLeft) {
        // Merge the words: remove the hyphen and combine
        const baseText = textWithoutTrailingPunct.slice(0, -1); // Remove trailing hyphen
        const mergedText = baseText + nextWord.text;

        result.push({
          text: mergedText,
          boundingBox: word.boundingBox, // Use first part's bounding box
        });
        i++; // Skip the next word since we merged it
        continue;
      }
    }

    // Default: keep word as-is
    result.push(word);
  }

  return result;
}

export async function extractTextFromImage(imageBuffer: Buffer): Promise<OcrResult> {
  // Get actual image dimensions using canvas
  let imageWidth = 0;
  let imageHeight = 0;

  try {
    const img = await loadImage(imageBuffer);
    imageWidth = img.width;
    imageHeight = img.height;
    console.log(`Actual image dimensions: ${imageWidth}x${imageHeight}`);
  } catch (err) {
    console.warn('Could not get image dimensions from buffer:', err);
  }

  // Get text detection
  const [textResult] = await visionClient.textDetection({
    image: { content: imageBuffer },
  });

  const result = textResult;
  const textAnnotations = result.textAnnotations || [];

  // Fallback: if we couldn't get dimensions from image, use text bounding box
  if (imageWidth === 0 || imageHeight === 0) {
    if (textAnnotations.length > 0) {
      const vertices = textAnnotations[0].boundingPoly?.vertices || [];
      if (vertices.length >= 4) {
        // Get max x and y from all vertices to approximate image size
        imageWidth = Math.max(...vertices.map(v => v.x || 0));
        imageHeight = Math.max(...vertices.map(v => v.y || 0));
        console.log(`Fallback to text bounding box dimensions: ${imageWidth}x${imageHeight}`);
      }
    }
  }

  if (textAnnotations.length === 0) {
    return { fullText: '', words: [], imageWidth, imageHeight };
  }

  // First annotation is the full text
  const fullText = textAnnotations[0].description || '';

  // Remaining annotations are individual words
  const words: OcrWord[] = [];

  for (let i = 1; i < textAnnotations.length; i++) {
    const annotation = textAnnotations[i];
    const vertices = annotation.boundingPoly?.vertices || [];

    if (vertices.length < 4) continue;

    const x = vertices[0].x || 0;
    const y = vertices[0].y || 0;
    const width = (vertices[1].x || 0) - x;
    const height = (vertices[2].y || 0) - y;

    words.push({
      text: annotation.description || '',
      boundingBox: { x, y, width, height },
    });
  }

  // Post-process words to fix em-dash merging and hyphenated line breaks
  const processedWords = postProcessOcrWords(words);
  console.log(`OCR post-processing: ${words.length} words → ${processedWords.length} words`);

  return { fullText, words: processedWords, imageWidth, imageHeight };
}
