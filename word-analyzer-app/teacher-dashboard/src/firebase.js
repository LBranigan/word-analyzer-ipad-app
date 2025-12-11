import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCH3USHSUtgYl1JSPl_hG_nVXq2y9NU-ww",
  authDomain: "word-analyzer-ipad-app.firebaseapp.com",
  projectId: "word-analyzer-ipad-app",
  storageBucket: "word-analyzer-ipad-app.firebasestorage.app",
  messagingSenderId: "406918627968",
  appId: "1:406918627968:web:dashboard"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword };
