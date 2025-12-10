# Analysis Backend & Teacher Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Firebase Cloud Functions to process reading assessments (Speech-to-Text, OCR, word matching, video generation) and a teacher dashboard web app.

**Architecture:** iPad app uploads audio/image to Firebase Storage, triggering a Cloud Function that calls Google APIs, runs word matching, generates video, and saves results to Firestore. Teacher dashboard is a React web app on Firebase Hosting.

**Tech Stack:** Firebase (Functions, Storage, Firestore, Hosting), Google Cloud Speech-to-Text API, Google Cloud Vision API, Node.js/TypeScript, React (dashboard), FFmpeg (video generation)

---

## Phase 1: Firebase Infrastructure Setup

### Task 1.1: Initialize Firebase Functions Project

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/index.ts`
- Create: `firebase.json`
- Create: `.firebaserc`

**Step 1: Create functions directory and initialize**

```bash
cd "C:\Users\brani\Desktop\Word analyzer ipad app\word-analyzer-app"
mkdir -p functions/src
```

**Step 2: Create functions/package.json**

```json
{
  "name": "word-analyzer-functions",
  "version": "1.0.0",
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "shell": "npm run build && firebase functions:shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "18"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.5.0",
    "@google-cloud/speech": "^6.0.0",
    "@google-cloud/vision": "^4.0.0",
    "fluent-ffmpeg": "^2.1.2",
    "@ffmpeg-installer/ffmpeg": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^18.0.0",
    "@types/fluent-ffmpeg": "^2.1.21"
  }
}
```

**Step 3: Create functions/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2017",
    "esModuleInterop": true
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

**Step 4: Create functions/src/index.ts (scaffold)**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const processAssessment = functions.storage
  .object()
  .onFinalize(async (object) => {
    // Will be implemented in Task 2
    console.log('File uploaded:', object.name);
  });
```

**Step 5: Create firebase.json**

```json
{
  "functions": {
    "source": "functions",
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
  },
  "storage": {
    "rules": "storage.rules"
  },
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": {
    "public": "teacher-dashboard/build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

**Step 6: Create .firebaserc**

```json
{
  "projects": {
    "default": "word-analyzer-ipad-app"
  }
}
```

**Step 7: Commit**

```bash
git add functions/ firebase.json .firebaserc
git commit -m "feat: initialize Firebase Functions project structure"
```

---

### Task 1.2: Create Storage Rules

**Files:**
- Create: `storage.rules`

**Step 1: Create storage.rules**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Uploads folder - authenticated users can write to their own folder
    match /uploads/{userId}/{assessmentId}/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Temp audio - read only for authenticated owner
    match /audio-temp/{userId}/{assessmentId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }

    // Videos - read only for authenticated owner
    match /videos/{userId}/{assessmentId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

**Step 2: Commit**

```bash
git add storage.rules
git commit -m "feat: add Firebase Storage security rules"
```

---

### Task 1.3: Create Firestore Rules

**Files:**
- Create: `firestore.rules`

**Step 1: Create firestore.rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Teachers can only access their own document
    match /teachers/{teacherId} {
      allow read, write: if request.auth != null && request.auth.uid == teacherId;

      // Students subcollection
      match /students/{studentId} {
        allow read, write: if request.auth != null && request.auth.uid == teacherId;
      }

      // Assessments subcollection
      match /assessments/{assessmentId} {
        allow read, write: if request.auth != null && request.auth.uid == teacherId;
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for teachers/students/assessments"
```

---

### Task 1.4: Install Functions Dependencies

**Step 1: Install npm packages**

```bash
cd "C:\Users\brani\Desktop\Word analyzer ipad app\word-analyzer-app\functions"
npm install
```

**Step 2: Build to verify setup**

```bash
npm run build
```

Expected: Compiles without errors, creates `lib/` directory.

**Step 3: Commit lockfile**

```bash
cd ..
git add functions/package-lock.json
git commit -m "chore: add functions package-lock.json"
```

---

## Phase 2: Cloud Function - Core Processing

### Task 2.1: Create Speech-to-Text Service

**Files:**
- Create: `functions/src/services/speechToText.ts`

**Step 1: Create the service file**

```typescript
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
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
cd ..
git add functions/src/services/speechToText.ts
git commit -m "feat: add Speech-to-Text service for audio transcription"
```

---

### Task 2.2: Create Vision OCR Service

**Files:**
- Create: `functions/src/services/visionOcr.ts`

**Step 1: Create the service file**

```typescript
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
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

Expected: Compiles without errors.

**Step 3: Commit**

```bash
cd ..
git add functions/src/services/visionOcr.ts
git commit -m "feat: add Vision OCR service for text extraction"
```

---

### Task 2.3: Create Phonetic Equivalences Database

**Files:**
- Create: `functions/src/data/phoneticEquivalences.ts`

**Step 1: Create the phonetic database (ported from word-analyzer-v2)**

```typescript
/**
 * Phonetic equivalences database
 * Maps words to their homophones and common confusions
 * Ported from word-analyzer-v2 app.js lines 1916-1981
 */
