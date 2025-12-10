/**
 * Standard Celeration Chart Dashboard
 * A digital implementation of Ogden Lindsley's precision teaching chart
 */

// ===== Configuration =====
const CONFIG = {
    // Standard Celeration Chart Y-axis range (logarithmic)
    yMin: 0.001,
    yMax: 1000,

    // X-axis range (calendar days) - this will be dynamic based on zoom
    xMin: 0,
    xMax: 140,

    // Chart margins
    margin: { top: 60, right: 80, bottom: 60, left: 80 },

    // Grid lines for log scale (count per minute values)
    // Original SCC is 6-cycle semi-log paper with lines at 1-9 within each decade
    logGridLines: [
        // Decade 0.001
        0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009,
        // Decade 0.01
        0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09,
        // Decade 0.1
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
        // Decade 1
        1, 2, 3, 4, 5, 6, 7, 8, 9,
        // Decade 10
        10, 20, 30, 40, 50, 60, 70, 80, 90,
        // Decade 100
        100, 200, 300, 400, 500, 600, 700, 800, 900,
        // Top
        1000
    ],
    // Major lines are at powers of 10 (decade markers)
    majorLogLines: [0.001, 0.01, 0.1, 1, 10, 100, 1000],
    // Mid-decade lines for labels
    midLogLines: [0.005, 0.05, 0.5, 5, 50, 500],

    // Week markers
    weekDays: 7,

    // Zoom presets (in days)
    zoomLevels: {
        7: { label: '1 Week', days: 7, weekInterval: 1, dayInterval: 1 },
        30: { label: '1 Month', days: 30, weekInterval: 1, dayInterval: 7 },
        90: { label: '3 Months', days: 90, weekInterval: 2, dayInterval: 14 },
        140: { label: 'Full', days: 140, weekInterval: 4, dayInterval: 14 }
    },

    // Vintage Scientific Instrument color palette
    colors: {
        paperCream: '#f7f3eb',
        paperAged: '#efe9dd',
        inkNavy: '#1a2744',
        inkLight: '#2d3d5a',
        burgundy: '#8b2942',
        brass: '#c4a35a',
        gridMajor: 'rgba(26, 39, 68, 0.35)',
        gridMinor: 'rgba(26, 39, 68, 0.12)',
        gridAccent: 'rgba(139, 41, 66, 0.2)',
        // Original SCC cyan color scheme
        sccCyan: '#00a0b0',
        sccGridMajor: 'rgba(0, 160, 176, 0.6)',
        sccGridMid: 'rgba(0, 160, 176, 0.4)',
        sccGridMinor: 'rgba(0, 160, 176, 0.25)'
    },

    // Colors for multiple students (vintage-appropriate)
    studentColors: [
        '#2d6a4f', // forest green
        '#b07d3d', // bronze
        '#4a6fa5', // slate blue
        '#7b5ea7', // purple
        '#9d4444', // brick red
        '#3d7a7a', // teal
        '#8b6914', // olive gold
        '#6b4c7a', // dusty violet
    ],

    // Metric colors - sepia-tinted for vintage feel
    metricColors: {
        correctPerMinute: '#2d6a4f',
        errorsPerMinute: '#9d4444',
        wpm: '#4a6fa5',
        accuracy: '#7b5ea7',
        prosody: '#b07d3d'
    },

    // Data point symbols
    symbols: {
        correct: 'dot',
        errors: 'x',
        zero: '?'
    }
};

// ===== State Management =====
const state = {
    students: [],
    activeStudents: [],
    activeMetrics: ['correctPerMinute', 'errorsPerMinute'],
    displayOptions: {
        showCelerationLines: true,
        showDataPoints: true,
        showRecordFloor: false,
        connectPoints: true
    },
    zoom: 140, // Current zoom level in days (Full view by default)
    panOffset: 0, // Starting day for the current view (for panning)
    maxDataDay: 140, // Maximum day with data (updated when data loads)
    hoveredPoint: null,
    canvas: null,
    ctx: null,
    isDragging: false,
    dragStartX: 0,
    dragStartOffset: 0,
    // Range selection state
    isSelecting: false,
    selectionStartX: 0,
    selectionEndX: 0,
    selectionStartDay: 0,
    selectionEndDay: 0,
    // Subject data organization
    subjects: {}, // { category: { subcategory: [dataSetIds] } }
    dataSets: {}, // { dataSetId: { subject, student, assessments, active, color } }
    activeDataSets: [] // List of active dataSet IDs to display
};

// Subject color palette
const SUBJECT_COLORS = {
    'Reading': ['#2d6a4f', '#40916c', '#52b788', '#74c69d'],
    'Math': ['#4a6fa5', '#5c7cba', '#6e8acf', '#8098e4'],
    'Writing': ['#7b5ea7', '#8d70b9', '#9f82cb', '#b194dd'],
    'default': ['#9d4444', '#af5656', '#c16868', '#d37a7a']
};

// Full assessment tree structure
const ASSESSMENT_TREE = {
    'Reading': ['Decoding', 'Oral Reading Fluency', 'Phonics'],
    'Math': ['Calculation', 'Counting', 'Math Concepts', 'Math Facts', 'Math Vocabulary'],
    'Writing': ['Descriptive', 'Explanatory', 'Handwriting', 'Keyboarding', 'Narrative', 'Persuasive', 'Transcription']
};

// ===== Make functions globally accessible =====
window.processStudentData = processStudentData;
window.state = state;
window.CONFIG = CONFIG;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initEventListeners();
    initCollapsibleSections();
    updateSubjectTree(); // Show empty tree structure on load
    drawChart();
    updatePanInfo();
    updatePanButtons();

    // Redraw chart once fonts are loaded (for canvas font rendering)
    document.fonts.ready.then(() => {
        drawChart();
    });
});

