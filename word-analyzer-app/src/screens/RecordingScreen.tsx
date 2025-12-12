/**
 * Recording Screen
 * Two-phase recording:
 * 1. Name capture (4 seconds) - Voice prompt "Please state your name" + beep
 * 2. Reading recording (30/60 seconds) - Beep then record
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { RecordingDuration } from '../types';

type RootStackParamList = {
  Home: undefined;
  Recording: { duration: RecordingDuration };
  Capture: undefined;
  Results: undefined;
};

type RecordingRouteProp = RouteProp<RootStackParamList, 'Recording'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Recording'>;

// Recording phases
type Phase =
  | 'initial'           // Just entered screen
  | 'voice_prompt'      // Playing "Please state your name"
  | 'name_beep'         // Beeping before name recording
  | 'name_recording'    // Recording name (4 seconds)
  | 'name_complete'     // Name recorded, waiting to start reading
  | 'reading_beep'      // Beeping before reading recording
  | 'reading_recording' // Recording reading (30/60 seconds)
  | 'complete';         // All done

const NAME_RECORDING_DURATION = 4; // seconds
const BEEP_DURATION = 2.5; // seconds

// Pre-recorded audio prompts
const AUDIO_STATE_YOUR_NAME = require('../assets/audio/state-your-name.mp3');
const AUDIO_BEGIN_READING = require('../assets/audio/begin-reading.mp3'); // Includes beep at end
const AUDIO_RECORDING_COMPLETE = require('../assets/audio/recording-complete.mp3');

export default function RecordingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RecordingRouteProp>();
  const { duration } = route.params;

  const [phase, setPhase] = useState<Phase>('initial');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [beepCountdown, setBeepCountdown] = useState(0);

  const [nameRecording, setNameRecording] = useState<Audio.Recording | null>(null);
  const [readingRecording, setReadingRecording] = useState<Audio.Recording | null>(null);
  const [nameAudioUri, setNameAudioUri] = useState<string | null>(null);
  const [readingAudioUri, setReadingAudioUri] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const promptSound = useRef<Audio.Sound | null>(null);

  // Start the flow when screen loads
  useEffect(() => {
    startFlow();
    return () => {
      cleanup();
    };
  }, []);

  // Pulse animation while recording
  useEffect(() => {
    if (phase === 'name_recording' || phase === 'reading_recording') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [phase]);

  const cleanup = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (promptSound.current) {
      try {
        await promptSound.current.stopAsync();
        await promptSound.current.unloadAsync();
      } catch (e) {
        // Ignore errors during cleanup
      }
      promptSound.current = null;
    }
  };

  const startFlow = async () => {
    // Request permissions first
    const permission = await Audio.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      alert('Microphone permission is required to record audio.');
      navigation.goBack();
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // Start with voice prompt
    setPhase('voice_prompt');
    speakPrompt();
  };

  // Helper to play a single sound and wait for it to finish
  const playSoundAsync = async (audioSource: any): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      let sound: Audio.Sound | null = null;
      let hasResolved = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = async () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (sound) {
          try {
            await sound.unloadAsync();
          } catch (e) {
            // Ignore cleanup errors
          }
          sound = null;
        }
      };

      const finish = async () => {
        if (hasResolved) return;
        hasResolved = true;
        await cleanup();
        resolve();
      };

      // Timeout fallback - if sound doesn't finish in 10 seconds, continue anyway
      timeoutId = setTimeout(() => {
        console.warn('playSoundAsync timeout - continuing anyway');
        finish();
      }, 10000);

      // Create and play the sound
      Audio.Sound.createAsync(audioSource, { shouldPlay: true, volume: 1.0 })
        .then(({ sound: createdSound, status }) => {
          sound = createdSound;

          if (!status.isLoaded) {
            console.error('Sound failed to load');
            finish();
            return;
          }

          // Check if already finished (very short sounds)
          if (status.isLoaded && status.didJustFinish) {
            console.log('Sound already finished on load');
            finish();
            return;
          }

          // Get duration for a more accurate timeout
          const duration = status.isLoaded && status.durationMillis
            ? status.durationMillis + 500
            : 10000;

          // Update timeout based on actual duration
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            console.warn(`playSoundAsync timeout after ${duration}ms - continuing`);
            finish();
          }, duration);

          // Set up status listener
          createdSound.setOnPlaybackStatusUpdate((playStatus: AVPlaybackStatus) => {
            if (playStatus.isLoaded && playStatus.didJustFinish) {
              console.log('Sound finished playing via status update');
              finish();
            }
            // Handle errors
            if (!playStatus.isLoaded && 'error' in playStatus) {
              console.error('Sound playback error:', playStatus.error);
              finish();
            }
          });
        })
        .catch((err) => {
          console.error('playSoundAsync createAsync error:', err);
          if (timeoutId) clearTimeout(timeoutId);
          hasResolved = true;
          reject(err);
        });
    });
  };

  // Play audio prompt then call onComplete
  const playAudioPrompt = async (audioSource: any, onComplete: () => void) => {
    try {
      if (promptSound.current) {
        await promptSound.current.unloadAsync();
        promptSound.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      await playSoundAsync(audioSource);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      onComplete();
    } catch (err) {
      console.error('Failed to play audio prompt:', err);
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch {}
      onComplete();
    }
  };

  const speakPrompt = () => {
    // Play "state your name" then start countdown and recording
    playAudioPrompt(AUDIO_STATE_YOUR_NAME, () => {
      startCountdownThenRecord('name');
    });
  };

  // Visual countdown before recording starts
  const startCountdownThenRecord = (type: 'name' | 'reading') => {
    const phase = type === 'name' ? 'name_beep' : 'reading_beep';
    setPhase(phase);
    setBeepCountdown(Math.ceil(BEEP_DURATION));

    let count = Math.ceil(BEEP_DURATION);
    const interval = setInterval(() => {
      count -= 1;
      setBeepCountdown(count);

      if (count <= 0) {
        clearInterval(interval);
        if (type === 'name') {
          startNameRecording();
        } else {
          startReadingRecording();
        }
      }
    }, 1000);
  };

  const startNameRecording = async () => {
    setPhase('name_recording');
    setElapsedTime(0);

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setNameRecording(recording);

      // Auto-stop after 4 seconds
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= NAME_RECORDING_DURATION - 1) {
            stopNameRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start name recording:', err);
      alert('Failed to start recording. Please try again.');
      navigation.goBack();
    }
  };

  const stopNameRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (nameRecording) {
      try {
        await nameRecording.stopAndUnloadAsync();
        const uri = nameRecording.getURI();
        setNameAudioUri(uri);
        console.log('Name recording saved to:', uri);
      } catch (err) {
        console.error('Failed to stop name recording:', err);
      }
    }

    setPhase('name_complete');
  };

  const handleStartReading = () => {
    // Play "Please begin reading" (includes beep in the audio file), then start recording
    setPhase('voice_prompt');
    playAudioPrompt(AUDIO_BEGIN_READING, () => {
      startCountdownThenRecord('reading');
    });
  };

  const startReadingRecording = async () => {
    setPhase('reading_recording');
    setElapsedTime(0);

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setReadingRecording(recording);

      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= duration - 1) {
            stopReadingRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start reading recording:', err);
      alert('Failed to start recording. Please try again.');
      navigation.goBack();
    }
  };

  const stopReadingRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (readingRecording) {
      try {
        await readingRecording.stopAndUnloadAsync();
        const uri = readingRecording.getURI();
        setReadingAudioUri(uri);
        console.log('Reading recording saved to:', uri);
      } catch (err) {
        console.error('Failed to stop reading recording:', err);
      }
    }

    setPhase('complete');

    // Play completion sound
    playAudioPrompt(AUDIO_RECORDING_COMPLETE, () => {
      // Navigate back after completion sound
      navigation.goBack();
    });
  };

  const handleCancel = async () => {
    await cleanup();
    if (nameRecording) {
      try { await nameRecording.stopAndUnloadAsync(); } catch {}
    }
    if (readingRecording) {
      try { await readingRecording.stopAndUnloadAsync(); } catch {}
    }
    navigation.goBack();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // RENDER: Voice prompt phase
  if (phase === 'initial' || phase === 'voice_prompt') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <MaterialIcons name="record-voice-over" size={80} color="#4299E1" />
          <Text style={styles.phaseTitle}>Get Ready</Text>
          <Text style={styles.phaseSubtitle}>
            {phase === 'voice_prompt' ? 'Listen to the prompt...' : 'Starting...'}
          </Text>
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // RENDER: Beep countdown phase
  if (phase === 'name_beep' || phase === 'reading_beep') {
    const isNamePhase = phase === 'name_beep';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.beepLabel}>
            {isNamePhase ? 'State your name in...' : 'Begin reading in...'}
          </Text>
          <Text style={styles.countdownNumber}>{beepCountdown}</Text>
          <View style={styles.beepIndicator}>
            <Text style={styles.beepText}>🔊 BEEP</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // RENDER: Name recording phase
  if (phase === 'name_recording') {
    const progress = elapsedTime / NAME_RECORDING_DURATION;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.recordingLabel}>Say your name now!</Text>

          <Animated.View
            style={[
              styles.recordingIndicator,
              styles.nameRecordingIndicator,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <MaterialIcons name="mic" size={60} color="#FFFFFF" />
          </Animated.View>

          <Text style={styles.timerText}>{elapsedTime + 1}s / {NAME_RECORDING_DURATION}s</Text>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, styles.nameProgressBar, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // RENDER: Name complete - ready for reading
  if (phase === 'name_complete') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <MaterialIcons name="check-circle" size={80} color="#48BB78" />
          <Text style={styles.phaseTitle}>Name Recorded!</Text>
          <Text style={styles.phaseSubtitle}>
            Now tap the button below to start{'\n'}your {duration}-second reading
          </Text>

          <TouchableOpacity style={styles.startReadingButton} onPress={handleStartReading}>
            <MaterialIcons name="play-arrow" size={32} color="#FFFFFF" />
            <Text style={styles.startReadingText}>Start Reading</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // RENDER: Reading recording phase
  if (phase === 'reading_recording') {
    const progress = elapsedTime / duration;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.recordingLabel}>Read aloud now!</Text>

          <Animated.View
            style={[
              styles.recordingIndicator,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <MaterialIcons name="mic" size={80} color="#FFFFFF" />
          </Animated.View>

          <View style={styles.timerContainer}>
            <Text style={styles.timerTextLarge}>{formatTime(elapsedTime + 1)}</Text>
            <Text style={styles.timerDuration}>/ {formatTime(duration)}</Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.stopButton} onPress={stopReadingRecording}>
            <MaterialIcons name="stop" size={32} color="#FFFFFF" />
            <Text style={styles.stopButtonText}>Stop Early</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // RENDER: Complete phase
  if (phase === 'complete') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <MaterialIcons name="check-circle" size={100} color="#48BB78" />
          <Text style={styles.phaseTitle}>Recording Complete!</Text>
          <Text style={styles.phaseSubtitle}>Saving your audio...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A202C',
    justifyContent: 'space-between',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  phaseTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 24,
    textAlign: 'center',
  },
  phaseSubtitle: {
    fontSize: 20,
    color: '#A0AEC0',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 28,
  },
  beepLabel: {
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  countdownNumber: {
    fontSize: 140,
    fontWeight: '700',
    color: '#F6E05E',
  },
  beepIndicator: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#F6E05E',
    borderRadius: 12,
  },
  beepText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A202C',
  },
  recordingLabel: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 40,
  },
  recordingIndicator: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: '#E53E3E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
  },
  nameRecordingIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4299E1',
    shadowColor: '#4299E1',
  },
  timerText: {
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  timerTextLarge: {
    fontSize: 64,
    fontWeight: '300',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  timerDuration: {
    fontSize: 24,
    color: '#718096',
    marginLeft: 8,
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#2D3748',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E53E3E',
    borderRadius: 4,
  },
  nameProgressBar: {
    backgroundColor: '#4299E1',
  },
  startReadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38A169',
    paddingVertical: 20,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginTop: 40,
  },
  startReadingText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  controls: {
    paddingHorizontal: 40,
    paddingBottom: 40,
    alignItems: 'center',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E53E3E',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    marginBottom: 16,
  },
  stopButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 18,
    color: '#A0AEC0',
  },
});
