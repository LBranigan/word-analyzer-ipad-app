# Analysis Backend & Teacher Dashboard Design

**Date:** 2025-12-10
**Status:** Approved

## Overview

This document describes the backend architecture for processing reading assessments and the teacher dashboard for viewing results. The iPad app acts as a thin client, uploading audio/image files to Firebase where Cloud Functions handle all processing.

## Architecture

```
┌─────────────────┐         ┌──────────────────────────┐
│   iPad App      │         │   Firebase Backend       │
│  (Expo/React    │         │                          │
│   Native)       │         │  ┌────────────────┐      │
│                 │         │  │ Cloud Storage  │      │
│  • Student      │ ──────► │  │ (temp uploads) │      │
│    Selection    │         │  └───────┬────────┘      │
│  • Audio Record │         │          │ trigger       │
│  • Image Capture│         │  ┌───────▼────────┐      │
│  • Results View │         │  │ Cloud Function │      │
│                 │ ◄────── │  │ • Speech API   │      │
└─────────────────┘         │  │ • Vision API   │      │
                            │  │ • Word Match   │      │
        ┌───────────────┐   │  │ • Video Gen    │      │
        │ Teacher       │   │  └───────┬────────┘      │
        │ Dashboard     │   │          │               │
        │ (Web App)     │◄──│  ┌───────▼────────┐      │
        └───────────────┘   │  │   Firestore    │      │
                            │  │ • Assessments  │      │
                            │  │ • Students     │      │
                            │  │ • Teachers     │      │
                            │  └────────────────┘      │
                            │                          │
                            │  Firebase Hosting        │
                            │  (Teacher Dashboard)     │
                            └──────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Key Management | Central (managed by admin) | Simpler teacher UX, scales to multiple schools |
| API Security | Cloud Functions proxy | Key never exposed to clients |
| Processing Location | All in Cloud Functions | Easier updates, consistent results, lighter app |
| File Upload | Firebase Storage + trigger | Reliable uploads, resume on failure |
| File Retention | Delete after processing | FERPA/COPPA compliance, minimal storage |
| Audio for Playback | 24h temporary retention | Allows review session, then auto-deletes |
| Results Storage | Full details in Firestore | Supports teacher dashboard, historical tracking |
| Student ID | Teacher selects upfront | Reliable, no speech recognition errors on names |
| Teacher Dashboard | Firebase Hosting | Accessible anywhere, protected by Auth |
| Video Generation | Server-side in v1 | Included from start, done in Cloud Function |

## Cloud Function: processAssessment

Triggered when files are uploaded to Cloud Storage.

### Processing Pipeline

```
Upload Complete (audio + image in Storage)
           │
           ▼
┌──────────────────────────────────┐
│ 1. SPEECH-TO-TEXT                │
│    • Input: audio file           │
│    • Output: transcript +        │
│      word timestamps +           │
│      confidence scores           │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ 2. VISION OCR                    │
│    • Input: image file           │
│    • Output: extracted text      │
│      + word bounding boxes       │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ 3. WORD MATCHING                 │
│    • Compare spoken vs OCR       │
│    • Handle homophones (150+)    │
│    • Detect: correct, skip,      │
│      substitution, misread       │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ 4. CALCULATE METRICS             │
│    • Accuracy %                  │
│    • Words per minute            │
│    • Prosody score               │
│    • Error patterns              │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ 5. GENERATE VIDEO                │
│    • Audio waveform sync         │
│    • Words highlighted as spoken │
│    • Running stats overlay       │
│    • Output: MP4 file            │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│ 6. SAVE & CLEANUP                │
│    • Write results to Firestore  │
│    • Move audio to temp bucket   │
│      (24h TTL)                   │
│    • Save video to temp bucket   │
│      (24h TTL)                   │
│    • Delete original uploads     │
└──────────────────────────────────┘
```

## Firestore Data Structure

```
/teachers/{teacherId}
  - email: string
  - displayName: string
  - createdAt: timestamp

