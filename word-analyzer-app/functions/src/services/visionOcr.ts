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
}

export async function extractTextFromImage(imageBuffer: Buffer): Promise<OcrResult> {
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

  return { fullText, words };
}
