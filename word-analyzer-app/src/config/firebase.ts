/**
 * Firebase Configuration
 * Project: word-analyzer-ipad-app
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCH3USHSUtgYl1JSPl_hG_nVXq2y9NU-ww",
  authDomain: "word-analyzer-ipad-app.firebaseapp.com",
  projectId: "word-analyzer-ipad-app",
  storageBucket: "word-analyzer-ipad-app.firebasestorage.app",
  messagingSenderId: "406918627968",
  appId: "1:406918627968:ios:cad8151c9bf895c1419c65",
};

// iOS Client ID for Google Sign-In
export const IOS_CLIENT_ID = "406918627968-oocj8tvc3qmmrhl0vch63d2c4baqs9cn.apps.googleusercontent.com";

// Web Client ID for Google Sign-In
export const WEB_CLIENT_ID = "406918627968-42f1t66c8h1oa2r4baps73dph4a4na5v.apps.googleusercontent.com";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
