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
  Linking,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { DashboardErrorPattern } from '../types';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../hooks/useAuth';
import { DashboardAssessment as Assessment, AlignedWord, AssessmentMetrics, PatternSummary, SeverityLevel } from '../types';
import { createAssessment, subscribeToAssessment, completeAssessmentWithImage } from '../services/assessmentService';

import type { RootStackParamList } from '../navigation/AppNavigator';

type AnalysisScreenRouteProp = RouteProp<RootStackParamList, 'Analysis'>;

/**
 * Calculate similarity between two words (0-100%)
 * Simplified version of the backend algorithm for display purposes
 */
function calculateWordSimilarity(expected: string, spoken: string | null): number {
  if (!spoken) return 0;

  const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const w1 = normalize(expected);
  const w2 = normalize(spoken);

  if (!w1 || !w2) return 0;
  if (w1 === w2) return 100;

  // Levenshtein distance
  const m = w1.length;
  const n = w2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (w1[i - 1] === w2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  const distance = dp[m][n];
  const maxLen = Math.max(w1.length, w2.length);
  const similarity = Math.round((1 - distance / maxLen) * 100);

  return Math.max(0, similarity);
}

type Tab = 'summary' | 'video' | 'export' | 'image' | 'patterns';

export default function AnalysisScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AnalysisScreenRouteProp>();
  const { nameAudioUri, readingAudioUri, imageUri, studentId, studentName, earlyUploadAssessmentId } = route.params;
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
  const [showProsodyPopup, setShowProsodyPopup] = useState(false);
  const [highlightedWordIndices, setHighlightedWordIndices] = useState<number[]>([]);

  // Background generation state (persists across tab switches)
  const [videoStatus, setVideoStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Sync video/pdf URLs from assessment
  useEffect(() => {
    if (assessment?.videoUrl && videoStatus !== 'generating') {
      setVideoUrl(assessment.videoUrl);
      setVideoStatus('ready');
    }
    if (assessment?.pdfUrl && pdfStatus !== 'generating') {
      setPdfUrl(assessment.pdfUrl);
      setPdfStatus('ready');
    }
  }, [assessment?.videoUrl, assessment?.pdfUrl]);

  // Start upload on mount
  useEffect(() => {
    console.log('AnalysisScreen mounted with params:', {
      teacherId: teacher?.uid,
      studentId,
      studentName,
      readingAudioUri: readingAudioUri?.slice(0, 100),
      imageUri: imageUri?.slice(0, 100),
      earlyUploadAssessmentId,
    });

    if (teacher && imageUri) {
      // If we have an early upload assessment ID, just upload the image
      if (earlyUploadAssessmentId) {
        completeWithImage();
      } else if (readingAudioUri) {
        // Standard flow - upload both files
        startUpload();
      } else {
        console.error('Missing required data:', {
          hasTeacher: !!teacher,
          hasAudioUri: !!readingAudioUri,
          hasImageUri: !!imageUri,
          hasEarlyUploadId: !!earlyUploadAssessmentId,
        });
        setUploadStage('Error: Missing audio or image');
      }
    } else {
      console.error('Missing required data:', {
        hasTeacher: !!teacher,
        hasAudioUri: !!readingAudioUri,
        hasImageUri: !!imageUri,
      });
      setUploadStage('Error: Missing audio or image');
    }

    return () => {
      unsubscribeRef.current?.();
      soundRef.current?.unloadAsync();
    };
  }, []);

  // Complete assessment with just image (audio was pre-uploaded)
  const completeWithImage = async () => {
    if (!teacher || !imageUri || !earlyUploadAssessmentId) return;

    try {
      setUploadStage('Audio already uploaded, uploading image...');
      setUploadProgress(50);

      const id = await completeAssessmentWithImage(
        teacher.uid,
        earlyUploadAssessmentId,
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
      console.error('Image upload failed:', error);
      setUploadStage('Upload failed - trying full upload');
      // Fall back to full upload if early upload failed
      if (readingAudioUri) {
        startUpload();
      }
    }
  };

  // Standard upload - both audio and image
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
    // Skip if no audio URL or if word wasn't spoken (skipped words have startTime 0)
    if (!assessment?.audioUrl) {
      console.log('No audio URL available');
      return;
    }

    if (word.status === 'skipped' || (word.startTime === 0 && word.endTime === 0)) {
      console.log('Word was skipped, no audio to play');
      return;
    }

    try {
      // Unload previous sound if exists
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setIsPlayingAudio(true);

      // Calculate timing with buffer for better audio capture
      // Add 1 second before and 1 second after for context
      const startMs = Math.max(0, (word.startTime * 1000) - 1000);
      const endMs = (word.endTime * 1000) + 1000;

      // Ensure minimum duration of 1 second for very short words
      const duration = Math.max(1000, endMs - startMs);

      console.log(`Playing audio: ${word.expected} from ${startMs}ms, duration ${duration}ms`);

      const { sound } = await Audio.Sound.createAsync(
        { uri: assessment.audioUrl },
        { positionMillis: startMs, shouldPlay: false }
      );
      soundRef.current = sound;

      // Use playback status update to stop at the right time
      const targetEndMs = startMs + duration;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          if (status.positionMillis >= targetEndMs || status.didJustFinish) {
            sound.stopAsync();
            setIsPlayingAudio(false);
          }
        }
      });

      // Start playback
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

  // Handle error pattern click - highlight matching words
  const handleErrorPatternClick = (pattern: DashboardErrorPattern) => {
    if (!assessment?.words) return;

    // Find word indices that match this error pattern
    const matchingIndices: number[] = [];

    // Use pattern.type to determine how to match words
    // This is more reliable than checking pattern name text
    const patternType = pattern.type;

    if (patternType === 'hesitation') {
      // Match words with hesitation flag
      assessment.words.forEach((word, index) => {
        if (word.hesitation) {
          matchingIndices.push(index);
        }
      });
    } else if (patternType === 'repetition') {
      // Match words with repeat flag
      assessment.words.forEach((word, index) => {
        if (word.isRepeat) {
          matchingIndices.push(index);
        }
      });
    } else if (patternType === 'self_correction') {
      // Match words with self-correction flag
      assessment.words.forEach((word, index) => {
        if (word.isSelfCorrection) {
          matchingIndices.push(index);
        }
      });
    } else {
      // For other error patterns (substitution, phonetic, etc.), match by examples
      // Build a set of expected words from examples for efficient lookup
      const exampleWords = new Set(
        pattern.examples.map(ex => ex.expected.toLowerCase())
      );

      assessment.words.forEach((word, index) => {
        // Match by expected word (case-insensitive) AND word has an error
        if (exampleWords.has(word.expected.toLowerCase()) &&
            word.status !== 'correct') {
          matchingIndices.push(index);
        }
      });
    }

    // Toggle: if same pattern clicked again, clear highlighting
    if (highlightedWordIndices.length > 0 &&
        JSON.stringify([...highlightedWordIndices].sort()) === JSON.stringify([...matchingIndices].sort())) {
      setHighlightedWordIndices([]);
    } else {
      setHighlightedWordIndices(matchingIndices);
    }
  };

  // RENDER: Uploading/Processing state
  if (!assessment || assessment.status === 'uploading' || assessment.status === 'processing') {
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

      {/* Background Generation Banner */}
      {(videoStatus === 'generating' || pdfStatus === 'generating') && activeTab !== 'video' && activeTab !== 'export' && (
        <View style={styles.generatingBanner}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.generatingBannerText}>
            {videoStatus === 'generating' && pdfStatus === 'generating'
              ? 'Generating video & PDF...'
              : videoStatus === 'generating'
              ? 'Generating video in background...'
              : 'Generating PDF in background...'}
          </Text>
          <TouchableOpacity
            onPress={() => setActiveTab(videoStatus === 'generating' ? 'video' : 'export')}
          >
            <Text style={styles.generatingBannerLink}>View</Text>
          </TouchableOpacity>
        </View>
      )}

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
            ready={videoStatus === 'ready'}
          />
          <SidebarTab
            icon="picture-as-pdf"
            label="Export"
            active={activeTab === 'export'}
            onPress={() => setActiveTab('export')}
            ready={pdfStatus === 'ready'}
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
              onShowProsody={() => setShowProsodyPopup(true)}
              onErrorPatternClick={handleErrorPatternClick}
              highlightedWordIndices={highlightedWordIndices}
            />
          )}
          {activeTab === 'video' && (
            <VideoTab
              assessment={assessment}
              teacherId={teacher?.uid || ''}
              assessmentId={assessmentId || ''}
              videoStatus={videoStatus}
              videoUrl={videoUrl}
              videoError={videoError}
              setVideoStatus={setVideoStatus}
              setVideoUrl={setVideoUrl}
              setVideoError={setVideoError}
            />
          )}
          {activeTab === 'export' && (
            <ExportTab
              assessment={assessment}
              teacherId={teacher?.uid || ''}
              assessmentId={assessmentId || ''}
              pdfStatus={pdfStatus}
              pdfUrl={pdfUrl}
              pdfError={pdfError}
              setPdfStatus={setPdfStatus}
              setPdfUrl={setPdfUrl}
              setPdfError={setPdfError}
            />
          )}
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

      {/* Prosody Explanation Popup */}
      {showProsodyPopup && (
        <ProsodyPopup
          metrics={assessment.metrics}
          onClose={() => setShowProsodyPopup(false)}
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

function SidebarTab({ icon, label, active, onPress, ready }: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  ready?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.sidebarItem, active && styles.sidebarItemActive]}
      onPress={onPress}
    >
      <View style={styles.sidebarIconContainer}>
        <MaterialIcons
          name={icon as any}
          size={24}
          color={active ? '#4299E1' : ready ? '#48BB78' : '#718096'}
        />
        {ready && !active && (
          <View style={styles.readyBadge}>
            <MaterialIcons name="check" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>
      <Text style={[
        styles.sidebarText,
        active && styles.sidebarTextActive,
        ready && !active && styles.sidebarTextReady
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SummaryTab({ assessment, onWordPress, getWordStyle, onShowProsody, onErrorPatternClick, highlightedWordIndices }: {
  assessment: Assessment;
  onWordPress: (word: AlignedWord) => void;
  getWordStyle: (status: string) => any;
  onShowProsody: () => void;
  onErrorPatternClick: (pattern: DashboardErrorPattern) => void;
  highlightedWordIndices: number[];
}) {
  const metrics = assessment.metrics;

  // AI Summary playback state
  const [summaryState, setSummaryState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [displayedText, setDisplayedText] = useState('');
  const revealTimeouts = useRef<NodeJS.Timeout[]>([]);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Get the AI summary or fallback to a simple message
  const aiSummary = assessment.aiSummary ||
    (metrics?.prosodyGrade === 'Excellent'
      ? `Great job! You read ${metrics?.totalWords} words with ${metrics?.accuracy}% accuracy.`
      : metrics?.prosodyGrade === 'Proficient'
      ? `Good reading! ${metrics?.correctCount} words correct. Keep practicing the highlighted words.`
      : `Keep practicing! Focus on the words highlighted in red and orange.`);

  // Check if we have pre-generated audio
  const hasPreGeneratedAudio = !!assessment.aiSummaryAudioUrl;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revealTimeouts.current.forEach(t => clearTimeout(t));
      Speech.stop();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const revealTextGradually = (fullText: string, durationMs?: number) => {
    const words = fullText.split(' ');
    // If we have duration from audio, use it; otherwise estimate
    const msPerWord = durationMs ? durationMs / words.length : 320;

    // Clear any existing timeouts
    revealTimeouts.current.forEach(t => clearTimeout(t));
    revealTimeouts.current = [];

    words.forEach((_, index) => {
      const timeout = setTimeout(() => {
        setDisplayedText(words.slice(0, index + 1).join(' '));
      }, index * msPerWord);
      revealTimeouts.current.push(timeout);
    });
  };

  const handlePlaySummary = async () => {
    setSummaryState('playing');
    setDisplayedText('');

    // If we have pre-generated audio, use it (much better quality!)
    if (hasPreGeneratedAudio && assessment.aiSummaryAudioUrl) {
      try {
        // Unload any previous sound
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }

        // Load and play the pre-generated audio
        const { sound } = await Audio.Sound.createAsync(
          { uri: assessment.aiSummaryAudioUrl },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setSummaryState('finished');
              setDisplayedText(aiSummary);
            }
          }
        );
        soundRef.current = sound;

        // Get audio duration for text reveal timing
        const status = await sound.getStatusAsync();
        const durationMs = status.isLoaded ? status.durationMillis || 30000 : 30000;

        // Reveal text gradually synced with audio duration
        revealTextGradually(aiSummary, durationMs);

      } catch (error) {
        console.error('Error playing pre-generated audio, falling back to device TTS:', error);
        // Fall back to device TTS
        playWithDeviceTTS();
      }
    } else {
      // No pre-generated audio, use device TTS
      playWithDeviceTTS();
    }
  };

  const playWithDeviceTTS = () => {
    Speech.speak(aiSummary, {
      language: 'en-US',
      rate: 0.95,
      onDone: () => {
        setSummaryState('finished');
        setDisplayedText(aiSummary);
      },
      onStopped: () => {
        setSummaryState('finished');
        setDisplayedText(aiSummary);
      },
      onError: () => {
        setSummaryState('finished');
        setDisplayedText(aiSummary);
      },
    });

    // Reveal text gradually
    revealTextGradually(aiSummary);
  };

  const handleStopSummary = async () => {
    // Stop pre-generated audio if playing
    if (soundRef.current) {
      await soundRef.current.stopAsync();
    }
    // Stop device TTS if playing
    Speech.stop();

    revealTimeouts.current.forEach(t => clearTimeout(t));
    setDisplayedText(aiSummary);
    setSummaryState('finished');
  };

  return (
    <View style={styles.summaryContainer}>
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatBox label="Correct" value={metrics?.correctCount || 0} color="#48BB78" />
        <StatBox label="Errors" value={metrics?.errorCount || 0} color="#E53E3E" />
        <StatBox label="Accuracy" value={`${metrics?.accuracy || 0}%`} color="#4299E1" />
        <StatBox label="WPM" value={metrics?.wordsPerMinute || 0} color="#9F7AEA" />
        <TouchableOpacity style={styles.statBoxTouchable} onPress={onShowProsody}>
          <View style={[styles.statBoxInner, { borderTopColor: '#ED8936' }]}>
            <Text style={styles.statValue}>{metrics?.prosodyScore || 0}</Text>
            <Text style={styles.statLabel}>Prosody</Text>
            <Text style={styles.prosodyGradeLabel}>{metrics?.prosodyGrade || 'N/A'}</Text>
            <MaterialIcons name="info-outline" size={16} color="#A0AEC0" style={styles.prosodyInfoIcon} />
          </View>
        </TouchableOpacity>
      </View>

      {/* AI Summary - Interactive */}
      <View style={styles.aiSummaryContainer}>
        {summaryState === 'ready' && (
          <TouchableOpacity style={styles.aiSummaryButton} onPress={handlePlaySummary} activeOpacity={0.8}>
            <MaterialIcons name="volume-up" size={28} color="#4299E1" />
            <View style={styles.aiSummaryButtonText}>
              <Text style={styles.aiSummaryTitle}>Hear Your Results</Text>
              <Text style={styles.aiSummarySubtitle}>Tap to hear your personalized feedback</Text>
            </View>
          </TouchableOpacity>
        )}

        {summaryState === 'playing' && (
          <View style={styles.aiSummaryPlaying}>
            <View style={styles.aiSummaryPlayingHeader}>
              <View style={styles.aiSummaryPlayingLeft}>
                <MaterialIcons name="graphic-eq" size={24} color="#48BB78" />
                <Text style={styles.aiSummaryPlayingTitle}>Playing...</Text>
              </View>
              <TouchableOpacity style={styles.aiSummaryStopButton} onPress={handleStopSummary}>
                <Text style={styles.aiSummaryStopText}>Stop</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.aiSummaryText}>{displayedText}</Text>
          </View>
        )}

        {summaryState === 'finished' && (
          <View style={styles.aiSummaryFinished}>
            <TouchableOpacity style={styles.aiSummaryPlayAgain} onPress={handlePlaySummary}>
              <MaterialIcons name="replay" size={20} color="#4299E1" />
              <Text style={styles.aiSummaryPlayAgainText}>Play Again</Text>
            </TouchableOpacity>
            <ScrollView style={styles.aiSummaryTextScroll} nestedScrollEnabled>
              <Text style={styles.aiSummaryText}>{displayedText}</Text>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Fluency Indicators */}
      {(metrics?.hesitationCount || metrics?.fillerWordCount || metrics?.repeatCount) ? (
        <View style={styles.fluencyRow}>
          <Text style={styles.fluencyTitle}>Fluency</Text>
          <View style={styles.fluencyIndicators}>
            {metrics?.hesitationCount ? (
              <View style={styles.fluencyItem}>
                <MaterialIcons name="pause-circle-outline" size={18} color="#7C3AED" />
                <Text style={styles.fluencyValue}>{metrics.hesitationCount}</Text>
                <Text style={styles.fluencyLabel}>pauses</Text>
              </View>
            ) : null}
            {metrics?.fillerWordCount ? (
              <View style={styles.fluencyItem}>
                <MaterialIcons name="chat-bubble-outline" size={18} color="#9F7AEA" />
                <Text style={styles.fluencyValue}>{metrics.fillerWordCount}</Text>
                <Text style={styles.fluencyLabel}>fillers</Text>
              </View>
            ) : null}
            {metrics?.repeatCount ? (
              <View style={styles.fluencyItem}>
                <MaterialIcons name="repeat" size={18} color="#4299E1" />
                <Text style={styles.fluencyValue}>{metrics.repeatCount}</Text>
                <Text style={styles.fluencyLabel}>repeats</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Word Highlighting */}
      <Text style={styles.sectionTitle}>Text with Error Highlighting</Text>
      <View style={styles.wordsContainer}>
        {assessment.words?.map((word, index) => (
          <PulsingWord
            key={index}
            word={word}
            index={index}
            isHighlighted={highlightedWordIndices.includes(index)}
            onPress={() => onWordPress(word)}
            getWordStyle={getWordStyle}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color="#C6F6D5" label="Correct" />
        <LegendItem color="#FEEBC8" label="Misread" />
        <LegendItem color="#FED7D7" label="Substituted" />
        <LegendItem color="#E2E8F0" label="Skipped" />
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, styles.hesitationLegendColor]}>
            <Text style={styles.hesitationLegendIcon}>⏸</Text>
          </View>
          <Text style={styles.legendText}>Hesitation</Text>
        </View>
      </View>

      {/* Error Breakdown - Clickable */}
      {assessment.errorPatterns && assessment.errorPatterns.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Error Breakdown</Text>
          <Text style={styles.errorBreakdownHint}>Tap an error to highlight words</Text>
          <View style={styles.errorBreakdown}>
            {assessment.errorPatterns.slice(0, 5).map((pattern, index) => (
              <TouchableOpacity
                key={index}
                style={styles.errorPatternItem}
                onPress={() => onErrorPatternClick(pattern)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="touch-app" size={16} color="#718096" style={{ marginRight: 6 }} />
                <Text style={styles.errorPatternText}>
                  {pattern.pattern} ({pattern.count}x)
                </Text>
              </TouchableOpacity>
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

// PulsingWord component with animation for highlighted errors
function PulsingWord({ word, index, isHighlighted, onPress, getWordStyle }: {
  word: AlignedWord;
  index: number;
  isHighlighted: boolean;
  onPress: () => void;
  getWordStyle: (status: string) => any;
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isHighlighted) {
      // Start pulsing animation - subtle opacity pulse
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: false,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isHighlighted]);

  // Interpolate border color opacity for subtle pulse (no size change)
  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: ['transparent', 'rgba(229, 62, 62, 0.4)', 'rgba(229, 62, 62, 1)'],
  });

  return (
    <TouchableOpacity onPress={onPress}>
      <Animated.View
        style={[
          styles.word,
          getWordStyle(word.status),
          word.hesitation && styles.wordWithHesitation,
          // Always have border space reserved to prevent movement
          styles.wordWithPulseBorder,
          isHighlighted && { borderColor },
        ]}
      >
        <Text style={styles.wordText}>{word.expected}</Text>
        {word.hesitation && (
          <View style={styles.hesitationIndicator}>
            <Text style={styles.hesitationDot}>⏸</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function VideoTab({ assessment, teacherId, assessmentId, videoStatus, videoUrl, videoError, setVideoStatus, setVideoUrl, setVideoError }: {
  assessment: Assessment;
  teacherId: string;
  assessmentId: string;
  videoStatus: 'idle' | 'generating' | 'ready' | 'error';
  videoUrl: string | null;
  videoError: string | null;
  setVideoStatus: (status: 'idle' | 'generating' | 'ready' | 'error') => void;
  setVideoUrl: (url: string | null) => void;
  setVideoError: (error: string | null) => void;
}) {
  const generateVideo = async () => {
    setVideoStatus('generating');
    setVideoError(null);

    try {
      const functions = getFunctions();
      // Set timeout to 5 minutes (300000ms) for video generation
      const generateAssessmentVideo = httpsCallable(functions, 'generateAssessmentVideo', {
        timeout: 300000,
      });

      const result = await generateAssessmentVideo({ teacherId, assessmentId });
      const data = result.data as { videoUrl: string };

      setVideoUrl(data.videoUrl);
      setVideoStatus('ready');
    } catch (error: any) {
      console.error('Video generation failed:', error);
      setVideoError(error.message || 'Failed to generate video');
      setVideoStatus('error');
    }
  };

  const downloadVideo = async () => {
    if (videoUrl) {
      if (Platform.OS === 'web') {
        window.open(videoUrl, '_blank');
      } else {
        await Linking.openURL(videoUrl);
      }
    }
  };

  if (videoStatus === 'generating') {
    return (
      <View style={styles.tabPlaceholder}>
        <ActivityIndicator size="large" color="#4299E1" />
        <Text style={styles.placeholderText}>Generating video...</Text>
        <Text style={styles.videoSubtext}>This may take a few minutes</Text>
      </View>
    );
  }

  if (videoStatus === 'ready' && videoUrl) {
    return (
      <View style={styles.videoContainer}>
        <View style={styles.videoReadyBox}>
          <MaterialIcons name="check-circle" size={64} color="#48BB78" />
          <Text style={styles.videoReadyTitle}>Video Ready!</Text>
          <Text style={styles.videoReadySubtitle}>
            Your assessment video has been generated
          </Text>

          <TouchableOpacity style={styles.downloadButton} onPress={downloadVideo}>
            <MaterialIcons name="download" size={24} color="#FFFFFF" />
            <Text style={styles.downloadButtonText}>Download Video</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.videoInfo}>
          <Text style={styles.videoInfoTitle}>Video Features:</Text>
          <View style={styles.videoFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.videoFeatureText}>Synchronized word highlighting</Text>
          </View>
          <View style={styles.videoFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.videoFeatureText}>Color-coded error indicators</Text>
          </View>
          <View style={styles.videoFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.videoFeatureText}>Student's audio recording</Text>
          </View>
          <View style={styles.videoFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.videoFeatureText}>Progress indicator</Text>
          </View>
        </View>
      </View>
    );
  }

  if (videoStatus === 'error') {
    return (
      <View style={styles.tabPlaceholder}>
        <MaterialIcons name="error-outline" size={64} color="#E53E3E" />
        <Text style={styles.errorText}>Video generation failed</Text>
        <Text style={styles.videoSubtext}>{videoError}</Text>
        <TouchableOpacity style={styles.retryVideoButton} onPress={generateVideo}>
          <Text style={styles.retryVideoButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Idle state - show generate button
  return (
    <View style={styles.videoContainer}>
      <View style={styles.videoPreviewBox}>
        <MaterialIcons name="videocam" size={64} color="#4299E1" />
        <Text style={styles.videoPreviewTitle}>Generate Assessment Video</Text>
        <Text style={styles.videoPreviewSubtitle}>
          Create a video showing the student's reading with synchronized word highlighting
        </Text>

        <TouchableOpacity style={styles.generateButton} onPress={generateVideo}>
          <MaterialIcons name="movie-creation" size={24} color="#FFFFFF" />
          <Text style={styles.generateButtonText}>Generate Video</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.videoInfo}>
        <Text style={styles.videoInfoTitle}>The video will include:</Text>
        <View style={styles.videoFeature}>
          <MaterialIcons name="text-fields" size={20} color="#718096" />
          <Text style={styles.videoFeatureText}>Words highlighted as spoken</Text>
        </View>
        <View style={styles.videoFeature}>
          <MaterialIcons name="palette" size={20} color="#718096" />
          <Text style={styles.videoFeatureText}>Color-coded accuracy indicators</Text>
        </View>
        <View style={styles.videoFeature}>
          <MaterialIcons name="record-voice-over" size={20} color="#718096" />
          <Text style={styles.videoFeatureText}>Student's audio recording</Text>
        </View>
      </View>
    </View>
  );
}

function ExportTab({ assessment, teacherId, assessmentId, pdfStatus, pdfUrl, pdfError, setPdfStatus, setPdfUrl, setPdfError }: {
  assessment: Assessment;
  teacherId: string;
  assessmentId: string;
  pdfStatus: 'idle' | 'generating' | 'ready' | 'error';
  pdfUrl: string | null;
  pdfError: string | null;
  setPdfStatus: (status: 'idle' | 'generating' | 'ready' | 'error') => void;
  setPdfUrl: (url: string | null) => void;
  setPdfError: (error: string | null) => void;
}) {
  const generatePdf = async () => {
    setPdfStatus('generating');
    setPdfError(null);

    try {
      const functions = getFunctions();
      const generateAssessmentPdf = httpsCallable(functions, 'generateAssessmentPdf');

      const result = await generateAssessmentPdf({ teacherId, assessmentId });
      const data = result.data as { pdfUrl: string };

      setPdfUrl(data.pdfUrl);
      setPdfStatus('ready');
    } catch (error: any) {
      console.error('PDF generation failed:', error);
      setPdfError(error.message || 'Failed to generate PDF');
      setPdfStatus('error');
    }
  };

  const downloadPdf = async () => {
    if (pdfUrl) {
      if (Platform.OS === 'web') {
        window.open(pdfUrl, '_blank');
      } else {
        await Linking.openURL(pdfUrl);
      }
    }
  };

  if (pdfStatus === 'generating') {
    return (
      <View style={styles.tabPlaceholder}>
        <ActivityIndicator size="large" color="#4299E1" />
        <Text style={styles.placeholderText}>Generating PDF report...</Text>
        <Text style={styles.exportSubtext}>This should only take a moment</Text>
      </View>
    );
  }

  if (pdfStatus === 'ready' && pdfUrl) {
    return (
      <View style={styles.exportContainer}>
        <View style={styles.exportReadyBox}>
          <MaterialIcons name="picture-as-pdf" size={64} color="#E53E3E" />
          <Text style={styles.exportReadyTitle}>PDF Report Ready!</Text>
          <Text style={styles.exportReadySubtitle}>
            Your assessment report has been generated
          </Text>

          <TouchableOpacity style={styles.exportDownloadButton} onPress={downloadPdf}>
            <MaterialIcons name="download" size={24} color="#FFFFFF" />
            <Text style={styles.exportDownloadButtonText}>Download PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.exportInfo}>
          <Text style={styles.exportInfoTitle}>Report Includes:</Text>
          <View style={styles.exportFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.exportFeatureText}>Summary metrics and grades</Text>
          </View>
          <View style={styles.exportFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.exportFeatureText}>Color-coded word analysis</Text>
          </View>
          <View style={styles.exportFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.exportFeatureText}>Error pattern breakdown</Text>
          </View>
          <View style={styles.exportFeature}>
            <MaterialIcons name="check" size={20} color="#48BB78" />
            <Text style={styles.exportFeatureText}>Professional formatting</Text>
          </View>
        </View>
      </View>
    );
  }

  if (pdfStatus === 'error') {
    return (
      <View style={styles.tabPlaceholder}>
        <MaterialIcons name="error-outline" size={64} color="#E53E3E" />
        <Text style={styles.errorText}>PDF generation failed</Text>
        <Text style={styles.exportSubtext}>{pdfError}</Text>
        <TouchableOpacity style={styles.retryExportButton} onPress={generatePdf}>
          <Text style={styles.retryExportButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Idle state - show generate button
  return (
    <View style={styles.exportContainer}>
      <View style={styles.exportPreviewBox}>
        <MaterialIcons name="picture-as-pdf" size={64} color="#E53E3E" />
        <Text style={styles.exportPreviewTitle}>Generate PDF Report</Text>
        <Text style={styles.exportPreviewSubtitle}>
          Create a professional PDF report of this assessment for printing or sharing
        </Text>

        <TouchableOpacity style={styles.exportGenerateButton} onPress={generatePdf}>
          <MaterialIcons name="picture-as-pdf" size={24} color="#FFFFFF" />
          <Text style={styles.exportGenerateButtonText}>Generate PDF</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.exportInfo}>
        <Text style={styles.exportInfoTitle}>The report will include:</Text>
        <View style={styles.exportFeature}>
          <MaterialIcons name="assessment" size={20} color="#718096" />
          <Text style={styles.exportFeatureText}>Accuracy, WPM, and prosody metrics</Text>
        </View>
        <View style={styles.exportFeature}>
          <MaterialIcons name="text-fields" size={20} color="#718096" />
          <Text style={styles.exportFeatureText}>Word-by-word analysis with highlighting</Text>
        </View>
        <View style={styles.exportFeature}>
          <MaterialIcons name="pattern" size={20} color="#718096" />
          <Text style={styles.exportFeatureText}>Common error patterns identified</Text>
        </View>
      </View>
    </View>
  );
}

function ImageTab({ assessment }: { assessment: Assessment }) {
  const words = assessment.words || [];
  const metrics = assessment.metrics;
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Original image dimensions from OCR (coordinate space for bounding boxes)
  const originalWidth = assessment.imageWidth || 0;
  const originalHeight = assessment.imageHeight || 0;

  // Calculate aspect ratio for sizing (default to 4:3 if no dimensions)
  const aspectRatio = originalWidth > 0 && originalHeight > 0
    ? originalWidth / originalHeight
    : 4 / 3;

  // Container height based on width and aspect ratio
  const containerHeight = containerWidth > 0 ? containerWidth / aspectRatio : 500;

  // Find first and last words that have bounding boxes
  const wordsWithBoxes = words.filter(w => w.boundingBox);
  const firstWord = wordsWithBoxes[0] || null;
  const lastWord = wordsWithBoxes[wordsWithBoxes.length - 1] || null;

  // Calculate counts
  const correctCount = metrics?.correctCount || 0;
  const errorCount = metrics?.errorCount || 0;

  // Scale factor: displayed width / original width
  const scale = containerWidth > 0 && originalWidth > 0 ? containerWidth / originalWidth : 0;

  // No image available
  if (!assessment.imageUrl) {
    return (
      <View style={styles.tabPlaceholder}>
        <MaterialIcons name="image" size={64} color="#CBD5E0" />
        <Text style={styles.placeholderText}>No image available</Text>
      </View>
    );
  }

  // Render a word overlay box (green highlight, no label)
  const renderWordOverlay = (
    word: typeof firstWord,
    key: string
  ) => {
    if (!word?.boundingBox || scale === 0) return null;

    const box = word.boundingBox;
    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          left: box.x * scale,
          top: box.y * scale,
          width: box.width * scale,
          height: box.height * scale,
          borderWidth: 3,
          borderColor: '#22C55E',
          backgroundColor: 'rgba(34, 197, 94, 0.25)',
          borderRadius: 4,
          zIndex: 10,
        }}
      />
    );
  };

  return (
    <View style={styles.imageTabContainer}>
      {/* Stats bar above image */}
      <View style={styles.imageStatsBar}>
        <View style={styles.imageStatItem}>
          <Text style={styles.imageStatNumber}>{correctCount}</Text>
          <Text style={styles.imageStatLabel}>Correct</Text>
        </View>
        <View style={styles.imageStatDivider} />
        <View style={styles.imageStatItem}>
          <Text style={[styles.imageStatNumber, { color: '#E53E3E' }]}>{errorCount}</Text>
          <Text style={styles.imageStatLabel}>Errors</Text>
        </View>
      </View>

      {/* First and Last Words Display */}
      <View style={styles.imageFirstLastRow}>
        <View style={styles.imageFirstLastBox}>
          <Text style={styles.imageFirstLastLabel}>First Word</Text>
          <Text style={styles.imageFirstLastWord}>
            {firstWord?.expected || '—'}
          </Text>
        </View>
        <View style={styles.imageFirstLastDivider} />
        <View style={styles.imageFirstLastBox}>
          <Text style={styles.imageFirstLastLabel}>Last Word</Text>
          <Text style={styles.imageFirstLastWord}>
            {lastWord?.expected || '—'}
          </Text>
        </View>
      </View>

      {/* Image container with explicit height based on aspect ratio */}
      <View
        style={[styles.imageDisplayContainer, { height: containerHeight }]}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          setContainerWidth(width);
        }}
      >
        {/* The captured image - fills container completely */}
        <Image
          source={{ uri: assessment.imageUrl }}
          style={styles.imageFill}
          resizeMode="stretch"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
        />

        {/* Word overlays - only render when image is loaded and we have dimensions */}
        {imageLoaded && scale > 0 && (
          <>
            {renderWordOverlay(firstWord, 'first')}
            {renderWordOverlay(lastWord, 'last')}
          </>
        )}
      </View>

      {/* Show dimension info if missing */}
      {(originalWidth === 0 || originalHeight === 0) && (
        <Text style={styles.imageDimensionWarning}>
          Note: Image dimensions not available. Overlays may not align correctly.
        </Text>
      )}
    </View>
  );
}

function PatternsTab({ assessment }: { assessment: Assessment }) {
  const patterns = assessment.errorPatterns || [];
  const summary = assessment.patternSummary;

  // Severity badge colors and labels
  const getSeverityConfig = (severity: SeverityLevel) => {
    switch (severity) {
      case 'excellent':
        return { color: '#22C55E', bgColor: '#DCFCE7', icon: 'star' as const, label: 'Excellent' };
      case 'mild':
        return { color: '#3B82F6', bgColor: '#DBEAFE', icon: 'trending-up' as const, label: 'Mild Concerns' };
      case 'moderate':
        return { color: '#F59E0B', bgColor: '#FEF3C7', icon: 'warning' as const, label: 'Moderate Concerns' };
      case 'significant':
        return { color: '#EF4444', bgColor: '#FEE2E2', icon: 'error' as const, label: 'Significant Concerns' };
    }
  };

  const severityConfig = summary ? getSeverityConfig(summary.severity) : null;

  // Combine concerns and recommendations into one list for display
  const hasContent = summary && (
    summary.referralSuggestions.length > 0 ||
    summary.primaryIssues.length > 0 ||
    summary.recommendations.length > 0
  );

  return (
    <ScrollView style={styles.patternsContainer} showsVerticalScrollIndicator={false}>
      {/* === UNIFIED SUMMARY CARD === */}
      {summary && severityConfig && (
        <View style={styles.unifiedSummaryCard}>
          {/* Severity Header */}
          <View style={[styles.severityHeader, { backgroundColor: severityConfig.bgColor }]}>
            <MaterialIcons name={severityConfig.icon} size={28} color={severityConfig.color} />
            <View style={styles.severityHeaderText}>
              <Text style={[styles.severityLabel, { color: severityConfig.color }]}>
                {severityConfig.label}
              </Text>
              <Text style={styles.severitySubtext}>
                {summary.severity === 'excellent'
                  ? 'Reading at or above expected level'
                  : summary.severity === 'mild'
                  ? 'Minor areas for targeted practice'
                  : summary.severity === 'moderate'
                  ? 'Multiple areas need focused attention'
                  : 'Consider additional assessment or support'}
              </Text>
            </View>
          </View>

          {/* Content Section */}
          {hasContent && (
            <View style={styles.summaryContent}>
              {/* Referral Alert - inline, compact */}
              {summary.referralSuggestions.length > 0 && (
                <View style={styles.referralAlert}>
                  <MaterialIcons name="warning" size={18} color="#DC2626" />
                  <Text style={styles.referralAlertText}>
                    {summary.referralSuggestions[0]}
                  </Text>
                </View>
              )}

              {/* Concerns & Recommendations Combined */}
              {(summary.primaryIssues.length > 0 || summary.recommendations.length > 0) && (
                <View style={styles.insightsSection}>
                  {/* Concerns as compact list */}
                  {summary.primaryIssues.length > 0 && (
                    <>
                      <Text style={styles.insightsSectionLabel}>Focus Areas</Text>
                      {summary.primaryIssues.slice(0, 3).map((issue, index) => (
                        <View key={`issue-${index}`} style={styles.insightItem}>
                          <MaterialIcons name="flag" size={14} color="#F59E0B" />
                          <Text style={styles.insightText}>{issue}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Recommendations as compact list */}
                  {summary.recommendations.length > 0 && (
                    <>
                      <Text style={[styles.insightsSectionLabel, summary.primaryIssues.length > 0 && { marginTop: 12 }]}>
                        Recommendations
                      </Text>
                      {summary.recommendations.slice(0, 3).map((rec, index) => (
                        <View key={`rec-${index}`} style={styles.insightItem}>
                          <MaterialIcons name="lightbulb-outline" size={14} color="#3B82F6" />
                          <Text style={styles.insightText}>{rec}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* === DETAILED PATTERNS SECTION === */}
      {patterns.length > 0 && (
        <View style={styles.detailedPatternsSection}>
          <Text style={styles.patternsSectionTitle}>Error Patterns</Text>
          {patterns.map((pattern, index) => (
            <View key={index} style={styles.patternCard}>
              <View style={styles.patternHeader}>
                <Text style={styles.patternTitle}>{pattern.pattern}</Text>
                <View style={styles.patternCountBadge}>
                  <Text style={styles.patternCountText}>{pattern.count}×</Text>
                </View>
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
      )}

      {/* No patterns - Excellent reading */}
      {patterns.length === 0 && summary?.severity === 'excellent' && (
        <View style={styles.excellentReadingCard}>
          <MaterialIcons name="emoji-events" size={48} color="#F59E0B" />
          <Text style={styles.excellentTitle}>Outstanding!</Text>
          <Text style={styles.excellentSubtext}>
            No significant error patterns detected.
          </Text>
        </View>
      )}

      {/* No data at all */}
      {patterns.length === 0 && !summary && (
        <View style={styles.tabPlaceholder}>
          <MaterialIcons name="check-circle" size={64} color="#48BB78" />
          <Text style={styles.placeholderText}>No error patterns detected</Text>
        </View>
      )}
    </ScrollView>
  );
}

function ProsodyPopup({ metrics, onClose }: {
  metrics?: AssessmentMetrics;
  onClose: () => void;
}) {
  const accuracy = metrics?.accuracy || 0;
  const wpm = metrics?.wordsPerMinute || 0;
  const errorCount = metrics?.errorCount || 0;
  const totalWords = metrics?.totalWords || 1;
  const hesitationCount = metrics?.hesitationCount || 0;
  const fillerWordCount = metrics?.fillerWordCount || 0;
  const repeatCount = metrics?.repeatCount || 0;

  // Calculate component scores (mirrors metricsCalculator.ts logic)
  let accuracyPoints: number;
  if (accuracy >= 98) accuracyPoints = 4;
  else if (accuracy >= 95) accuracyPoints = 3.5;
  else if (accuracy >= 90) accuracyPoints = 3;
  else if (accuracy >= 85) accuracyPoints = 2.5;
  else if (accuracy >= 75) accuracyPoints = 2;
  else accuracyPoints = 1.5;

  let ratePoints: number;
  if (wpm >= 100 && wpm <= 180) ratePoints = 4;
  else if (wpm >= 80 && wpm <= 200) ratePoints = 3.5;
  else if (wpm >= 60 && wpm <= 220) ratePoints = 3;
  else ratePoints = 2;

  const errorRate = errorCount / totalWords;
  let fluencyPoints: number;
  if (errorRate <= 0.02) fluencyPoints = 4;
  else if (errorRate <= 0.05) fluencyPoints = 3.5;
  else if (errorRate <= 0.10) fluencyPoints = 3;
  else if (errorRate <= 0.20) fluencyPoints = 2.5;
  else fluencyPoints = 2;

  const disfluencyRate = (hesitationCount + fillerWordCount + repeatCount) / totalWords;
  let smoothnessPoints: number;
  if (disfluencyRate <= 0.02) smoothnessPoints = 4;
  else if (disfluencyRate <= 0.05) smoothnessPoints = 3.5;
  else if (disfluencyRate <= 0.10) smoothnessPoints = 3;
  else if (disfluencyRate <= 0.20) smoothnessPoints = 2.5;
  else if (disfluencyRate <= 0.30) smoothnessPoints = 2;
  else smoothnessPoints = 1.5;

  return (
    <View style={styles.popupOverlay}>
      <View style={[styles.popupContainer, { width: 380, maxHeight: 500 }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.popupTitle}>How Prosody is Calculated</Text>

          <Text style={styles.prosodyExplainText}>
            Prosody score (0-4) measures reading fluency based on four components:
          </Text>

          {/* Accuracy Component */}
          <View style={styles.prosodyComponent}>
            <View style={styles.prosodyComponentHeader}>
              <Text style={styles.prosodyComponentTitle}>1. Accuracy (35%)</Text>
              <Text style={styles.prosodyComponentScore}>{accuracyPoints}/4</Text>
            </View>
            <Text style={styles.prosodyComponentDesc}>
              Based on {accuracy}% words read correctly
            </Text>
            <View style={styles.prosodyComponentBar}>
              <View style={[styles.prosodyComponentFill, { width: `${(accuracyPoints / 4) * 100}%`, backgroundColor: '#48BB78' }]} />
            </View>
          </View>

          {/* Rate Component */}
          <View style={styles.prosodyComponent}>
            <View style={styles.prosodyComponentHeader}>
              <Text style={styles.prosodyComponentTitle}>2. Reading Rate (25%)</Text>
              <Text style={styles.prosodyComponentScore}>{ratePoints}/4</Text>
            </View>
            <Text style={styles.prosodyComponentDesc}>
              {wpm} WPM (optimal: 100-180 WPM)
            </Text>
            <View style={styles.prosodyComponentBar}>
              <View style={[styles.prosodyComponentFill, { width: `${(ratePoints / 4) * 100}%`, backgroundColor: '#4299E1' }]} />
            </View>
          </View>

          {/* Fluency Component */}
          <View style={styles.prosodyComponent}>
            <View style={styles.prosodyComponentHeader}>
              <Text style={styles.prosodyComponentTitle}>3. Fluency (25%)</Text>
              <Text style={styles.prosodyComponentScore}>{fluencyPoints}/4</Text>
            </View>
            <Text style={styles.prosodyComponentDesc}>
              {Math.round(errorRate * 100)}% error rate ({errorCount} errors)
            </Text>
            <View style={styles.prosodyComponentBar}>
              <View style={[styles.prosodyComponentFill, { width: `${(fluencyPoints / 4) * 100}%`, backgroundColor: '#9F7AEA' }]} />
            </View>
          </View>

          {/* Smoothness Component */}
          <View style={styles.prosodyComponent}>
            <View style={styles.prosodyComponentHeader}>
              <Text style={styles.prosodyComponentTitle}>4. Smoothness (15%)</Text>
              <Text style={styles.prosodyComponentScore}>{smoothnessPoints}/4</Text>
            </View>
            <Text style={styles.prosodyComponentDesc}>
              {hesitationCount} hesitations, {fillerWordCount} fillers, {repeatCount} repeats
            </Text>
            <View style={styles.prosodyComponentBar}>
              <View style={[styles.prosodyComponentFill, { width: `${(smoothnessPoints / 4) * 100}%`, backgroundColor: '#ED8936' }]} />
            </View>
          </View>

          {/* Grade Scale */}
          <View style={styles.prosodyGradeScale}>
            <Text style={styles.prosodyGradeScaleTitle}>Grade Scale:</Text>
            <View style={styles.prosodyGradeRow}>
              <Text style={[styles.prosodyGradeBadge, { backgroundColor: '#48BB78' }]}>3.8-4.0</Text>
              <Text style={styles.prosodyGradeText}>Excellent</Text>
            </View>
            <View style={styles.prosodyGradeRow}>
              <Text style={[styles.prosodyGradeBadge, { backgroundColor: '#4299E1' }]}>3.0-3.7</Text>
              <Text style={styles.prosodyGradeText}>Proficient</Text>
            </View>
            <View style={styles.prosodyGradeRow}>
              <Text style={[styles.prosodyGradeBadge, { backgroundColor: '#ED8936' }]}>2.0-2.9</Text>
              <Text style={styles.prosodyGradeText}>Developing</Text>
            </View>
            <View style={styles.prosodyGradeRow}>
              <Text style={[styles.prosodyGradeBadge, { backgroundColor: '#E53E3E' }]}>Below 2.0</Text>
              <Text style={styles.prosodyGradeText}>Needs Support</Text>
            </View>
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function WordPopup({ word, onClose, onPlayAudio, isPlaying }: {
  word: AlignedWord;
  onClose: () => void;
  onPlayAudio: () => void;
  isPlaying: boolean;
}) {
  const similarity = calculateWordSimilarity(word.expected, word.spoken);

  // Get color for similarity score
  const getSimilarityColor = (score: number) => {
    if (score >= 95) return '#48BB78'; // Green - excellent
    if (score >= 70) return '#ED8936'; // Orange - partial match
    if (score >= 40) return '#E53E3E'; // Red - poor match
    return '#718096'; // Gray - very low/no match
  };

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

        {/* Similarity Score */}
        <View style={styles.popupRow}>
          <Text style={styles.popupLabel}>Similarity:</Text>
          <View style={styles.similarityContainer}>
            <Text style={[styles.popupValue, { color: getSimilarityColor(similarity) }]}>
              {word.spoken ? `${similarity}%` : '—'}
            </Text>
            {word.spoken && (
              <View style={[styles.similarityBar, { backgroundColor: '#E2E8F0' }]}>
                <View
                  style={[
                    styles.similarityFill,
                    { width: `${similarity}%`, backgroundColor: getSimilarityColor(similarity) }
                  ]}
                />
              </View>
            )}
          </View>
        </View>

        {/* Show hesitation/timing info if available */}
        {word.hesitation && (
          <View style={styles.popupRow}>
            <Text style={styles.popupLabel}>Hesitation:</Text>
            <Text style={[styles.popupValue, { color: '#ED8936' }]}>
              {word.pauseDuration ? `${word.pauseDuration.toFixed(1)}s pause` : 'Yes'}
            </Text>
          </View>
        )}

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
  // Background generating banner
  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4299E1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  generatingBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  generatingBannerLink: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  sidebarTextReady: {
    color: '#48BB78',
    fontWeight: '500',
  },
  sidebarIconContainer: {
    position: 'relative',
  },
  readyBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#48BB78',
    alignItems: 'center',
    justifyContent: 'center',
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
  statBoxTouchable: {
    flex: 1,
  },
  statBoxInner: {
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
  // AI Summary styles
  aiSummaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiSummaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
    backgroundColor: '#EBF8FF',
  },
  aiSummaryButtonText: {
    flex: 1,
  },
  aiSummaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C5282',
    marginBottom: 4,
  },
  aiSummarySubtitle: {
    fontSize: 14,
    color: '#4A5568',
  },
  aiSummaryPlaying: {
    padding: 16,
    backgroundColor: '#F0FFF4',
    minHeight: 120,
  },
  aiSummaryPlayingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiSummaryPlayingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSummaryPlayingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#276749',
  },
  aiSummaryStopButton: {
    backgroundColor: '#FC8181',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  aiSummaryStopText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  aiSummaryText: {
    fontSize: 16,
    color: '#2D3748',
    lineHeight: 26,
  },
  aiSummaryFinished: {
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  aiSummaryPlayAgain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  aiSummaryPlayAgainText: {
    fontSize: 14,
    color: '#4299E1',
    fontWeight: '500',
  },
  aiSummaryTextScroll: {
    maxHeight: 150,
  },
  // Legacy summary styles (kept for compatibility)
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
  fluencyRow: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  fluencyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fluencyIndicators: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'flex-start',
    gap: 24,
  },
  fluencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fluencyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
  },
  fluencyLabel: {
    fontSize: 14,
    color: '#718096',
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
  wordWithHesitation: {
    backgroundColor: '#DDD6FE', // Light purple background (matching video)
  },
  wordWithPulseBorder: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 4,
  },
  hesitationIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#7C3AED', // Purple (matching video)
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hesitationDot: {
    fontSize: 8,
    color: '#FFFFFF',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
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
  hesitationLegendColor: {
    backgroundColor: '#DDD6FE', // Light purple (matching video)
    alignItems: 'center',
    justifyContent: 'center',
  },
  hesitationLegendIcon: {
    fontSize: 8,
    color: '#7C3AED', // Purple (matching video)
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
  errorBreakdownHint: {
    fontSize: 12,
    color: '#A0AEC0',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  errorPatternItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    borderRadius: 6,
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
  // Unified summary card styles (simplified patterns tab)
  unifiedSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  severityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  severityHeaderText: {
    flex: 1,
  },
  severityLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  severitySubtext: {
    fontSize: 14,
    color: '#4A5568',
    marginTop: 4,
  },
  summaryContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  referralAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  referralAlertText: {
    fontSize: 14,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
  insightsSection: {
    gap: 6,
  },
  insightsSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  insightText: {
    fontSize: 14,
    color: '#4A5568',
    flex: 1,
    lineHeight: 20,
  },
  patternsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 12,
    marginTop: 8,
  },
  patternCountBadge: {
    backgroundColor: '#E53E3E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  patternCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailedPatternsSection: {
    gap: 12,
  },
  excellentReadingCard: {
    backgroundColor: '#FFFBEB',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  excellentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 12,
    textAlign: 'center',
  },
  excellentSubtext: {
    fontSize: 16,
    color: '#A16207',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
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
    zIndex: 1000,
    elevation: 1000,
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
  // Similarity styles
  similarityContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  similarityBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  similarityFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Video tab styles
  videoSubtext: {
    fontSize: 14,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  videoContainer: {
    flex: 1,
    gap: 24,
  },
  videoReadyBox: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#48BB78',
  },
  videoReadyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  videoReadySubtitle: {
    fontSize: 16,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#48BB78',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 24,
  },
  downloadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  videoInfo: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
  },
  videoInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 16,
  },
  videoFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  videoFeatureText: {
    fontSize: 15,
    color: '#4A5568',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E53E3E',
    marginTop: 16,
  },
  retryVideoButton: {
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  retryVideoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  videoPreviewBox: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  videoPreviewTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  videoPreviewSubtitle: {
    fontSize: 15,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 300,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4299E1',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 24,
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
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
  // Export tab styles
  exportSubtext: {
    fontSize: 14,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  exportContainer: {
    flex: 1,
    gap: 24,
  },
  exportReadyBox: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E53E3E',
  },
  exportReadyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  exportReadySubtitle: {
    fontSize: 16,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  exportDownloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E53E3E',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 24,
  },
  exportDownloadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exportInfo: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
  },
  exportInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 16,
  },
  exportFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  exportFeatureText: {
    fontSize: 15,
    color: '#4A5568',
  },
  retryExportButton: {
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  retryExportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exportPreviewBox: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  exportPreviewTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  exportPreviewSubtitle: {
    fontSize: 15,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 350,
  },
  exportGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E53E3E',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 24,
  },
  exportGenerateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageQualityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EDF2F7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  imageQualityText: {
    fontSize: 13,
    color: '#718096',
    flex: 1,
  },
  // First/Last word summary styles
  firstLastSummary: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  firstLastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  firstLastLabel: {
    fontSize: 14,
    color: '#718096',
  },
  firstLastWord: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  firstLastStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  firstLastStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  firstLastDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  // Image Tab styles
  imageTabContainer: {
    flex: 1,
    gap: 12,
  },
  imageStatsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 32,
  },
  imageFirstLastRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  imageFirstLastBox: {
    flex: 1,
    alignItems: 'center',
  },
  imageFirstLastLabel: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 4,
  },
  imageFirstLastWord: {
    fontSize: 20,
    fontWeight: '600',
    color: '#22C55E',
  },
  imageFirstLastDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  imageStatItem: {
    alignItems: 'center',
  },
  imageStatNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#22C55E',
  },
  imageStatLabel: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
  },
  imageStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  imageDisplayContainer: {
    width: '100%',
    backgroundColor: '#1A202C',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imageFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageDimensionWarning: {
    fontSize: 12,
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Legacy image styles (kept for potential future use)
  imageLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  imageFullResScrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  imageFullResContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlayContainer: {
    position: 'relative',
  },
  fullResImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 4 / 3, // Default aspect ratio, will be overridden by actual image
    minHeight: 500,
  },
  wordOverlayBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 3,
  },
  // Legacy styles (kept for compatibility)
  imageContainerWithOverlay: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  // Passage range indicators (legacy - no longer used)
  passageRangeContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#48BB78',
    marginBottom: 16,
  },
  passageRangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  passageRangeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  passageRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  passageRangeItem: {
    alignItems: 'center',
    gap: 6,
  },
  passageRangeLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '500',
  },
  passageRangeWord: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
  },
  passageRangeDivider: {
    paddingHorizontal: 8,
  },
  bracketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C6F6D5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  bracketSymbolSmall: {
    fontSize: 20,
    fontWeight: '700',
    color: '#48BB78',
  },
  // Bracket overlay styles - on image
  bracketOverlayTopLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(72, 187, 120, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    gap: 4,
  },
  bracketOverlayBottomRight: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(72, 187, 120, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    gap: 4,
  },
  bracketOverlayTop: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(72, 187, 120, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  bracketOverlayBottom: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(72, 187, 120, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  bracketSymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginHorizontal: 2,
  },
  bracketWordText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    paddingHorizontal: 4,
  },
  adjustedIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 137, 54, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  adjustedIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Range adjustment controls
  rangeAdjustContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 12,
  },
  rangeAdjustSection: {
    alignItems: 'center',
    gap: 8,
  },
  rangeAdjustLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#718096',
  },
  rangeAdjustControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeWordBadge: {
    backgroundColor: '#48BB78',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  rangeWordText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resetRangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
  },
  resetRangeText: {
    fontSize: 13,
    color: '#718096',
  },
  ocrPreview: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
  },
  ocrPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
    marginBottom: 12,
  },
  ocrHighlightedText: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ocrWord: {
    fontSize: 15,
    lineHeight: 24,
  },
  ocrWordCorrect: {
    color: '#2D3748',
  },
  ocrWordError: {
    color: '#E53E3E',
    fontWeight: '500',
  },
  ocrWordFirst: {
    backgroundColor: '#C6F6D5',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  ocrWordLast: {
    backgroundColor: '#C6F6D5',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  // Prosody display styles
  prosodyGradeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ED8936',
    marginTop: 2,
  },
  prosodyInfoIcon: {
    marginTop: 4,
  },
  // Prosody popup styles
  prosodyExplainText: {
    fontSize: 14,
    color: '#4A5568',
    lineHeight: 20,
    marginBottom: 16,
  },
  prosodyComponent: {
    backgroundColor: '#F7FAFC',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  prosodyComponentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  prosodyComponentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
  },
  prosodyComponentScore: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4299E1',
  },
  prosodyComponentDesc: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 8,
  },
  prosodyComponentBar: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  prosodyComponentFill: {
    height: '100%',
    borderRadius: 3,
  },
  prosodyGradeScale: {
    backgroundColor: '#EDF2F7',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  prosodyGradeScaleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  prosodyGradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  prosodyGradeBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    minWidth: 60,
    textAlign: 'center',
  },
  prosodyGradeText: {
    fontSize: 13,
    color: '#4A5568',
  },
});
