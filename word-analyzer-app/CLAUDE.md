# CLAUDE.md - Word Analyzer iPad App

## Project Overview

Word Analyzer is an iPad app for teachers to assess student oral reading fluency. Students read a passage aloud while the app records audio and captures an image of the text. The backend uses Google Cloud Speech-to-Text and Vision OCR to analyze the reading, producing metrics like accuracy, WPM, and prosody scores.

## Quick Commands

```bash
# Start development (iPad testing via Expo Go)
cd word-analyzer-app
npx expo start --tunnel

# Deploy backend after changes
cd word-analyzer-app/functions
npm run deploy

# TypeScript check (frontend)
cd word-analyzer-app
npx tsc --noEmit

# TypeScript check (backend)
cd word-analyzer-app/functions
npx tsc --noEmit
```

## Architecture

```
word-analyzer-app/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx          # Main dashboard, student selection
│   │   ├── RecordingScreen.tsx     # Audio recording flow with prompts
│   │   ├── CaptureScreen.tsx       # Image capture of reading passage
│   │   ├── AnalysisScreen.tsx      # Results display (5 tabs: Summary, Video, Export, Image, Patterns)
│   │   ├── HistoryScreen.tsx       # Past assessments list
│   │   └── AssessmentDetailScreen.tsx
│   ├── components/
│   │   └── StudentSelector.tsx     # Dropdown for student selection
│   ├── services/
│   │   ├── assessmentService.ts    # Firebase upload, real-time subscriptions
│   │   └── studentService.ts       # Student CRUD operations
│   ├── hooks/
│   │   └── useAuth.ts              # Firebase authentication
│   ├── config/
│   │   └── firebase.ts             # Firebase configuration
│   └── types/
│       └── index.ts                # TypeScript interfaces
├── functions/                       # Firebase Cloud Functions (Node.js)
│   └── src/
│       ├── index.ts                # Function entry points
│       └── services/
│           ├── speechToText.ts     # Google Speech-to-Text API
│           ├── visionOcr.ts        # Google Vision OCR with word positions
│           ├── wordMatching.ts     # DP alignment algorithm
│           ├── metricsCalculator.ts # Accuracy, WPM, prosody, error patterns
│           ├── videoGenerator.ts   # MP4 with word highlighting
│           └── pdfGenerator.ts     # PDF reports
└── app.json                        # Expo configuration
```

## Key Files

### Frontend (React Native / Expo)

| File | Purpose |
|------|---------|
| `src/screens/AnalysisScreen.tsx` | Main results screen with 5 tabs (Summary, Video, Export, Image, Patterns). Contains word highlighting, error pattern click-to-pulse, prosody popup |
| `src/screens/RecordingScreen.tsx` | Recording flow with voice prompts, countdown, early audio upload |
| `src/services/assessmentService.ts` | Firebase upload functions including early upload optimization |
| `src/types/index.ts` | All TypeScript interfaces for the app |

### Backend (Firebase Functions)

| File | Purpose |
|------|---------|
| `functions/src/index.ts` | Cloud function entry points: `preTranscribeAudio`, `processAssessment`, `generateAssessmentVideo`, `generateAssessmentPdf` |
| `functions/src/services/wordMatching.ts` | Dynamic programming word alignment with hesitation/repeat/self-correction detection |
| `functions/src/services/metricsCalculator.ts` | Calculates accuracy, WPM (correct words only), prosody (4-component weighted score), error patterns, severity assessment |
| `functions/src/services/visionOcr.ts` | OCR with actual image dimensions from canvas, hyphenated word merging |
| `functions/src/services/summaryGenerator.ts` | AI summary generation with Gemini, randomized creative sign-offs |
| `functions/src/services/textToSpeech.ts` | Google Cloud TTS with Studio voices (highest quality) |
| `functions/src/services/videoGenerator.ts` | Optimized video generation using keyframe-only approach |

## Data Flow

1. **Recording**: User records audio (30s/60s) on RecordingScreen
2. **Early Upload**: Audio uploads immediately after recording while user takes picture
3. **Pre-Transcribe**: `preTranscribeAudio` function starts transcription in background
4. **Image Capture**: User takes photo of reading passage
5. **Processing**: `processAssessment` function:
   - Uses pre-transcription if available (saves 5-15s)
   - Runs OCR on image
   - Aligns spoken words to expected text
   - Calculates metrics and error patterns