export const phoneticEquivalences: Record<string, string[]> = {
  // Common homophones
  'knight': ['night'],
  'know': ['no'],
  'knew': ['new', 'gnu'],
  'one': ['won', '1'],
  'two': ['to', 'too', '2'],
  'three': ['3'],
  'four': ['for', 'fore', '4'],
  'five': ['5'],
  'six': ['sicks', '6'],
  'seven': ['7'],
  'eight': ['ate', '8'],
  'nine': ['9'],
  'ten': ['10'],
  'to': ['too', 'two'],
  'their': ['there', 'theyre', "they're"],
  'there': ['their', 'theyre', "they're"],
  'theyre': ['their', 'there', "they're"],
  'your': ['youre', "you're"],
  'youre': ['your', "you're"],
  'its': ["it's", 'itis'],
  'write': ['right', 'rite'],
  'right': ['write', 'rite'],
  'see': ['sea', 'c'],
  'sea': ['see', 'c'],
  'be': ['bee'],
  'bee': ['be'],
  'by': ['bye', 'buy'],
  'bye': ['by', 'buy'],
  'buy': ['by', 'bye'],
  'here': ['hear'],
  'hear': ['here'],
  'where': ['wear', 'ware'],
  'wear': ['where', 'ware'],
  'which': ['witch'],
  'witch': ['which'],
  'would': ['wood'],
  'wood': ['would'],
  'piece': ['peace'],
  'peace': ['piece'],
  'plain': ['plane'],
  'plane': ['plain'],
  'rain': ['reign', 'rein'],
  'reign': ['rain', 'rein'],
  'road': ['rode', 'rowed'],
  'rode': ['road', 'rowed'],
  'role': ['roll'],
  'roll': ['role'],
  'sail': ['sale'],
  'sale': ['sail'],
  'son': ['sun'],
  'sun': ['son'],
  'tail': ['tale'],
  'tale': ['tail'],
  'wait': ['weight'],
  'weight': ['wait'],
  'weak': ['week'],
  'week': ['weak'],
  'whole': ['hole'],
  'hole': ['whole'],
  'flour': ['flower'],
  'flower': ['flour'],
  'hair': ['hare'],
  'hare': ['hair'],
  'bare': ['bear'],
  'bear': ['bare'],
  'pair': ['pear', 'pare'],
  'pear': ['pair', 'pare'],
  'fair': ['fare'],
  'fare': ['fair'],
  'stair': ['stare'],
  'stare': ['stair'],
  'die': ['dye'],
  'dye': ['die'],
  'eye': ['i', 'aye'],
  'i': ['eye', 'aye'],
  'hour': ['our'],
  'our': ['hour'],
  'meat': ['meet', 'mete'],
  'meet': ['meat', 'mete'],
  'steel': ['steal'],
  'steal': ['steel'],
  'dear': ['deer'],
  'deer': ['dear'],
  'board': ['bored'],
  'bored': ['board'],
  'scene': ['seen'],
  'seen': ['scene'],
  'break': ['brake'],
  'brake': ['break'],
  'waist': ['waste'],
  'waste': ['waist'],
  'allowed': ['aloud'],
  'aloud': ['allowed'],
  'cell': ['sell'],
  'sell': ['cell'],
  'cent': ['sent', 'scent'],
  'sent': ['cent', 'scent'],
  'scent': ['cent', 'sent'],
  'cite': ['site', 'sight'],
  'site': ['cite', 'sight'],
  'sight': ['cite', 'site'],
  'course': ['coarse'],
  'coarse': ['course'],
  'principle': ['principal'],
  'principal': ['principle'],
  'stationary': ['stationery'],
  'stationery': ['stationary'],
  'complement': ['compliment'],
  'compliment': ['complement'],
  'than': ['then'],
  'then': ['than'],
  'affect': ['effect'],
  'effect': ['affect'],
  'accept': ['except'],
  'except': ['accept'],
  'advice': ['advise'],
  'advise': ['advice'],
  'breath': ['breathe'],
  'breathe': ['breath'],
  'loose': ['lose'],
  'lose': ['loose'],
  'quite': ['quiet'],
  'quiet': ['quite'],

  // Names (common confusions)
  'graham': ['gram', 'grahm'],
  'stephen': ['steven'],
  'steven': ['stephen'],
  'sean': ['shawn', 'shaun'],
  'shawn': ['sean', 'shaun'],
  'shaun': ['sean', 'shawn'],
  'michael': ['micheal'],
  'micheal': ['michael'],
  'katherine': ['catherine', 'kathryn'],
  'catherine': ['katherine', 'kathryn'],

  // Contractions
  'cannot': ["can't", 'cant'],
  'dont': ["don't", 'do not'],
  'wont': ["won't", 'will not'],
  'isnt': ["isn't", 'is not'],
  'arent': ["aren't", 'are not'],
  'wasnt': ["wasn't", 'was not'],
  'werent': ["weren't", 'were not'],
  'havent': ["haven't", 'have not'],
  'hasnt': ["hasn't", 'has not'],
  'hadnt': ["hadn't", 'had not'],
  'wouldnt': ["wouldn't", 'would not'],
  'couldnt': ["couldn't", 'could not'],
  'shouldnt': ["shouldn't", 'should not'],
  'didnt': ["didn't", 'did not'],
  'doesnt': ["doesn't", 'does not'],
};

/**
 * Check if two words are phonetic equivalents
 */
export function arePhoneticEquivalents(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const w2 = word2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (w1 === w2) return true;

  const equivalents1 = phoneticEquivalences[w1] || [];
  const equivalents2 = phoneticEquivalences[w2] || [];

  return equivalents1.includes(w2) || equivalents2.includes(w1);
}
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

**Step 3: Commit**

```bash
cd ..
git add functions/src/data/phoneticEquivalences.ts
git commit -m "feat: add phonetic equivalences database (150+ homophones)"
```

---

### Task 2.4: Create Word Matching Algorithm

**Files:**
- Create: `functions/src/services/wordMatching.ts`

**Step 1: Create the word matching service (ported from word-analyzer-v2)**

