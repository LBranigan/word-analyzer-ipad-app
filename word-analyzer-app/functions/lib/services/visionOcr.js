"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
const vision_1 = require("@google-cloud/vision");
const visionClient = new vision_1.ImageAnnotatorClient();
async function extractTextFromImage(imageBuffer) {
    var _a;
    const [result] = await visionClient.textDetection({
        image: { content: imageBuffer },
    });
    const textAnnotations = result.textAnnotations || [];
    if (textAnnotations.length === 0) {
        return { fullText: '', words: [] };
    }
    // First annotation is the full text
    const fullText = textAnnotations[0].description || '';
    // Remaining annotations are individual words
    const words = [];
    for (let i = 1; i < textAnnotations.length; i++) {
        const annotation = textAnnotations[i];
        const vertices = ((_a = annotation.boundingPoly) === null || _a === void 0 ? void 0 : _a.vertices) || [];
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
    return { fullText, words };
}
//# sourceMappingURL=visionOcr.js.map