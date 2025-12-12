# Word Analyzer - Data Flow Documentation

**Last Updated:** [LAST_UPDATED]

This document provides a detailed technical overview of how student data flows through the Word Analyzer application, including what data is sent to third-party services and how it is processed.

---

## Overview

Word Analyzer uses **exclusively Google Cloud services** for all data processing. No student data is sent to non-Google third parties.

```
+------------------+     +-------------------+     +------------------+
|   iPad App       | --> | Firebase Cloud    | --> | Google Cloud     |
|   (Frontend)     |     | Functions         |     | APIs             |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        v                        v                        v
   User Input            Processing Logic           AI Services
   - Audio               - Word Matching           - Speech-to-Text
   - Images              - Metrics Calc            - Vision OCR
   - Student Info        - Video Generation        - Text-to-Speech
                                                   - Gemini AI
```

---

## Data Collection Points

### 1. Student Information (Entered by Teacher)

| Field | Example | Storage | Sent to Google APIs |
|-------|---------|---------|---------------------|
| Student Name | "Emma Johnson" | Firebase Firestore | Yes (first name only to Gemini/TTS) |
| Grade Level | "6th Grade" | Firebase Firestore | No |

**Privacy Note:** Only the student's first name is sent to AI services for personalized feedback. Full name is stored only in Firebase.

### 2. Audio Recording (From Student)

| Attribute | Details |
|-----------|---------|
| Format | WebM/Opus or M4A |
| Duration | 30 or 60 seconds |
| Content | Student reading passage aloud |
| Temporary Storage | Firebase Storage (24h TTL) |
| Sent To | Google Cloud Speech-to-Text |

### 3. Image Capture (From Student/Teacher)

| Attribute | Details |
|-----------|---------|
| Format | JPEG/PNG |
| Content | Photo of reading passage (text only) |
| Temporary Storage | Firebase Storage (24h TTL) |
| Sent To | Google Cloud Vision OCR |

---

## Detailed Data Flow

### Stage 1: Recording and Upload

```
iPad App                          Firebase Storage
   |                                    |
   |  1. Record audio (30-60s)          |
   |  2. Capture image of text          |
   |                                    |
   +----- Upload audio.webm ----------->|  (24h TTL)
   +----- Upload image.jpg ------------>|  (24h TTL)
   |                                    |
   |  3. Trigger processAssessment      |
   |                                    |
```

