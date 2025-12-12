# AI-Generated Student Summary Design

**Date:** 2025-12-11
**Status:** Approved
**Feature:** Replace generic summary text with personalized AI-generated feedback

## Overview

Replace the current static template-based summary ("Great job! You read X words...") with a personalized AI-generated summary that analyzes the student's specific performance, identifies patterns, and delivers encouraging feedback with a playful name-based compliment.

## Design Decisions

| Decision | Choice |
|----------|--------|
| **Audience** | Students (6th-7th grade, ages 11-13) |
| **Length** | ~30-40 seconds spoken (6-8 sentences) |
| **Tone** | Encouraging, specific, includes Gen Z slang |
| **Name compliment** | Rhyming/playful with slang ("No cap, Marcus, you're a reading star-cus!") |
| **Presentation** | "Hear Your Results" button, text reveals as it speaks |
| **Generation timing** | During processAssessment (ready when results load) |
| **LLM** | Google Gemini 1.5 Flash (already in Google ecosystem) |

## Summary Structure (5 Parts)

1. **Specific praise** - What the student did well, mentioning actual words they nailed
2. **Gentle struggles** - 1-2 specific words they stumbled on (encouraging tone)
3. **Pattern + tip** - Identify the main pattern and give ONE actionable practice tip
4. **Encouragement** - Motivation + simple next step
5. **Name compliment** - Fun rhyming compliment with youth slang

## Example Output

For a student named Marcus with 94% accuracy and vowel confusion issues:

> "Nice work, Marcus! You read 52 words at a solid pace, and nailed some tricky ones like 'magnificent' and 'discovered' - those aren't easy. You stumbled a bit on 'beautiful' and 'through,' which is totally normal. I noticed the vowel sounds in the middle of words are giving you some trouble - try sounding out each syllable slowly, like 'beau-ti-ful.' Keep practicing with passages like this one, and those vowel sounds will click. No cap, Marcus, you're a reading star-cus - that was straight fire, fam!"

## Architecture

### Data Flow

```
processAssessment Cloud Function
        │
        ├── [existing] Speech-to-Text → transcript
        ├── [existing] Vision OCR → ocrText
        ├── [existing] Word matching → words[], metrics
        ├── [existing] Error analysis → errorPatterns[], patternSummary
        │
        └── [NEW] Gemini API call
              │
              ├── Input: metrics, words, errorPatterns, studentName
              └── Output: aiSummary (string, stored in Firestore)

AnalysisScreen (iPad)
        │
        ├── Shows results immediately
        ├── "Hear Your Results" button prominent
        └── On tap: expo-speech reads aiSummary aloud
              └── Text displays synchronized with speech
```

### New Firestore Field

```typescript
assessments/{id}: {
  ...existing fields,
  aiSummary: string  // The generated summary text
}
```

## Backend Implementation

### New Service: `functions/src/services/summaryGenerator.ts`

**Data sent to Gemini:**

```typescript
{
  studentName: "Marcus",

  metrics: {
    accuracy: 94,
    wordsPerMinute: 112,
    totalWords: 52,
    correctCount: 49,
    errorCount: 3,
    hesitationCount: 2,
    prosodyGrade: "Proficient"
  },

  // Correctly read challenging words (≥7 letters)
  strengths: ["magnificent", "adventure", "discovered"],

  // Misread words with what was actually said
  struggles: [
    { expected: "through", spoken: "threw" },
    { expected: "beautiful", spoken: "bootiful" }
  ],

  // Top error pattern
  primaryPattern: {
    type: "vowel_error",
    description: "Vowel sound confusion",
    examples: ["beautiful→bootiful", "castle→castel"]
  }
}
```

**System Prompt:**

```
You are a friendly reading coach for a 6th-7th grade student. Generate a 6-8 sentence spoken summary following this exact structure:

1. Specific praise for what they did well (mention actual words they read correctly)
2. Gently mention 1-2 specific words they struggled with (encouraging tone, normalize mistakes)
3. Identify the main pattern and give ONE simple, actionable practice tip
4. Encouragement and a simple next step they can take
5. End with a fun, rhyming compliment using their name. Include 1-2 pieces of current youth slang (like "no cap", "lit", "fam", "slay", "fire", "W", "goated") to make it relatable.

Output plain text only - no markdown, bullets, or formatting. This will be read aloud.
Keep the total length to 6-8 sentences (~30-40 seconds when spoken).
Be specific - use actual words from the data, not generic praise.
```

**Function Signature:**

```typescript
export async function generateAISummary(
  studentName: string,
  metrics: Metrics,
  words: AlignedWord[],
  errorPatterns: ErrorPattern[],
  patternSummary: PatternSummary
): Promise<string>
```

