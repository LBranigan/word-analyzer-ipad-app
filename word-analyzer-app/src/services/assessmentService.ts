import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getStorage } from 'firebase/storage';
import { db } from '../config/firebase';
import { DashboardAssessment } from '../types';

const storage = getStorage();

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
  // Generate assessment ID
  const assessmentId = doc(collection(db, 'temp')).id;

  // Create assessment document with processing status
  const assessmentRef = doc(db, 'teachers', teacherId, 'assessments', assessmentId);
  await setDoc(assessmentRef, {
    studentId,
    studentName,
    status: 'processing',
    createdAt: serverTimestamp(),
  });

  onProgress?.('Uploading audio...', 0);

  // Upload audio file
  const audioResponse = await fetch(audioUri);
  const audioBlob = await audioResponse.blob();
  const audioRef = ref(storage, `uploads/${teacherId}/${assessmentId}/audio.webm`);
  await uploadBytes(audioRef, audioBlob);

  onProgress?.('Uploading image...', 50);

  // Upload image file
  const imageResponse = await fetch(imageUri);
  const imageBlob = await imageResponse.blob();
  const imageRef = ref(storage, `uploads/${teacherId}/${assessmentId}/image.jpg`);
  await uploadBytes(imageRef, imageBlob);

  onProgress?.('Processing...', 100);

  return assessmentId;
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
        videoUrl: data.videoUrl,
        audioDuration: data.audioDuration,
        ocrText: data.ocrText,
        transcript: data.transcript,
        metrics: data.metrics,
        words: data.words,
        errorPatterns: data.errorPatterns,
      });
    }
  });
}
