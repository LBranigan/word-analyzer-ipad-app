import PDFDocument from 'pdfkit';

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
  };
  words: Array<{
    expected: string;
    spoken: string | null;
    status: 'correct' | 'misread' | 'substituted' | 'skipped';
  }>;
  errorPatterns: Array<{
    pattern: string;
    count: number;
    examples: Array<{ expected: string; spoken: string }>;
  }>;
}

/**
 * Generate a PDF report for an assessment
 * Returns a Buffer containing the PDF data
 */
export async function generatePdfReport(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Oral Fluency Assessment - ${input.studentName}`,
        Author: 'Word Analyzer',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Oral Fluency Assessment Report', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .fontSize(14)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Student: ${input.studentName}`, { align: 'center' });

    doc.text(
      `Date: ${input.assessmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      { align: 'center' }
    );

    doc.moveDown(1.5);

    // Summary Box
    const boxY = doc.y;
    doc
      .rect(50, boxY, 495, 100)
      .fill('#f0f9ff');

    doc
      .fillColor('#1e3a5f')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Summary', 70, boxY + 15);

    doc
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#333333')
      .text(
        `${input.studentName} read ${input.metrics.totalWords} words at ${input.metrics.wordsPerMinute} words per minute with ${input.metrics.accuracy}% accuracy.`,
        70,
        boxY + 45,
        { width: 455 }
      );

    if (input.metrics.prosodyGrade) {
      doc.text(`Prosody Grade: ${input.metrics.prosodyGrade}`, 70, boxY + 70);
    }

    doc.y = boxY + 120;

    // Key Metrics
    doc.moveDown(0.5);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1e3a5f')
      .text('Key Metrics');

    doc.moveDown(0.5);

    // Metrics grid
    const metricsStartY = doc.y;
    const colWidth = 120;
    const metrics = [
      { label: 'Accuracy', value: `${input.metrics.accuracy}%`, color: '#22c55e' },
      { label: 'Words/Minute', value: `${input.metrics.wordsPerMinute}`, color: '#3b82f6' },
      { label: 'Total Words', value: `${input.metrics.totalWords}`, color: '#8b5cf6' },
      { label: 'Errors', value: `${input.metrics.errorCount}`, color: '#ef4444' },
    ];

    metrics.forEach((metric, index) => {
      const x = 50 + (index * colWidth);

      // Box
      doc
        .rect(x, metricsStartY, colWidth - 10, 60)
        .lineWidth(2)
        .stroke(metric.color);

      // Value
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor(metric.color)
        .text(metric.value, x, metricsStartY + 10, {
          width: colWidth - 10,
          align: 'center',
        });

      // Label
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(metric.label, x, metricsStartY + 42, {
          width: colWidth - 10,
          align: 'center',
        });
    });

    doc.y = metricsStartY + 80;

    // Word Analysis
    doc.moveDown(1);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1e3a5f')
      .text('Word Analysis');

    doc.moveDown(0.5);

    // Legend
    const legendY = doc.y;
    const legendItems = [
      { color: '#bbf7d0', label: 'Correct' },
      { color: '#fef08a', label: 'Misread' },
      { color: '#fecaca', label: 'Substituted' },
      { color: '#e2e8f0', label: 'Skipped' },
    ];

    legendItems.forEach((item, index) => {
      const x = 50 + (index * 110);
      doc.rect(x, legendY, 12, 12).fill(item.color);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#333333')
        .text(item.label, x + 16, legendY + 1);
    });

    doc.y = legendY + 25;

    // Words
    const wordsStartY = doc.y;
    let wordX = 50;
    let wordY = wordsStartY;
    const maxWidth = 495;
    const lineHeight = 22;

    doc.fontSize(11).font('Helvetica');

    input.words.forEach((word) => {
      const wordWidth = doc.widthOfString(word.expected) + 12;

      // Check if we need to wrap
      if (wordX + wordWidth > 50 + maxWidth) {
        wordX = 50;
        wordY += lineHeight;

        // Check if we need a new page
        if (wordY > 750) {
          doc.addPage();
          wordY = 50;
        }
      }

      // Get background color
      let bgColor = '#ffffff';
      switch (word.status) {
        case 'correct':
          bgColor = '#bbf7d0';
          break;
        case 'misread':
          bgColor = '#fef08a';
          break;
        case 'substituted':
          bgColor = '#fecaca';
          break;
        case 'skipped':
          bgColor = '#e2e8f0';
          break;
      }

      // Draw word box
      doc.rect(wordX, wordY, wordWidth - 4, lineHeight - 4).fill(bgColor);
      doc
        .fillColor('#333333')
        .text(word.expected, wordX + 4, wordY + 4, { lineBreak: false });

      wordX += wordWidth;
    });

    doc.y = wordY + lineHeight + 20;

    // Error Patterns (if any and if space allows)
    if (input.errorPatterns.length > 0 && doc.y < 650) {
      doc.moveDown(1);
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('Error Patterns');

      doc.moveDown(0.5);

      input.errorPatterns.slice(0, 5).forEach((pattern) => {
        if (doc.y > 750) {
          doc.addPage();
        }

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#333333')
          .text(`${pattern.pattern} (${pattern.count} errors)`);

        doc.fontSize(10).font('Helvetica').fillColor('#666666');

        pattern.examples.slice(0, 2).forEach((ex) => {
          doc.text(`  "${ex.expected}" → "${ex.spoken}"`);
        });

        doc.moveDown(0.5);
      });
    }

    // Add footer to current page only (avoids bufferedPageRange issues)
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#999999')
      .text(
        'Generated by Word Analyzer',
        50,
        doc.page.height - 40,
        { align: 'center', width: 495 }
      );

    doc.end();
  });
}