// ===== Collapsible Sections =====
function initCollapsibleSections() {
    const sectionHeaders = document.querySelectorAll('.section-header');

    sectionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const controlSection = header.closest('.control-section');
            controlSection.classList.toggle('collapsed');
        });
    });
}

function initCanvas() {
    state.canvas = document.getElementById('sccChart');
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        drawChart();
    });
}

function resizeCanvas() {
    const wrapper = state.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;

    state.canvas.width = wrapper.clientWidth * dpr;
    state.canvas.height = wrapper.clientHeight * dpr;
    state.canvas.style.width = wrapper.clientWidth + 'px';
    state.canvas.style.height = wrapper.clientHeight + 'px';

    state.ctx.scale(dpr, dpr);
}

function initEventListeners() {
    // File upload
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Drag and drop
    const chartWrapper = document.querySelector('.chart-wrapper');
    chartWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        chartWrapper.classList.add('dragover');
    });
    chartWrapper.addEventListener('dragleave', () => {
        chartWrapper.classList.remove('dragover');
    });
    chartWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        chartWrapper.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json') {
            loadFile(file);
        }
    });

    // Zoom controls
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoomDays = parseInt(btn.dataset.zoom);
            setZoom(zoomDays);

            // Update active state
            document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Metric toggles
    document.querySelectorAll('.metric-toggles .toggle-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const metric = item.dataset.metric;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                if (!state.activeMetrics.includes(metric)) {
                    state.activeMetrics.push(metric);
                }
            } else {
                state.activeMetrics = state.activeMetrics.filter(m => m !== metric);
            }
            drawChart();
            updateLegend();
        });
    });

    // Display options
    document.getElementById('showCelerationLines').addEventListener('change', (e) => {
        state.displayOptions.showCelerationLines = e.target.checked;
        drawChart();
    });

    document.getElementById('showDataPoints').addEventListener('change', (e) => {
        state.displayOptions.showDataPoints = e.target.checked;
        drawChart();
    });

    document.getElementById('showRecordFloor').addEventListener('change', (e) => {
        state.displayOptions.showRecordFloor = e.target.checked;
        drawChart();
    });

    document.getElementById('connectPoints').addEventListener('change', (e) => {
        state.displayOptions.connectPoints = e.target.checked;
        drawChart();
    });

    // Pattern detection toggle
    document.getElementById('showDeclinePatterns')?.addEventListener('change', () => {
        updatePatternsPanel();
    });

    // Mouse interaction for tooltips
    state.canvas.addEventListener('mousemove', handleMouseMove);
    state.canvas.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('tooltip');
        tooltip.classList.remove('visible');
    });

    // Modal close
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('infoModal').hidden = true;
    });

    // Pan controls
    document.getElementById('panLeft').addEventListener('click', () => panChart(-1));
    document.getElementById('panRight').addEventListener('click', () => panChart(1));

    // Keyboard navigation for panning
    document.addEventListener('keydown', (e) => {
        // Only handle if not in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            panChart(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            panChart(1);
        }
    });

    // Drag to pan on chart (only when zoomed in, not in full view)
    state.canvas.addEventListener('mousedown', (e) => {
        const rect = state.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Check if click is within chart area
        if (x < CONFIG.margin.left || x > state.canvas.clientWidth - CONFIG.margin.right) return;

        // Only allow drag-to-pan when zoomed in (not full view)
        if (state.zoom < 140) {
            state.isDragging = true;
            state.dragStartX = e.clientX;
            state.dragStartOffset = state.panOffset;
            state.canvas.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (state.isDragging) {
            const chartWidth = state.canvas.clientWidth - CONFIG.margin.left - CONFIG.margin.right;
            const pixelsPerDay = chartWidth / state.zoom;
            const dragDelta = state.dragStartX - e.clientX;
            const daysDelta = Math.round(dragDelta / pixelsPerDay);

            const newOffset = state.dragStartOffset + daysDelta;
            const maxOffset = Math.max(0, state.maxDataDay - state.zoom);
            state.panOffset = Math.max(0, Math.min(maxOffset, newOffset));

            drawChart();
            updatePanInfo();
        }
    });

    document.addEventListener('mouseup', () => {
        if (state.isDragging) {
            state.isDragging = false;
            state.canvas.style.cursor = 'default';
        }
    });
}

// Convert x coordinate to day number
function xToDay(x) {
    const chartWidth = state.canvas.clientWidth - CONFIG.margin.left - CONFIG.margin.right;
    const relativeX = x - CONFIG.margin.left;
    const day = (relativeX / chartWidth) * state.zoom + state.panOffset;
    return Math.max(0, Math.min(state.maxDataDay, day));
}

// Draw selection overlay
function drawSelectionOverlay() {
    if (!state.isSelecting) return;

    const { ctx, canvas } = state;
    const { margin } = CONFIG;
    const chartHeight = canvas.clientHeight - margin.top - margin.bottom;

    const startX = Math.min(state.selectionStartX, state.selectionEndX);
    const endX = Math.max(state.selectionStartX, state.selectionEndX);
    const width = endX - startX;

    // Draw selection rectangle
    ctx.save();
    ctx.fillStyle = 'rgba(196, 163, 90, 0.2)'; // brass with transparency
    ctx.fillRect(startX, margin.top, width, chartHeight);

    // Draw selection borders
    ctx.strokeStyle = CONFIG.colors.brass;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(startX, margin.top, width, chartHeight);
    ctx.setLineDash([]);

    // Draw day labels
    const startDay = Math.min(state.selectionStartDay, state.selectionEndDay);
    const endDay = Math.max(state.selectionStartDay, state.selectionEndDay);

    ctx.fillStyle = CONFIG.colors.inkNavy;
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'center';

    // Start day label
    ctx.fillText(`Day ${Math.floor(startDay)}`, startX, margin.top - 8);
    // End day label
    ctx.fillText(`Day ${Math.ceil(endDay)}`, endX, margin.top - 8);

    ctx.restore();
}

