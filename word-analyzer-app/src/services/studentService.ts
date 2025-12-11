import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Student } from '../types';

/**
 * Ensure teacher document exists
 */
async function ensureTeacherExists(teacherId: string): Promise<void> {
  const teacherRef = doc(db, 'teachers', teacherId);
  const teacherDoc = await getDoc(teacherRef);

  if (!teacherDoc.exists()) {
    await setDoc(teacherRef, {
      createdAt: serverTimestamp(),
    });
  }
}

/**
 * Get all students for a teacher
 */
export async function getStudents(teacherId: string): Promise<Student[]> {
  try {
    await ensureTeacherExists(teacherId);

    const studentsRef = collection(db, 'teachers', teacherId, 'students');
    const q = query(studentsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      grade: doc.data().grade,
      createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
      teacherId,
    }));
  } catch (error) {
    console.error('getStudents error:', error);
    throw error;
  }
}

/**
 * Add a new student
 */
export async function addStudent(
  teacherId: string,
  name: string,
  grade?: string
): Promise<Student> {
  try {
    await ensureTeacherExists(teacherId);

    const studentsRef = collection(db, 'teachers', teacherId, 'students');

    const docRef = await addDoc(studentsRef, {
      name,
      grade: grade || null,
      createdAt: serverTimestamp(),
    });

    console.log('Student added with ID:', docRef.id);

    return {
      id: docRef.id,
      name,
      grade,
      createdAt: new Date(),
      teacherId,
    };
  } catch (error) {
    console.error('addStudent error:', error);
    throw error;
  }
}

/**
 * Delete a student
 */
export async function deleteStudent(teacherId: string, studentId: string): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentId);
  await deleteDoc(studentRef);
}