```typescript
/**
 * Word Matching Algorithm
 * Ported from word-analyzer-v2 app.js
 * Key functions: calculateWordSimilarity, findBestAlignment, analyzePronunciation
 */

import { arePhoneticEquivalents } from '../data/phoneticEquivalences';
import { WordTiming } from './speechToText';

export type WordStatus = 'correct' | 'misread' | 'substituted' | 'skipped';

export interface AlignedWord {
  expected: string;
  spoken: string | null;
  status: WordStatus;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface MatchingResult {
  words: AlignedWord[];
  correctCount: number;
  errorCount: number;
  skipCount: number;
  substitutionCount: number;
  misreadCount: number;
}

/**
 * Normalize word for matching
 * - Lowercase
 * - Remove punctuation
 * - Expand contractions
 */
function normalizeWord(word: string): string {
  let normalized = word.toLowerCase().replace(/[^a-z0-9']/g, '');

  // Expand contractions
  const contractions: Record<string, string> = {
    "n't": ' not',
    "'re": ' are',
    "'ve": ' have',
    "'ll": ' will',
    "'d": ' would',
    "'m": ' am',
    "'s": '', // possessive or is - remove
  };

  for (const [contraction, expansion] of Object.entries(contractions)) {
    normalized = normalized.replace(contraction, expansion);
  }

  return normalized.trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity between two words (0-1)
 * Based on word-analyzer-v2 calculateWordSimilarity (lines 1510-1546)
 */
function calculateWordSimilarity(word1: string, word2: string): number {
  const w1 = normalizeWord(word1);
  const w2 = normalizeWord(word2);

  if (!w1 || !w2) return 0;

  // Exact match
  if (w1 === w2) return 1.0;

  // Phonetic equivalents
  if (arePhoneticEquivalents(w1, w2)) return 0.95;

  // Prefix matching (same first 3+ characters)
  const minLen = Math.min(w1.length, w2.length);
  if (minLen >= 3) {
    const prefixLen = Math.min(3, minLen);
    if (w1.substring(0, prefixLen) === w2.substring(0, prefixLen)) {
      const lengthRatio = Math.min(w1.length, w2.length) / Math.max(w1.length, w2.length);
      return 0.6 + (0.35 * lengthRatio);
    }
  }

  // Levenshtein-based similarity
  const distance = levenshteinDistance(w1, w2);
  const maxLen = Math.max(w1.length, w2.length);
  const similarity = 1 - (distance / maxLen);

  // Bonus for same length
  const lengthBonus = w1.length === w2.length ? 0.1 : 0;

  return Math.min(1, similarity + lengthBonus);
}

/**
 * Check if word is a filler word
 */
function isFillerWord(word: string): boolean {
  const fillers = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'i mean', 'so', 'well'];
  return fillers.includes(normalizeWord(word));
}

/**
 * Main word matching function using dynamic programming alignment
 * Based on word-analyzer-v2 analyzePronunciation (lines 2015-2137)
 */
export function matchWords(
  expectedWords: string[],
  spokenWords: WordTiming[]
): MatchingResult {
  // Filter out filler words from spoken
  const cleanSpoken = spokenWords.filter(w => !isFillerWord(w.word));

  if (expectedWords.length === 0) {
    return {
      words: [],
      correctCount: 0,
      errorCount: 0,
      skipCount: 0,
      substitutionCount: 0,
      misreadCount: 0,
    };
  }

  if (cleanSpoken.length === 0) {
    // All words skipped
    return {
      words: expectedWords.map(word => ({
        expected: word,
        spoken: null,
        status: 'skipped' as WordStatus,
        startTime: 0,
        endTime: 0,
        confidence: 0,
      })),
      correctCount: 0,
      errorCount: expectedWords.length,
      skipCount: expectedWords.length,
      substitutionCount: 0,
      misreadCount: 0,
    };
  }

  const m = expectedWords.length;
  const n = cleanSpoken.length;

  // DP table: dp[i][j] = best score aligning expected[0..i-1] with spoken[0..j-1]
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(-Infinity));
  const parent: [number, number, string][][] = Array(m + 1).fill(null).map(() =>
    Array(n + 1).fill(null).map(() => [-1, -1, ''] as [number, number, string])
  );

  dp[0][0] = 0;

  // Fill DP table
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (dp[i][j] === -Infinity) continue;

      // Option 1: Match expected[i] with spoken[j]
      if (i < m && j < n) {
        const similarity = calculateWordSimilarity(expectedWords[i], cleanSpoken[j].word);
        let score: number;
        let status: string;

        if (similarity >= 0.95) {
          score = 1.0;
          status = 'correct';
        } else if (similarity >= 0.7) {
          score = 0.5;
          status = 'misread';
        } else if (similarity >= 0.4) {
          score = 0.2;
          status = 'substituted';
        } else {
          score = -0.5;
          status = 'substituted';
        }

        if (dp[i][j] + score > dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = dp[i][j] + score;
          parent[i + 1][j + 1] = [i, j, status];
        }
      }

      // Option 2: Skip expected word (not spoken)
      if (i < m) {
        const skipPenalty = -1.0;
        if (dp[i][j] + skipPenalty > dp[i + 1][j]) {
          dp[i + 1][j] = dp[i][j] + skipPenalty;
          parent[i + 1][j] = [i, j, 'skipped'];
        }
      }

      // Option 3: Extra spoken word (insertion) - skip it
      if (j < n) {
        const insertPenalty = -0.3;
        if (dp[i][j] + insertPenalty > dp[i][j + 1]) {
          dp[i][j + 1] = dp[i][j] + insertPenalty;
          parent[i][j + 1] = [i, j, 'extra'];
        }
      }
    }
  }

  // Backtrack to find alignment
  const alignment: AlignedWord[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    const [pi, pj, status] = parent[i][j];

    if (pi === -1 && pj === -1) break;

    if (status === 'correct' || status === 'misread' || status === 'substituted') {
      alignment.unshift({
        expected: expectedWords[pi],
        spoken: cleanSpoken[pj].word,
        status: status as WordStatus,
        startTime: cleanSpoken[pj].startTime,
        endTime: cleanSpoken[pj].endTime,
        confidence: cleanSpoken[pj].confidence,
      });
      i = pi;
      j = pj;
    } else if (status === 'skipped') {
      alignment.unshift({
        expected: expectedWords[pi],
        spoken: null,
        status: 'skipped',
        startTime: 0,
        endTime: 0,
        confidence: 0,
      });
      i = pi;
    } else if (status === 'extra') {
      // Extra spoken word - skip it in output
      j = pj;
    } else {
      break;
    }
  }

  // Count results
  let correctCount = 0;
  let skipCount = 0;
  let substitutionCount = 0;
  let misreadCount = 0;

  for (const word of alignment) {
    switch (word.status) {
      case 'correct':
        correctCount++;
        break;
      case 'skipped':
        skipCount++;
        break;
      case 'substituted':
        substitutionCount++;
        break;
      case 'misread':
        misreadCount++;
        break;
    }
  }

  return {
    words: alignment,
    correctCount,
    errorCount: skipCount + substitutionCount + misreadCount,
    skipCount,
    substitutionCount,
    misreadCount,
  };
}
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

**Step 3: Commit**

```bash
cd ..
git add functions/src/services/wordMatching.ts
git commit -m "feat: add word matching algorithm with DP alignment"
```

---

### Task 2.5: Create Metrics Calculator

**Files:**
- Create: `functions/src/services/metricsCalculator.ts`

**Step 1: Create the metrics service (ported from word-analyzer-v2)**

```typescript
/**
 * Metrics Calculator
 * Calculates accuracy, WPM, prosody score, and error patterns
 * Ported from word-analyzer-v2 calculateProsodyMetrics (lines 2249-2281)
 */

import { AlignedWord, MatchingResult } from './wordMatching';

export interface Metrics {
  accuracy: number;
  wordsPerMinute: number;
  prosodyScore: number;
  prosodyGrade: string;
  totalWords: number;
  correctCount: number;
  errorCount: number;
  skipCount: number;
}

export interface ErrorPattern {
  type: 'substitution' | 'phonetic' | 'initial_sound' | 'final_sound' | 'visual_similarity';
  pattern: string;
  examples: Array<{ expected: string; spoken: string }>;
  count: number;
}

/**
 * Calculate all metrics from matching result
 */
export function calculateMetrics(
  matchingResult: MatchingResult,
  audioDuration: number
): Metrics {
  const { words, correctCount, errorCount, skipCount } = matchingResult;
  const totalWords = words.length;

  // Accuracy percentage
  const accuracy = totalWords > 0
    ? Math.round((correctCount / totalWords) * 100)
    : 0;

  // Words per minute
  const wordsRead = correctCount + matchingResult.misreadCount + matchingResult.substitutionCount;
  const minutesElapsed = audioDuration / 60;
  const wordsPerMinute = minutesElapsed > 0
    ? Math.round(wordsRead / minutesElapsed)
    : 0;

  // Prosody score calculation (from word-analyzer-v2 lines 2249-2281)
  // Component 1: Accuracy points (40% weight)
  let accuracyPoints: number;
  if (accuracy >= 98) accuracyPoints = 4;
  else if (accuracy >= 95) accuracyPoints = 3.5;
  else if (accuracy >= 90) accuracyPoints = 3;
  else if (accuracy >= 85) accuracyPoints = 2.5;
  else if (accuracy >= 75) accuracyPoints = 2;
  else accuracyPoints = 1.5;

  // Component 2: Rate points (30% weight)
  let ratePoints: number;
  if (wordsPerMinute >= 100 && wordsPerMinute <= 180) ratePoints = 4;
  else if (wordsPerMinute >= 80 && wordsPerMinute <= 200) ratePoints = 3.5;
  else if (wordsPerMinute >= 60 && wordsPerMinute <= 220) ratePoints = 3;
  else ratePoints = 2;

  // Component 3: Fluency points (30% weight)
  const errorRate = totalWords > 0 ? errorCount / totalWords : 0;
  let fluencyPoints: number;
  if (errorRate <= 0.02) fluencyPoints = 4;
  else if (errorRate <= 0.05) fluencyPoints = 3.5;
  else if (errorRate <= 0.10) fluencyPoints = 3;
  else if (errorRate <= 0.20) fluencyPoints = 2.5;
  else fluencyPoints = 2;

  // Final prosody score
  const prosodyScore = Math.round(
    (accuracyPoints * 0.4 + ratePoints * 0.3 + fluencyPoints * 0.3) * 10
  ) / 10;

  // Grade assignment
  let prosodyGrade: string;
  if (prosodyScore >= 3.8) prosodyGrade = 'Excellent';
  else if (prosodyScore >= 3.0) prosodyGrade = 'Proficient';
  else if (prosodyScore >= 2.0) prosodyGrade = 'Developing';
  else prosodyGrade = 'Needs Support';

  return {
    accuracy,
    wordsPerMinute,
    prosodyScore,
    prosodyGrade,
    totalWords,
    correctCount,
    errorCount,
    skipCount,
  };
}