6. **Results**: AnalysisScreen displays results with real-time Firestore subscription

## Important Patterns

### Error Pattern Matching (Click-to-Pulse)
When user clicks an error pattern in the breakdown, matching words pulse:
- `hesitation` type → matches `word.hesitation` flag
- `repetition` type → matches `word.isRepeat` flag
- `self_correction` type → matches `word.isSelfCorrection` flag
- Other types → matches by `pattern.examples` word list

### Word Color Coding (Priority System)
Hesitation (purple) only shows if word is otherwise correct. Errors take priority:
- **Correct** → Green (#22c55e)
- **Correct + Hesitation** → Purple (#7c3aed)
- **Misread/Substituted** → Orange (#f97316) - overrides hesitation
- **Skipped** → Red (#ef4444) - overrides hesitation

### Prosody Score Components
- **Accuracy (35%)**: Percentage of words read correctly
- **Rate (25%)**: Words per minute (optimal: 100-180 WPM)
- **Fluency (25%)**: Error rate across reading
- **Smoothness (15%)**: Hesitations + fillers + repeats rate

### Severity Levels
- `excellent`: Accuracy >= 98%, WPM 100-180, minimal errors
- `mild`: Accuracy >= 93%, minor issues
- `moderate`: Accuracy >= 85%, multiple concern areas
- `significant`: Below thresholds, may need referral

### AI Summary Generation
Summaries are generated with variety built-in:
- Gemini AI with high temperature (0.95) for creativity
- Random "variety seed" in prompt for different phrasing
- 25+ unique sign-off options selected by name/performance
- Fallback summaries also randomized with slang variations

## Firebase Structure

```
teachers/{teacherId}/
├── students/{studentId}
│   ├── name: string
│   ├── grade?: string
│   └── createdAt: timestamp
└── assessments/{assessmentId}
    ├── studentId, studentName
    ├── status: 'uploading' | 'processing' | 'complete' | 'error'
    ├── audioUrl, imageUrl (24h TTL)
    ├── preTranscript, preTranscriptWords (from early transcription)
    ├── ocrText, transcript
    ├── imageWidth, imageHeight
    ├── metrics: { accuracy, wordsPerMinute, prosodyScore, prosodyGrade, ... }
    ├── words: AlignedWord[]
    ├── errorPatterns: DashboardErrorPattern[]
    ├── patternSummary: { severity, primaryIssues, recommendations, strengths, referralSuggestions }
    ├── aiSummary: string (generated feedback text)
    ├── aiSummaryAudioUrl: string (TTS audio URL, 24h TTL)
    └── videoUrl: string (auto-generated video URL, 24h TTL)
```

## Common Tasks

### Adding a New Error Pattern Type
1. Add type to `ErrorPatternType` in `metricsCalculator.ts`
2. Add detection logic in `analyzeErrorPatterns()`
3. If word-level flag needed, add to `AlignedWord` interface in both:
   - `functions/src/services/wordMatching.ts`
   - `src/types/index.ts`
4. Update `handleErrorPatternClick` in `AnalysisScreen.tsx` to match by flag

### Modifying Prosody Calculation
Edit `calculateMetrics()` in `functions/src/services/metricsCalculator.ts`. The prosody score is a weighted sum of 4 components. Update weights or thresholds as needed.

### Adding UI to Analysis Screen
The screen has 5 tabs defined in the `Tab` type. Each tab is a separate function component (e.g., `SummaryTab`, `PatternsTab`). Styles are in the `styles` object at the bottom of the file.

## Deployment

```bash
# Deploy only cloud functions
cd functions && firebase deploy --only functions

# Deploy everything
firebase deploy

# Build for TestFlight
eas build --platform ios
eas submit --platform ios
```

## Testing on iPad

1. Install "Expo Go" from App Store
2. Run `npx expo start --tunnel`
3. Scan QR code with iPad camera
4. App runs with native camera/microphone access

## Firebase Secrets

The following secrets must be set for full functionality:

```bash
# Set Gemini API key (for AI summaries)
firebase functions:secrets:set GEMINI_API_KEY
```

Get keys from:
- Gemini: https://aistudio.google.com/apikey

Note: Google Cloud TTS uses the default service account credentials (no separate API key needed).

## Known Limitations

1. **Web Camera**: Safari WebRTC defaults to 640x480, affecting OCR quality. Use Expo Go for native resolution.
2. **Transcription Time**: 30-60 seconds for long recordings (Google API limitation)
