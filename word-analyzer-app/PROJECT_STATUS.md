# Word Analyzer iPad App - Project Status

**Last Updated:** December 12, 2024

## Quick Start (Resume Development)

```bash
# Terminal 1: Start Expo with tunnel (for iPad testing)
cd "C:\Users\brani\Desktop\Word analyzer ipad app\word-analyzer-app"
npx expo start --tunnel

# Terminal 2: Deploy cloud functions (if you changed functions/)
cd "C:\Users\brani\Desktop\Word analyzer ipad app\word-analyzer-app\functions"
npm run deploy
```

## Current State: WORKING

The app is functional and can:
- Record audio (30s or 60s) with voice prompts and countdown
- Capture image of text passage
- Upload to Firebase and process via Cloud Functions
- Pre-transcribe audio while user takes picture (saves 5-15s)
- Display results with word-by-word analysis
- Show prosody scores with detailed breakdown popup
- Detect hesitations, repeats, and self-corrections
- Click error patterns to highlight matching words (pulse animation)
- View image with first/last word highlighting
- Generate video playback with word highlighting (optimized keyframe approach)
- Export to PDF
- Simplified Patterns page with unified summary card
- **AI-generated personalized audio summaries** (ElevenLabs voice)
- **Auto video generation** after processing completes

## Recent Changes (December 12, 2024)

### 1. ElevenLabs TTS Integration (NEW)
Replaced Google Cloud TTS with ElevenLabs for more natural-sounding AI summaries.
- Primary: ElevenLabs "Rachel" voice (warm, conversational)
- Fallback: Google Cloud TTS Neural2 (if ElevenLabs fails)
- Firebase secret: `ELEVENLABS_API_KEY`

**Files changed:**
- `functions/src/services/textToSpeech.ts` - Complete rewrite with ElevenLabs SDK
- `functions/src/index.ts` - Added ELEVENLABS_API_KEY to secrets

### 2. AI Summary Variety Improvements
Made AI summaries unique and fun every time:
- Random variety seed in Gemini prompt
- 25+ unique sign-off options based on name/performance
- Random greetings and slang variations in fallback
- Higher temperature (0.95) for creative outputs

**Files changed:**
- `functions/src/services/summaryGenerator.ts` - Added randomization, creative sign-offs

### 3. Video Generation Optimization
Reduced video generation from 2-5 minutes to ~10-15 seconds:
- Keyframe-only approach (100-200 frames vs 1800+)
- JPEG encoding instead of PNG
- Auto-trigger after processing completes

**Files changed:**
- `functions/src/services/videoGenerator.ts` - Complete optimization rewrite

### 4. Hesitation Color Priority Fix
Purple hesitation color only shows if word is otherwise correct. Errors take priority:
- Misread/Substituted → Orange (priority over hesitation)
- Skipped → Red (priority over hesitation)
- Correct with hesitation → Purple

**Files changed:**
- `functions/src/services/videoGenerator.ts` - Updated getWordColor()
- `src/screens/AnalysisScreen.tsx` - Updated PulsingWord component

### 5. WPM Calculation Fix
WPM now only counts correctly read words, not total words.

**Files changed:**
- `functions/src/services/metricsCalculator.ts` - Fixed wordsPerMinute calculation

### 6. Patterns Tab Scroll Fix
Patterns tab now scrolls to top when selected instead of bottom.

**Files changed:**
- `src/screens/AnalysisScreen.tsx` - Added scrollViewRef, handleTabChange

## Previous Changes (December 11, 2024)

### 1. Pre-Transcribe Audio Function (NEW)
Added `preTranscribeAudio` cloud function that starts transcription immediately when audio uploads, **before** the image is taken. The main `processAssessment` function now checks for and reuses pre-transcription results, saving 5-15 seconds.

**Files changed:**
- `functions/src/index.ts` - Added `preTranscribeAudio` function, modified `processAssessment` to use pre-transcription

### 2. Error Pattern Click-to-Pulse Fix
Fixed bug where clicking "Self-corrected (caught own error) 9x" only highlighted 1 word. Now uses `pattern.type` to match by appropriate word flag:
- `hesitation` → `word.hesitation`
- `repetition` → `word.isRepeat`
- `self_correction` → `word.isSelfCorrection`

**Files changed:**
- `src/screens/AnalysisScreen.tsx` - Rewrote `handleErrorPatternClick` function
- `src/types/index.ts` - Added `isSelfCorrection` to `AlignedWord` interface

### 3. Simplified Patterns Page
Removed "Observed Strengths" section and combined containers into unified summary card:
- Severity badge header with color-coded background
- Inline referral alert (compact)
- Combined Focus Areas and Recommendations sections

**Files changed:**
- `src/screens/AnalysisScreen.tsx` - Rewrote `PatternsTab`, added new styles

### 4. Image Bounding Box Fix
Fixed inaccurate word highlighting on images. Now uses `canvas.loadImage()` to get actual image dimensions instead of deriving from text bounding box.

