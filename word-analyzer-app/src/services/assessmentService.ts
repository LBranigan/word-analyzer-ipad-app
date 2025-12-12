import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getStorage } from 'firebase/storage';
import { db } from '../config/firebase';
import { DashboardAssessment } from '../types';

const storage = getStorage();

/**
 * Early upload result - contains IDs needed to complete the upload later
 */
export interface EarlyUploadResult {
  assessmentId: string;
  audioUploaded: boolean;
}

/**
 * Create a new assessment and upload files
 */
export async function createAssessment(
  teacherId: string,
  studentId: string,
  studentName: string,
  audioUri: string,
  imageUri: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<string> {
  console.log('createAssessment called with:', { teacherId, studentId, studentName, audioUri: audioUri?.slice(0, 50), imageUri: imageUri?.slice(0, 50) });

  // Generate assessment ID
  const assessmentId = doc(collection(db, 'temp')).id;
  console.log('Generated assessmentId:', assessmentId);

  try {
    // Create assessment document with uploading status (will be changed to 'processing' by cloud function)
    onProgress?.('Creating assessment...', 0);
    const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);
    await setDoc(assessmentRef, {
      studentId,
      studentName,
      status: 'uploading',
      createdAt: serverTimestamp(),
    });
    console.log('Assessment document created');

    onProgress?.('Uploading audio...', 20);

    // Upload audio file
    console.log('Fetching audio from:', audioUri?.slice(0, 100));
    const audioResponse = await fetch(audioUri);
    const audioBlob = await audioResponse.blob();
    console.log('Audio blob size:', audioBlob.size);

    const audioRef = ref(storage, `uploads/${teacherId}/${assessmentId}/audio.webm`);
    console.log('Uploading audio to:', `uploads/${teacherId}/${assessmentId}/audio.webm`);
    await uploadBytes(audioRef, audioBlob);
    console.log('Audio uploaded successfully');

    onProgress?.('Uploading image...', 60);

    // Upload image file - preserve original quality
    console.log('Fetching image from:', imageUri?.slice(0, 100));
    const imageResponse = await fetch(imageUri);
    const imageBlob = await imageResponse.blob();
    console.log('Image blob size:', imageBlob.size, 'type:', imageBlob.type);

    // Use PNG for better quality if source is PNG, otherwise use original format
    const imageExtension = imageBlob.type.includes('png') ? 'png' : 'jpg';
    const imageRef = ref(storage, `uploads/${teacherId}/${assessmentId}/image.${imageExtension}`);
    console.log('Uploading image to:', `uploads/${teacherId}/${assessmentId}/image.${imageExtension}`);

    // Upload with metadata to preserve quality
    await uploadBytes(imageRef, imageBlob, {
      contentType: imageBlob.type || 'image/jpeg',
      customMetadata: {
        originalSize: imageBlob.size.toString(),
      },
    });
    console.log('Image uploaded successfully with full quality');

    onProgress?.('Processing...', 100);

    return assessmentId;
  } catch (error) {
    console.error('createAssessment error:', error);
    throw error;
  }
}

/**
 * Subscribe to assessment status updates
 */
export function subscribeToAssessment(
  teacherId: string,
  assessmentId: string,
  onUpdate: (assessment: DashboardAssessment) => void
): Unsubscribe {
  const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);

  return onSnapshot(assessmentRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      onUpdate({
        id: snapshot.id,
        studentId: data.studentId,
        studentName: data.studentName,
        status: data.status,
        errorMessage: data.errorMessage,
        createdAt: data.createdAt?.toDate() || new Date(),
        processedAt: data.processedAt?.toDate(),
        audioUrl: data.audioUrl,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        pdfUrl: data.pdfUrl,
        audioDuration: data.audioDuration,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
        ocrText: data.ocrText,
        transcript: data.transcript,
        metrics: data.metrics,
        words: data.words,
        errorPatterns: data.errorPatterns,
        patternSummary: data.patternSummary,
        aiSummary: data.aiSummary,
      });
    }
  });
}

/**
 * Get all assessments for a teacher (paginated)
 */
export async function getAssessments(
  teacherId: string,
  maxResults: number = 50
): Promise<DashboardAssessment[]> {
  const assessmentsRef = collection(db, 'teachers', teacherId, 'assessments');
  const q = query(assessmentsRef, orderBy('createdAt', 'desc'), limit(maxResults));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      studentId: data.studentId,
      studentName: data.studentName,
      status: data.status,
      errorMessage: data.errorMessage,
      createdAt: data.createdAt?.toDate() || new Date(),
      processedAt: data.processedAt?.toDate(),
      audioUrl: data.audioUrl,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      pdfUrl: data.pdfUrl,
      audioDuration: data.audioDuration,
      imageWidth: data.imageWidth,
      imageHeight: data.imageHeight,
      ocrText: data.ocrText,
      transcript: data.transcript,
      metrics: data.metrics,
      words: data.words,
      errorPatterns: data.errorPatterns,
      patternSummary: data.patternSummary,
      aiSummary: data.aiSummary,
    };
  });
}

