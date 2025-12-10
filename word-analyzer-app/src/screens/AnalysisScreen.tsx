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

import type { RootStackParamList } from '../navigation/AppNavigator';

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