**Files changed:**
- `functions/src/services/visionOcr.ts` - Added actual image dimension extraction

### 5. Pulse Animation Fix
Changed pulse animation to not move elements - now uses fixed border width with animated color opacity.

**Files changed:**
- `src/screens/AnalysisScreen.tsx` - Updated `PulsingWord` component

### 6. Audio Prompt Simplification
Combined "please begin reading" voice prompt with beep into single audio file.

**Files changed:**
- `src/screens/RecordingScreen.tsx` - Simplified audio playback flow

### 7. Image Tab Improvements
- Removed "FIRST"/"LAST" labels, both highlights now green
- Added first/last words display above image

**Files changed:**
- `src/screens/AnalysisScreen.tsx` - Updated `ImageTab`

## Known Issues / TODO

1. **Web Camera Resolution** - Safari WebRTC defaults to 640x480. **Use Expo Go for native camera.**

2. **Long Transcription Time** - Google Speech-to-Text can take 30-60s for 60-second recordings. Pre-transcribe feature mitigates this.

3. **Gemini API Key** - May need to be refreshed periodically. Set via `firebase functions:secrets:set GEMINI_API_KEY`

## Architecture

```
word-analyzer-app/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx         # Main dashboard, student selection
│   │   ├── RecordingScreen.tsx    # Recording flow with voice prompts
│   │   ├── CaptureScreen.tsx      # Image capture
│   │   ├── AnalysisScreen.tsx     # Results (5 tabs)
│   │   ├── HistoryScreen.tsx      # Past assessments
│   │   └── AssessmentDetailScreen.tsx
│   ├── components/
│   │   └── StudentSelector.tsx
│   ├── services/
│   │   ├── assessmentService.ts   # Firebase upload/subscribe
│   │   └── studentService.ts      # Student CRUD
│   ├── hooks/
│   │   └── useAuth.ts             # Authentication
│   └── types/
│       └── index.ts               # TypeScript types
├── functions/
│   └── src/
│       ├── index.ts               # Cloud function entry points
│       └── services/
│           ├── speechToText.ts    # Google Speech API
│           ├── visionOcr.ts       # Google Vision OCR
│           ├── wordMatching.ts    # Alignment algorithm
│           ├── metricsCalculator.ts # Metrics & patterns
│           ├── videoGenerator.ts  # MP4 generation
│           └── pdfGenerator.ts    # PDF reports
├── CLAUDE.md                      # Developer documentation
└── firebase.json
```

## Firebase Project

- **Project ID:** word-analyzer-ipad-app
- **Storage Bucket:** word-analyzer-ipad-app.firebasestorage.app
- **Functions Region:** us-central1

### Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `preTranscribeAudio` | Storage (audio upload) | Start transcription early |
| `processAssessment` | Storage (image upload) | Full processing pipeline |
| `generateAssessmentVideo` | HTTPS callable | On-demand video generation |
| `generateAssessmentPdf` | HTTPS callable | On-demand PDF generation |

### Firestore Structure
```
teachers/{teacherId}/
├── students/{studentId}
│   └── name, grade, createdAt
└── assessments/{assessmentId}
    ├── status: 'uploading' | 'processing' | 'complete' | 'error'
    ├── preTranscribeStatus: 'processing' | 'complete' | 'error'
    ├── preTranscript, preTranscriptWords
    ├── audioUrl, imageUrl (24h TTL)
    ├── ocrText, transcript
    ├── imageWidth, imageHeight
    ├── metrics: { accuracy, wpm, prosodyScore, prosodyGrade, ... }
    ├── words: AlignedWord[]
    ├── errorPatterns: DashboardErrorPattern[]
    └── patternSummary: { severity, issues, recommendations, referrals }
```

## Testing on iPad

### Option 1: Expo Go (Development)
1. Install "Expo Go" from App Store
2. Run `npx expo start --tunnel`
3. Scan QR code with iPad camera
4. App runs with native camera/microphone

### Option 2: Development Build
```bash
npx expo install expo-dev-client
eas build --profile development --platform ios
```

### Option 3: TestFlight (Distribution)
```bash
eas build --platform ios
eas submit --platform ios
```

## Deployment Checklist

- [ ] Run TypeScript checks: `npx tsc --noEmit` (both frontend and functions)
- [ ] Test on iPad with Expo Go
- [ ] Deploy functions: `cd functions && firebase deploy --only functions`
- [ ] Check Firebase console for errors
- [ ] Verify Storage lifecycle rules (24h TTL)

## Dependencies

### Frontend (Expo 54)
- React Native 0.81.5
- React 19.1.0
- Firebase 12.6.0
- expo-av, expo-camera, expo-image-picker

### Backend (Node 20)
- firebase-functions 4.5.0
- @google-cloud/speech 6.0.0
- @google-cloud/vision 4.0.0
- canvas 3.2.0
- fluent-ffmpeg 2.1.3
- pdfkit 0.17.2