/**
 * Analyze error patterns
 * Based on word-analyzer-v2 analyzeErrorPatterns (lines 2140-2165)
 */
export function analyzeErrorPatterns(words: AlignedWord[]): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];
  const patternMap = new Map<string, ErrorPattern>();

  for (const word of words) {
    if (word.status === 'correct' || !word.spoken) continue;

    const expected = word.expected.toLowerCase();
    const spoken = word.spoken.toLowerCase();

    // Initial sound errors
    if (expected[0] !== spoken[0]) {
      const key = 'initial_sound';
      const existing = patternMap.get(key);
      if (existing) {
        existing.examples.push({ expected: word.expected, spoken: word.spoken });
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'initial_sound',
          pattern: 'Initial consonant substitution',
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }

    // Final sound errors
    if (expected[expected.length - 1] !== spoken[spoken.length - 1]) {
      const key = 'final_sound';
      const existing = patternMap.get(key);
      if (existing) {
        existing.examples.push({ expected: word.expected, spoken: word.spoken });
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'final_sound',
          pattern: 'Final sound error',
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }

    // Visual similarity (b/d, p/q, m/n, u/n)
    const visualPairs = [['b', 'd'], ['p', 'q'], ['m', 'n'], ['u', 'n']];
    for (const [a, b] of visualPairs) {
      if ((expected.includes(a) && spoken.includes(b)) ||
          (expected.includes(b) && spoken.includes(a))) {
        const key = `visual_${a}_${b}`;
        const existing = patternMap.get(key);
        if (existing) {
          existing.examples.push({ expected: word.expected, spoken: word.spoken });
          existing.count++;
        } else {
          patternMap.set(key, {
            type: 'visual_similarity',
            pattern: `Visual confusion: ${a}/${b}`,
            examples: [{ expected: word.expected, spoken: word.spoken }],
            count: 1,
          });
        }
      }
    }

    // Substitution tracking
    if (word.status === 'substituted') {
      const key = `sub_${expected}_${spoken}`;
      const existing = patternMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternMap.set(key, {
          type: 'substitution',
          pattern: `"${word.expected}" → "${word.spoken}"`,
          examples: [{ expected: word.expected, spoken: word.spoken }],
          count: 1,
        });
      }
    }
  }

  // Convert map to array and sort by count
  for (const pattern of patternMap.values()) {
    patterns.push(pattern);
  }

  return patterns.sort((a, b) => b.count - a.count);
}
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

**Step 3: Commit**

```bash
cd ..
git add functions/src/services/metricsCalculator.ts
git commit -m "feat: add metrics calculator for accuracy, WPM, prosody"
```

---

### Task 2.6: Create Main Processing Function

**Files:**
- Modify: `functions/src/index.ts`

**Step 1: Update index.ts with full processing logic**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as path from 'path';
import { transcribeAudio } from './services/speechToText';
import { extractTextFromImage } from './services/visionOcr';
import { matchWords } from './services/wordMatching';
import { calculateMetrics, analyzeErrorPatterns } from './services/metricsCalculator';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