/**
 * Subscribe to all assessments for a teacher (real-time updates)
 */
export function subscribeToAssessments(
  teacherId: string,
  onUpdate: (assessments: DashboardAssessment[]) => void
): Unsubscribe {
  const assessmentsRef = collection(db, 'teachers', teacherId, 'assessments');
  const q = query(assessmentsRef, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(q, (snapshot) => {
    const assessments = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        studentId: data.studentId,
        studentName: data.studentName,
        status: data.status,
        errorMessage: data.errorMessage,
        createdAt: data.createdAt?.toDate() || new Date(),
        processedAt: data.processedAt?.toDate(),
        audioUrl: data.audioUrl,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        pdfUrl: data.pdfUrl,
        audioDuration: data.audioDuration,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
        ocrText: data.ocrText,
        transcript: data.transcript,
        metrics: data.metrics,
        words: data.words,
        errorPatterns: data.errorPatterns,
        patternSummary: data.patternSummary,
        aiSummary: data.aiSummary,
      };
    });
    onUpdate(assessments);
  });
}

/**
 * Delete an assessment
 */
export async function deleteAssessment(
  teacherId: string,
  assessmentId: string
): Promise<void> {
  const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);
  await deleteDoc(assessmentRef);
}

/**
 * Start early audio upload - uploads audio immediately after recording finishes
 * This allows transcription to start while the user is taking a picture
 * Returns the assessmentId for later use when uploading the image
 */
export async function startEarlyAudioUpload(
  teacherId: string,
  studentId: string,
  studentName: string,
  audioUri: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<EarlyUploadResult> {
  console.log('startEarlyAudioUpload called with:', { teacherId, studentId, studentName, audioUri: audioUri?.slice(0, 50) });

  // Generate assessment ID
  const assessmentId = doc(collection(db, 'temp')).id;
  console.log('Generated assessmentId for early upload:', assessmentId);

  try {
    onProgress?.('Preparing upload...', 0);

    // Create assessment document with 'pending_image' status
    // Cloud function won't process until both files are present
    const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);
    await setDoc(assessmentRef, {
      studentId,
      studentName,
      status: 'uploading',  // Cloud function checks for this status
      audioUploadedEarly: true,  // Flag to indicate early upload was used
      createdAt: serverTimestamp(),
    });
    console.log('Assessment document created for early upload');

    onProgress?.('Uploading audio...', 20);

    // Upload audio file
    console.log('Fetching audio from:', audioUri?.slice(0, 100));
    const audioResponse = await fetch(audioUri);
    const audioBlob = await audioResponse.blob();
    console.log('Audio blob size:', audioBlob.size);

    const audioRef = ref(storage, `uploads/${teacherId}/${assessmentId}/audio.webm`);
    console.log('Uploading audio to:', `uploads/${teacherId}/${assessmentId}/audio.webm`);
    await uploadBytes(audioRef, audioBlob);
    console.log('Early audio upload complete');

    onProgress?.('Audio uploaded, waiting for image...', 100);

    return {
      assessmentId,
      audioUploaded: true,
    };
  } catch (error) {
    console.error('startEarlyAudioUpload error:', error);
    throw error;
  }
}

/**
 * Complete assessment with image - used after early audio upload
 * Uploads the image which triggers cloud function processing
 */
export async function completeAssessmentWithImage(
  teacherId: string,
  assessmentId: string,
  imageUri: string,
  onProgress?: (stage: string, progress: number) => void
): Promise<string> {
  console.log('completeAssessmentWithImage called with:', { teacherId, assessmentId, imageUri: imageUri?.slice(0, 50) });

  try {
    onProgress?.('Uploading image...', 50);

    // Upload image file - preserve original quality
    console.log('Fetching image from:', imageUri?.slice(0, 100));
    const imageResponse = await fetch(imageUri);
    const imageBlob = await imageResponse.blob();
    console.log('Image blob size:', imageBlob.size, 'type:', imageBlob.type);

    // Use PNG for better quality if source is PNG, otherwise use original format
    const imageExtension = imageBlob.type.includes('png') ? 'png' : 'jpg';
    const imageRef = ref(storage, `uploads/${teacherId}/${assessmentId}/image.${imageExtension}`);
    console.log('Uploading image to:', `uploads/${teacherId}/${assessmentId}/image.${imageExtension}`);

    // Upload with metadata to preserve quality
    await uploadBytes(imageRef, imageBlob, {
      contentType: imageBlob.type || 'image/jpeg',
      customMetadata: {
        originalSize: imageBlob.size.toString(),
      },
    });
    console.log('Image uploaded with full quality - cloud function will now process');

    onProgress?.('Processing...', 100);

    return assessmentId;
  } catch (error) {
    console.error('completeAssessmentWithImage error:', error);
    throw error;
  }
}
