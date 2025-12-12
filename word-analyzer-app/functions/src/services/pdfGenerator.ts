import PDFDocument from 'pdfkit';

// Types for pattern summary
type SeverityLevel = 'excellent' | 'mild' | 'moderate' | 'significant';

interface PatternSummary {
  severity: SeverityLevel;
  primaryIssues: string[];
  recommendations: string[];
  strengths: string[];
  referralSuggestions: string[];
}

export interface PdfReportInput {
  studentName: string;
  assessmentDate: Date;
  metrics: {
    accuracy: number;
    wordsPerMinute: number;
    prosodyScore: number;
    prosodyGrade: string;
    totalWords: number;
    correctCount: number;
    errorCount: number;
    skipCount: number;
    hesitationCount?: number;
    fillerWordCount?: number;
    repeatCount?: number;
    selfCorrectionCount?: number;
  };
  words: Array<{
    expected: string;
    spoken: string | null;
    status: 'correct' | 'misread' | 'substituted' | 'skipped';
  }>;
  errorPatterns: Array<{
    type: string;
    pattern: string;
    count: number;
    examples: Array<{ expected: string; spoken: string }>;
  }>;
  aiSummary?: string;
  patternSummary?: PatternSummary;
}

// Color palette
const COLORS = {
  primary: '#1e40af',      // Deep blue
  secondary: '#3b82f6',    // Bright blue
  success: '#059669',      // Green
  warning: '#d97706',      // Orange
  danger: '#dc2626',       // Red
  purple: '#7c3aed',       // Purple
  text: '#1f2937',         // Dark gray
  textLight: '#6b7280',    // Medium gray
  textMuted: '#9ca3af',    // Light gray
  background: '#f8fafc',   // Very light blue-gray
  white: '#ffffff',
  border: '#e5e7eb',
};

// Severity badge colors
const SEVERITY_COLORS: Record<SeverityLevel, { bg: string; text: string; label: string }> = {
  excellent: { bg: '#dcfce7', text: '#166534', label: 'Excellent' },
  mild: { bg: '#dbeafe', text: '#1e40af', label: 'Mild Concerns' },
  moderate: { bg: '#fef3c7', text: '#92400e', label: 'Moderate Concerns' },
  significant: { bg: '#fee2e2', text: '#991b1b', label: 'Significant Concerns' },
};

/**
 * Generate a professional PDF report for an assessment
 * Returns a Buffer containing the PDF data
 */
