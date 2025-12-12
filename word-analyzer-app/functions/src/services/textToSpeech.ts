/**
 * Text-to-Speech Service
 * Uses Google Cloud Text-to-Speech with Studio voices (highest quality)
 *
 * Privacy Note: Student data is sent to Google Cloud for TTS processing.
 * Schools should have a Google Cloud DPA in place for FERPA compliance.
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';

// Initialize Google TTS client
const googleTtsClient = new TextToSpeechClient();

// Google TTS voices - ordered by quality (best first)
// Studio voices are the most natural-sounding
const GOOGLE_VOICES = {
  // Studio voices - highest quality, most natural (premium pricing ~$0.16/1M chars)
  studioFemale: {
    languageCode: 'en-US',
    name: 'en-US-Studio-O',  // Studio female voice - warm, professional
    ssmlGender: 'FEMALE' as const,
  },
  // Neural2 voices - very good quality (~$0.000016/char)
  neural2Female: {
    languageCode: 'en-US',
    name: 'en-US-Neural2-F',
    ssmlGender: 'FEMALE' as const,
  },
  // Journey voices - good for longer content
  journeyFemale: {
    languageCode: 'en-US',
    name: 'en-US-Journey-F',
    ssmlGender: 'FEMALE' as const,
  },
  // WaveNet voices - good quality fallback
  wavenetFemale: {
    languageCode: 'en-US',
    name: 'en-US-Wavenet-F',
    ssmlGender: 'FEMALE' as const,
  },
  // Standard voices - basic fallback (cheapest)
  standard: {
    languageCode: 'en-US',
    name: 'en-US-Standard-C',
    ssmlGender: 'FEMALE' as const,
  },
};

export interface TTSOptions {
  speakingRate?: number;
}

/**
 * Generate speech audio using Google Cloud TTS
 * Tries highest quality voices first, falls back to lower quality if unavailable
 * Returns MP3 audio buffer
 */
export async function generateSpeechAudio(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const { speakingRate = 1.0 } = options;

  // Try voices in order of quality (best first)
  const voicesToTry = [
    'studioFemale',
    'neural2Female',
    'journeyFemale',
    'wavenetFemale',
    'standard'
  ] as const;

  for (const voiceKey of voicesToTry) {
    const voice = GOOGLE_VOICES[voiceKey];

    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      input: { text },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
        ssmlGender: voice.ssmlGender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        pitch: 0,
        // Audio profile optimized for speakers
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
      },
    };

    try {
      console.log(`Trying Google TTS voice: ${voiceKey} (${voice.name})...`);
      const [response] = await googleTtsClient.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error('No audio content in Google TTS response');
      }

      console.log(`Google TTS success with ${voiceKey}: ${(response.audioContent as Uint8Array).length} bytes`);
      return Buffer.from(response.audioContent as Uint8Array);
    } catch (error) {
      console.warn(`Google TTS voice ${voiceKey} failed:`, error);
      // Continue to next voice
    }
  }

  throw new Error('All Google TTS voices failed');
}

// Legacy export for backwards compatibility
export async function generateSpeechAudioSSML(
  ssml: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  // Strip SSML tags and use plain text
  const plainText = ssml
    .replace(/<speak>/g, '')
    .replace(/<\/speak>/g, '')
    .replace(/<break[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();

  return generateSpeechAudio(plainText, options);
}
