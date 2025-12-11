/**
 * Authentication Hook & Context
 * Manages teacher Google OAuth login
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInAnonymously,
  User
} from 'firebase/auth';
import { auth, IOS_CLIENT_ID, WEB_CLIENT_ID } from '../config/firebase';
import { Teacher } from '../types';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  teacher: Teacher | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signInWithDifferentAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// DEV MODE: Set to true to bypass login for testing UI
const DEV_BYPASS_AUTH = true;

export function AuthProvider({ children }: AuthProviderProps) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Google OAuth client IDs - let the library handle the redirect URI
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    clientId: WEB_CLIENT_ID,
    extraParams: {
      prompt: 'select_account',
    },
  });

  console.log('=== REDIRECT URI ===', request?.redirectUri);

  // Listen for auth state changes
  useEffect(() => {
    // DEV MODE: Use anonymous Firebase auth for testing
    if (DEV_BYPASS_AUTH) {
      signInAnonymously(auth)
        .then((userCredential) => {
          console.log('Dev mode: Signed in anonymously', userCredential.user.uid);
          setTeacher({
            uid: userCredential.user.uid,
            email: 'dev-teacher@test.com',
            displayName: 'Test Teacher',
            photoURL: null,
          });
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Anonymous sign-in failed:', error);
          setError(error.message);
          setIsLoading(false);
        });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        setTeacher({
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName,
          photoURL: user.photoURL,
        });
      } else {
        setTeacher(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle Google sign-in response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token, access_token } = response.params;

      // Web flow may return access_token instead of id_token
      if (id_token) {
        const credential = GoogleAuthProvider.credential(id_token);
        signInWithCredential(auth, credential)
          .catch((err) => {
            console.error('Firebase sign-in error:', err);
            setError(err.message);
          });
      } else if (access_token) {
        // For web, we need to use the access token differently
        const credential = GoogleAuthProvider.credential(null, access_token);
        signInWithCredential(auth, credential)
          .catch((err) => {
            console.error('Firebase sign-in error with access_token:', err);
            setError(err.message);
          });
      }
    }
  }, [response]);

  const signIn = async () => {
    setError(null);
    try {
      await promptAsync();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const signInWithDifferentAccount = async () => {
    setError(null);
    try {
      // Clear the web browser session to force fresh login
      await WebBrowser.coolDownAsync();
      // Use showInRecents: false to avoid session caching
      await promptAsync({ showInRecents: false });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setTeacher(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        teacher,
        isLoading,
        isAuthenticated: !!teacher,
        signIn,
        signInWithDifferentAccount,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
