import { ImageAnnotatorClient } from '@google-cloud/vision';

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

export async function extractTextFromImage(imageBuffer: Buffer): Promise<OcrResult> {
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
    const vertices = textAnnotations[0].boundingPoly?.vertices || [];
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

  return { fullText, words, imageWidth, imageHeight };
}