// ===== Pan Functions =====
function panChart(direction) {
    // direction: -1 for left (earlier), +1 for right (later)
    const panStep = getPanStep();
    const newOffset = state.panOffset + (direction * panStep);
    const maxOffset = Math.max(0, state.maxDataDay - state.zoom);

    state.panOffset = Math.max(0, Math.min(maxOffset, newOffset));

    drawChart();
    updatePanInfo();
    updatePanButtons();
}

function getPanStep() {
    // Pan step based on zoom level
    if (state.zoom <= 7) return 1; // 1 day for week view
    if (state.zoom <= 30) return 7; // 1 week for month view
    if (state.zoom <= 90) return 14; // 2 weeks for quarter view
    return 30; // 1 month for full view
}

function updatePanInfo() {
    const panInfo = document.getElementById('panInfo');
    const startDay = state.panOffset;
    const endDay = Math.min(state.panOffset + state.zoom, state.maxDataDay);
    panInfo.textContent = `Days ${startDay}-${endDay}`;
}

function updatePanButtons() {
    const panLeft = document.getElementById('panLeft');
    const panRight = document.getElementById('panRight');
    const maxOffset = Math.max(0, state.maxDataDay - state.zoom);

    panLeft.disabled = state.panOffset <= 0;
    panRight.disabled = state.panOffset >= maxOffset;
}

// ===== Zoom Functions =====
function setZoom(days) {
    state.zoom = days;
    // Reset pan offset when changing zoom, but keep it valid
    const maxOffset = Math.max(0, state.maxDataDay - state.zoom);
    state.panOffset = Math.min(state.panOffset, maxOffset);

    drawChart();
    updateChartSubtitle();
    updatePanInfo();
    updatePanButtons();
}

function getZoomConfig() {
    return CONFIG.zoomLevels[state.zoom] || CONFIG.zoomLevels[140];
}

function updateChartSubtitle() {
    const subtitle = document.getElementById('chartSubtitle');
    const zoomConfig = getZoomConfig();
    subtitle.textContent = `View: ${zoomConfig.label} (${state.zoom} days)`;
}

// ===== File Handling =====
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        loadFile(file);
    }
}

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            processStudentData(data);
        } catch (err) {
            console.error('Error parsing JSON:', err);
            alert('Invalid JSON file format');
        }
    };
    reader.readAsText(file);
}

function processStudentData(data) {
    // Check if it's the expected format
    if (!data.student || !data.assessments) {
        alert('Invalid data format. Expected student data export from Word Analyzer.');
        return;
    }

    // Extract category from data (e.g., "Oral Reading Fluency")
    // This determines where in the tree it appears
    const assessmentCategory = data.category || data.subject?.subcategory || 'Oral Reading Fluency';

    // Find which subject area this category belongs to
    let subjectArea = 'Reading'; // default
    for (const [area, categories] of Object.entries(ASSESSMENT_TREE)) {
        if (categories.includes(assessmentCategory)) {
            subjectArea = area;
            break;
        }
    }

    const category = subjectArea;
    const subcategory = assessmentCategory;

    const studentId = data.student.id || `student-${Date.now()}`;
    const dataSetId = `${studentId}-${category}-${subcategory}`.replace(/\s+/g, '-').toLowerCase();

    // Initialize subject hierarchy if needed
    if (!state.subjects[category]) {
        state.subjects[category] = {};
    }
    if (!state.subjects[category][subcategory]) {
        state.subjects[category][subcategory] = [];
    }

    // Get color for this data set
    const colorPalette = SUBJECT_COLORS[category] || SUBJECT_COLORS['default'];
    const colorIndex = state.subjects[category][subcategory].length % colorPalette.length;
    const color = colorPalette[colorIndex];

    // Check if data set already exists
    if (state.dataSets[dataSetId]) {
        // Update existing data set
        state.dataSets[dataSetId].assessments = data.assessments;
        state.dataSets[dataSetId].summary = data.summary;
    } else {
        // Create new data set
        state.dataSets[dataSetId] = {
            id: dataSetId,
            subject: { category, subcategory },
            student: data.student,
            assessments: data.assessments,
            summary: data.summary,
            color: color,
            active: true
        };

        // Add to subject hierarchy
        state.subjects[category][subcategory].push(dataSetId);

        // Add to active data sets
        state.activeDataSets.push(dataSetId);
    }

    // Also maintain legacy students array for compatibility
    const existingIndex = state.students.findIndex(s => s.id === studentId);
    if (existingIndex !== -1) {
        state.students[existingIndex] = {
            ...state.students[existingIndex],
            ...data.student,
            assessments: data.assessments,
            summary: data.summary
        };
    } else {
        const legacyColorIndex = state.students.length % CONFIG.studentColors.length;
        state.students.push({
            ...data.student,
            assessments: data.assessments,
            summary: data.summary,
            color: CONFIG.studentColors[legacyColorIndex]
        });
        state.activeStudents.push(studentId);
    }

    // Update maxDataDay based on all loaded data
    updateMaxDataDay();

    updateSubjectTree();
    updateStudentList();
    drawChart();
    updateStats();
    updateLegend();
    updatePatternsPanel();
    updateChartSubtitle();
    updatePanInfo();
    updatePanButtons();
}

