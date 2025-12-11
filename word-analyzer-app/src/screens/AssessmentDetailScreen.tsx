/**
 * Assessment Detail Screen
 * View details of a completed assessment from history
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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../hooks/useAuth';
import { DashboardAssessment as Assessment, AlignedWord } from '../types';
import { subscribeToAssessment } from '../services/assessmentService';

import type { RootStackParamList } from '../navigation/AppNavigator';

type AssessmentDetailScreenRouteProp = RouteProp<RootStackParamList, 'AssessmentDetail'>;

type Tab = 'summary' | 'video' | 'image' | 'patterns';

export default function AssessmentDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AssessmentDetailScreenRouteProp>();
  const { assessmentId } = route.params;
  const { teacher } = useAuth();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [selectedWord, setSelectedWord] = useState<AlignedWord | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (teacher?.uid && assessmentId) {
      unsubscribeRef.current = subscribeToAssessment(
        teacher.uid,
        assessmentId,
        (data) => {
          setAssessment(data);
          setIsLoading(false);
        }
      );
    }

    return () => {
      unsubscribeRef.current?.();
      soundRef.current?.unloadAsync();
    };
  }, [teacher?.uid, assessmentId]);

  const playWordAudio = async (word: AlignedWord) => {
    if (!assessment?.audioUrl || word.startTime === 0) return;

    try {
      setIsPlayingAudio(true);

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: assessment.audioUrl },
        { positionMillis: word.startTime * 1000 }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          if (status.positionMillis >= word.endTime * 1000 || status.didJustFinish) {
            sound.stopAsync();
            setIsPlayingAudio(false);
          }
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play audio:', err);
      setIsPlayingAudio(false);
    }
  };

  const getWordStyle = (status: AlignedWord['status']) => {
    switch (status) {
      case 'correct':
        return styles.wordCorrect;
      case 'misread':
        return styles.wordMisread;
      case 'substituted':
        return styles.wordSubstituted;
      case 'skipped':
        return styles.wordSkipped;
      default:
        return {};
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4299E1" />
          <Text style={styles.loadingText}>Loading assessment...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!assessment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#E53E3E" />
          <Text style={styles.errorTitle}>Assessment Not Found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>{assessment.studentName}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          {(['summary', 'video', 'image', 'patterns'] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.sidebarItem, activeTab === tab && styles.sidebarItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <MaterialIcons
                name={
                  tab === 'summary'
                    ? 'assessment'
                    : tab === 'video'
                    ? 'videocam'
                    : tab === 'image'
                    ? 'image'
                    : 'pattern'
                }
                size={24}
                color={activeTab === tab ? '#4299E1' : '#718096'}
              />
              <Text
                style={[styles.sidebarText, activeTab === tab && styles.sidebarTextActive]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Results Area */}
        <ScrollView style={styles.resultsArea}>
          {activeTab === 'summary' && (
            <SummaryTab
              assessment={assessment}
              selectedWord={selectedWord}
              onSelectWord={setSelectedWord}
              getWordStyle={getWordStyle}
            />
          )}
          {activeTab === 'video' && teacher && (
            <VideoTab
              assessment={assessment}
              teacherId={teacher.uid}
              assessmentId={assessmentId}
            />
          )}
          {activeTab === 'image' && <ImageTab assessment={assessment} />}
          {activeTab === 'patterns' && <PatternsTab assessment={assessment} />}
        </ScrollView>
      </View>

      {/* Word Popup */}
      {selectedWord && (
        <WordPopup
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onPlayAudio={() => playWordAudio(selectedWord)}
          isPlaying={isPlayingAudio}
        />
      )}
    </SafeAreaView>
  );
}

function SummaryTab({
  assessment,
  selectedWord,
  onSelectWord,
  getWordStyle,
}: {
  assessment: Assessment;
  selectedWord: AlignedWord | null;
  onSelectWord: (word: AlignedWord | null) => void;
  getWordStyle: (status: AlignedWord['status']) => object;
}) {
  const metrics = assessment.metrics;
  const words = assessment.words || [];

  return (
    <View style={styles.summaryContainer}>
      {/* Stats */}
      {metrics && (
        <View style={styles.statsRow}>
          <StatBox label="Accuracy" value={`${metrics.accuracy}%`} color="#48BB78" />
          <StatBox label="WPM" value={metrics.wordsPerMinute} color="#4299E1" />
          <StatBox label="Words" value={metrics.totalWords} color="#9F7AEA" />
          <StatBox label="Errors" value={metrics.errorCount} color="#E53E3E" />
        </View>
      )}

      {/* Summary */}
      {metrics && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>
            {assessment.studentName} read {metrics.totalWords} words at{' '}
            {metrics.wordsPerMinute} words per minute with {metrics.accuracy}% accuracy.
            {metrics.prosodyGrade && ` Prosody: ${metrics.prosodyGrade}`}
          </Text>
        </View>
      )}

      {/* Words */}
      <Text style={styles.sectionTitle}>Word Analysis</Text>
      <View style={styles.wordsContainer}>
        {words.map((word, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.word, getWordStyle(word.status)]}
            onPress={() => onSelectWord(word)}
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

function VideoTab({ assessment, teacherId, assessmentId }: {
  assessment: Assessment;
  teacherId: string;
  assessmentId: string;
}) {
  const [videoStatus, setVideoStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>(
    assessment.videoUrl ? 'ready' : 'idle'
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(assessment.videoUrl || null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateVideo = async () => {
    setVideoStatus('generating');
    setErrorMessage(null);

    try {
      const functions = getFunctions();
      const generateAssessmentVideo = httpsCallable(functions, 'generateAssessmentVideo');

      const result = await generateAssessmentVideo({ teacherId, assessmentId });
      const data = result.data as { videoUrl: string };

      setVideoUrl(data.videoUrl);
      setVideoStatus('ready');
    } catch (error: any) {
      console.error('Video generation failed:', error);
      setErrorMessage(error.message || 'Failed to generate video');
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
          <TouchableOpacity style={styles.downloadButton} onPress={downloadVideo}>
            <MaterialIcons name="download" size={24} color="#FFFFFF" />
            <Text style={styles.downloadButtonText}>Download Video</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (videoStatus === 'error') {
    return (
      <View style={styles.tabPlaceholder}>
        <MaterialIcons name="error-outline" size={64} color="#E53E3E" />
        <Text style={styles.errorText}>Video generation failed</Text>
        <Text style={styles.videoSubtext}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryVideoButton} onPress={generateVideo}>
          <Text style={styles.retryVideoButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.videoContainer}>
      <View style={styles.videoPreviewBox}>
        <MaterialIcons name="videocam" size={64} color="#4299E1" />
        <Text style={styles.videoPreviewTitle}>Generate Assessment Video</Text>
        <TouchableOpacity style={styles.generateButton} onPress={generateVideo}>
          <MaterialIcons name="movie-creation" size={24} color="#FFFFFF" />
          <Text style={styles.generateButtonText}>Generate Video</Text>
        </TouchableOpacity>
      </View>
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
          <Text style={styles.popupValue}>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
  },
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
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
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
  resultsArea: {
    flex: 1,
    padding: 24,
  },
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
});
