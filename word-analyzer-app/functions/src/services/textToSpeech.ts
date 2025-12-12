/**
 * Text-to-Speech Service
 * Uses Google Cloud Text-to-Speech with WaveNet voices for natural-sounding audio
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';

// Initialize the client
const ttsClient = new TextToSpeechClient();

// Voice options - using Journey voices for most natural sound
// These are the newest, most natural-sounding voices from Google
const VOICE_OPTIONS = {
  // Journey voices (newest, most expressive)
  journey: {
    languageCode: 'en-US',
    name: 'en-US-Journey-D', // Male journey voice (warm, friendly)
    ssmlGender: 'MALE' as const,
  },
  journeyFemale: {
    languageCode: 'en-US',
    name: 'en-US-Journey-F', // Female journey voice
    ssmlGender: 'FEMALE' as const,
  },
  // WaveNet voices (very natural, slightly less expressive than Journey)
  wavenet: {
    languageCode: 'en-US',
    name: 'en-US-Wavenet-D', // Male WaveNet voice
    ssmlGender: 'MALE' as const,
  },
  wavenetFemale: {
    languageCode: 'en-US',
    name: 'en-US-Wavenet-F', // Female WaveNet voice
    ssmlGender: 'FEMALE' as const,
  },
  // Neural2 voices (good quality, faster)
  neural2: {
    languageCode: 'en-US',
    name: 'en-US-Neural2-D', // Male Neural2 voice
    ssmlGender: 'MALE' as const,
  },
};

export interface TTSOptions {
  voiceType?: 'journey' | 'journeyFemale' | 'wavenet' | 'wavenetFemale' | 'neural2';
  speakingRate?: number; // 0.25 to 4.0, default 1.0
  pitch?: number; // -20.0 to 20.0, default 0
}

/**
 * Generate speech audio from text using Google Cloud TTS
 * Returns MP3 audio buffer
 */
export async function generateSpeechAudio(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voiceType = 'journey', // Default to Journey voice (most natural)
    speakingRate = 0.95, // Slightly slower for clarity
    pitch = 0,
  } = options;

  const voice = VOICE_OPTIONS[voiceType];

  console.log(`Generating TTS audio with ${voiceType} voice...`);

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
      pitch,
      // Add effects for even better quality
      effectsProfileId: ['headphone-class-device'], // Optimized for headphones/speakers
    },
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content in TTS response');
    }

    const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
    console.log(`TTS audio generated: ${audioBuffer.length} bytes`);

    return audioBuffer;
  } catch (error) {
    console.error('TTS generation error:', error);
    throw error;
  }
}

/**
 * Generate speech with SSML for better pronunciation and emphasis
 * Use this for more control over how the summary is spoken
 */
export async function generateSpeechAudioSSML(
  ssml: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voiceType = 'journey',
    speakingRate = 0.95,
    pitch = 0,
  } = options;

  const voice = VOICE_OPTIONS[voiceType];

  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: { ssml },
    voice: {
      languageCode: voice.languageCode,
      name: voice.name,
      ssmlGender: voice.ssmlGender,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
      pitch,
      effectsProfileId: ['headphone-class-device'],
    },
  };

  const [response] = await ttsClient.synthesizeSpeech(request);

  if (!response.audioContent) {
    throw new Error('No audio content in TTS response');
  }

  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * Convert plain text to SSML with natural pauses and emphasis
 * Makes the summary sound more natural when spoken
 */
export function textToSSML(text: string): string {
  let ssml = text
    // Add pauses after sentences
    .replace(/\. /g, '.<break time="400ms"/> ')
    .replace(/! /g, '!<break time="300ms"/> ')
    .replace(/\? /g, '?<break time="400ms"/> ')
    // Add slight pause after commas
    .replace(/, /g, ',<break time="200ms"/> ')
    // Add emphasis to quoted words (words they nailed/struggled with)
    .replace(/'([^']+)'/g, '<emphasis level="moderate">$1</emphasis>')
    // Add excitement to slang terms
    .replace(/\b(no cap|lit|fire|fam|slay|goated|bussin)\b/gi,
      '<prosody rate="105%" pitch="+5%">$1</prosody>');

  return `<speak>${ssml}</speak>`;
}
