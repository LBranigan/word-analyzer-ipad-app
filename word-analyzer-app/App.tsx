/**
 * Word Analyzer iPad App
 * Main entry point
 */

import React, { useEffect } from 'react';
// import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/hooks/useAuth';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  // Lock to landscape orientation for iPad
  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    }
    lockOrientation();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
{/* StatusBar removed for debugging */}
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
