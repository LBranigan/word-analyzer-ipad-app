/**
 * History Screen
 * Shows list of past assessments with quick stats
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { DashboardAssessment } from '../types';
import { subscribeToAssessments, deleteAssessment } from '../services/assessmentService';

import type { RootStackParamList } from '../navigation/AppNavigator';

export default function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { teacher } = useAuth();
  const [assessments, setAssessments] = useState<DashboardAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (teacher?.uid) {
      unsubscribeRef.current = subscribeToAssessments(
        teacher.uid,
        (newAssessments) => {
          setAssessments(newAssessments);
          setIsLoading(false);
        }
      );
    }

    return () => {
      unsubscribeRef.current?.();
    };
  }, [teacher?.uid]);

  const handleViewAssessment = (assessment: DashboardAssessment) => {
    if (assessment.status === 'complete') {
      navigation.navigate('AssessmentDetail', { assessmentId: assessment.id });
    }
  };

  const handleDeleteAssessment = (assessment: DashboardAssessment) => {
    Alert.alert(
      'Delete Assessment',
      `Are you sure you want to delete the assessment for ${assessment.studentName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (teacher?.uid) {
              await deleteAssessment(teacher.uid, assessment.id);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: DashboardAssessment['status']) => {
    switch (status) {
      case 'complete':
        return '#48BB78';
      case 'processing':
        return '#4299E1';
      case 'error':
        return '#E53E3E';
      default:
        return '#718096';
    }
  };

  const getStatusIcon = (status: DashboardAssessment['status']) => {
    switch (status) {
      case 'complete':
        return 'check-circle';
      case 'processing':
        return 'hourglass-empty';
      case 'error':
        return 'error';
      default:
        return 'help';
    }
  };

  const renderAssessmentItem = ({ item }: { item: DashboardAssessment }) => (
    <TouchableOpacity
      style={styles.assessmentCard}
      onPress={() => handleViewAssessment(item)}
      disabled={item.status !== 'complete'}
    >
      <View style={styles.cardHeader}>
        <View style={styles.studentInfo}>
          <MaterialIcons name="person" size={24} color="#4A5568" />
          <Text style={styles.studentName}>{item.studentName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <MaterialIcons
            name={getStatusIcon(item.status) as any}
            size={16}
            color="#FFFFFF"
          />
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>

        {item.status === 'complete' && item.metrics && (
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{item.metrics.accuracy}%</Text>
              <Text style={styles.metricLabel}>Accuracy</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{item.metrics.wordsPerMinute}</Text>
              <Text style={styles.metricLabel}>WPM</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{item.metrics.totalWords}</Text>
              <Text style={styles.metricLabel}>Words</Text>
            </View>
          </View>
        )}

        {item.status === 'error' && (
          <Text style={styles.errorText}>{item.errorMessage}</Text>
        )}

        {item.status === 'processing' && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#4299E1" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        {item.status === 'complete' && (
          <TouchableOpacity style={styles.viewButton}>
            <Text style={styles.viewButtonText}>View Details</Text>
            <MaterialIcons name="chevron-right" size={20} color="#4299E1" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteAssessment(item)}
        >
          <MaterialIcons name="delete-outline" size={20} color="#E53E3E" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="history" size={80} color="#CBD5E0" />
      <Text style={styles.emptyTitle}>No Assessments Yet</Text>
      <Text style={styles.emptySubtitle}>
        Complete your first assessment to see it here
      </Text>
      <TouchableOpacity
        style={styles.newAssessmentButton}
        onPress={() => navigation.navigate('Home')}
      >
        <MaterialIcons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.newAssessmentText}>New Assessment</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#4A5568" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assessment History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4299E1" />
          <Text style={styles.loadingText}>Loading assessments...</Text>
        </View>
      ) : (
        <FlatList
          data={assessments}
          renderItem={renderAssessmentItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4A5568',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
  },
  headerSpacer: {
    width: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
  },
  listContent: {
    padding: 24,
    gap: 16,
  },
  assessmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
  },
  dateText: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  metricLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  errorText: {
    fontSize: 14,
    color: '#E53E3E',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processingText: {
    fontSize: 14,
    color: '#4299E1',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4299E1',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },
  newAssessmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 24,
  },
  newAssessmentText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
