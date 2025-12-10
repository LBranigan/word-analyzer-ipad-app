import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { transcribeAudio } from './services/speechToText';
import { extractTextFromImage } from './services/visionOcr';
import { matchWords } from './services/wordMatching';
import { calculateMetrics, analyzeErrorPatterns } from './services/metricsCalculator';

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

/**
 * Triggered when a file is uploaded to the uploads/ folder
 * Expected path: uploads/{teacherId}/{assessmentId}/audio.webm or image.jpg
 */
export const processAssessment = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '1GB',
  })
  .storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath) return;

    // Only process files in uploads/ folder
    if (!filePath.startsWith('uploads/')) return;

    const pathParts = filePath.split('/');
    // Expected: uploads/{teacherId}/{assessmentId}/{filename}
    if (pathParts.length !== 4) return;

    const [, teacherId, assessmentId, fileName] = pathParts;

    console.log(`Processing file: ${filePath}`);
    console.log(`Teacher: ${teacherId}, Assessment: ${assessmentId}, File: ${fileName}`);

    // Check if this is the second file (we need both audio and image)
    const assessmentRef = db.collection('teachers').doc(teacherId)
      .collection('assessments').doc(assessmentId);

    const bucket = storage.bucket(object.bucket);
    const uploadsPrefix = `uploads/${teacherId}/${assessmentId}/`;

    const [files] = await bucket.getFiles({ prefix: uploadsPrefix });

    // Wait for both files
    const hasAudio = files.some(f => f.name.includes('audio'));
    const hasImage = files.some(f => f.name.includes('image'));

    if (!hasAudio || !hasImage) {
      console.log('Waiting for both files to be uploaded...');
      return;
    }

    console.log('Both files present, starting processing...');

    try {
      // Update status to processing
      await assessmentRef.update({ status: 'processing' });

      // Download files
      const audioFile = files.find(f => f.name.includes('audio'))!;
      const imageFile = files.find(f => f.name.includes('image'))!;

      const [audioBuffer] = await audioFile.download();
      const [imageBuffer] = await imageFile.download();

      console.log('Files downloaded, calling APIs...');

      // Call Speech-to-Text
      const transcription = await transcribeAudio(
        audioBuffer,
        object.contentType || 'audio/webm'
      );
      console.log(`Transcription: "${transcription.transcript.substring(0, 100)}..."`);

      // Call Vision OCR
      const ocrResult = await extractTextFromImage(imageBuffer);
      console.log(`OCR extracted ${ocrResult.words.length} words`);

      // Parse OCR text into word array
      const expectedWords = ocrResult.fullText
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9']/g, ''))
        .filter(w => w.length > 0);

      // Match words
      const matchingResult = matchWords(expectedWords, transcription.words);
      console.log(`Matching complete: ${matchingResult.correctCount} correct, ${matchingResult.errorCount} errors`);

      // Calculate metrics
      const audioDuration = transcription.words.length > 0
        ? transcription.words[transcription.words.length - 1].endTime
        : 0;
      const metrics = calculateMetrics(matchingResult, audioDuration);

      // Analyze error patterns
      const errorPatterns = analyzeErrorPatterns(matchingResult.words);

      // Move audio to temp bucket for playback (24h TTL handled by lifecycle rule)
      const tempAudioPath = `audio-temp/${teacherId}/${assessmentId}/audio.webm`;
      await bucket.file(audioFile.name).copy(bucket.file(tempAudioPath));

      // Generate signed URL for audio (expires in 24h)
      const [audioUrl] = await bucket.file(tempAudioPath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });

      // Save results to Firestore
      await assessmentRef.update({
        status: 'complete',
        audioUrl,
        audioDuration,
        ocrText: ocrResult.fullText,
        transcript: transcription.transcript,
        metrics: {
          accuracy: metrics.accuracy,
          wordsPerMinute: metrics.wordsPerMinute,
          prosodyScore: metrics.prosodyScore,
          prosodyGrade: metrics.prosodyGrade,
          totalWords: metrics.totalWords,
          correctCount: metrics.correctCount,
          errorCount: metrics.errorCount,
          skipCount: metrics.skipCount,
        },
        words: matchingResult.words,
        errorPatterns,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Results saved to Firestore');

      // Delete original uploads
      await audioFile.delete();
      await imageFile.delete();
      console.log('Original uploads deleted');

    } catch (error) {
      console.error('Processing error:', error);

      await assessmentRef.update({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
