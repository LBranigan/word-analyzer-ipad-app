/**
 * Type definitions for Word Analyzer iPad App
 */

export interface Teacher {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

export interface Student {
  id: string;
  name: string;
  grade?: string;
  createdAt: Date;
  teacherId: string;
}

export interface Assessment {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  createdAt: Date;

  // Audio data
  audioUri?: string;
  audioDuration: number; // seconds

  // Image data
  imageUri?: string;

  // OCR results
  ocrText?: string;
  ocrWords?: OCRWord[];

  // Speech results
  transcript?: string;
  transcriptWords?: TranscriptWord[];

  // Analysis results
  results?: AssessmentResults;

  // Sync status
  synced: boolean;
  syncedAt?: Date;
}

export interface OCRWord {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface TranscriptWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface AssessmentResults {
  totalWords: number;
  correctWords: number;
  errorWords: number;
  skippedWords: number;
  accuracy: number;
  wpm: number;
  prosodyScore: number;

  wordDetails: WordResult[];
  errorPatterns: ErrorPattern[];
}

export interface WordResult {
  expectedWord: string;
  spokenWord: string | null;
  status: 'correct' | 'misread' | 'substituted' | 'skipped';
  audioStartTime?: number;
  audioEndTime?: number;
}

export interface ErrorPattern {
  pattern: string;
  count: number;
  examples: string[];
}

// Additional types for Teacher Dashboard
export interface AssessmentMetrics {
  accuracy: number;
  wordsPerMinute: number;
  prosodyScore: number;
  prosodyGrade: string;
  totalWords: number;
  correctCount: number;
  errorCount: number;
  skipCount: number;
  hesitationCount?: number;   // Number of significant pauses (> 0.5s)
  fillerWordCount?: number;   // Number of filler words (um, uh, etc)
  repeatCount?: number;       // Number of repeated words
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignedWord {
  expected: string;
  spoken: string | null;
  status: 'correct' | 'misread' | 'substituted' | 'skipped';
  startTime: number;
  endTime: number;
  confidence: number;
  hesitation?: boolean;       // True if there was a significant pause before this word
  pauseDuration?: number;     // Duration of pause before this word in seconds
  isRepeat?: boolean;         // True if this word was repeated
  isSelfCorrection?: boolean; // True if student self-corrected this word
  boundingBox?: BoundingBox;  // Position of word on the original image
}

export interface DashboardErrorPattern {
  type: string;
  pattern: string;
  examples: Array<{ expected: string; spoken: string }>;
  count: number;
}

export type SeverityLevel = 'excellent' | 'mild' | 'moderate' | 'significant';

export interface PatternSummary {
  severity: SeverityLevel;
  primaryIssues: string[];
  recommendations: string[];
  strengths: string[];
  referralSuggestions: string[];
}

export interface DashboardAssessment {
  id: string;
  studentId: string;
  studentName: string;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;

  // Media URLs (temporary, 24h)
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  pdfUrl?: string;
  audioDuration?: number;

  // Image dimensions (for scaling bounding boxes)
  imageWidth?: number;
  imageHeight?: number;

  // Results
  ocrText?: string;
  transcript?: string;
  metrics?: AssessmentMetrics;
  words?: AlignedWord[];
  errorPatterns?: DashboardErrorPattern[];
  patternSummary?: PatternSummary;
  aiSummary?: string;  // AI-generated personalized feedback for the student
}

export type RecordingDuration = 30 | 60;

export interface AppState {
  teacher: Teacher | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  currentAssessment: Partial<Assessment> | null;
  offlineQueue: Assessment[];
}
