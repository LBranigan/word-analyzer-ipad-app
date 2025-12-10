import { SpeechClient, protos } from '@google-cloud/speech';

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

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  // Determine encoding from mime type
  let encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
  let sampleRateHertz = 16000;

  if (mimeType.includes('webm')) {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS;
    sampleRateHertz = 48000;
  } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3;
  } else {
    encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16;
  }

  const request: protos.google.cloud.speech.v1.IRecognizeRequest = {
    audio: {
      content: audioBuffer.toString('base64'),
    },
    config: {
      encoding,
      sampleRateHertz,
      languageCode: 'en-US',
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    },
  };

  const [response] = await speechClient.recognize(request);

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

      words.push({
        word: wordInfo.word || '',
        startTime,
        endTime,
        confidence: alternative.confidence || 0,
      });
    }
  }

  return {
    transcript: fullTranscript,
    words,
    confidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
  };
}