**Error Handling:**
- If Gemini API fails, return fallback template (current behavior)
- Log error but don't fail the assessment
- Timeout: 10 seconds max for Gemini call

### Integration in `index.ts`

```typescript
// After existing analysis...
const patternSummary = generatePatternSummary(errorPatterns, metrics);

// NEW: Generate AI summary
let aiSummary: string;
try {
  aiSummary = await generateAISummary(
    studentName,
    metrics,
    alignedWords,
    errorPatterns,
    patternSummary
  );
} catch (error) {
  console.error('AI summary generation failed, using fallback:', error);
  aiSummary = generateFallbackSummary(studentName, metrics);
}

// Save to Firestore
await assessmentRef.update({
  ...existing fields,
  aiSummary,
});
```

## Frontend Implementation

### UI States

**State 1: Ready to Play**
```
┌─────────────────────────────────────────────────────────────┐
│  🔊  Hear Your Results                                      │
│      Tap to hear your personalized feedback                 │
└─────────────────────────────────────────────────────────────┘
```

**State 2: Playing**
```
┌─────────────────────────────────────────────────────────────┐
│  ⏸️  Playing...                                    [Stop]   │
│                                                             │
│  "Nice work, Marcus! You read 52 words at a solid           │
│   pace, and nailed some tricky ones like 'magnificent'..."  │
│                                                             │
│  ████████████░░░░░░░░░  45%                                │
└─────────────────────────────────────────────────────────────┘
```

**State 3: Finished**
```
┌─────────────────────────────────────────────────────────────┐
│  🔊  Play Again                                             │
│                                                             │
│  "Nice work, Marcus! You read 52 words at a solid           │
│   pace, and nailed some tricky ones like 'magnificent'      │
│   and 'discovered' - those aren't easy..."                  │
│                                                             │
│  [Full text visible, scrollable if needed]                  │
└─────────────────────────────────────────────────────────────┘
```

### Component Changes in `AnalysisScreen.tsx`

**New State:**
```typescript
const [summaryState, setSummaryState] = useState<'ready' | 'playing' | 'finished'>('ready');
const [displayedText, setDisplayedText] = useState('');
```

**Text-to-Speech:**
```typescript
import * as Speech from 'expo-speech';

const handlePlaySummary = () => {
  setSummaryState('playing');

  Speech.speak(assessment.aiSummary, {
    language: 'en-US',
    rate: 0.95,
    onDone: () => setSummaryState('finished'),
    onStopped: () => setSummaryState('finished'),
  });

  revealTextGradually(assessment.aiSummary);
};

const handleStopSummary = () => {
  Speech.stop();
  setDisplayedText(assessment.aiSummary);
  setSummaryState('finished');
};
```

**Progressive Text Reveal:**
```typescript
const revealTextGradually = (fullText: string) => {
  const words = fullText.split(' ');
  const msPerWord = 350; // Approximate speaking rate

  words.forEach((_, index) => {
    setTimeout(() => {
      setDisplayedText(words.slice(0, index + 1).join(' '));
    }, index * msPerWord);
  });
};
```

### Type Update in `src/types/index.ts`

```typescript
interface DashboardAssessment {
  ...existing fields,
  aiSummary?: string;
}
```

## Files to Change

| Area | File | Change |
|------|------|--------|
| Backend | `functions/package.json` | Add `@google-cloud/vertexai` |
| Backend | `functions/src/services/summaryGenerator.ts` | NEW - Gemini integration |
| Backend | `functions/src/index.ts` | Call generateAISummary() |
| Frontend | `src/types/index.ts` | Add aiSummary field |
| Frontend | `src/screens/AnalysisScreen.tsx` | New summary UI component |

## Testing Checklist

- [ ] Gemini generates appropriate summary for high-accuracy student
- [ ] Gemini generates appropriate summary for struggling student
- [ ] Gemini generates appropriate summary for average student
- [ ] Fallback works if Gemini API fails
- [ ] Text-to-speech plays correctly on iPad
- [ ] Progressive text reveal syncs reasonably with audio
- [ ] Stop button works mid-playback
- [ ] Play Again button works after completion
- [ ] Various student names produce fun rhymes
- [ ] Slang usage is appropriate and not overused
- [ ] Summary length stays within 30-40 second range

## Future Considerations

- **Teacher dashboard**: Separate, more clinical summary for teachers (not part of this implementation)
- **Voice selection**: Could offer different TTS voices
- **Celebration animations**: Confetti for excellent performance
- **Save favorites**: Let students save/share summaries they liked
