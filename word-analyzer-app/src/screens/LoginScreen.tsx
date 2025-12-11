/**
 * Login Screen
 * Teacher signs in with Google OAuth
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { signIn, signInWithDifferentAccount, isLoading, error } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="record-voice-over" size={80} color="#2C5282" />
        <Text style={styles.title}>Word Analyzer</Text>
        <Text style={styles.subtitle}>Reading Assessment Tool</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.instructions}>
          Teachers: Sign in with your Google account to get started.
        </Text>

        <TouchableOpacity style={styles.googleButton} onPress={signIn}>
          <MaterialIcons name="login" size={24} color="#4285F4" style={styles.googleIcon} />
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.differentAccountButton}
          onPress={signInWithDifferentAccount}
        >
          <MaterialIcons name="switch-account" size={20} color="#4285F4" />
          <Text style={styles.differentAccountText}>Use a different account</Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={20} color="#E53E3E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          FERPA & COPPA Compliant
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1A365D',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 20,
    color: '#4A5568',
    marginTop: 8,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  instructions: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
  },
  differentAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
  },
  differentAccountText: {
    fontSize: 14,
    color: '#4285F4',
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: '#FED7D7',
    borderRadius: 8,
  },
  errorText: {
    color: '#C53030',
    marginLeft: 8,
    fontSize: 14,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#A0AEC0',
  },
});
