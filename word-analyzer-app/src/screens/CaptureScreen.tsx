/**
 * Capture Screen
 * Takes a photo of the reading passage using iPad camera
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

type RootStackParamList = {
  Home: undefined;
  Recording: { duration: number };
  Capture: undefined;
  Results: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Capture'>;

export default function CaptureScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      // Use maximum quality (1.0) for best OCR results
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        skipProcessing: true, // Skip post-processing for raw quality
      });

      if (photo) {
        setCapturedImage(photo.uri);
      }
    } catch (err) {
      console.error('Failed to take picture:', err);
      alert('Failed to capture image. Please try again.');
    }
  };

  const handlePickImage = async () => {
    try {
      // Use maximum quality (1.0) for best OCR results
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1.0,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Failed to pick image:', err);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const handleUsePhoto = () => {
    // TODO: Save image URI to assessment context/state
    console.log('Using photo:', capturedImage);
    navigation.goBack();
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  // Permission not determined yet
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <MaterialIcons name="camera-alt" size={80} color="#718096" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to capture images of reading passages.
          </Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
            <Text style={styles.grantButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage}>
            <MaterialIcons name="photo-library" size={24} color="#4299E1" />
            <Text style={styles.uploadButtonText}>Upload from Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Image captured - show preview
  if (capturedImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
        </View>

        <View style={styles.previewControls}>
          <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
            <MaterialIcons name="refresh" size={24} color="#FFFFFF" />
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.usePhotoButton} onPress={handleUsePhoto}>
            <MaterialIcons name="check" size={24} color="#FFFFFF" />
            <Text style={styles.usePhotoButtonText}>Use Photo</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Camera view
  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Guide overlay */}
        <View style={styles.overlay}>
          <Text style={styles.guideText}>
            Position the reading passage within the frame
          </Text>
          <View style={styles.frameGuide} />
        </View>
      </CameraView>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage}>
          <MaterialIcons name="photo-library" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButtonCamera} onPress={handleCancel}>
          <MaterialIcons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  guideText: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  frameGuide: {
    width: '85%',
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#000000',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  uploadButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonCamera: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F7FAFC',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 20,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  grantButton: {
    backgroundColor: '#38A169',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 16,
  },
  grantButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#4299E1',
    marginLeft: 8,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 16,
    color: '#A0AEC0',
  },
  // Preview screen
  previewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    backgroundColor: '#000000',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A5568',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retakeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  usePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38A169',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  usePhotoButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
});
