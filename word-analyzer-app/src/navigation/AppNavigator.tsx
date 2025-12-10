/**
 * App Navigation
 * Handles routing between screens based on auth state
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import {
  LoginScreen,
  HomeScreen,
  AnalysisScreen,
} from '../screens';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Analysis: {
    nameAudioUri: string | null;
    readingAudioUri: string | null;
    imageUri: string | null;
    studentId: string;
    studentName: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Analysis" component={AnalysisScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
