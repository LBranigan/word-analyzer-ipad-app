# Data Retention Policy
## Word Analyzer

**Effective Date:** [EFFECTIVE_DATE]
**Last Updated:** [LAST_UPDATED]
**Policy Owner:** [OPERATOR_NAME]

---

## Purpose

This Data Retention Policy establishes guidelines for retaining and deleting personal information collected from children through Word Analyzer. This policy is maintained in compliance with:

- **FERPA** - Family Educational Rights and Privacy Act (20 U.S.C. 1232g)
- **COPPA** - Children's Online Privacy Protection Act (16 CFR Part 312.10)
- **2025 COPPA Rule Updates** - Requiring written data retention policies
- **Washington SUPER Act** - RCW 28A.604.040

---

## Scope

This policy applies to all personal information collected from or about students through the Word Analyzer application.

---

## Data Categories and Retention Periods

### 1. Audio Recordings

| Attribute | Details |
|-----------|---------|
| **Description** | Recordings of students reading aloud |
| **Collection Purpose** | Transcribe speech and analyze reading fluency |
| **Business Need for Retention** | Processing only |
| **Retention Period** | **24 hours** - Auto-deleted via Firebase Storage TTL |
| **Storage Location** | Firebase Storage (encrypted) |
| **Deletion Method** | Automatic expiration |

**Rationale:** Audio recordings are needed for transcription processing and for video generation (audio track). After 24 hours, all processing is complete and the audio is automatically deleted.

---

### 2. Captured Images

| Attribute | Details |
|-----------|---------|
| **Description** | Images of reading materials (books, worksheets) |
| **Collection Purpose** | Extract text via optical character recognition (OCR) |
| **Business Need for Retention** | Processing and video generation |
| **Retention Period** | **24 hours** - Auto-deleted via Firebase Storage TTL |
| **Storage Location** | Firebase Storage (encrypted) |
| **Deletion Method** | Automatic expiration |

**Rationale:** Images are needed for OCR processing. After text extraction and video generation, the original images are automatically deleted.

---

### 3. Generated Videos

| Attribute | Details |
|-----------|---------|
| **Description** | MP4 videos showing word-by-word highlighting |
| **Collection Purpose** | Provide visual assessment playback |
| **Business Need for Retention** | Teacher review |
| **Retention Period** | **24 hours** - Auto-deleted via Firebase Storage TTL |
| **Storage Location** | Firebase Storage (encrypted) |
| **Deletion Method** | Automatic expiration |

**Rationale:** Videos can be regenerated on demand from assessment data. Temporary storage reduces storage costs and privacy exposure.

---

### 4. AI Summary Audio

| Attribute | Details |
|-----------|---------|
| **Description** | MP3 audio of AI-generated feedback |
| **Collection Purpose** | Provide spoken feedback to students |
| **Business Need for Retention** | Playback during session |
| **Retention Period** | **24 hours** - Auto-deleted via Firebase Storage TTL |
| **Storage Location** | Firebase Storage (encrypted) |
| **Deletion Method** | Automatic expiration |

**Rationale:** Audio can be regenerated from the stored text summary. Temporary storage is sufficient for immediate playback needs.

---

### 5. Student Profile Information

| Attribute | Details |
|-----------|---------|
| **Description** | Student name and grade level |
| **Collection Purpose** | Identify student and contextualize assessments |
| **Business Need for Retention** | Track progress across multiple assessments |
| **Retention Period** | Until school or parent requests deletion |
| **Storage Location** | Firebase Firestore (encrypted) |
| **Deletion Method** | Manual deletion upon request |

**Rationale:** Student profile information is needed to associate assessments with the correct student and track progress over time. This information is retained as long as the school or parent finds it useful for educational purposes.

---

### 6. Assessment Results

| Attribute | Details |
|-----------|---------|
| **Description** | Accuracy scores, error patterns, prosody metrics, word lists, AI summary text |
| **Collection Purpose** | Measure reading proficiency and track progress |
| **Business Need for Retention** | Historical tracking of student improvement |
| **Retention Period** | Until school or parent requests deletion |
| **Storage Location** | Firebase Firestore (encrypted) |
| **Deletion Method** | Manual deletion upon request |

**Rationale:** Assessment results are the core educational value of the application. They are retained to allow educators to track student progress over time and identify patterns in reading development.

---

### 7. Transcribed Text and Word Timing

| Attribute | Details |
|-----------|---------|
| **Description** | Text of words spoken by student with timing information |
| **Collection Purpose** | Analyze pronunciation accuracy and reading speed |
| **Business Need for Retention** | Part of assessment results |
| **Retention Period** | Until school or parent requests deletion |
| **Storage Location** | Firebase Firestore (encrypted) |
| **Deletion Method** | Deleted with associated assessment |

---

## Retention Schedule Summary

| Data Type | Retention Period | Deletion Trigger |
|-----------|------------------|------------------|
| Audio Recordings | 24 hours | Automatic TTL expiration |
| Captured Images | 24 hours | Automatic TTL expiration |
| Generated Videos | 24 hours | Automatic TTL expiration |
| AI Summary Audio | 24 hours | Automatic TTL expiration |
| Student Profiles | Until request | School/parent request |
| Assessment Results | Until request | School/parent request |
| Transcribed Text | Until request | Deleted with assessment |

---

## Deletion Procedures

### Automatic Deletion

The following data is automatically deleted without any action required:

1. **Audio Recordings** - Firebase Storage TTL automatically deletes after 24 hours
2. **Captured Images** - Firebase Storage TTL automatically deletes after 24 hours
3. **Generated Videos** - Firebase Storage TTL automatically deletes after 24 hours
4. **AI Summary Audio** - Firebase Storage TTL automatically deletes after 24 hours

### Deletion Upon Request

Schools or parents may request deletion of:

- Individual student profiles
- Individual assessments
- All data associated with a school
- All data associated with a student

**To Request Deletion:**

1. Send request to [OPERATOR_EMAIL]
2. Include:
   - School name
   - Student name (if applicable)
   - Specific data to be deleted (or "all data")
   - Requestor's relationship to student (parent, school administrator)
3. We will confirm deletion within **30 days**

### Deletion Process

When deletion is requested:

1. Verify requestor's identity and authority
2. Locate all data matching the request
3. Delete data from Firebase Firestore
4. Delete any associated files from Firebase Storage (if within TTL)
5. Confirm deletion to requestor
6. Log deletion for compliance records

---

## Third-Party Data Handling

### Google Cloud APIs

| Service | Data Sent | Retention by Google |
|---------|-----------|---------------------|
| Speech-to-Text API | Audio | Processed and discarded (not stored) |
| Vision API | Images | Processed and discarded (not stored) |
| Text-to-Speech API | Summary text | Processed and discarded (not stored) |
| Gemini AI | Metrics + first name | API calls not used for training |

We use Google Cloud APIs with settings that do not retain data for model training. Per [Google Cloud's Data Processing Terms](https://cloud.google.com/terms/data-processing-terms), customer data is processed only to provide the service and is not retained after processing.

### Firebase

Assessment results and student profiles are stored in Firebase Firestore. Firebase retains data until we delete it. Data is encrypted at rest and in transit.

---

## Policy Review

This Data Retention Policy is reviewed annually and updated as needed to reflect:

- Changes in applicable law
- Changes in our data practices
- Feedback from schools or parents

---

## Contact

For questions about this policy or to request data deletion:

**[OPERATOR_NAME]**
[OPERATOR_ADDRESS]
Email: [OPERATOR_EMAIL]
Phone: [OPERATOR_PHONE]

---

*This policy was last reviewed on [LAST_UPDATED].*
