import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Student } from '../types';

/**
 * Get all students for a teacher
 */
export async function getStudents(teacherId: string): Promise<Student[]> {
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
}

/**
 * Add a new student
 */
export async function addStudent(
  teacherId: string,
  name: string,
  grade?: string
): Promise<Student> {
  const studentsRef = collection(db, 'teachers', teacherId, 'students');

  const docRef = await addDoc(studentsRef, {
    name,
    grade: grade || null,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    name,
    grade,
    createdAt: new Date(),
    teacherId,
  };
}

/**
 * Delete a student
 */
export async function deleteStudent(teacherId: string, studentId: string): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentId);
  await deleteDoc(studentRef);
}