/teachers/{teacherId}/students/{studentId}
  - name: string
  - grade: string (optional)
  - createdAt: timestamp

/teachers/{teacherId}/assessments/{assessmentId}
  - studentId: string (reference)
  - studentName: string (denormalized)
  - createdAt: timestamp
  - status: "processing" | "complete" | "error"
  - errorMessage: string (if status == "error")

  # Audio/Video references (temp, 24h TTL)
  - audioUrl: string (signed URL, expires)
  - videoUrl: string (signed URL, expires)
  - audioDuration: number (seconds)

  # Results (populated when status == "complete")
  - metrics:
      accuracy: number (0-100)
      wordsPerMinute: number
      prosodyScore: number (0-100)
      totalWords: number
      correctCount: number
      errorCount: number
      skipCount: number

  - ocrText: string (full extracted passage)
  - transcript: string (what student said)

  - words: [
      {
        expected: string
        spoken: string | null
        status: "correct" | "misread" | "substituted" | "skipped"
        startTime: number (seconds into audio)
        endTime: number (seconds into audio)
        confidence: number (0-1)
      }
    ]

  - errorPatterns: [
      {
        type: "substitution" | "phonetic" | "ending" | "vowel"
        pattern: string (e.g., "th sounds")
        examples: [{ expected: string, spoken: string }]
        count: number
      }
    ]
```

## Cloud Storage Structure

```
/uploads/{assessmentId}/
  - audio.webm (or .m4a)    # Deleted after processing
  - image.jpg               # Deleted after processing

/audio-temp/{assessmentId}/
  - audio.webm              # 24h lifecycle rule, for playback

/videos/{assessmentId}/
  - video.mp4               # 24h lifecycle rule
```

### Lifecycle Rules

- `uploads/` - Delete immediately after processing (in Cloud Function)
- `audio-temp/` - 24h TTL (Cloud Storage lifecycle rule)
- `videos/` - 24h TTL (Cloud Storage lifecycle rule)

## iPad App Changes

### Home Screen Modifications

Add student selector above the red/green buttons:

```
┌─────────────────────────────────────────────────────────┐
│ [Teacher: jane@school.org]              [Sign Out]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                 Select Student                          │
│         ┌─────────────────────────┐                     │
│         │ ▼ Choose student...     │                     │
│         └─────────────────────────┘                     │
│                                                         │
│      ┌─────────────┐    ┌─────────────┐                 │
│      │     🎤      │    │     📷      │                 │
│      │    RED      │    │   GREEN     │                 │
│      └─────────────┘    └─────────────┘                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Dropdown shows students from Firestore
- "Add New Student" option opens modal
- Buttons disabled until student selected
- Selected student ID included in assessment

### Analysis Screen (Complete Rewrite)

#### States

1. **Uploading** - Progress bars for audio and image upload
2. **Processing** - Checklist showing backend progress
3. **Complete** - Full results with tabs
4. **Error** - Error message with retry option

#### Tab: Summary

```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  42  │ │   8  │ │ 84%  │ │  95  │ │  72  │
│correct│ │errors│ │accur.│ │ WPM  │ │prosdy│
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘

┌────────────────────────────────────────┐
│ 🔊 "Great job! You read 50 words..."   │  ← AI summary (tap to read aloud)
└────────────────────────────────────────┘

TEXT WITH ERROR HIGHLIGHTING
┌────────────────────────────────────────┐
│ The [cat] sat on the [mat]. She was    │  ← Tap word for popup
│ very [happy] to see the [bird] fly     │
│                                        │
│ 🟢 correct  🟠 misread  🔴 substituted │
│ ⚫ skipped                             │
└────────────────────────────────────────┘

ERROR BREAKDOWN
┌────────────────────────────────────────┐
│ Substitutions (3): "was"→"saw" ×2 ...  │
│ Skipped (2): "very", "happy"           │
└────────────────────────────────────────┘
```

#### Word Popup (on tap)

