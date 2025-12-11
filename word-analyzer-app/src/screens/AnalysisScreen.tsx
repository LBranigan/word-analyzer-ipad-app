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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../hooks/useAuth';
import { DashboardAssessment as Assessment, AlignedWord, AssessmentMetrics } from '../types';
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
      // Add 200ms before and 300ms after for context
      const startMs = Math.max(0, (word.startTime * 1000) - 200);
      const endMs = (word.endTime * 1000) + 300;

      // Ensure minimum duration of 500ms for very short words
      const duration = Math.max(500, endMs - startMs);

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
          />
          <SidebarTab
            icon="picture-as-pdf"
            label="Export"
            active={activeTab === 'export'}
            onPress={() => setActiveTab('export')}
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

function SummaryTab({ assessment, onWordPress, getWordStyle, onShowProsody }: {
  assessment: Assessment;
  onWordPress: (word: AlignedWord) => void;
  getWordStyle: (status: string) => any;
  onShowProsody: () => void;
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
        <TouchableOpacity style={styles.statBoxTouchable} onPress={onShowProsody}>
          <View style={[styles.statBoxInner, { borderTopColor: '#ED8936' }]}>
            <Text style={styles.statValue}>{metrics?.prosodyScore || 0}</Text>
            <Text style={styles.statLabel}>Prosody</Text>
            <Text style={styles.prosodyGradeLabel}>{metrics?.prosodyGrade || 'N/A'}</Text>
            <MaterialIcons name="info-outline" size={16} color="#A0AEC0" style={styles.prosodyInfoIcon} />
          </View>
        </TouchableOpacity>
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
  const correctCount = words.filter(w => w.status === 'correct').length;
  const errorCount = words.filter(w => w.status !== 'correct').length;

  // Get first and last word that were actually read (have spoken values)
  const spokenWords = words.filter(w => w.spoken);
  const firstWord = spokenWords.length > 0 ? spokenWords[0] : null;
  const lastWord = spokenWords.length > 0 ? spokenWords[spokenWords.length - 1] : null;

  // Also get the expected first/last from the passage (OCR-detected range)
  const expectedFirst = words.length > 0 ? words[0] : null;
  const expectedLast = words.length > 0 ? words[words.length - 1] : null;

  return (
    <View style={styles.imageTabContainer}>
      {/* Stats Header - Simplified */}
      <View style={styles.imageStatsHeader}>
        <View style={styles.imageStatRow}>
          <Text style={styles.imageStatLabel}>Total Words:</Text>
          <Text style={styles.imageStatValue}>{words.length}</Text>
          <Text style={styles.imageStatDivider}>|</Text>
          <Text style={styles.imageStatLabel}>Correct:</Text>
          <Text style={[styles.imageStatValue, { color: '#48BB78' }]}>{correctCount}</Text>
          <Text style={styles.imageStatDivider}>/</Text>
          <Text style={styles.imageStatLabel}>Errors:</Text>
          <Text style={[styles.imageStatValue, { color: '#E53E3E' }]}>{errorCount}</Text>
        </View>
      </View>

      {/* Passage Range Indicators */}
      {(firstWord || lastWord) && (
        <View style={styles.passageRangeContainer}>
          <View style={styles.passageRangeHeader}>
            <MaterialIcons name="format-quote" size={20} color="#48BB78" />
            <Text style={styles.passageRangeTitle}>Reading Range Detected</Text>
          </View>
          <View style={styles.passageRangeRow}>
            <View style={styles.passageRangeItem}>
              <Text style={styles.passageRangeLabel}>Started at:</Text>
              <View style={styles.bracketBadge}>
                <Text style={styles.bracketSymbolSmall}>[</Text>
                <Text style={styles.passageRangeWord}>{expectedFirst?.expected || '—'}</Text>
              </View>
            </View>
            <View style={styles.passageRangeDivider}>
              <MaterialIcons name="arrow-forward" size={20} color="#A0AEC0" />
            </View>
            <View style={styles.passageRangeItem}>
              <Text style={styles.passageRangeLabel}>Ended at:</Text>
              <View style={styles.bracketBadge}>
                <Text style={styles.passageRangeWord}>{expectedLast?.expected || '—'}</Text>
                <Text style={styles.bracketSymbolSmall}>]</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Image Container - Full resolution display with bracket overlay */}
      {assessment.imageUrl ? (
        <View style={styles.imageContainerWithOverlay}>
          <ScrollView
            style={styles.imageScrollContainer}
            maximumZoomScale={3}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={true}
          >
            <Image
              source={{ uri: assessment.imageUrl }}
              style={styles.capturedImageFullRes}
              resizeMode="contain"
            />
          </ScrollView>

          {/* Green bracket overlays - positioned at corners */}
          {expectedFirst && (
            <View style={styles.bracketOverlayTopLeft}>
              <Text style={styles.bracketSymbol}>[</Text>
              <Text style={styles.bracketWordText}>{expectedFirst.expected}</Text>
              <MaterialIcons name="play-arrow" size={16} color="#FFFFFF" />
            </View>
          )}
          {expectedLast && (
            <View style={styles.bracketOverlayBottomRight}>
              <MaterialIcons name="stop" size={16} color="#FFFFFF" />
              <Text style={styles.bracketWordText}>{expectedLast.expected}</Text>
              <Text style={styles.bracketSymbol}>]</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.tabPlaceholder}>
          <MaterialIcons name="image" size={64} color="#CBD5E0" />
          <Text style={styles.placeholderText}>Image not available</Text>
        </View>
      )}

      {/* Image Quality Info */}
      <View style={styles.imageQualityInfo}>
        <MaterialIcons name="info-outline" size={16} color="#718096" />
        <Text style={styles.imageQualityText}>
          Pinch to zoom. Green brackets show detected reading range (first and last word).
        </Text>
      </View>
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
  // Image tab styles
  imageTabContainer: {
    flex: 1,
    gap: 16,
  },
  imageStatsHeader: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  imageStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  imageStatLabel: {
    fontSize: 16,
    color: '#718096',
  },
  imageStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  imageStatDivider: {
    fontSize: 16,
    color: '#CBD5E0',
    marginHorizontal: 8,
  },
  capturedImageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  capturedImage: {
    width: '100%',
    height: 400,
    backgroundColor: '#F7FAFC',
  },
  imageScrollContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minHeight: 500,
  },
  capturedImageFullRes: {
    width: '100%',
    height: 600,
    backgroundColor: '#F7FAFC',
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
  // Image container with overlay
  imageContainerWithOverlay: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  // Passage range indicators
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
