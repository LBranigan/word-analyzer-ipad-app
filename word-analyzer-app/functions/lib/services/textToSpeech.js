"use strict";
/**
 * Text-to-Speech Service
 * Uses Google Cloud Text-to-Speech with WaveNet voices for natural-sounding audio
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSpeechAudio = generateSpeechAudio;
exports.generateSpeechAudioSSML = generateSpeechAudioSSML;
exports.textToSSML = textToSSML;
const text_to_speech_1 = require("@google-cloud/text-to-speech");
// Initialize the client
const ttsClient = new text_to_speech_1.TextToSpeechClient();
// Voice options - using Journey voices for most natural sound
// These are the newest, most natural-sounding voices from Google
const VOICE_OPTIONS = {
    // Journey voices (newest, most expressive)
    journey: {
        languageCode: 'en-US',
        name: 'en-US-Journey-D', // Male journey voice (warm, friendly)
        ssmlGender: 'MALE',
    },
    journeyFemale: {
        languageCode: 'en-US',
        name: 'en-US-Journey-F', // Female journey voice
        ssmlGender: 'FEMALE',
    },
    // WaveNet voices (very natural, slightly less expressive than Journey)
    wavenet: {
        languageCode: 'en-US',
        name: 'en-US-Wavenet-D', // Male WaveNet voice
        ssmlGender: 'MALE',
    },
    wavenetFemale: {
        languageCode: 'en-US',
        name: 'en-US-Wavenet-F', // Female WaveNet voice
        ssmlGender: 'FEMALE',
    },
    // Neural2 voices (good quality, faster)
    neural2: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-D', // Male Neural2 voice
        ssmlGender: 'MALE',
    },
};
/**
 * Generate speech audio from text using Google Cloud TTS
 * Returns MP3 audio buffer
 */
async function generateSpeechAudio(text, options = {}) {
    const { voiceType = 'journey', // Default to Journey voice (most natural)
    speakingRate = 0.95, // Slightly slower for clarity
    pitch = 0, } = options;
    const voice = VOICE_OPTIONS[voiceType];
    console.log(`Generating TTS audio with ${voiceType} voice...`);
    const request = {
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
        const audioBuffer = Buffer.from(response.audioContent);
        console.log(`TTS audio generated: ${audioBuffer.length} bytes`);
        return audioBuffer;
    }
    catch (error) {
        console.error('TTS generation error:', error);
        throw error;
    }
}
/**
 * Generate speech with SSML for better pronunciation and emphasis
 * Use this for more control over how the summary is spoken
 */
async function generateSpeechAudioSSML(ssml, options = {}) {
    const { voiceType = 'journey', speakingRate = 0.95, pitch = 0, } = options;
    const voice = VOICE_OPTIONS[voiceType];
    const request = {
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
    return Buffer.from(response.audioContent);
}
/**
 * Convert plain text to SSML with natural pauses and emphasis
 * Makes the summary sound more natural when spoken
 */
function textToSSML(text) {
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
        .replace(/\b(no cap|lit|fire|fam|slay|goated|bussin)\b/gi, '<prosody rate="105%" pitch="+5%">$1</prosody>');
    return `<speak>${ssml}</speak>`;
}
//# sourceMappingURL=textToSpeech.js.map