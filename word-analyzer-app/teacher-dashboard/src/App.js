import React, { useState, useEffect } from 'react';
import { auth, db, signInAnonymously } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [students, setStudents] = useState([]);
  const [filterStudent, setFilterStudent] = useState('all');

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Auto sign-in anonymously (same as iPad app in dev mode)
  useEffect(() => {
    if (!loading && !user) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [loading, user]);

  // Load assessments
  useEffect(() => {
    if (!user) return;

    const assessmentsRef = collection(db, 'teachers', user.uid, 'assessments');
    const q = query(assessmentsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
      setAssessments(data);

      // Extract unique students
      const uniqueStudents = [...new Set(data.map(a => a.studentName))].filter(Boolean);
      setStudents(uniqueStudents);
    });

    return () => unsubscribe();
  }, [user]);

  // Filter assessments
  const filteredAssessments = filterStudent === 'all'
    ? assessments
    : assessments.filter(a => a.studentName === filterStudent);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="material-icons logo-icon">record_voice_over</span>
          <h1>Word Analyzer</h1>
          <span className="header-subtitle">Teacher Dashboard</span>
        </div>
        <div className="header-right">
          <span className="compliance-badge">FERPA & COPPA Compliant</span>
        </div>
      </header>

      <div className="main-container">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="filter-section">
            <h3>Filter by Student</h3>
            <select
              value={filterStudent}
              onChange={(e) => setFilterStudent(e.target.value)}
              className="student-filter"
            >
              <option value="all">All Students ({assessments.length})</option>
              {students.map(student => (
                <option key={student} value={student}>
                  {student} ({assessments.filter(a => a.studentName === student).length})
                </option>
              ))}
            </select>
          </div>

          <div className="stats-section">
            <h3>Quick Stats</h3>
            <div className="stat-item">
              <span className="stat-label">Total Assessments</span>
              <span className="stat-value">{assessments.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Students</span>
              <span className="stat-value">{students.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Avg Accuracy</span>
              <span className="stat-value">
                {assessments.length > 0
                  ? Math.round(assessments.reduce((sum, a) => sum + (a.metrics?.accuracy || 0), 0) / assessments.length)
                  : 0}%
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="content">
          {selectedAssessment ? (
            <AssessmentDetail
              assessment={selectedAssessment}
              onBack={() => setSelectedAssessment(null)}
            />
          ) : (
            <AssessmentList
              assessments={filteredAssessments}
              onSelect={setSelectedAssessment}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function AssessmentList({ assessments, onSelect }) {
  if (assessments.length === 0) {
    return (
      <div className="empty-state">
        <span className="material-icons empty-icon">assignment</span>
        <h2>No Assessments Yet</h2>
        <p>Assessments created on the iPad app will appear here.</p>
      </div>
    );
  }

  return (
    <div className="assessment-list">
      <h2>Recent Assessments</h2>
      <div className="assessment-grid">
        {assessments.map(assessment => (
          <AssessmentCard
            key={assessment.id}
            assessment={assessment}
            onClick={() => onSelect(assessment)}
          />
        ))}
      </div>
    </div>
  );
}

function AssessmentCard({ assessment, onClick }) {
  const metrics = assessment.metrics || {};
  const status = assessment.status;

  const getStatusColor = () => {
    if (status === 'error') return '#E53E3E';
    if (status === 'processing') return '#ED8936';
    if (status === 'complete') return '#48BB78';
    return '#A0AEC0';
  };

  const getAccuracyColor = (acc) => {
    if (acc >= 95) return '#48BB78';
    if (acc >= 85) return '#4299E1';
    if (acc >= 70) return '#ED8936';
    return '#E53E3E';
  };

  return (
    <div className="assessment-card" onClick={onClick}>
      <div className="card-header">
        <h3>{assessment.studentName || 'Unknown Student'}</h3>
        <span
          className="status-badge"
          style={{ backgroundColor: getStatusColor() }}
        >
          {status || 'unknown'}
        </span>
      </div>

      <div className="card-date">
        {assessment.createdAt.toLocaleDateString()} at {assessment.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
      </div>

      {status === 'complete' && metrics && (
        <div className="card-metrics">
          <div className="metric">
            <span className="metric-value" style={{ color: getAccuracyColor(metrics.accuracy) }}>
              {metrics.accuracy}%
            </span>
            <span className="metric-label">Accuracy</span>
          </div>
          <div className="metric">
            <span className="metric-value">{metrics.wordsPerMinute}</span>
            <span className="metric-label">WPM</span>
          </div>
          <div className="metric">
            <span className="metric-value">{metrics.totalWords}</span>
            <span className="metric-label">Words</span>
          </div>
          <div className="metric">
            <span className="metric-value">{metrics.errorCount}</span>
            <span className="metric-label">Errors</span>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <div className="card-processing">
          <div className="spinner small"></div>
          <span>Processing...</span>
        </div>
      )}

      {status === 'error' && (
        <div className="card-error">
          <span className="material-icons">error_outline</span>
          <span>{assessment.errorMessage || 'An error occurred'}</span>
        </div>
      )}
    </div>
  );
}

function AssessmentDetail({ assessment, onBack }) {
  const metrics = assessment.metrics || {};
  const words = assessment.words || [];

  const getWordClass = (status) => {
    switch (status) {
      case 'correct': return 'word-correct';
      case 'misread': return 'word-misread';
      case 'substituted': return 'word-substituted';
      case 'skipped': return 'word-skipped';
      default: return '';
    }
  };

  return (
    <div className="assessment-detail">
      <button className="back-button" onClick={onBack}>
        <span className="material-icons">arrow_back</span>
        Back to List
      </button>

      <div className="detail-header">
        <h2>{assessment.studentName}'s Assessment</h2>
        <span className="detail-date">
          {assessment.createdAt.toLocaleDateString()} at {assessment.createdAt.toLocaleTimeString()}
        </span>
      </div>

      {/* Metrics */}
      <div className="metrics-row">
        <div className="metric-box" style={{ borderTopColor: '#48BB78' }}>
          <span className="metric-box-value">{metrics.correctCount || 0}</span>
          <span className="metric-box-label">Correct</span>
        </div>
        <div className="metric-box" style={{ borderTopColor: '#E53E3E' }}>
          <span className="metric-box-value">{metrics.errorCount || 0}</span>
          <span className="metric-box-label">Errors</span>
        </div>
        <div className="metric-box" style={{ borderTopColor: '#4299E1' }}>
          <span className="metric-box-value">{metrics.accuracy || 0}%</span>
          <span className="metric-box-label">Accuracy</span>
        </div>
        <div className="metric-box" style={{ borderTopColor: '#9F7AEA' }}>
          <span className="metric-box-value">{metrics.wordsPerMinute || 0}</span>
          <span className="metric-box-label">WPM</span>
        </div>
        <div className="metric-box" style={{ borderTopColor: '#ED8936' }}>
          <span className="metric-box-value">{metrics.prosodyScore || 0}</span>
          <span className="metric-box-label">Prosody</span>
          <span className="prosody-grade">{metrics.prosodyGrade || 'N/A'}</span>
        </div>
      </div>

      {/* Word Highlighting */}
      <div className="words-section">
        <h3>Text with Error Highlighting</h3>
        <div className="words-container">
          {words.map((word, index) => (
            <span
              key={index}
              className={`word ${getWordClass(word.status)}`}
              title={`Expected: ${word.expected}\nSpoken: ${word.spoken || '—'}\nStatus: ${word.status}`}
            >
              {word.expected}
            </span>
          ))}
        </div>
        <div className="legend">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#C6F6D5' }}></span>
            <span>Correct</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#FEEBC8' }}></span>
            <span>Misread</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#FED7D7' }}></span>
            <span>Substituted</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#E2E8F0' }}></span>
            <span>Skipped</span>
          </div>
        </div>
      </div>

      {/* Error Patterns */}
      {assessment.errorPatterns && assessment.errorPatterns.length > 0 && (
        <div className="patterns-section">
          <h3>Error Patterns</h3>
          <div className="patterns-grid">
            {assessment.errorPatterns.map((pattern, index) => (
              <div key={index} className="pattern-card">
                <div className="pattern-header">
                  <span className="pattern-name">{pattern.pattern}</span>
                  <span className="pattern-count">{pattern.count} errors</span>
                </div>
                <div className="pattern-examples">
                  {pattern.examples.slice(0, 3).map((ex, i) => (
                    <div key={i} className="pattern-example">
                      "{ex.expected}" → "{ex.spoken}"
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Downloads */}
      <div className="downloads-section">
        <h3>Downloads</h3>
        <div className="download-buttons">
          {assessment.audioUrl && (
            <a href={assessment.audioUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
              <span className="material-icons">audiotrack</span>
              Audio Recording
            </a>
          )}
          {assessment.imageUrl && (
            <a href={assessment.imageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
              <span className="material-icons">image</span>
              Passage Image
            </a>
          )}
          {assessment.pdfUrl && (
            <a href={assessment.pdfUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
              <span className="material-icons">picture_as_pdf</span>
              PDF Report
            </a>
          )}
          {assessment.videoUrl && (
            <a href={assessment.videoUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
              <span className="material-icons">videocam</span>
              Video
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
