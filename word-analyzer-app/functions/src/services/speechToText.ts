import { SpeechClient, protos } from '@google-cloud/speech';

// Speech-to-Text service - uses longRunningRecognize for longer audio
const speechClient = new SpeechClient();

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface TranscriptionResult {
  transcript: string;
  words: WordTiming[];
  confidence: number;
}

/**
 * Transcribe audio using Google Cloud Speech-to-Text
 * Uses longRunningRecognize with GCS URI to handle longer audio files
 */
export async function transcribeAudio(
  gcsUri: string,
  mimeType: string
): Promise<TranscriptionResult> {
  // Determine encoding from mime type
  let encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

  if (mimeType.includes('webm')) {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS;
  } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3;
  } else {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16;
  }

  // Config for speech recognition
  // enableWordConfidence provides per-word confidence scores for better analysis
  const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
    encoding,
    languageCode: 'en-US',
    enableWordTimeOffsets: true,
    enableWordConfidence: true,  // Enable per-word confidence scores
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  };

  // Only set sample rate for non-WEBM formats (WEBM_OPUS auto-detects)
  if (encoding !== protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS) {
    config.sampleRateHertz = 16000;
  }

  const request: protos.google.cloud.speech.v1.ILongRunningRecognizeRequest = {
    audio: {
      uri: gcsUri,
    },
    config,
  };

  console.log(`Starting longRunningRecognize for: ${gcsUri}`);

  // Start the long-running operation
  const [operation] = await speechClient.longRunningRecognize(request);

  // Wait for the operation to complete
  const [response] = await operation.promise();

  console.log('Speech recognition completed');

  const words: WordTiming[] = [];
  let fullTranscript = '';
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const result of response.results || []) {
    const alternative = result.alternatives?.[0];
    if (!alternative) continue;

    fullTranscript += (fullTranscript ? ' ' : '') + alternative.transcript;

    if (alternative.confidence) {
      totalConfidence += alternative.confidence;
      confidenceCount++;
    }

    for (const wordInfo of alternative.words || []) {
      const startTime = wordInfo.startTime
        ? Number(wordInfo.startTime.seconds || 0) +
          Number(wordInfo.startTime.nanos || 0) / 1e9
        : 0;
      const endTime = wordInfo.endTime
        ? Number(wordInfo.endTime.seconds || 0) +
          Number(wordInfo.endTime.nanos || 0) / 1e9
        : 0;

      // Use per-word confidence if available, otherwise fall back to transcript confidence
      // Per-word confidence helps identify uncertain transcriptions
      const wordConfidence = wordInfo.confidence !== undefined && wordInfo.confidence !== null
        ? wordInfo.confidence
        : alternative.confidence || 0;

      words.push({
        word: wordInfo.word || '',
        startTime,
        endTime,
        confidence: wordConfidence,
      });
    }
  }

  return {
    transcript: fullTranscript,
    words,
    confidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
  };
}
