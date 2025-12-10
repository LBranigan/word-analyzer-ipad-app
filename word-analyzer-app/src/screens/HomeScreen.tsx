/**
 * Home Screen
 * Main two-button interface for student assessments
 * Recording and capture show minimalist inline UI (no popups/new screens)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Audio prompt files
const stateYourNameAudio = require('../assets/audio/state-your-name.mp3');
const beginReadingAudio = require('../assets/audio/begin-reading.mp3');
const recordingCompleteAudio = require('../assets/audio/recording-complete.mp3');
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { RecordingDuration, Student } from '../types';
import StudentSelector from '../components/StudentSelector';

type RootStackParamList = {
  Home: undefined;
  Analysis: {
    nameAudioUri: string | null;
    readingAudioUri: string | null;
    imageUri: string | null;
  };
};

// Recording phases
type RecordingPhase =
  | 'idle'
  | 'name_prompt'
  | 'name_beep'
  | 'name_recording'
  | 'reading_prompt'
  | 'reading_beep'
  | 'reading_recording'
  | 'complete';

// Camera phases
type CameraPhase =
  | 'idle'
  | 'warming_up'
  | 'focusing'
  | 'captured';

const NAME_RECORDING_DURATION = 4;
const BEEP_DURATION_MS = 800;
const CAMERA_FOCUS_MS = 2000; // Time to focus after camera is ready

export default function HomeScreen() {
  const { teacher, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedDuration, setSelectedDuration] = useState<RecordingDuration>(60);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Recording state
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [nameRecording, setNameRecording] = useState<Audio.Recording | null>(null);
  const [readingRecording, setReadingRecording] = useState<Audio.Recording | null>(null);
  const [nameAudioUri, setNameAudioUri] = useState<string | null>(null);
  const [readingAudioUri, setReadingAudioUri] = useState<string | null>(null);

  // Camera state
  const [cameraPhase, setCameraPhase] = useState<CameraPhase>('idle');
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showCameraCheckmark, setShowCameraCheckmark] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const cameraReadyRef = useRef(false);

  // Animation values for camera
  const cameraSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden below, 1 = visible above
  const cameraShrinkAnim = useRef(new Animated.Value(1)).current; // 1 = full size, 0 = shrunk
  const checkmarkScaleAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible

  // Animation values for recording
  const recordingShrinkAnim = useRef(new Animated.Value(1)).current; // 1 = full size, 0 = shrunk
  const recordingCheckmarkAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const [showRecordingCheckmark, setShowRecordingCheckmark] = useState(false);

  const [audioRecorded, setAudioRecorded] = useState(false);
  const [imageCaptured, setImageCaptured] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    if (promptSoundRef.current) {
      await promptSoundRef.current.unloadAsync();
      promptSoundRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Play audio prompt and call callback when done
  const playPromptAudio = async (type: 'name' | 'reading'): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        // Unload previous sound if exists
        if (promptSoundRef.current) {
          await promptSoundRef.current.unloadAsync();
        }

        const audioSource = type === 'name' ? stateYourNameAudio : beginReadingAudio;
        const { sound } = await Audio.Sound.createAsync(audioSource);
        promptSoundRef.current = sound;

        // Set up playback status listener to detect when audio finishes
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            resolve();
          }
        });

        await sound.playAsync();
      } catch (err) {
        console.error('Failed to play prompt audio:', err);
        resolve(); // Continue even if audio fails
      }
    });
  };

// Play the recording complete audio
  const playRecordingCompleteAudio = async (): Promise<void> => {
    try {
      // Unload previous sound if exists
      if (promptSoundRef.current) {
        await promptSoundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(recordingCompleteAudio);
      promptSoundRef.current = sound;
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play recording complete audio:', err);
    }
  };

  // Handle camera ready callback - this is critical for proper capture
  const handleCameraReady = () => {
    console.log('Camera hardware is ready!');
    cameraReadyRef.current = true;
    setIsCameraReady(true);
  };

  // Effect to handle camera phase transitions when camera becomes ready
  useEffect(() => {
    // When camera becomes ready during warming_up, transition to focusing
    if (isCameraReady && cameraPhase === 'warming_up') {
      console.log('Camera ready detected, starting focus phase...');
      setCameraPhase('focusing');

      // Give camera time to focus properly before capturing
      focusTimerRef.current = setTimeout(() => {
        console.log('Focus time complete, taking picture...');
        takePicture();
      }, CAMERA_FOCUS_MS);
    }
  }, [isCameraReady, cameraPhase]);

  // Reset camera ready state when camera phase goes idle
  useEffect(() => {
    if (cameraPhase === 'idle') {
      setIsCameraReady(false);
      cameraReadyRef.current = false;
    }
  }, [cameraPhase]);

  const playBeep = (): Promise<void> => {
    return new Promise((resolve) => {
      if (Platform.OS === 'web') {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;

          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.value = 0.5;

          oscillator.start();

          setTimeout(() => {
            oscillator.stop();
            audioCtx.close();
            resolve();
          }, BEEP_DURATION_MS);
        } catch (err) {
          console.error('Beep error:', err);
          setTimeout(resolve, BEEP_DURATION_MS);
        }
      } else {
        setTimeout(resolve, BEEP_DURATION_MS);
      }
    });
  };

  // ============ AUDIO RECORDING ============

  const handleRecordAudio = async () => {
    if (cameraPhase !== 'idle') return;

    const permission = await Audio.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      alert('Microphone permission is required to record audio.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    setRecordingPhase('name_prompt');

    // Play audio prompt file, then beep, then start recording
    await playPromptAudio('name');
    playBeepThenRecord('name');
  };

  const playBeepThenRecord = (type: 'name' | 'reading') => {
    const runAsync = async () => {
      setRecordingPhase(type === 'name' ? 'name_beep' : 'reading_beep');
      await playBeep();

      if (type === 'name') {
        startNameRecording();
      } else {
        startReadingRecording();
      }
    };
    runAsync();
  };

  const startNameRecording = async () => {
    setRecordingPhase('name_recording');
    setElapsedTime(0);

    // Web fallback - simulate recording with timer only
    if (Platform.OS === 'web') {
      console.log('Web fallback: simulating name recording');
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= NAME_RECORDING_DURATION - 1) {
            stopNameRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      return;
    }

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setNameRecording(recording);

      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= NAME_RECORDING_DURATION - 1) {
            stopNameRecording(recording);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start name recording:', err);
      // Fallback to timer-only mode
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= NAME_RECORDING_DURATION - 1) {
            stopNameRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const stopNameRecording = async (recording?: Audio.Recording) => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setNameAudioUri(uri);
        console.log('Name recording saved:', uri);
      } catch (err) {
        console.error('Failed to stop name recording:', err);
      }
    } else {
      console.log('Web fallback: name recording simulated');
    }

    setRecordingPhase('reading_prompt');

    // Small delay, then play audio prompt file, then beep, then start recording
    setTimeout(async () => {
      await playPromptAudio('reading');
      playBeepThenRecord('reading');
    }, 300);
  };

  const startReadingRecording = async () => {
    setRecordingPhase('reading_recording');
    setElapsedTime(0);

    // Web fallback - simulate recording with timer only
    if (Platform.OS === 'web') {
      console.log('Web fallback: simulating reading recording');
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= selectedDuration - 1) {
            stopReadingRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      return;
    }

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setReadingRecording(recording);

      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= selectedDuration - 1) {
            stopReadingRecording(recording);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start reading recording:', err);
      // Fallback to timer-only mode
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          if (prev >= selectedDuration - 1) {
            stopReadingRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const stopReadingRecording = async (recording?: Audio.Recording) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const rec = recording || readingRecording;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        setReadingAudioUri(uri);
        console.log('Reading recording saved:', uri);
      } catch (err) {
        console.error('Failed to stop reading recording:', err);
      }
    }

    setRecordingPhase('complete');
    setAudioRecorded(true);

    // Play the completion audio
    playRecordingCompleteAudio();

    // Animate the progress bar shrinking and checkmark appearing
    animateRecordingComplete();
  };

  // Animate recording complete - shrink progress bar and show checkmark
  const animateRecordingComplete = () => {
    setShowRecordingCheckmark(true);
    recordingShrinkAnim.setValue(1);
    recordingCheckmarkAnim.setValue(0);

    Animated.parallel([
      // Shrink the progress bar area
      Animated.timing(recordingShrinkAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      // Pop in the checkmark
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(recordingCheckmarkAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
      ]),
    ]).start(() => {
      // After animation, keep checkmark visible briefly then reset
      setTimeout(() => {
        Animated.timing(recordingCheckmarkAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setShowRecordingCheckmark(false);
          setRecordingPhase('idle');
          recordingShrinkAnim.setValue(1);
        });
      }, 1000);
    });
  };

  const handleStopEarly = () => {
    stopReadingRecording();
  };

  // ============ IMAGE CAPTURE ============

  // Animate camera sliding up
  const animateCameraIn = () => {
    cameraSlideAnim.setValue(0);
    cameraShrinkAnim.setValue(1);
    Animated.spring(cameraSlideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  };

  // Animate camera shrinking and checkmark appearing
  const animateCameraOut = () => {
    setShowCameraCheckmark(true);

    Animated.parallel([
      // Shrink the camera/image
      Animated.timing(cameraShrinkAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      // Pop in the checkmark
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(checkmarkScaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
      ]),
    ]).start(() => {
      // After animation completes, reset and go to idle
      setTimeout(() => {
        setCameraPhase('idle');
        cameraSlideAnim.setValue(0);
        cameraShrinkAnim.setValue(1);
        // Keep checkmark visible briefly then hide
        setTimeout(() => {
          Animated.timing(checkmarkScaleAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setShowCameraCheckmark(false);
          });
        }, 1000);
      }, 100);
    });
  };

  const handleCaptureImage = async () => {
    if (recordingPhase !== 'idle') return;

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        alert('Camera permission is required to capture images.');
        return;
      }
    }

    // Reset camera ready state before starting
    setIsCameraReady(false);
    cameraReadyRef.current = false;
    checkmarkScaleAnim.setValue(0);
    setShowCameraCheckmark(false);

    // Set to warming_up and animate camera in
    setCameraPhase('warming_up');
    animateCameraIn();
    console.log('Camera warming up, waiting for onCameraReady callback...');
  };

  const takePicture = async () => {
    // Verify camera is actually ready before attempting capture
    if (!cameraReadyRef.current) {
      console.warn('takePicture called but camera not ready, waiting...');
      // Retry after a short delay
      setTimeout(() => takePicture(), 500);
      return;
    }

    if (cameraRef.current) {
      try {
        console.log('Taking picture now...');
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });

        if (photo?.uri) {
          setCapturedImageUri(photo.uri);
          setImageCaptured(true);
          setCameraPhase('captured');
          console.log('Image captured successfully:', photo.uri);

          // Animate out after brief display
          setTimeout(() => {
            animateCameraOut();
          }, 500);
        } else {
          console.error('Photo captured but no URI returned');
          setCameraPhase('idle');
        }
      } catch (err) {
        console.error('Failed to take picture:', err);
        setCameraPhase('idle');
      }
    } else {
      // Web fallback - simulate capture
      console.log('Web fallback: simulating capture');
      setImageCaptured(true);
      setCameraPhase('captured');
      // Animate out after brief display
      setTimeout(() => {
        animateCameraOut();
      }, 500);
    }
  };

  const handleStartNew = () => {
    setAudioRecorded(false);
    setImageCaptured(false);
    setNameAudioUri(null);
    setReadingAudioUri(null);
    setCapturedImageUri(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isRecordingActive = recordingPhase !== 'idle';
  const isCameraActive = cameraPhase !== 'idle';
  const isAnyActive = isRecordingActive || isCameraActive;

  // Get status text for below the red button
  const getRecordingStatusText = () => {
    switch (recordingPhase) {
      case 'name_prompt':
      case 'name_beep':
      case 'name_recording':
        return 'Please state your name...';
      case 'reading_prompt':
      case 'reading_beep':
        return 'Begin reading passage...';
      case 'reading_recording':
        return 'Reading passage...';
      case 'complete':
        return 'Recording complete';
      default:
        return null;
    }
  };

  // Get status text for camera
  const getCameraStatusText = () => {
    switch (cameraPhase) {
      case 'warming_up':
        return 'Camera warming up...';
      case 'focusing':
        return 'Focusing...';
      case 'captured':
        return 'Image captured';
      default:
        return null;
    }
  };

  const getProgress = () => {
    if (recordingPhase === 'name_recording') {
      return (elapsedTime + 1) / NAME_RECORDING_DURATION;
    }
    if (recordingPhase === 'reading_recording') {
      return (elapsedTime + 1) / selectedDuration;
    }
    return 0;
  };

  const recordingStatusText = getRecordingStatusText();
  const cameraStatusText = getCameraStatusText();
  const progress = getProgress();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.teacherInfo}>
          <MaterialIcons name="person" size={20} color="#718096" />
          <Text style={styles.teacherEmail}>{teacher?.email}</Text>
        </View>
        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Student Selector */}
      <View style={styles.studentSelectorContainer}>
        <StudentSelector
          teacherId={teacher?.uid || ''}
          selectedStudent={selectedStudent}
          onSelectStudent={setSelectedStudent}
        />
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Record Audio Section */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.recordButton,
              isRecordingActive && styles.buttonActive,
            ]}
            onPress={handleRecordAudio}
            activeOpacity={0.8}
            disabled={isAnyActive || !selectedStudent}
          >
            <View style={styles.buttonIconContainer}>
              <MaterialIcons name="mic" size={80} color="#FFFFFF" />
              {audioRecorded && !isRecordingActive && (
                <View style={styles.checkBadge}>
                  <MaterialIcons name="check" size={24} color="#FFFFFF" />
                </View>
              )}
            </View>
            <Text style={styles.buttonTitle}>Record Audio</Text>

            {!isRecordingActive && !audioRecorded && (
              <View style={styles.durationSelector}>
                <TouchableOpacity
                  style={[
                    styles.durationOption,
                    selectedDuration === 30 && styles.durationOptionSelected,
                  ]}
                  onPress={() => setSelectedDuration(30)}
                >
                  <Text
                    style={[
                      styles.durationText,
                      selectedDuration === 30 && styles.durationTextSelected,
                    ]}
                  >
                    30s
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationOption,
                    selectedDuration === 60 && styles.durationOptionSelected,
                  ]}
                  onPress={() => setSelectedDuration(60)}
                >
                  <Text
                    style={[
                      styles.durationText,
                      selectedDuration === 60 && styles.durationTextSelected,
                    ]}
                  >
                    60s
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>

          {/* Inline Recording Status */}
          <View style={styles.inlineStatus}>
            {/* Recording progress - animates when complete */}
            {recordingStatusText && recordingPhase !== 'complete' && (
              <>
                <Text style={styles.statusLabel}>{recordingStatusText}</Text>
                {(recordingPhase === 'name_recording' || recordingPhase === 'reading_recording') && (
                  <>
                    <View style={styles.progressBarInline}>
                      <View style={[styles.progressFillInline, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={styles.timerText}>{formatTime(elapsedTime + 1)}</Text>
                    {recordingPhase === 'reading_recording' && (
                      <TouchableOpacity style={styles.stopButton} onPress={handleStopEarly}>
                        <Text style={styles.stopButtonText}>Stop</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}

            {/* Animated completion - shrinking text and checkmark */}
            {recordingPhase === 'complete' && (
              <Animated.View
                style={[
                  styles.recordingCompleteContainer,
                  {
                    transform: [{ scale: recordingShrinkAnim }],
                    opacity: recordingShrinkAnim,
                  },
                ]}
              >
                <Text style={styles.statusLabel}>Recording complete</Text>
              </Animated.View>
            )}

            {/* Animated checkmark */}
            {showRecordingCheckmark && (
              <Animated.View
                style={[
                  styles.recordingCheckmarkContainer,
                  {
                    transform: [{ scale: recordingCheckmarkAnim }],
                    opacity: recordingCheckmarkAnim,
                  },
                ]}
              >
                <View style={styles.recordingCheckmarkCircle}>
                  <MaterialIcons name="check" size={30} color="#FFFFFF" />
                </View>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Capture Image Section */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.captureButton,
              isCameraActive && styles.buttonActive,
            ]}
            onPress={handleCaptureImage}
            activeOpacity={0.8}
            disabled={isAnyActive || !selectedStudent}
          >
            <View style={styles.buttonIconContainer}>
              <MaterialIcons name="photo-camera" size={80} color="#FFFFFF" />
              {imageCaptured && !isCameraActive && !showCameraCheckmark && (
                <View style={styles.checkBadge}>
                  <MaterialIcons name="check" size={24} color="#FFFFFF" />
                </View>
              )}
            </View>
            <Text style={styles.buttonTitle}>Capture Image</Text>
          </TouchableOpacity>

          {/* Camera preview and checkmark - positioned BELOW button */}
          <View style={styles.inlineStatus}>
            {/* Animated camera/image that slides down from above */}
            {isCameraActive && (
              <Animated.View
                style={[
                  styles.cameraPreviewContainer,
                  {
                    transform: [
                      {
                        translateY: cameraSlideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-200, 0], // Slides down from above
                        }),
                      },
                      { scale: cameraShrinkAnim },
                    ],
                    opacity: cameraShrinkAnim,
                  },
                ]}
              >
                {cameraPhase !== 'captured' ? (
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraPreview}
                    facing="back"
                    onCameraReady={handleCameraReady}
                  />
                ) : capturedImageUri ? (
                  <Image source={{ uri: capturedImageUri }} style={styles.cameraPreview} />
                ) : null}
                <Text style={styles.cameraStatusText}>{cameraStatusText}</Text>
              </Animated.View>
            )}

            {/* Animated checkmark that appears after capture */}
            {showCameraCheckmark && (
              <Animated.View
                style={[
                  styles.cameraCheckmarkContainer,
                  {
                    transform: [{ scale: checkmarkScaleAnim }],
                    opacity: checkmarkScaleAnim,
                  },
                ]}
              >
                <View style={styles.cameraCheckmarkCircle}>
                  <MaterialIcons name="check" size={30} color="#FFFFFF" />
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      </View>

      {/* View Analysis button - appears ABOVE footer when both are complete */}
      {audioRecorded && imageCaptured && (
        <View style={styles.viewAnalysisContainer}>
          <TouchableOpacity
            style={styles.viewAnalysisButton}
            onPress={() => navigation.navigate('Analysis', {
              nameAudioUri,
              readingAudioUri,
              imageUri: capturedImageUri,
              studentId: selectedStudent?.id || '',
              studentName: selectedStudent?.name || '',
            })}
          >
            <MaterialIcons name="analytics" size={36} color="#FFFFFF" />
            <Text style={styles.viewAnalysisText}>View Analysis</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        {(audioRecorded || imageCaptured) && (
          <View style={styles.footerStatusContainer}>
            <View style={styles.footerStatusItem}>
              <MaterialIcons
                name={audioRecorded ? 'check-circle' : 'radio-button-unchecked'}
                size={24}
                color={audioRecorded ? '#48BB78' : '#A0AEC0'}
              />
              <Text style={styles.footerStatusText}>Audio</Text>
            </View>
            <View style={styles.footerStatusItem}>
              <MaterialIcons
                name={imageCaptured ? 'check-circle' : 'radio-button-unchecked'}
                size={24}
                color={imageCaptured ? '#48BB78' : '#A0AEC0'}
              />
              <Text style={styles.footerStatusText}>Image</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.startNewButton} onPress={handleStartNew}>
          <MaterialIcons name="refresh" size={20} color="#4A5568" />
          <Text style={styles.startNewText}>Start New Assessment</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
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
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherEmail: {
    marginLeft: 8,
    fontSize: 14,
    color: '#718096',
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  signOutText: {
    fontSize: 14,
    color: '#4299E1',
    fontWeight: '500',
  },
  studentSelectorContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    gap: 60,
  },
  buttonSection: {
    flex: 1,
    maxWidth: 350,
    alignItems: 'center',
  },
  actionButton: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  recordButton: {
    backgroundColor: '#E53E3E',
  },
  captureButton: {
    backgroundColor: '#38A169',
  },
  buttonActive: {
    opacity: 0.7,
  },
  buttonIconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  checkBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#48BB78',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  buttonTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  durationSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 4,
  },
  durationOption: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  durationOptionSelected: {
    backgroundColor: '#FFFFFF',
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  durationTextSelected: {
    color: '#E53E3E',
  },
  // Inline status below button
  inlineStatus: {
    height: 80,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
  },
  statusLabel: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '500',
    marginBottom: 10,
  },
  progressBarInline: {
    width: '80%',
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFillInline: {
    height: '100%',
    backgroundColor: '#E53E3E',
    borderRadius: 2,
  },
  timerText: {
    fontSize: 14,
    color: '#718096',
    marginTop: 6,
  },
  stopButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: '#E53E3E',
    borderRadius: 6,
  },
  stopButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Recording completion animation
  recordingCompleteContainer: {
    alignItems: 'center',
  },
  recordingCheckmarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCheckmarkCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#48BB78',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Camera preview
  cameraPreviewContainer: {
    width: 280,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A202C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPreview: {
    width: '100%',
    height: 150,
  },
  cameraStatusText: {
    fontSize: 14,
    color: '#A0AEC0',
    marginTop: 8,
  },
  cameraCheckmarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCheckmarkCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#48BB78',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  footerStatusContainer: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 12,
  },
  footerStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerStatusText: {
    fontSize: 16,
    color: '#4A5568',
  },
  viewAnalysisContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  viewAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 48,
    backgroundColor: '#4299E1',
    borderRadius: 14,
    shadowColor: '#4299E1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  viewAnalysisText: {
    fontSize: 26,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  startNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#EDF2F7',
    borderRadius: 10,
  },
  startNewText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#4A5568',
  },
});