**Data at this stage:**
- Audio file (student's voice reading)
- Image file (photo of text passage)
- Student name, grade (metadata)

### Stage 2: Speech-to-Text Processing

```
Firebase Cloud Function              Google Speech-to-Text API
        |                                      |
        |  Send: audio file (WebM/M4A)         |
        +------------------------------------->|
        |                                      |
        |  Receive: transcript + word timing   |
        |<-------------------------------------+
        |                                      |
        |  Data returned:                      |
        |  - Full transcript text              |
        |  - Per-word timing (start/end)       |
        |  - Per-word confidence scores        |
```

**Data sent to Google Speech-to-Text:**
- Audio recording of student reading
- No student name or identifying information

**Data returned:**
- Transcript text
- Word-level timing information
- Confidence scores

**Google's data handling:**
- Processed in memory, not stored for training
- [Google Cloud Data Processing Terms](https://cloud.google.com/terms/data-processing-terms)

### Stage 3: Vision OCR Processing

```
Firebase Cloud Function              Google Vision API
        |                                      |
        |  Send: image of text passage         |
        +------------------------------------->|
        |                                      |
        |  Receive: extracted text + positions |
        |<-------------------------------------+
        |                                      |
        |  Data returned:                      |
        |  - All text found in image           |
        |  - Bounding box coordinates          |
```

**Data sent to Google Vision:**
- Image of reading passage (text only, no photos of children)

**Data returned:**
- Extracted text
- Word positions (bounding boxes)

**Google's data handling:**
- Processed in memory, not stored for training

### Stage 4: Word Alignment and Metrics

```
Firebase Cloud Function (Local Processing)
        |
        |  Input:
        |  - Spoken words (from Speech-to-Text)
        |  - Expected words (from Vision OCR)
        |
        |  Processing:
        |  - Dynamic programming alignment
        |  - Calculate accuracy, WPM, prosody
        |  - Detect error patterns
        |
        |  Output:
        |  - AlignedWord[] with status
        |  - Metrics (accuracy %, WPM, etc.)
        |  - Error patterns detected
```

**This stage is entirely local** - no data sent to external services.

### Stage 5: AI Summary Generation

```
Firebase Cloud Function              Google Gemini AI
        |                                      |
        |  Send:                               |
        |  - Student first name                |
        |  - Accuracy percentage               |
        |  - Words per minute                  |
        |  - Prosody grade                     |
        |  - List of words read correctly      |
        |  - List of words misread             |
        |  - Primary error pattern             |
        +------------------------------------->|
        |                                      |
        |  Receive: personalized summary text  |
        |<-------------------------------------+
```

**Data sent to Google Gemini:**
```json
{
  "studentFirstName": "Emma",
  "accuracy": 92,
  "wordsPerMinute": 105,
  "prosodyGrade": "Proficient",
  "strengthWords": ["beautiful", "restaurant", "adventure"],
  "struggleWords": [
    {"expected": "through", "spoken": "threw"},
    {"expected": "knight", "spoken": "night"}
  ],
  "primaryPattern": {
    "type": "homophone_confusion",
    "description": "Confusing words that sound alike"
  }
}
```

**Data returned:**
- 8-10 sentence personalized summary
- Encouraging tone with Gen-Z friendly language

**Google's data handling:**
- API usage does not contribute to model training
- [Gemini API Terms](https://ai.google.dev/gemini-api/terms)

### Stage 6: Text-to-Speech

```
Firebase Cloud Function              Google Cloud TTS
        |                                      |
        |  Send: AI summary text               |
        |  (contains student first name)       |
        +------------------------------------->|
        |                                      |
        |  Receive: MP3 audio file             |
        |<-------------------------------------+
```

**Data sent to Google TTS:**
- AI-generated summary text (includes student first name and performance description)

**Data returned:**
- MP3 audio file of spoken summary

**Voice Used:** Google Cloud TTS Studio voice (en-US-Studio-O) - highest quality

### Stage 7: Storage and Display

```
Firebase Firestore                   Firebase Storage
        |                                    |
        |  Permanent Storage:                |  Temporary Storage (24h):
        |  - Student name                    |  - Audio recording
        |  - Assessment metrics              |  - Original image
        |  - Word alignment results          |  - Generated video
        |  - Error patterns                  |  - AI summary audio
        |  - AI summary text                 |
```

---

## Data Sent to Each Google Service

### Google Cloud Speech-to-Text
| Data | Included | Notes |
|------|----------|-------|
| Audio recording | Yes | Student's voice reading |
| Student name | No | Not included in audio metadata |
| School/Teacher info | No | Not sent |

### Google Cloud Vision
| Data | Included | Notes |
|------|----------|-------|
| Image of text | Yes | Reading passage only |
| Student name | No | Not in image |
| Photos of children | No | Only text images captured |

### Google Gemini AI
| Data | Included | Notes |
|------|----------|-------|
| Student first name | Yes | For personalization |
| Full name | No | Only first name |
| Assessment scores | Yes | Accuracy, WPM, etc. |
| Words read | Yes | Correct and incorrect |
| Audio/Images | No | Only text metrics |

### Google Cloud Text-to-Speech
| Data | Included | Notes |
|------|----------|-------|
| Summary text | Yes | Contains first name |
| Performance data | Yes | Embedded in summary |
| Raw assessment data | No | Only formatted summary |

### Firebase
| Data | Included | Notes |
|------|----------|-------|
| Full student name | Yes | Stored securely |
| All assessment data | Yes | Encrypted at rest |
| Audio/Images | Yes | 24h TTL, auto-deleted |

---

## Data NOT Sent to Third Parties

The following data is **never** sent outside Firebase:

- Student's last name (only first name to AI services)
- Grade level
- Teacher/school identifying information
- Device identifiers
- Location data
- Photos of children (only text images)

---

## Data Retention by Service

| Service | Our Request | Google's Handling |
|---------|-------------|-------------------|
| Speech-to-Text | No storage | Processed and discarded |
| Vision API | No storage | Processed and discarded |
| Gemini AI | No storage | API calls not used for training |
| Cloud TTS | No storage | Processed and discarded |
| Firebase | Until deletion | Encrypted, access-controlled |

---

## Security Measures

### In Transit
- All API calls use HTTPS/TLS 1.3
- Firebase SDK uses secure WebSocket connections

### At Rest
- Firebase Firestore: Encrypted with AES-256
- Firebase Storage: Encrypted with Google-managed keys

### Access Control
- Teacher accounts isolated by Firebase Auth UID
- Firestore security rules enforce data isolation
- No cross-teacher data access possible

---

## Compliance Summary

| Requirement | How We Comply |
|-------------|---------------|
| COPPA: Disclose third parties | All Google services listed above |
| COPPA: No more data than needed | Only first name to AI, no photos of children |
| COPPA: Reasonable security | HTTPS, encryption, access control |
| FERPA: School official exception | Used only for educational purposes |
| FERPA: Direct control | Data isolated by teacher account |

---

## Questions?

For technical questions about data flow:
**[OPERATOR_EMAIL]**

For compliance questions:
**[OPERATOR_EMAIL]**