interface AssessmentData {
  studentId: string;
  studentName: string;
  teacherId: string;
  status: 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Triggered when a file is uploaded to the uploads/ folder
 * Expected path: uploads/{teacherId}/{assessmentId}/audio.webm or image.jpg
 */
export const processAssessment = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '1GB',
  })
  .storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath) return;

    // Only process files in uploads/ folder
    if (!filePath.startsWith('uploads/')) return;

    const pathParts = filePath.split('/');
    // Expected: uploads/{teacherId}/{assessmentId}/{filename}
    if (pathParts.length !== 4) return;

    const [, teacherId, assessmentId, fileName] = pathParts;

    console.log(`Processing file: ${filePath}`);
    console.log(`Teacher: ${teacherId}, Assessment: ${assessmentId}, File: ${fileName}`);

    // Check if this is the second file (we need both audio and image)
    const assessmentRef = db.collection('teachers').doc(teacherId)
      .collection('assessments').doc(assessmentId);

    const bucket = storage.bucket(object.bucket);
    const uploadsPrefix = `uploads/${teacherId}/${assessmentId}/`;

    const [files] = await bucket.getFiles({ prefix: uploadsPrefix });

    // Wait for both files
    const hasAudio = files.some(f => f.name.includes('audio'));
    const hasImage = files.some(f => f.name.includes('image'));

    if (!hasAudio || !hasImage) {
      console.log('Waiting for both files to be uploaded...');
      return;
    }

    console.log('Both files present, starting processing...');

    try {
      // Update status to processing
      await assessmentRef.update({ status: 'processing' });

      // Download files
      const audioFile = files.find(f => f.name.includes('audio'))!;
      const imageFile = files.find(f => f.name.includes('image'))!;

      const [audioBuffer] = await audioFile.download();
      const [imageBuffer] = await imageFile.download();

      console.log('Files downloaded, calling APIs...');

      // Call Speech-to-Text
      const transcription = await transcribeAudio(
        audioBuffer,
        object.contentType || 'audio/webm'
      );
      console.log(`Transcription: "${transcription.transcript.substring(0, 100)}..."`);

      // Call Vision OCR
      const ocrResult = await extractTextFromImage(imageBuffer);
      console.log(`OCR extracted ${ocrResult.words.length} words`);

      // Parse OCR text into word array
      const expectedWords = ocrResult.fullText
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9']/g, ''))
        .filter(w => w.length > 0);

      // Match words
      const matchingResult = matchWords(expectedWords, transcription.words);
      console.log(`Matching complete: ${matchingResult.correctCount} correct, ${matchingResult.errorCount} errors`);

      // Calculate metrics
      const audioDuration = transcription.words.length > 0
        ? transcription.words[transcription.words.length - 1].endTime
        : 0;
      const metrics = calculateMetrics(matchingResult, audioDuration);

      // Analyze error patterns
      const errorPatterns = analyzeErrorPatterns(matchingResult.words);

      // Move audio to temp bucket for playback (24h TTL handled by lifecycle rule)
      const tempAudioPath = `audio-temp/${teacherId}/${assessmentId}/audio.webm`;
      await bucket.file(audioFile.name).copy(bucket.file(tempAudioPath));

      // Generate signed URL for audio (expires in 24h)
      const [audioUrl] = await bucket.file(tempAudioPath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });

      // Save results to Firestore
      await assessmentRef.update({
        status: 'complete',
        audioUrl,
        audioDuration,
        ocrText: ocrResult.fullText,
        transcript: transcription.transcript,
        metrics: {
          accuracy: metrics.accuracy,
          wordsPerMinute: metrics.wordsPerMinute,
          prosodyScore: metrics.prosodyScore,
          prosodyGrade: metrics.prosodyGrade,
          totalWords: metrics.totalWords,
          correctCount: metrics.correctCount,
          errorCount: metrics.errorCount,
          skipCount: metrics.skipCount,
        },
        words: matchingResult.words,
        errorPatterns,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Results saved to Firestore');

      // Delete original uploads
      await audioFile.delete();
      await imageFile.delete();
      console.log('Original uploads deleted');

    } catch (error) {
      console.error('Processing error:', error);

      await assessmentRef.update({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
```

**Step 2: Build to verify**

```bash
cd functions && npm run build
```

**Step 3: Commit**

```bash
cd ..
git add functions/src/index.ts
git commit -m "feat: implement main assessment processing Cloud Function"
```

---

## Phase 3: iPad App - Student Management

### Task 3.1: Create Student Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Read current types file**

```bash
cat src/types/index.ts
```

**Step 2: Add student and assessment types**

```typescript
// Add to existing types file

export interface Student {
  id: string;
  name: string;
  grade?: string;
  createdAt: Date;
}

export interface AssessmentMetrics {
  accuracy: number;
  wordsPerMinute: number;
  prosodyScore: number;
  prosodyGrade: string;
  totalWords: number;
  correctCount: number;
  errorCount: number;
  skipCount: number;
}

export interface AlignedWord {
  expected: string;
  spoken: string | null;
  status: 'correct' | 'misread' | 'substituted' | 'skipped';
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface ErrorPattern {
  type: string;
  pattern: string;
  examples: Array<{ expected: string; spoken: string }>;
  count: number;
}

export interface Assessment {
  id: string;
  studentId: string;
  studentName: string;
  status: 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;

  // Media URLs (temporary, 24h)
  audioUrl?: string;
  videoUrl?: string;
  audioDuration?: number;

  // Results
  ocrText?: string;
  transcript?: string;
  metrics?: AssessmentMetrics;
  words?: AlignedWord[];
  errorPatterns?: ErrorPattern[];
}
```

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Student and Assessment type definitions"
```

---

### Task 3.2: Create Student Service

**Files:**
- Create: `src/services/studentService.ts`

**Step 1: Create the student service**

```typescript
import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Student } from '../types';

/**
 * Get all students for a teacher
 */
export async function getStudents(teacherId: string): Promise<Student[]> {
  const studentsRef = collection(db, 'teachers', teacherId, 'students');
  const q = query(studentsRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    grade: doc.data().grade,
    createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
  }));
}

/**
 * Add a new student
 */
export async function addStudent(
  teacherId: string,
  name: string,
  grade?: string
): Promise<Student> {
  const studentsRef = collection(db, 'teachers', teacherId, 'students');

  const docRef = await addDoc(studentsRef, {
    name,
    grade: grade || null,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    name,
    grade,
    createdAt: new Date(),
  };
}

/**
 * Delete a student
 */
export async function deleteStudent(teacherId: string, studentId: string): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentId);
  await deleteDoc(studentRef);
}
```

**Step 2: Commit**

```bash
git add src/services/studentService.ts
git commit -m "feat: add student service for CRUD operations"
```

---

### Task 3.3: Create Student Selector Component

**Files:**
- Create: `src/components/StudentSelector.tsx`

**Step 1: Create the component**

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Student } from '../types';
import { getStudents, addStudent } from '../services/studentService';

interface Props {
  teacherId: string;
  selectedStudent: Student | null;
  onSelectStudent: (student: Student) => void;
}

export default function StudentSelector({ teacherId, selectedStudent, onSelectStudent }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [teacherId]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await getStudents(teacherId);
      setStudents(data);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;

    setAdding(true);
    try {
      const student = await addStudent(teacherId, newStudentName.trim(), newStudentGrade.trim());
      setStudents(prev => [...prev, student].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStudentName('');
      setNewStudentGrade('');
      setAddModalOpen(false);
      onSelectStudent(student);
    } catch (error) {
      console.error('Failed to add student:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleSelectStudent = (student: Student) => {
    onSelectStudent(student);
    setDropdownOpen(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#4299E1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select Student</Text>

      <TouchableOpacity
        style={styles.selector}
        onPress={() => setDropdownOpen(true)}
      >
        <Text style={selectedStudent ? styles.selectedText : styles.placeholderText}>
          {selectedStudent ? selectedStudent.name : 'Choose student...'}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={24} color="#718096" />
      </TouchableOpacity>

      {/* Dropdown Modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={styles.dropdownContainer}>
            <FlatList
              data={students}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    selectedStudent?.id === item.id && styles.dropdownItemSelected,
                  ]}
                  onPress={() => handleSelectStudent(item)}
                >
                  <Text style={styles.dropdownItemText}>{item.name}</Text>
                  {item.grade && (
                    <Text style={styles.dropdownItemGrade}>Grade {item.grade}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No students yet</Text>
              }
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    setDropdownOpen(false);
                    setAddModalOpen(true);
                  }}
                >
                  <MaterialIcons name="add" size={20} color="#4299E1" />
                  <Text style={styles.addButtonText}>Add New Student</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Student Modal */}
      <Modal
        visible={addModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <Text style={styles.addModalTitle}>Add New Student</Text>

            <Text style={styles.inputLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={newStudentName}
              onChangeText={setNewStudentName}
              placeholder="Enter student name"
              autoFocus
            />

            <Text style={styles.inputLabel}>Grade (optional)</Text>
            <TextInput
              style={styles.input}
              value={newStudentGrade}
              onChangeText={setNewStudentGrade}
              placeholder="e.g., 3"
              keyboardType="number-pad"
            />

            <View style={styles.addModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setAddModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !newStudentName.trim() && styles.buttonDisabled]}
                onPress={handleAddStudent}
                disabled={!newStudentName.trim() || adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Add Student</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 250,
  },
  placeholderText: {
    fontSize: 16,
    color: '#A0AEC0',
  },
  selectedText: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 300,
    maxHeight: 400,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dropdownItemSelected: {
    backgroundColor: '#EBF8FF',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#2D3748',
  },
  dropdownItemGrade: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  emptyText: {
    padding: 16,
    textAlign: 'center',
    color: '#718096',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#4299E1',
    fontWeight: '500',
  },
  addModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: 320,
  },
  addModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A5568',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  addModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#718096',
  },
  confirmButton: {
    backgroundColor: '#48BB78',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
```

**Step 2: Commit**

```bash
git add src/components/StudentSelector.tsx
git commit -m "feat: add StudentSelector dropdown component"
```

---

### Task 3.4: Integrate Student Selector into Home Screen

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Step 1: Add imports and state at top of file**

Add after existing imports:
```typescript
import StudentSelector from '../components/StudentSelector';
import { Student } from '../types';
```

Add to component state (after other useState calls):
```typescript
const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
```

**Step 2: Add StudentSelector to render, before the mainContent View**

Add inside the component, after the header View and before the mainContent View:
```typescript
{/* Student Selector */}
<View style={styles.studentSelectorContainer}>
  <StudentSelector
    teacherId={teacher?.uid || ''}
    selectedStudent={selectedStudent}
    onSelectStudent={setSelectedStudent}
  />
</View>
```

**Step 3: Disable buttons when no student selected**

Update the disabled prop on both buttons:
```typescript
disabled={isAnyActive || !selectedStudent}
```

**Step 4: Pass studentId to Analysis screen navigation**

Update the navigation.navigate call:
```typescript
onPress={() => navigation.navigate('Analysis', {
  nameAudioUri,
  readingAudioUri,
  imageUri: capturedImageUri,
  studentId: selectedStudent?.id || '',
  studentName: selectedStudent?.name || '',
})}
```

**Step 5: Add style for student selector container**

```typescript
studentSelectorContainer: {
  paddingHorizontal: 24,
  paddingVertical: 16,
  alignItems: 'center',
},
```

**Step 6: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: integrate StudentSelector into HomeScreen"
```

---

## Phase 4: iPad App - Assessment Upload & Analysis Screen

### Task 4.1: Create Assessment Service

**Files:**
- Create: `src/services/assessmentService.ts`

**Step 1: Create the service**

```typescript
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db } from '../config/firebase';
import { Assessment } from '../types';
import { getStorage } from 'firebase/storage';

const storage = getStorage();

/**
 * Create a new assessment and upload files
 */
export async function createAssessment(
  teacherId: string,
  studentId: string,
  studentName: string,
  audioUri: string,
  imageUri: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<string> {
  // Generate assessment ID
  const assessmentId = doc(collection(db, 'temp')).id;

  // Create assessment document with processing status
  const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);
  await setDoc(assessmentRef, {
    studentId,
    studentName,
    status: 'processing',
    createdAt: serverTimestamp(),
  });

  onProgress?.('Uploading audio...', 0);

  // Upload audio file
  const audioResponse = await fetch(audioUri);
  const audioBlob = await audioResponse.blob();
  const audioRef = ref(storage, `uploads/${teacherId}/${assessmentId}/audio.webm`);
  await uploadBytes(audioRef, audioBlob);

  onProgress?.('Uploading image...', 50);

  // Upload image file
  const imageResponse = await fetch(imageUri);
  const imageBlob = await imageResponse.blob();
  const imageRef = ref(storage, `uploads/${teacherId}/${assessmentId}/image.jpg`);
  await uploadBytes(imageRef, imageBlob);

  onProgress?.('Processing...', 100);

  return assessmentId;
}

/**
 * Subscribe to assessment status updates
 */
export function subscribeToAssessment(
  teacherId: string,
  assessmentId: string,
  onUpdate: (assessment: Assessment) => void
): Unsubscribe {
  const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);

  return onSnapshot(assessmentRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      onUpdate({
        id: snapshot.id,
        studentId: data.studentId,
        studentName: data.studentName,
        status: data.status,
        errorMessage: data.errorMessage,
        createdAt: data.createdAt?.toDate() || new Date(),
        processedAt: data.processedAt?.toDate(),
        audioUrl: data.audioUrl,
        videoUrl: data.videoUrl,
        audioDuration: data.audioDuration,
        ocrText: data.ocrText,
        transcript: data.transcript,
        metrics: data.metrics,
        words: data.words,
        errorPatterns: data.errorPatterns,
      });
    }
  });
}
```

**Step 2: Commit**

```bash
git add src/services/assessmentService.ts
git commit -m "feat: add assessment service for upload and real-time updates"
```

---

### Task 4.2: Rewrite Analysis Screen - Structure & States

**Files:**
- Modify: `src/screens/AnalysisScreen.tsx`

**Step 1: Complete rewrite of AnalysisScreen**

```typescript
/**
 * Analysis Screen
 * Shows upload progress, processing status, and results
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAuth } from '../hooks/useAuth';
import { Assessment, AlignedWord } from '../types';
import { createAssessment, subscribeToAssessment } from '../services/assessmentService';

type RootStackParamList = {
  Home: undefined;
  Analysis: {
    nameAudioUri: string | null;
    readingAudioUri: string | null;
    imageUri: string | null;
    studentId: string;
    studentName: string;
  };
};

type AnalysisScreenRouteProp = RouteProp<RootStackParamList, 'Analysis'>;

type Tab = 'summary' | 'video' | 'image' | 'patterns';

export default function AnalysisScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AnalysisScreenRouteProp>();
  const { nameAudioUri, readingAudioUri, imageUri, studentId, studentName } = route.params;
  const { teacher } = useAuth();

  // Upload/processing state
  const [uploadStage, setUploadStage] = useState<string>('Starting...');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [selectedWord, setSelectedWord] = useState<AlignedWord | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Start upload on mount
  useEffect(() => {
    if (teacher && readingAudioUri && imageUri) {
      startUpload();
    }

    return () => {
      unsubscribeRef.current?.();
      soundRef.current?.unloadAsync();
    };
  }, []);

  const startUpload = async () => {
    if (!teacher || !readingAudioUri || !imageUri) return;

    try {
      const id = await createAssessment(
        teacher.uid,
        studentId,
        studentName,
        readingAudioUri,
        imageUri,
        (stage, progress) => {
          setUploadStage(stage);
          setUploadProgress(progress);
        }
      );

      setAssessmentId(id);

      // Subscribe to assessment updates
      unsubscribeRef.current = subscribeToAssessment(
        teacher.uid,
        id,
        (updated) => {
          setAssessment(updated);
        }
      );
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStage('Upload failed');
    }
  };

  const playWordAudio = async (word: AlignedWord) => {
    if (!assessment?.audioUrl || word.startTime === 0) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: assessment.audioUrl },
        { positionMillis: word.startTime * 1000 }
      );
      soundRef.current = sound;
      setIsPlayingAudio(true);

      // Stop after word duration
      const duration = (word.endTime - word.startTime) * 1000;
      setTimeout(async () => {
        await sound.stopAsync();
        setIsPlayingAudio(false);
      }, duration + 100);

      await sound.playAsync();
    } catch (error) {
      console.error('Failed to play audio:', error);
      setIsPlayingAudio(false);
    }
  };

  const getWordStyle = (status: string) => {
    switch (status) {
      case 'correct': return styles.wordCorrect;
      case 'misread': return styles.wordMisread;
      case 'substituted': return styles.wordSubstituted;
      case 'skipped': return styles.wordSkipped;
      default: return {};
    }
  };

  // RENDER: Uploading/Processing state
  if (!assessment || assessment.status === 'processing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#4299E1" />
          <Text style={styles.processingTitle}>
            {assessment ? 'Analyzing your reading...' : uploadStage}
          </Text>

          {!assessment && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
          )}

          {assessment && (
            <View style={styles.processingSteps}>
              <ProcessingStep label="Audio uploaded" done />
              <ProcessingStep label="Image uploaded" done />
              <ProcessingStep label="Transcribing speech" active />
              <ProcessingStep label="Extracting text" />
              <ProcessingStep label="Matching words" />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // RENDER: Error state
  if (assessment.status === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#E53E3E" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{assessment.errorMessage}</Text>
          <View style={styles.errorButtons}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // RENDER: Results
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#4A5568" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{studentName}'s Results</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          <SidebarTab
            icon="summarize"
            label="Summary"
            active={activeTab === 'summary'}
            onPress={() => setActiveTab('summary')}
          />
          <SidebarTab
            icon="videocam"
            label="Video"
            active={activeTab === 'video'}
            onPress={() => setActiveTab('video')}
          />
          <SidebarTab
            icon="image"
            label="Image"
            active={activeTab === 'image'}
            onPress={() => setActiveTab('image')}
          />
          <SidebarTab
            icon="pattern"
            label="Patterns"
            active={activeTab === 'patterns'}
            onPress={() => setActiveTab('patterns')}
          />
        </View>

        {/* Results Area */}
        <ScrollView style={styles.resultsArea}>
          {activeTab === 'summary' && (
            <SummaryTab
              assessment={assessment}
              onWordPress={(word) => setSelectedWord(word)}
              getWordStyle={getWordStyle}
            />
          )}
          {activeTab === 'video' && <VideoTab assessment={assessment} />}
          {activeTab === 'image' && <ImageTab assessment={assessment} />}
          {activeTab === 'patterns' && <PatternsTab assessment={assessment} />}
        </ScrollView>
      </View>

      {/* Word Popup Modal */}
      {selectedWord && (
        <WordPopup
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onPlayAudio={() => playWordAudio(selectedWord)}
          isPlaying={isPlayingAudio}
        />
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.newAssessmentButton}
          onPress={() => navigation.navigate('Home')}
        >
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.newAssessmentText}>Start New Assessment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Sub-components

function ProcessingStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <View style={styles.processingStep}>
      <MaterialIcons
        name={done ? 'check-circle' : active ? 'autorenew' : 'radio-button-unchecked'}
        size={20}
        color={done ? '#48BB78' : active ? '#4299E1' : '#A0AEC0'}
      />
      <Text style={[styles.processingStepText, active && styles.processingStepActive]}>
        {label}
      </Text>
    </View>
  );
}

function SidebarTab({ icon, label, active, onPress }: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.sidebarItem, active && styles.sidebarItemActive]}
      onPress={onPress}
    >
      <MaterialIcons
        name={icon as any}
        size={24}
        color={active ? '#4299E1' : '#718096'}
      />
      <Text style={[styles.sidebarText, active && styles.sidebarTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SummaryTab({ assessment, onWordPress, getWordStyle }: {
  assessment: Assessment;
  onWordPress: (word: AlignedWord) => void;
  getWordStyle: (status: string) => any;
}) {
  const metrics = assessment.metrics;

  return (
    <View style={styles.summaryContainer}>
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatBox label="Correct" value={metrics?.correctCount || 0} color="#48BB78" />
        <StatBox label="Errors" value={metrics?.errorCount || 0} color="#E53E3E" />
        <StatBox label="Accuracy" value={`${metrics?.accuracy || 0}%`} color="#4299E1" />
        <StatBox label="WPM" value={metrics?.wordsPerMinute || 0} color="#9F7AEA" />
        <StatBox label="Prosody" value={metrics?.prosodyScore || 0} color="#ED8936" />
      </View>

      {/* AI Summary */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>
          {metrics?.prosodyGrade === 'Excellent'
            ? `Great job! You read ${metrics?.totalWords} words with ${metrics?.accuracy}% accuracy.`
            : metrics?.prosodyGrade === 'Proficient'
            ? `Good reading! ${metrics?.correctCount} words correct. Keep practicing the highlighted words.`
            : `Keep practicing! Focus on the words highlighted in red and orange.`
          }
        </Text>
      </View>

      {/* Word Highlighting */}
      <Text style={styles.sectionTitle}>Text with Error Highlighting</Text>
      <View style={styles.wordsContainer}>
        {assessment.words?.map((word, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => onWordPress(word)}
            style={[styles.word, getWordStyle(word.status)]}
          >
            <Text style={styles.wordText}>{word.expected}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color="#C6F6D5" label="Correct" />
        <LegendItem color="#FEEBC8" label="Misread" />
        <LegendItem color="#FED7D7" label="Substituted" />
        <LegendItem color="#E2E8F0" label="Skipped" />
      </View>

      {/* Error Breakdown */}
      {assessment.errorPatterns && assessment.errorPatterns.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Error Breakdown</Text>
          <View style={styles.errorBreakdown}>
            {assessment.errorPatterns.slice(0, 5).map((pattern, index) => (
              <View key={index} style={styles.errorPatternItem}>
                <Text style={styles.errorPatternText}>
                  {pattern.pattern} ({pattern.count}x)
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendColor, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function VideoTab({ assessment }: { assessment: Assessment }) {
  // Video tab implementation - placeholder for now
  return (
    <View style={styles.tabPlaceholder}>
      <MaterialIcons name="videocam" size={64} color="#CBD5E0" />
      <Text style={styles.placeholderText}>Video generation coming soon</Text>
    </View>
  );
}

function ImageTab({ assessment }: { assessment: Assessment }) {
  return (
    <View style={styles.tabPlaceholder}>
      <MaterialIcons name="image" size={64} color="#CBD5E0" />
      <Text style={styles.placeholderText}>
        {assessment.ocrText
          ? `Detected ${assessment.ocrText.split(/\s+/).length} words`
          : 'No image data'
        }
      </Text>
    </View>
  );
}

function PatternsTab({ assessment }: { assessment: Assessment }) {
  const patterns = assessment.errorPatterns || [];

  if (patterns.length === 0) {
    return (
      <View style={styles.tabPlaceholder}>
        <MaterialIcons name="check-circle" size={64} color="#48BB78" />
        <Text style={styles.placeholderText}>No error patterns detected</Text>
      </View>
    );
  }

  return (
    <View style={styles.patternsContainer}>
      <Text style={styles.sectionTitle}>Phonetic Patterns</Text>
      {patterns.map((pattern, index) => (
        <View key={index} style={styles.patternCard}>
          <View style={styles.patternHeader}>
            <Text style={styles.patternTitle}>{pattern.pattern}</Text>
            <Text style={styles.patternCount}>{pattern.count} errors</Text>
          </View>
          <View style={styles.patternExamples}>
            {pattern.examples.slice(0, 3).map((ex, i) => (
              <Text key={i} style={styles.patternExample}>
                "{ex.expected}" → "{ex.spoken}"
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function WordPopup({ word, onClose, onPlayAudio, isPlaying }: {
  word: AlignedWord;
  onClose: () => void;
  onPlayAudio: () => void;
  isPlaying: boolean;
}) {
  return (
    <View style={styles.popupOverlay}>
      <View style={styles.popupContainer}>
        <Text style={styles.popupTitle}>Word Details</Text>

        <View style={styles.popupRow}>
          <Text style={styles.popupLabel}>Expected:</Text>
          <Text style={styles.popupValue}>{word.expected}</Text>
        </View>

        <View style={styles.popupRow}>
          <Text style={styles.popupLabel}>Spoken:</Text>
          <Text style={styles.popupValue}>{word.spoken || '—'}</Text>
        </View>

        <View style={styles.popupRow}>
          <Text style={styles.popupLabel}>Status:</Text>
          <Text style={[styles.popupValue, styles[`status_${word.status}`]]}>
            {word.status.charAt(0).toUpperCase() + word.status.slice(1)}
          </Text>
        </View>

        {word.startTime > 0 && (
          <TouchableOpacity
            style={styles.playButton}
            onPress={onPlayAudio}
            disabled={isPlaying}
          >
            <MaterialIcons
              name={isPlaying ? 'stop' : 'play-arrow'}
              size={24}
              color="#FFFFFF"
            />
            <Text style={styles.playButtonText}>
              {isPlaying ? 'Playing...' : 'Play Audio'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  // Processing styles
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 20,
    marginBottom: 16,
  },
  progressBar: {
    width: '60%',
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4299E1',
  },
  processingSteps: {
    marginTop: 32,
    gap: 12,
  },
  processingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  processingStepText: {
    fontSize: 16,
    color: '#718096',
  },
  processingStepActive: {
    color: '#4299E1',
    fontWeight: '500',
  },
  // Error styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  errorButtons: {
    marginTop: 24,
  },
  retryButton: {
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4A5568',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
  },
  headerSpacer: {
    width: 80,
  },
  // Main content
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  // Sidebar
  sidebar: {
    width: 160,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingVertical: 16,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  sidebarItemActive: {
    backgroundColor: '#EBF8FF',
    borderRightWidth: 3,
    borderRightColor: '#4299E1',
  },
  sidebarText: {
    fontSize: 15,
    color: '#718096',
  },
  sidebarTextActive: {
    color: '#4299E1',
    fontWeight: '500',
  },
  // Results area
  resultsArea: {
    flex: 1,
    padding: 24,
  },
  // Summary tab
  summaryContainer: {
    gap: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderTopWidth: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2D3748',
  },
  statLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  summaryBox: {
    backgroundColor: '#EBF8FF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4299E1',
  },
  summaryText: {
    fontSize: 16,
    color: '#2C5282',
    lineHeight: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 12,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
  },
  word: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  wordText: {
    fontSize: 16,
    color: '#2D3748',
  },
  wordCorrect: {
    backgroundColor: '#C6F6D5',
  },
  wordMisread: {
    backgroundColor: '#FEEBC8',
  },
  wordSubstituted: {
    backgroundColor: '#FED7D7',
  },
  wordSkipped: {
    backgroundColor: '#E2E8F0',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 14,
    color: '#718096',
  },
  errorBreakdown: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  errorPatternItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  errorPatternText: {
    fontSize: 14,
    color: '#4A5568',
  },
  // Placeholder tabs
  tabPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  placeholderText: {
    fontSize: 16,
    color: '#718096',
    marginTop: 16,
  },
  // Patterns tab
  patternsContainer: {
    gap: 16,
  },
  patternCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
  },
  patternHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  patternTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  patternCount: {
    fontSize: 14,
    color: '#718096',
  },
  patternExamples: {
    gap: 4,
  },
  patternExample: {
    fontSize: 14,
    color: '#4A5568',
  },
  // Word popup
  popupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    width: 300,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 16,
    textAlign: 'center',
  },
  popupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  popupLabel: {
    fontSize: 14,
    color: '#718096',
  },
  popupValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2D3748',
  },
  status_correct: { color: '#48BB78' },
  status_misread: { color: '#ED8936' },
  status_substituted: { color: '#E53E3E' },
  status_skipped: { color: '#718096' },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  closeButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
  },
  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  newAssessmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#48BB78',
    borderRadius: 10,
  },
  newAssessmentText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
```

**Step 2: Commit**

```bash
git add src/screens/AnalysisScreen.tsx
git commit -m "feat: complete rewrite of AnalysisScreen with upload, processing, and results"
```

---

### Task 4.3: Update Navigation Types

**Files:**
- Modify: `src/navigation/AppNavigator.tsx`

**Step 1: Update RootStackParamList to include new params**

```typescript
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Analysis: {
    nameAudioUri: string | null;
    readingAudioUri: string | null;
    imageUri: string | null;
    studentId: string;
    studentName: string;
  };
};
```

**Step 2: Commit**

```bash
git add src/navigation/AppNavigator.tsx
git commit -m "feat: update navigation types for Analysis screen params"
```

---

## Phase 5: Deploy & Test

### Task 5.1: Deploy Firebase Rules

**Step 1: Deploy Firestore and Storage rules**

```bash
cd "C:\Users\brani\Desktop\Word analyzer ipad app\word-analyzer-app"
firebase deploy --only firestore:rules,storage
```

Expected: "Deploy complete!"

### Task 5.2: Deploy Cloud Functions

**Step 1: Deploy functions**

```bash
firebase deploy --only functions
```

Expected: "Function processAssessment deployed successfully"

### Task 5.3: Test End-to-End

**Step 1: Run the app**

```bash
npx expo start
```

**Step 2: Test flow**
1. Sign in as teacher
2. Add a student
3. Select student
4. Record audio (read some text)
5. Capture image of text
6. Tap "View Analysis"
7. Wait for processing
8. Verify results appear

---

## Phase 6: Teacher Dashboard (Future)

This phase will be documented separately. Key tasks:

1. Create React web app in `teacher-dashboard/`
2. Firebase Hosting configuration
3. Authentication with same Google Sign-In
4. Student list with Celeration chart
5. Assessment detail view
6. Deploy to Firebase Hosting

---

## Summary

**Total Tasks:** 20+ tasks across 5 phases

**Phase 1:** Firebase infrastructure (rules, functions setup)
**Phase 2:** Cloud Function processing (Speech-to-Text, OCR, word matching, metrics)
**Phase 3:** iPad app student management (selector, service)
**Phase 4:** iPad app upload & analysis (assessment service, analysis screen)
**Phase 5:** Deploy & test

Each task follows TDD principles where applicable, with frequent commits.