export async function generatePdfReport(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Reading Assessment - ${input.studentName}`,
        Author: 'Word Analyzer',
        Subject: 'Oral Reading Fluency Assessment Report',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 612; // Letter width in points
    const contentWidth = pageWidth - 100; // Accounting for margins
    let currentY = 50;

    // Helper function to check if we need a new page
    const checkPageBreak = (neededHeight: number): boolean => {
      if (currentY + neededHeight > 700) {
        doc.addPage();
        currentY = 50;
        return true;
      }
      return false;
    };

    // Helper to draw a rounded rectangle
    const roundedRect = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
      doc.save();
      doc.roundedRect(x, y, w, h, r).fill(fill);
      doc.restore();
    };

    // =====================================================
    // HEADER
    // =====================================================

    // Logo/Title area with subtle background
    roundedRect(50, currentY, contentWidth, 80, 8, COLORS.primary);

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(COLORS.white)
      .text('Reading Assessment Report', 50, currentY + 20, {
        width: contentWidth,
        align: 'center'
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#93c5fd')
      .text('Oral Reading Fluency Analysis', 50, currentY + 50, {
        width: contentWidth,
        align: 'center'
      });

    currentY += 100;

    // Student info bar
    roundedRect(50, currentY, contentWidth, 45, 6, COLORS.background);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(COLORS.text)
      .text(input.studentName, 70, currentY + 14);

    const dateStr = input.assessmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(COLORS.textLight)
      .text(dateStr, 50, currentY + 14, {
        width: contentWidth - 20,
        align: 'right'
      });

    currentY += 60;

    // =====================================================
    // KEY METRICS - 4 boxes in a row
    // =====================================================

    const metricBoxWidth = (contentWidth - 30) / 4;
    const metricBoxHeight = 70;

    const metricsData = [
      {
        label: 'Accuracy',
        value: `${input.metrics.accuracy}%`,
        color: input.metrics.accuracy >= 90 ? COLORS.success :
               input.metrics.accuracy >= 80 ? COLORS.warning : COLORS.danger
      },
      {
        label: 'Words/Min',
        value: `${input.metrics.wordsPerMinute}`,
        color: COLORS.secondary
      },
      {
        label: 'Prosody',
        value: input.metrics.prosodyGrade || `${input.metrics.prosodyScore}`,
        color: COLORS.purple
      },
      {
        label: 'Total Words',
        value: `${input.metrics.totalWords}`,
        color: COLORS.textLight
      },
    ];

    metricsData.forEach((metric, index) => {
      const x = 50 + (index * (metricBoxWidth + 10));

      // Box background
      roundedRect(x, currentY, metricBoxWidth, metricBoxHeight, 6, COLORS.white);

      // Border
      doc
        .roundedRect(x, currentY, metricBoxWidth, metricBoxHeight, 6)
        .lineWidth(2)
        .stroke(metric.color);

      // Value
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(metric.color)
        .text(metric.value, x, currentY + 15, {
          width: metricBoxWidth,
          align: 'center',
        });

      // Label
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(COLORS.textLight)
        .text(metric.label, x, currentY + 48, {
          width: metricBoxWidth,
          align: 'center',
        });
    });

    currentY += metricBoxHeight + 20;

    // =====================================================
    // SECONDARY METRICS ROW (if available)
    // =====================================================

    const secondaryMetrics = [];
    if (input.metrics.correctCount !== undefined) {
      secondaryMetrics.push({ label: 'Correct', value: input.metrics.correctCount, color: COLORS.success });
    }
    if (input.metrics.errorCount !== undefined && input.metrics.errorCount > 0) {
      secondaryMetrics.push({ label: 'Errors', value: input.metrics.errorCount, color: COLORS.warning });
    }
    if (input.metrics.skipCount !== undefined && input.metrics.skipCount > 0) {
      secondaryMetrics.push({ label: 'Skipped', value: input.metrics.skipCount, color: COLORS.danger });
    }
    if (input.metrics.hesitationCount !== undefined && input.metrics.hesitationCount > 0) {
      secondaryMetrics.push({ label: 'Hesitations', value: input.metrics.hesitationCount, color: COLORS.purple });
    }
    if (input.metrics.selfCorrectionCount !== undefined && input.metrics.selfCorrectionCount > 0) {
      secondaryMetrics.push({ label: 'Self-Corrections', value: input.metrics.selfCorrectionCount, color: COLORS.success });
    }

    if (secondaryMetrics.length > 0) {
      const smallBoxWidth = Math.min(90, (contentWidth - (secondaryMetrics.length - 1) * 10) / secondaryMetrics.length);
      const startX = 50 + (contentWidth - (smallBoxWidth * secondaryMetrics.length + 10 * (secondaryMetrics.length - 1))) / 2;

      secondaryMetrics.forEach((metric, index) => {
        const x = startX + (index * (smallBoxWidth + 10));

        roundedRect(x, currentY, smallBoxWidth, 40, 4, COLORS.background);

        doc
          .font('Helvetica-Bold')
          .fontSize(16)
          .fillColor(metric.color)
          .text(String(metric.value), x, currentY + 8, {
            width: smallBoxWidth,
            align: 'center',
          });

        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.textMuted)
          .text(metric.label, x, currentY + 27, {
            width: smallBoxWidth,
            align: 'center',
          });
      });

      currentY += 55;
    }

    // =====================================================
    // AI SUMMARY SECTION
    // =====================================================

    if (input.aiSummary) {
      checkPageBreak(150);

      // Section header
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Personalized Feedback', 50, currentY);

      currentY += 25;

      // Summary box
      const summaryHeight = Math.min(120, Math.max(80, input.aiSummary.length / 3));
      roundedRect(50, currentY, contentWidth, summaryHeight, 8, '#f0f9ff');

      // Quote mark decoration
      doc
        .font('Helvetica-Bold')
        .fontSize(40)
        .fillColor('#bfdbfe')
        .text('"', 60, currentY + 5);

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(COLORS.text)
        .text(input.aiSummary, 70, currentY + 15, {
          width: contentWidth - 40,
          lineGap: 4,
        });

      currentY += summaryHeight + 20;
    }

    // =====================================================
    // PATTERN SUMMARY - SEVERITY & ANALYSIS
    // =====================================================

    if (input.patternSummary) {
      const ps = input.patternSummary;

      checkPageBreak(200);

      // Section header with severity badge
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Assessment Analysis', 50, currentY);

      // Severity badge
      const severityConfig = SEVERITY_COLORS[ps.severity];
      const badgeWidth = 120;
      const badgeX = 50 + contentWidth - badgeWidth;

      roundedRect(badgeX, currentY - 3, badgeWidth, 22, 11, severityConfig.bg);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(severityConfig.text)
        .text(severityConfig.label, badgeX, currentY + 3, {
          width: badgeWidth,
          align: 'center',
        });

      currentY += 30;

      // Strengths (always show if available)
      if (ps.strengths.length > 0) {
        roundedRect(50, currentY, contentWidth, 20 + ps.strengths.length * 18, 6, '#dcfce7');

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#166534')
          .text('Strengths', 65, currentY + 8);

        let strengthY = currentY + 26;
        ps.strengths.forEach((strength) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#166534')
            .text(`• ${strength}`, 70, strengthY, { width: contentWidth - 40 });
          strengthY += 18;
        });

        currentY += 30 + ps.strengths.length * 18;
      }

      // Primary Issues
      if (ps.primaryIssues.length > 0) {
        checkPageBreak(30 + ps.primaryIssues.length * 20);

        const issuesBgColor = ps.severity === 'significant' ? '#fee2e2' :
                              ps.severity === 'moderate' ? '#fef3c7' : '#f3f4f6';
        const issuesTextColor = ps.severity === 'significant' ? '#991b1b' :
                                ps.severity === 'moderate' ? '#92400e' : COLORS.text;

        roundedRect(50, currentY, contentWidth, 20 + ps.primaryIssues.length * 20, 6, issuesBgColor);

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(issuesTextColor)
          .text('Areas for Growth', 65, currentY + 8);

        let issueY = currentY + 28;
        ps.primaryIssues.forEach((issue) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(issuesTextColor)
            .text(`• ${issue}`, 70, issueY, { width: contentWidth - 40 });
          issueY += 20;
        });

        currentY += 35 + ps.primaryIssues.length * 20;
      }

      // Recommendations
      if (ps.recommendations.length > 0) {
        checkPageBreak(30 + ps.recommendations.length * 22);

        roundedRect(50, currentY, contentWidth, 20 + ps.recommendations.length * 22, 6, '#dbeafe');

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#1e40af')
          .text('Recommendations', 65, currentY + 8);

        let recY = currentY + 28;
        ps.recommendations.slice(0, 5).forEach((rec, index) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#1e40af')
            .text(`${index + 1}. ${rec}`, 70, recY, { width: contentWidth - 40 });
          recY += 22;
        });

        currentY += 35 + Math.min(ps.recommendations.length, 5) * 22;
      }

      // Referral Suggestions (if any)
      if (ps.referralSuggestions.length > 0) {
        checkPageBreak(30 + ps.referralSuggestions.length * 20);

        roundedRect(50, currentY, contentWidth, 20 + ps.referralSuggestions.length * 20, 6, '#fae8ff');

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#86198f')
          .text('Consider Specialist Consultation', 65, currentY + 8);

        let refY = currentY + 28;
        ps.referralSuggestions.forEach((ref) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#86198f')
            .text(`• ${ref}`, 70, refY, { width: contentWidth - 40 });
          refY += 20;
        });

        currentY += 35 + ps.referralSuggestions.length * 20;
      }
    }

    // =====================================================
    // ERROR PATTERNS DETAIL
    // =====================================================

    // Filter to most important patterns (exclude meta-patterns like hesitation if in summary)
    const significantPatterns = input.errorPatterns.filter(p =>
      p.count >= 2 &&
      !['hesitation', 'repetition', 'self_correction'].includes(p.type)
    ).slice(0, 6);

    if (significantPatterns.length > 0) {
      checkPageBreak(100);

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Error Pattern Details', 50, currentY);

      currentY += 25;

      significantPatterns.forEach((pattern) => {
        checkPageBreak(60);

        // Pattern header
        roundedRect(50, currentY, contentWidth, 50, 6, COLORS.background);

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(COLORS.text)
          .text(pattern.pattern, 65, currentY + 10, { width: contentWidth - 100 });

        // Count badge
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(COLORS.warning)
          .text(`${pattern.count}x`, 50 + contentWidth - 50, currentY + 10, {
            width: 40,
            align: 'right',
          });

        // Examples
        const exampleText = pattern.examples
          .slice(0, 3)
          .map(ex => `"${ex.expected}" → "${ex.spoken}"`)
          .join('   ');

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(COLORS.textLight)
          .text(exampleText, 65, currentY + 30, { width: contentWidth - 40 });

        currentY += 60;
      });
    }

    // =====================================================
    // WORD-BY-WORD SUMMARY (condensed)
    // =====================================================

    // Calculate word stats for a condensed view
    const wordStats = {
      correct: input.words.filter(w => w.status === 'correct').length,
      misread: input.words.filter(w => w.status === 'misread' || w.status === 'substituted').length,
      skipped: input.words.filter(w => w.status === 'skipped').length,
    };

    if (input.words.length > 0) {
      checkPageBreak(80);

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Word Analysis Summary', 50, currentY);

      currentY += 25;

      // Horizontal bar showing proportions
      const barHeight = 24;
      const totalWords = input.words.length;

      const correctWidth = (wordStats.correct / totalWords) * contentWidth;
      const misreadWidth = (wordStats.misread / totalWords) * contentWidth;
      const skippedWidth = (wordStats.skipped / totalWords) * contentWidth;

      // Draw the stacked bar
      let barX = 50;

      if (correctWidth > 0) {
        roundedRect(barX, currentY, correctWidth, barHeight, correctWidth === contentWidth ? 6 : 0, COLORS.success);
        if (correctWidth > 40) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white)
            .text(`${wordStats.correct}`, barX + 8, currentY + 7);
        }
        barX += correctWidth;
      }

      if (misreadWidth > 0) {
        doc.rect(barX, currentY, misreadWidth, barHeight).fill(COLORS.warning);
        if (misreadWidth > 30) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white)
            .text(`${wordStats.misread}`, barX + 8, currentY + 7);
        }
        barX += misreadWidth;
      }

      if (skippedWidth > 0) {
        doc.rect(barX, currentY, skippedWidth, barHeight).fill(COLORS.danger);
        if (skippedWidth > 30) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white)
            .text(`${wordStats.skipped}`, barX + 8, currentY + 7);
        }
      }

      currentY += barHeight + 10;

      // Legend
      const legendItems = [
        { color: COLORS.success, label: `Correct (${wordStats.correct})` },
        { color: COLORS.warning, label: `Misread (${wordStats.misread})` },
        { color: COLORS.danger, label: `Skipped (${wordStats.skipped})` },
      ];

      let legendX = 50;
      legendItems.forEach((item) => {
        if ((item.label.includes('Misread') && wordStats.misread === 0) ||
            (item.label.includes('Skipped') && wordStats.skipped === 0)) {
          return;
        }
        doc.rect(legendX, currentY, 12, 12).fill(item.color);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(COLORS.textLight)
          .text(item.label, legendX + 16, currentY + 1);
        legendX += 120;
      });

      currentY += 30;

      // Show misread words if not too many
      const misreadWords = input.words.filter(w => w.status === 'misread' || w.status === 'substituted');
      if (misreadWords.length > 0 && misreadWords.length <= 15) {
        checkPageBreak(60);

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(COLORS.text)
          .text('Words to Practice:', 50, currentY);

        currentY += 18;

        const wordsPerRow = 4;
        const wordBoxWidth = (contentWidth - 30) / wordsPerRow;

        misreadWords.slice(0, 12).forEach((word, index) => {
          const row = Math.floor(index / wordsPerRow);
          const col = index % wordsPerRow;
          const x = 50 + col * (wordBoxWidth + 10);
          const y = currentY + row * 35;

          if (y > 680) return; // Don't overflow page

          roundedRect(x, y, wordBoxWidth, 30, 4, '#fef3c7');

          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(COLORS.warning)
            .text(word.expected, x + 5, y + 5, { width: wordBoxWidth - 10 });

          if (word.spoken) {
            doc
              .font('Helvetica')
              .fontSize(8)
              .fillColor(COLORS.textMuted)
              .text(`said: "${word.spoken}"`, x + 5, y + 18, { width: wordBoxWidth - 10 });
          }
        });

        currentY += Math.ceil(Math.min(misreadWords.length, 12) / wordsPerRow) * 35 + 10;
      }
    }

    // =====================================================
    // FOOTER ON ALL PAGES
    // =====================================================

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Footer line
      doc
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .moveTo(50, 730)
        .lineTo(50 + contentWidth, 730)
        .stroke();

      // Footer text
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.textMuted)
        .text(
          'Generated by Word Analyzer',
          50,
          738,
          { width: contentWidth / 2, align: 'left' }
        );

      doc
        .text(
          `Page ${i + 1} of ${pages.count}`,
          50 + contentWidth / 2,
          738,
          { width: contentWidth / 2, align: 'right' }
        );
    }

    doc.end();
  });
}
