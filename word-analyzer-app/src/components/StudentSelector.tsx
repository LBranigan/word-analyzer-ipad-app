import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Student } from '../types';
import { getStudents, addStudent } from '../services/studentService';

interface Props {
  teacherId: string;
  selectedStudent: Student | null;
  onSelectStudent: (student: Student) => void;
}

export default function StudentSelector({ teacherId, selectedStudent, onSelectStudent }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [teacherId]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await getStudents(teacherId);
      setStudents(data);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;

    setAdding(true);
    try {
      const student = await addStudent(teacherId, newStudentName.trim(), newStudentGrade.trim());
      setStudents(prev => [...prev, student].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStudentName('');
      setNewStudentGrade('');
      setAddModalOpen(false);
      onSelectStudent(student);
    } catch (error) {
      console.error('Failed to add student:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleSelectStudent = (student: Student) => {
    onSelectStudent(student);
    setDropdownOpen(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#4299E1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select Student</Text>

      <TouchableOpacity
        style={styles.selector}
        onPress={() => setDropdownOpen(true)}
      >
        <Text style={selectedStudent ? styles.selectedText : styles.placeholderText}>
          {selectedStudent ? selectedStudent.name : 'Choose student...'}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={24} color="#718096" />
      </TouchableOpacity>

      {/* Dropdown Modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={styles.dropdownContainer}>
            <FlatList
              data={students}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    selectedStudent?.id === item.id && styles.dropdownItemSelected,
                  ]}
                  onPress={() => handleSelectStudent(item)}
                >
                  <Text style={styles.dropdownItemText}>{item.name}</Text>
                  {item.grade && (
                    <Text style={styles.dropdownItemGrade}>Grade {item.grade}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No students yet</Text>
              }
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    setDropdownOpen(false);
                    setAddModalOpen(true);
                  }}
                >
                  <MaterialIcons name="add" size={20} color="#4299E1" />
                  <Text style={styles.addButtonText}>Add New Student</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Student Modal */}
      <Modal
        visible={addModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <Text style={styles.addModalTitle}>Add New Student</Text>

            <Text style={styles.inputLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={newStudentName}
              onChangeText={setNewStudentName}
              placeholder="Enter student name"
              autoFocus
            />

            <Text style={styles.inputLabel}>Grade (optional)</Text>
            <TextInput
              style={styles.input}
              value={newStudentGrade}
              onChangeText={setNewStudentGrade}
              placeholder="e.g., 3"
              keyboardType="number-pad"
            />

            <View style={styles.addModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setAddModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !newStudentName.trim() && styles.buttonDisabled]}
                onPress={handleAddStudent}
                disabled={!newStudentName.trim() || adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Add Student</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 250,
  },
  placeholderText: {
    fontSize: 16,
    color: '#A0AEC0',
  },
  selectedText: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 300,
    maxHeight: 400,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dropdownItemSelected: {
    backgroundColor: '#EBF8FF',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#2D3748',
  },
  dropdownItemGrade: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  emptyText: {
    padding: 16,
    textAlign: 'center',
    color: '#718096',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#4299E1',
    fontWeight: '500',
  },
  addModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: 320,
  },
  addModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A5568',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  addModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#718096',
  },
  confirmButton: {
    backgroundColor: '#4299E1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