// ===== Subject Tree UI =====
function updateSubjectTree() {
    const container = document.getElementById('subjectTree');
    let html = '';

    // Show full assessment tree structure
    for (const [subjectArea, categories] of Object.entries(ASSESSMENT_TREE)) {
        const areaId = subjectArea.replace(/\s+/g, '-').toLowerCase();
        const hasData = state.subjects[subjectArea] && Object.keys(state.subjects[subjectArea]).length > 0;

        html += `
            <div class="subject-category ${hasData ? 'expanded has-data' : ''}" data-category="${subjectArea}">
                <div class="subject-category-header" onclick="toggleSubjectCategory('${subjectArea}')">
                    <span class="category-icon">▶</span>
                    <span class="${hasData ? '' : 'muted'}">${escapeHtml(subjectArea)}</span>
                </div>
                <div class="subject-subcategories">
        `;

        for (const category of categories) {
            const categoryDataSets = state.subjects[subjectArea]?.[category] || [];
            const hasDataForCategory = categoryDataSets.length > 0;

            if (hasDataForCategory) {
                // Show each data set for this category
                for (const dataSetId of categoryDataSets) {
                    const dataSet = state.dataSets[dataSetId];
                    if (!dataSet) continue;

                    const isActive = state.activeDataSets.includes(dataSetId);
                    const studentName = dataSet.student.name;
                    const assessmentCount = dataSet.assessments.length;

                    html += `
                        <label class="subject-item has-data ${isActive ? 'active' : ''}" data-dataset="${dataSetId}">
                            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleDataSet('${dataSetId}')">
                            <span class="subject-color" style="background: ${dataSet.color}"></span>
                            <span class="subject-label">${escapeHtml(category)}</span>
                            <span class="subject-count">${studentName} (${assessmentCount})</span>
                        </label>
                    `;
                }
            } else {
                // Show empty placeholder for this category
                html += `
                    <div class="subject-item empty">
                        <span class="subject-label muted">${escapeHtml(category)}</span>
                    </div>
                `;
            }
        }

        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function toggleSubjectCategory(categoryId) {
    const category = document.querySelector(`[data-category="${categoryId}"]`) ||
                     document.querySelector(`.subject-category[data-category]`);
    if (category) {
        category.classList.toggle('expanded');
    }
}

function toggleDataSet(dataSetId) {
    const index = state.activeDataSets.indexOf(dataSetId);
    const dataSet = state.dataSets[dataSetId];

    if (index !== -1) {
        state.activeDataSets.splice(index, 1);
        if (dataSet) {
            dataSet.active = false;
            // Also remove from activeStudents
            const studentId = dataSet.student?.id;
            if (studentId) {
                state.activeStudents = state.activeStudents.filter(s => s !== studentId);
            }
        }
    } else {
        state.activeDataSets.push(dataSetId);
        if (dataSet) {
            dataSet.active = true;
            // Also add to activeStudents
            const studentId = dataSet.student?.id;
            if (studentId && !state.activeStudents.includes(studentId)) {
                state.activeStudents.push(studentId);
            }
        }
    }

    updateSubjectTree();
    updateStudentList();
    drawChart();
    updateStats();
    updateLegend();
    updatePatternsPanel();
}

// Make functions globally accessible
window.toggleSubjectCategory = toggleSubjectCategory;
window.toggleDataSet = toggleDataSet;

function updateMaxDataDay() {
    let maxDay = 140; // Default to standard SCC range

    state.students.forEach(student => {
        if (student.assessments) {
            student.assessments.forEach(assessment => {
                if (assessment.celeration && assessment.celeration.calendarDay) {
                    maxDay = Math.max(maxDay, assessment.celeration.calendarDay);
                }
            });
        }
    });

    // Round up to nearest week and add buffer
    state.maxDataDay = Math.max(140, Math.ceil((maxDay + 7) / 7) * 7);
}

// ===== UI Updates =====
function updateStudentList() {
    const container = document.getElementById('studentList');

    if (state.students.length === 0) {
        container.innerHTML = '<p class="empty-state">No data loaded</p>';
        return;
    }

    container.innerHTML = state.students.map((student, index) => `
        <div class="student-item ${state.activeStudents.includes(student.id) ? 'active' : ''}"
             data-id="${student.id}" style="color: ${student.color}">
            <span class="student-color"></span>
            <span class="student-name">${escapeHtml(student.name)}</span>
            <span class="student-count">${student.assessments.length} assessments</span>
            <button class="remove-btn" data-id="${student.id}" title="Remove">&times;</button>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.student-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) return;

            const id = item.dataset.id;
            if (state.activeStudents.includes(id)) {
                state.activeStudents = state.activeStudents.filter(s => s !== id);
                item.classList.remove('active');
            } else {
                state.activeStudents.push(id);
                item.classList.add('active');
            }
            drawChart();
            updateStats();
            updateLegend();
            updatePatternsPanel();
        });
    });

    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            state.students = state.students.filter(s => s.id !== id);
            state.activeStudents = state.activeStudents.filter(s => s !== id);
            updateStudentList();
            drawChart();
            updateStats();
            updateLegend();
            updatePatternsPanel();
        });
    });
}

function updateStats() {
    const panel = document.getElementById('statsPanel');

    if (state.activeStudents.length === 0) {
        panel.innerHTML = '<p class="empty-state">Select a student</p>';
        return;
    }

    // Get first active student for stats
    const student = state.students.find(s => state.activeStudents.includes(s.id));
    if (!student) return;

    // Calculate celeration for correct per minute
    const correctData = student.assessments
        .filter(a => a.celeration && a.celeration.correctPerMinute > 0)
        .map(a => ({
            day: a.celeration.calendarDay,
            value: a.celeration.correctPerMinute
        }));

    const errorData = student.assessments
        .filter(a => a.celeration && a.celeration.errorsPerMinute > 0)
        .map(a => ({
            day: a.celeration.calendarDay,
            value: a.celeration.errorsPerMinute
        }));

    const correctCeleration = calculateCeleration(correctData);
    const errorCeleration = calculateCeleration(errorData);

    panel.innerHTML = `
        <div class="stat-row">
            <span class="stat-label">Student</span>
            <span class="stat-value neutral">${escapeHtml(student.name)}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Assessments</span>
            <span class="stat-value neutral">${student.assessments.length}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Avg Accuracy</span>
            <span class="stat-value neutral">${student.summary?.averages?.accuracy || 'N/A'}%</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Avg WPM</span>
            <span class="stat-value neutral">${student.summary?.averages?.wpm || 'N/A'}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Correct Celeration</span>
            <span class="stat-value ${correctCeleration >= 1 ? 'positive' : 'negative'}">
                ${formatCeleration(correctCeleration)}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Error Celeration</span>
            <span class="stat-value ${errorCeleration <= 1 ? 'positive' : 'negative'}">
                ${formatCeleration(errorCeleration)}
            </span>
        </div>
    `;
}

function updateLegend() {
    const legend = document.getElementById('chartLegend');
    const items = [];

    state.activeMetrics.forEach(metric => {
        const color = CONFIG.metricColors[metric];
        const label = getMetricLabel(metric);
        const symbol = metric === 'errorsPerMinute' ?
            `<span class="legend-x" style="color: ${color}">X</span>` :
            `<span class="legend-dot" style="background: ${color}"></span>`;

        items.push(`
            <div class="legend-item">
                ${symbol}
                <span>${label}</span>
            </div>
        `);
    });

    legend.innerHTML = items.join('');
}

function getMetricLabel(metric) {
    const labels = {
        correctPerMinute: 'Correct/min',
        errorsPerMinute: 'Errors/min',
        wpm: 'Words/min',
        accuracy: 'Accuracy %',
        prosody: 'Prosody'
    };
    return labels[metric] || metric;
}

// ===== Chart Drawing =====
function drawChart() {
    const { ctx, canvas } = state;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const { margin } = CONFIG;
    const zoomConfig = getZoomConfig();
    const xMax = state.zoom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Chart dimensions
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Draw background - vintage paper cream
    ctx.fillStyle = CONFIG.colors.paperCream;
    ctx.fillRect(0, 0, width, height);

    // Draw chart area
    ctx.save();
    ctx.translate(margin.left, margin.top);

    // Draw grid
    drawGrid(ctx, chartWidth, chartHeight, xMax, zoomConfig);

    // Draw axes
    drawAxes(ctx, chartWidth, chartHeight, xMax, zoomConfig);

    // Draw data for each active student and metric
    state.activeStudents.forEach(studentId => {
        const student = state.students.find(s => s.id === studentId);
        if (!student) return;

        state.activeMetrics.forEach(metric => {
            drawDataSeries(ctx, student, metric, chartWidth, chartHeight, xMax);
        });
    });

    ctx.restore();

    // Draw axis labels
    drawAxisLabels(ctx, width, height, margin);
}

function drawGrid(ctx, width, height, xMax, zoomConfig) {
    const panOffset = state.panOffset;

    // Vertical grid lines (calendar days) - cyan like original SCC
    ctx.strokeStyle = CONFIG.colors.sccGridMinor;
    ctx.lineWidth = 1;

    const dayInterval = zoomConfig.dayInterval;
    for (let day = 0; day <= xMax; day += dayInterval) {
        const x = (day / xMax) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Week number labels at top (adjusted for pan offset) - matching original SCC
    ctx.fillStyle = CONFIG.colors.sccCyan;
    ctx.font = "300 10px Inter, sans-serif";
    ctx.textAlign = 'center';

    const weekInterval = zoomConfig.weekInterval;
    const startWeek = Math.floor(panOffset / 7);
    const maxWeeks = Math.ceil((panOffset + xMax) / 7);
    for (let week = startWeek; week <= maxWeeks; week += weekInterval) {
        const dayInView = (week * 7) - panOffset;
        const x = (dayInView / xMax) * width;
        if (x >= 0 && x <= width) {
            ctx.fillText(week.toString(), x, -8);
        }
    }

    // Horizontal grid lines (logarithmic) - cyan like original SCC
    CONFIG.logGridLines.forEach(value => {
        const y = valueToY(value, height);
        const isMajor = CONFIG.majorLogLines.includes(value);
        const isMid = CONFIG.midLogLines.includes(value);

        if (isMajor) {
            // Decade lines (1, 10, 100, etc.) - darkest cyan
            ctx.strokeStyle = CONFIG.colors.sccGridMajor;
            ctx.lineWidth = 1.5;
        } else if (isMid) {
            // Mid-decade lines (5, 50, 500, etc.) - medium cyan
            ctx.strokeStyle = CONFIG.colors.sccGridMid;
            ctx.lineWidth = 1;
        } else {
            // Other intermediate lines (2,3,4,6,7,8,9) - lightest cyan
            ctx.strokeStyle = CONFIG.colors.sccGridMinor;
            ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    });
}

function drawAxes(ctx, width, height, xMax, zoomConfig) {
    // Y-axis labels - matching original SCC chart style
    ctx.fillStyle = CONFIG.colors.sccCyan;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Helper function to format Y-axis labels like original SCC
    const formatYLabel = (value) => {
        if (value >= 1) {
            return value.toString();
        } else {
            // Format as .5, .1, .05, .01, .005, .001 (without leading zero)
            return '.' + value.toString().split('.')[1];
        }
    };

    // Major lines (powers of 10): 1000, 100, 10, 1, .1, .01, .001 - larger font
    ctx.font = "300 13px Inter, sans-serif";
    CONFIG.majorLogLines.forEach(value => {
        const y = valueToY(value, height);
        ctx.fillText(formatYLabel(value), -8, y);
    });

    // Mid-decade lines (5's): 500, 50, 5, .5, .05, .005 - smaller font
    ctx.font = "300 10px Inter, sans-serif";
    CONFIG.midLogLines.forEach(value => {
        const y = valueToY(value, height);
        ctx.fillText(formatYLabel(value), -8, y);
    });

    // X-axis labels (adjusted for pan offset) - matching original SCC
    ctx.fillStyle = CONFIG.colors.sccCyan;
    ctx.font = "300 13px Inter, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const dayInterval = zoomConfig.dayInterval;
    const panOffset = state.panOffset;
    for (let day = 0; day <= xMax; day += dayInterval) {
        const x = (day / xMax) * width;
        const actualDay = day + panOffset;
        ctx.fillText(actualDay.toString(), x, height + 10);
    }
}

function drawAxisLabels(ctx, width, height, margin) {
    // Y-axis label (rotated) - matching original SCC
    ctx.save();
    ctx.fillStyle = CONFIG.colors.sccCyan;
    ctx.font = "400 13px Inter, sans-serif";
    ctx.textAlign = 'center';
    ctx.translate(18, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('COUNT PER MINUTE', 0, 0);
    ctx.restore();

    // Week label at top - matching original SCC
    ctx.fillStyle = CONFIG.colors.sccCyan;
    ctx.font = "400 13px Inter, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('SUCCESSIVE CALENDAR WEEKS', width / 2, 18);
}

function drawDataSeries(ctx, student, metric, chartWidth, chartHeight, xMax) {
    const color = CONFIG.metricColors[metric];
    const dataPoints = getDataPoints(student, metric);
    const panOffset = state.panOffset;

    if (dataPoints.length === 0) return;

    // Find the minimum calendar day to normalize (relative to student's first assessment)
    const minDay = Math.min(...dataPoints.map(p => p.day));

    // Normalize days relative to first assessment
    const normalizedPoints = dataPoints.map(p => ({
        ...p,
        normalizedDay: p.day - minDay
    }));

    // Filter points within visible pan range [panOffset, panOffset + xMax]
    const visiblePoints = normalizedPoints.filter(p =>
        p.normalizedDay >= panOffset && p.normalizedDay <= panOffset + xMax
    );

    // Also get all points up to panOffset + xMax for celeration calculation
    const pointsForCeleration = normalizedPoints.filter(p => p.normalizedDay <= panOffset + xMax);

    // Helper function to convert normalized day to x position
    const dayToX = (normalizedDay) => ((normalizedDay - panOffset) / xMax) * chartWidth;

    // Draw connecting lines
    if (state.displayOptions.connectPoints && visiblePoints.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();

        let started = false;
        visiblePoints.forEach(point => {
            if (point.value <= 0) return;

            const x = dayToX(point.normalizedDay);
            const y = valueToY(point.value, chartHeight);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Draw celeration line (use all points for calculation, but display in visible range)
    if (state.displayOptions.showCelerationLines && pointsForCeleration.length >= 2) {
        const validPoints = pointsForCeleration.filter(p => p.value > 0);
        if (validPoints.length >= 2) {
            drawCelerationLine(ctx, validPoints, color, chartWidth, chartHeight, xMax, metric, panOffset);
        }
    }

    // Draw data points
    if (state.displayOptions.showDataPoints) {
        visiblePoints.forEach(point => {
            const x = dayToX(point.normalizedDay);
            const y = valueToY(point.value > 0 ? point.value : 0.0005, chartHeight);

            if (metric === 'errorsPerMinute') {
                drawXMark(ctx, x, y, 6, color);
            } else if (point.value === 0) {
                drawQuestionMark(ctx, x, y, color);
            } else {
                drawDot(ctx, x, y, 5, color);
            }
        });
    }

    // Draw record floor if enabled
    if (state.displayOptions.showRecordFloor) {
        visiblePoints.forEach(point => {
            if (point.countingTimeMin && point.countingTimeMin > 0) {
                const x = dayToX(point.normalizedDay);
                const floorValue = 1 / point.countingTimeMin;
                const y = valueToY(floorValue, chartHeight);

                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(x - 8, y);
                ctx.lineTo(x + 8, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });
    }
}

function getDataPoints(student, metric) {
    return student.assessments
        .filter(a => a.celeration)
        .map(a => {
            let value;
            switch(metric) {
                case 'correctPerMinute':
                    value = a.celeration.correctPerMinute || 0;
                    break;
                case 'errorsPerMinute':
                    value = a.celeration.errorsPerMinute || 0;
                    break;
                case 'wpm':
                    value = a.performance?.wpm || 0;
                    break;
                case 'accuracy':
                    value = a.performance?.accuracy || 0;
                    break;
                case 'prosody':
                    value = (a.prosody?.score || 0) * 20;
                    break;
                default:
                    value = 0;
            }

            return {
                day: a.celeration.calendarDay,
                value: value,
                countingTimeMin: a.celeration.countingTimeMin,
                date: a.celeration.date,
                assessment: a
            };
        })
        .sort((a, b) => a.day - b.day);
}

function drawDot(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#0a1628';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawXMark(ctx, x, y, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
}

function drawQuestionMark(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y);
}

function drawCelerationLine(ctx, points, color, chartWidth, chartHeight, xMax, metric, panOffset = 0) {
    // Calculate celeration using log-linear regression
    const logPoints = points.map(p => ({
        x: p.normalizedDay,
        y: Math.log10(p.value)
    }));

    const n = logPoints.length;
    const sumX = logPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = logPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = logPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = logPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate weekly celeration (multiply per week)
    const weeklyCeleration = Math.pow(10, slope * 7);

    // Helper function to convert day to x position (accounting for pan)
    const dayToX = (day) => ((day - panOffset) / xMax) * chartWidth;

    // Draw the celeration line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;

    const minX = Math.min(...points.map(p => p.normalizedDay));
    const maxX = Math.max(...points.map(p => p.normalizedDay));

    // Extend line slightly beyond data but within visible pan range
    const extendDays = Math.min(3, xMax * 0.1);
    const startX = Math.max(panOffset, minX - extendDays);
    const endX = Math.min(panOffset + xMax, maxX + extendDays);

    const startY = Math.pow(10, intercept + slope * startX);
    const endY = Math.pow(10, intercept + slope * endX);

    ctx.beginPath();
    ctx.moveTo(dayToX(startX), valueToY(startY, chartHeight));
    ctx.lineTo(dayToX(endX), valueToY(endY, chartHeight));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Draw celeration label on the chart
    if (isFinite(weeklyCeleration) && !isNaN(weeklyCeleration)) {
        const celerationLabel = formatCeleration(weeklyCeleration);

        // Position label at the end of the celeration line (within visible area)
        const labelX = dayToX(endX);
        const labelY = valueToY(endY, chartHeight);

        // Draw label background
        ctx.font = "600 11px 'IBM Plex Mono', monospace";
        const textWidth = ctx.measureText(celerationLabel).width;
        const padding = 4;

        ctx.fillStyle = CONFIG.colors.inkNavy;
        ctx.fillRect(
            labelX + 5,
            labelY - 8,
            textWidth + padding * 2,
            16
        );

        // Draw label border (brass accent)
        ctx.strokeStyle = CONFIG.colors.brass;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
            labelX + 5,
            labelY - 8,
            textWidth + padding * 2,
            16
        );

        // Draw label text
        ctx.fillStyle = CONFIG.colors.paperCream;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(celerationLabel, labelX + 5 + padding, labelY);

        // Draw x2 target indicator for correct metrics
        if (metric === 'correctPerMinute') {
            const targetLabel = '(goal: x2.0)';
            ctx.font = "500 9px 'IBM Plex Mono', monospace";
            ctx.fillStyle = CONFIG.colors.brass;
            ctx.fillText(targetLabel, labelX + 5 + padding, labelY + 12);
        }
    }
}

// ===== Coordinate Transformations =====
function valueToY(value, chartHeight) {
    const { yMin, yMax } = CONFIG;

    // Clamp value to valid range
    value = Math.max(yMin, Math.min(yMax, value));

    // Logarithmic transformation
    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);
    const logValue = Math.log10(value);

    // Invert Y (0 at bottom)
    const normalized = (logValue - logMin) / (logMax - logMin);
    return chartHeight * (1 - normalized);
}

function yToValue(y, chartHeight) {
    const { yMin, yMax } = CONFIG;

    const logMin = Math.log10(yMin);
    const logMax = Math.log10(yMax);

    const normalized = 1 - (y / chartHeight);
    const logValue = logMin + normalized * (logMax - logMin);

    return Math.pow(10, logValue);
}

// ===== Celeration Calculations =====
function calculateCeleration(dataPoints) {
    if (dataPoints.length < 2) return 1;

    // Filter out zero values
    const validPoints = dataPoints.filter(p => p.value > 0);
    if (validPoints.length < 2) return 1;

    // Log-linear regression
    const logPoints = validPoints.map(p => ({
        x: p.day,
        y: Math.log10(p.value)
    }));

    const n = logPoints.length;
    const sumX = logPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = logPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = logPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = logPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Convert daily slope to weekly celeration
    const weeklyCeleration = Math.pow(10, slope * 7);

    return weeklyCeleration;
}

function formatCeleration(value) {
    if (!isFinite(value) || isNaN(value)) return 'N/A';

    if (value >= 1) {
        return `x${value.toFixed(2)}`;
    } else {
        return `/${(1/value).toFixed(2)}`;
    }
}

// ===== Mouse Interaction =====
function handleMouseMove(e) {
    // Don't show tooltips while dragging
    if (state.isDragging) return;

    const rect = state.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - CONFIG.margin.left;
    const y = e.clientY - rect.top - CONFIG.margin.top;

    const chartWidth = state.canvas.clientWidth - CONFIG.margin.left - CONFIG.margin.right;
    const chartHeight = state.canvas.clientHeight - CONFIG.margin.top - CONFIG.margin.bottom;
    const xMax = state.zoom;
    const panOffset = state.panOffset;

    // Check if within chart area
    if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) {
        document.getElementById('tooltip').classList.remove('visible');
        return;
    }

    // Find closest point
    let closestPoint = null;
    let closestDist = Infinity;

    state.activeStudents.forEach(studentId => {
        const student = state.students.find(s => s.id === studentId);
        if (!student) return;

        state.activeMetrics.forEach(metric => {
            const dataPoints = getDataPoints(student, metric);
            const minDay = dataPoints.length > 0 ? Math.min(...dataPoints.map(p => p.day)) : 0;

            dataPoints.forEach(point => {
                if (point.value <= 0) return;

                const normalizedDay = point.day - minDay;
                // Check if point is within visible pan range
                if (normalizedDay < panOffset || normalizedDay > panOffset + xMax) return;

                const px = ((normalizedDay - panOffset) / xMax) * chartWidth;
                const py = valueToY(point.value, chartHeight);

                const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

                if (dist < closestDist && dist < 20) {
                    closestDist = dist;
                    closestPoint = {
                        student,
                        metric,
                        point,
                        x: px,
                        y: py
                    };
                }
            });
        });
    });

    const tooltip = document.getElementById('tooltip');

    if (closestPoint) {
        tooltip.innerHTML = `
            <div class="tooltip-title">${escapeHtml(closestPoint.student.name)}</div>
            <div class="tooltip-row">
                <span>Date</span>
                <span class="value">${closestPoint.point.date}</span>
            </div>
            <div class="tooltip-row">
                <span>Day</span>
                <span class="value">${closestPoint.point.day}</span>
            </div>
            <div class="tooltip-row">
                <span>${getMetricLabel(closestPoint.metric)}</span>
                <span class="value">${closestPoint.point.value.toFixed(2)}</span>
            </div>
            ${closestPoint.point.countingTimeMin ? `
            <div class="tooltip-row">
                <span>Timing</span>
                <span class="value">${(closestPoint.point.countingTimeMin * 60).toFixed(0)}s</span>
            </div>
            ` : ''}
        `;

        tooltip.style.left = (closestPoint.x + CONFIG.margin.left + 15) + 'px';
        tooltip.style.top = (closestPoint.y + CONFIG.margin.top - 10) + 'px';
        tooltip.classList.add('visible');
    } else {
        tooltip.classList.remove('visible');
    }
}

// ===== Utilities =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

// ===== Pattern Detection =====
function detectPatterns() {
    const patterns = [];

    state.activeStudents.forEach(studentId => {
        const student = state.students.find(s => s.id === studentId);
        if (!student || !student.assessments) return;

        // Get correct per minute data sorted by day
        const correctData = student.assessments
            .filter(a => a.celeration && a.celeration.correctPerMinute > 0)
            .map(a => ({
                day: a.celeration.calendarDay,
                value: a.celeration.correctPerMinute,
                date: a.celeration.date
            }))
            .sort((a, b) => a.day - b.day);

        // Detect consecutive declines
        const declinePatterns = detectConsecutiveDeclines(correctData, student.name);
        patterns.push(...declinePatterns);
    });

    return patterns;
}

function detectConsecutiveDeclines(dataPoints, studentName) {
    const patterns = [];
    if (dataPoints.length < 2) return patterns;

    let consecutiveDeclines = 0;
    let declineStartDay = null;
    let declineEndDay = null;

    for (let i = 1; i < dataPoints.length; i++) {
        const prevValue = dataPoints[i - 1].value;
        const currValue = dataPoints[i].value;

        if (currValue < prevValue) {
            // Decline detected
            if (consecutiveDeclines === 0) {
                declineStartDay = dataPoints[i - 1].day;
            }
            consecutiveDeclines++;
            declineEndDay = dataPoints[i].day;
        } else {
            // Decline streak ended - record if significant
            if (consecutiveDeclines >= 2) {
                patterns.push({
                    type: 'decline',
                    severity: consecutiveDeclines >= 3 ? 'critical' : 'warning',
                    studentName: studentName,
                    consecutiveDays: consecutiveDeclines,
                    startDay: declineStartDay,
                    endDay: declineEndDay,
                    metric: 'Correct/Min'
                });
            }
            consecutiveDeclines = 0;
            declineStartDay = null;
        }
    }

    // Check if we ended with a decline streak
    if (consecutiveDeclines >= 2) {
        patterns.push({
            type: 'decline',
            severity: consecutiveDeclines >= 3 ? 'critical' : 'warning',
            studentName: studentName,
            consecutiveDays: consecutiveDeclines,
            startDay: declineStartDay,
            endDay: declineEndDay,
            metric: 'Correct/Min'
        });
    }

    return patterns;
}

function updatePatternsPanel() {
    const panel = document.getElementById('patternsPanel');
    const showDeclines = document.getElementById('showDeclinePatterns')?.checked ?? true;

    if (!showDeclines || state.activeStudents.length === 0) {
        panel.innerHTML = '<p class="empty-state">No patterns detected</p>';
        return;
    }

    const patterns = detectPatterns();

    if (patterns.length === 0) {
        panel.innerHTML = '<p class="empty-state">No patterns detected</p>';
        return;
    }

    // Sort patterns by severity (critical first) and then by end day (most recent first)
    patterns.sort((a, b) => {
        if (a.severity !== b.severity) {
            return a.severity === 'critical' ? -1 : 1;
        }
        return b.endDay - a.endDay;
    });

    panel.innerHTML = patterns.map(pattern => {
        const icon = pattern.severity === 'critical' ? '⚠' : '↘';
        const severityClass = pattern.severity;

        if (pattern.type === 'decline') {
            return `
                <div class="pattern-alert ${severityClass}">
                    <span class="pattern-icon">${icon}</span>
                    <span class="pattern-text">
                        <strong>${escapeHtml(pattern.studentName)}</strong>:
                        ${pattern.consecutiveDays} consecutive declines in ${pattern.metric}
                        <span class="pattern-days">(Days ${pattern.startDay}-${pattern.endDay})</span>
                    </span>
                </div>
            `;
        }
        return '';
    }).join('');
}

// Make pattern functions globally accessible
window.updatePatternsPanel = updatePatternsPanel;
