"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
const vision_1 = require("@google-cloud/vision");
const visionClient = new vision_1.ImageAnnotatorClient();
/**
 * Post-process OCR words to fix common issues:
 * 1. Split words merged by em-dashes (e.g., "2023—was" → ["2023", "was"])
 * 2. Merge words split by line-break hyphens (e.g., ["entre-", "preneurs"] → ["entrepreneurs"])
 */
function postProcessOcrWords(words) {
    const result = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        // Case 1: Split words containing em-dashes or en-dashes
        // These connect separate words that should be distinct (e.g., "2023—was")
        if (word.text.includes('—') || word.text.includes('–')) {
            const parts = word.text.split(/[—–]+/).filter(p => p.length > 0);
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
        // Case 2: Merge hyphenated line-break words
        // Detect when a word ends with hyphen and next word is on a new line
        const nextWord = words[i + 1];
        const textWithoutTrailingPunct = word.text.replace(/[.,;:!?"')\]]+$/, '');
        if (textWithoutTrailingPunct.endsWith('-') && nextWord) {
            // Check if next word is on a new line by comparing Y coordinates
            const currentBottom = word.boundingBox.y + word.boundingBox.height;
            const nextTop = nextWord.boundingBox.y;
            const lineGap = nextTop - currentBottom;
            // If there's a significant vertical gap (more than half the line height),
            // and the next word starts near the left side, it's likely a line break
            const isNewLine = lineGap > word.boundingBox.height * 0.3;
            const nextWordStartsLeft = nextWord.boundingBox.x < word.boundingBox.x;
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
async function extractTextFromImage(imageBuffer) {
    var _a, _b;
    // Get text detection
    const [textResult] = await visionClient.textDetection({
        image: { content: imageBuffer },
    });
    const result = textResult;
    const textAnnotations = result.textAnnotations || [];
    // Get image dimensions from the full text bounding box (covers entire image text area)
    // Or use a default if not available
    let imageWidth = 0;
    let imageHeight = 0;
    // Try to get dimensions from the first annotation (full text) bounding box
    if (textAnnotations.length > 0) {
        const vertices = ((_a = textAnnotations[0].boundingPoly) === null || _a === void 0 ? void 0 : _a.vertices) || [];
        if (vertices.length >= 4) {
            // Get max x and y from all vertices to approximate image size
            imageWidth = Math.max(...vertices.map(v => v.x || 0));
            imageHeight = Math.max(...vertices.map(v => v.y || 0));
        }
    }
    if (textAnnotations.length === 0) {
        return { fullText: '', words: [], imageWidth: 0, imageHeight: 0 };
    }
    // First annotation is the full text
    const fullText = textAnnotations[0].description || '';
    // Remaining annotations are individual words
    const words = [];
    for (let i = 1; i < textAnnotations.length; i++) {
        const annotation = textAnnotations[i];
        const vertices = ((_b = annotation.boundingPoly) === null || _b === void 0 ? void 0 : _b.vertices) || [];
        if (vertices.length < 4)
            continue;
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
//# sourceMappingURL=visionOcr.js.map