```
┌─────────────────────────┐
│      WORD DETAILS       │
│                         │
│  Expected: "was"        │
│  Spoken:   "saw"        │
│  Status:   Substituted  │
│                         │
│  ┌─────────────────┐    │
│  │  🔊 Play Audio  │    │  ← Plays audio snippet
│  └─────────────────┘    │
│                         │
│        [Close]          │
└─────────────────────────┘
```

#### Tab: Video

- MP4 player showing generated video
- Audio waveform synced to playback
- Words highlighted as spoken
- Running stats overlay
- "Save to Device" button

#### Tab: Image

- Captured passage image
- Word bounding boxes drawn (color-coded by status)
- Quick stats: "50 words detected"

#### Tab: Patterns

- Phonetic pattern analysis
- Grouped by pattern type (th sounds, word endings, vowels, etc.)
- Shows examples and count for each pattern

## Teacher Dashboard (Web App)

### Hosting

- Firebase Hosting
- URL: https://word-analyzer-ipad.web.app (or custom domain)
- Same Firebase Auth (Google Sign-In)
- Teachers see only their own students/assessments

### Features

```
┌─────────────────────────────────────────────────────────┐
│ [Logo]  Reading Assessment Dashboard    [jane@] [Logout]│
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Students │  CELERATION CHART                            │
│ ──────── │  ┌────────────────────────────────────────┐  │
│ Johnny ● │  │  (Interactive chart - click dots to    │  │
│ Sarah    │  │   open assessment details)             │  │
│ Marcus   │  └────────────────────────────────────────┘  │
│          │                                              │
│ + Add    │  RECENT ASSESSMENTS                          │
│          │  ┌────────────────────────────────────────┐  │
│          │  │ Today 2:30pm   84% acc   95 WPM  [→]  │  │
│          │  │ Dec 8 10:15am  79% acc   88 WPM  [→]  │  │
│          │  └────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────┘
```

### Assessment Detail View

- Same layout as iPad Summary tab
- Additional teacher features:
  - Edit OCR text (toggle words on/off)
  - Add notes
  - Export PDF report

## Privacy & Compliance

### FERPA/COPPA Measures

| Requirement | Implementation |
|-------------|----------------|
| Minimal PII | Student name only (no DOB, address, etc.) |
| Audio retention | 24h auto-delete via lifecycle rules |
| Video retention | 24h auto-delete via lifecycle rules |
| Access control | Teacher sees only their students |
| Data encryption | Firebase default (transit + rest) |
| Data residency | Firebase us-central region |

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Teachers can only access their own document
    match /teachers/{teacherId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == teacherId;

      // Students subcollection
      match /students/{studentId} {
        allow read, write: if request.auth != null
                           && request.auth.uid == teacherId;
      }

      // Assessments subcollection
      match /assessments/{assessmentId} {
        allow read, write: if request.auth != null
                           && request.auth.uid == teacherId;
      }
    }
  }
}
```

## Implementation Order

1. **Firebase Setup**
   - Cloud Storage buckets with lifecycle rules
   - Firestore collections and security rules
   - Cloud Functions scaffolding

2. **Cloud Function: processAssessment**
   - Speech-to-Text integration
   - Vision OCR integration
   - Word matching algorithm (port from v2)
   - Metrics calculation
   - Video generation

3. **iPad App: Student Management**
   - Firestore student CRUD
   - Student selector on Home screen
   - Add student modal

4. **iPad App: Upload Flow**
   - Upload to Cloud Storage
   - Create assessment doc with status: "processing"
   - Navigate to Analysis screen

5. **iPad App: Analysis Screen**
   - Real-time listener for assessment status
   - Upload/processing progress UI
   - Summary tab with highlighted text
   - Word popup with audio playback
   - Video, Image, Patterns tabs

6. **Teacher Dashboard**
   - Firebase Hosting setup
   - Student list with Celeration chart
   - Assessment detail view
   - OCR editing capability
