"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAssessmentPdf = exports.generateAssessmentVideo = exports.processAssessment = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const speechToText_1 = require("./services/speechToText");
const visionOcr_1 = require("./services/visionOcr");
const wordMatching_1 = require("./services/wordMatching");
const metricsCalculator_1 = require("./services/metricsCalculator");
const videoGenerator_1 = require("./services/videoGenerator");
const pdfGenerator_1 = require("./services/pdfGenerator");
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
/**
 * Triggered when a file is uploaded to the uploads/ folder
 * Expected path: uploads/{teacherId}/{assessmentId}/audio.webm or image.jpg
 */
exports.processAssessment = functions
    .runWith({
    timeoutSeconds: 300,
    memory: '1GB',
})
    .storage
    .object()
    .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath)
        return;
    // Only process files in uploads/ folder
    if (!filePath.startsWith('uploads/'))
        return;
    const pathParts = filePath.split('/');
    // Expected: uploads/{teacherId}/{assessmentId}/{filename}
    if (pathParts.length !== 4)
        return;
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
    // Use Firestore transaction to prevent race condition
    // Only one function instance should process the assessment
    const lockAcquired = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(assessmentRef);
        if (!doc.exists) {
            console.log('Assessment document does not exist');
            return false;
        }
        const data = doc.data();
        // Only proceed if status is 'uploading' (initial status from client)
        // Skip if already 'processing' or 'complete' to prevent race conditions
        if ((data === null || data === void 0 ? void 0 : data.status) !== 'uploading') {
            console.log(`Assessment status is ${data === null || data === void 0 ? void 0 : data.status}, skipping...`);
            return false;
        }
        // Set status to processing atomically
        transaction.update(assessmentRef, { status: 'processing' });
        return true;
    });
    if (!lockAcquired) {
        console.log('Lock not acquired, another instance is processing');
        return;
    }
    console.log('Lock acquired, proceeding with processing...');
    try {
        // Re-fetch files to ensure they still exist (in case of race condition)
        const [currentFiles] = await bucket.getFiles({ prefix: uploadsPrefix });
        const audioFile = currentFiles.find(f => f.name.includes('audio'));
        const imageFile = currentFiles.find(f => f.name.includes('image'));
        if (!audioFile || !imageFile) {
            console.error('Files no longer exist after acquiring lock');
            await assessmentRef.update({
                status: 'error',
                errorMessage: 'Upload files were not found. Please try again.',
            });
            return;
        }
        // Verify files exist by checking their existence
        const [audioExists] = await audioFile.exists();
        const [imageExists] = await imageFile.exists();
        if (!audioExists || !imageExists) {
            console.error('Files do not exist after verification');
            await assessmentRef.update({
                status: 'error',
                errorMessage: 'Upload files could not be verified. Please try again.',
            });
            return;
        }
        // Get the actual audio file's metadata for content type
        const [audioMetadata] = await audioFile.getMetadata();
        const audioContentType = audioMetadata.contentType || 'audio/webm';
        console.log(`Audio content type: ${audioContentType}`);
        // Download image for Vision OCR (it uses buffer)
        const [imageBuffer] = await imageFile.download();
        // Build GCS URI for Speech-to-Text (uses URI for long audio)
        const gcsUri = `gs://${bucket.name}/${audioFile.name}`;
        console.log(`Audio GCS URI: ${gcsUri}`);
        console.log('Calling Speech-to-Text API...');
        // Call Speech-to-Text with GCS URI (handles long audio)
        const transcription = await (0, speechToText_1.transcribeAudio)(gcsUri, audioContentType);
        console.log(`Transcription: "${transcription.transcript.substring(0, 100)}..."`);
        // Call Vision OCR
        const ocrResult = await (0, visionOcr_1.extractTextFromImage)(imageBuffer);
        console.log(`OCR extracted ${ocrResult.words.length} words`);
        // Parse OCR text into word array
        const expectedWords = ocrResult.fullText
            .split(/\s+/)
            .map(w => w.replace(/[^a-zA-Z0-9']/g, ''))
            .filter(w => w.length > 0);
        // Match words
        const matchingResult = (0, wordMatching_1.matchWords)(expectedWords, transcription.words);
        console.log(`Matching complete: ${matchingResult.correctCount} correct, ${matchingResult.errorCount} errors`);
        // Calculate metrics
        const audioDuration = transcription.words.length > 0
            ? transcription.words[transcription.words.length - 1].endTime
            : 0;
        const metrics = (0, metricsCalculator_1.calculateMetrics)(matchingResult, audioDuration);
        // Analyze error patterns
        const errorPatterns = (0, metricsCalculator_1.analyzeErrorPatterns)(matchingResult.words);
        // Move audio to temp bucket for playback (24h TTL handled by lifecycle rule)
        const tempAudioPath = `audio-temp/${teacherId}/${assessmentId}/audio.webm`;
        const audioDownloadToken = (0, uuid_1.v4)();
        // Copy audio file
        await bucket.file(audioFile.name).copy(bucket.file(tempAudioPath));
        // Set download token metadata for public access
        await bucket.file(tempAudioPath).setMetadata({
            metadata: {
                firebaseStorageDownloadTokens: audioDownloadToken,
            },
        });
        // Generate public download URL for audio
        const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(tempAudioPath)}?alt=media&token=${audioDownloadToken}`;
        // Move image to temp bucket for display
        const tempImagePath = `images-temp/${teacherId}/${assessmentId}/image.jpg`;
        const imageDownloadToken = (0, uuid_1.v4)();
        // Copy image file
        await bucket.file(imageFile.name).copy(bucket.file(tempImagePath));
        // Set download token metadata for public access
        await bucket.file(tempImagePath).setMetadata({
            metadata: {
                firebaseStorageDownloadTokens: imageDownloadToken,
            },
        });
        // Generate public download URL for image
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(tempImagePath)}?alt=media&token=${imageDownloadToken}`;
        // Save results to Firestore
        await assessmentRef.update({
            status: 'complete',
            audioUrl,
            imageUrl,
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
                hesitationCount: metrics.hesitationCount,
                fillerWordCount: metrics.fillerWordCount,
                repeatCount: metrics.repeatCount,
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
    }
    catch (error) {
        console.error('Processing error:', error);
        await assessmentRef.update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * Callable function to generate a video for an assessment
 * Called on-demand when user requests video download
 */
exports.generateAssessmentVideo = functions
    .runWith({
    timeoutSeconds: 540,
    memory: '2GB',
})
    .https
    .onCall(async (data, context) => {
    var _a;
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teacherId, assessmentId } = data;
    const userId = context.auth.uid;
    // Verify the user owns this assessment
    if (teacherId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only generate videos for your own assessments');
    }
    // Get the assessment data
    const assessmentRef = db.collection('teachers').doc(teacherId)
        .collection('assessments').doc(assessmentId);
    const assessmentDoc = await assessmentRef.get();
    if (!assessmentDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Assessment not found');
    }
    const assessmentData = assessmentDoc.data();
    // Check if video already exists
    if (assessmentData.videoUrl) {
        return { videoUrl: assessmentData.videoUrl };
    }
    // Check if assessment is complete
    if (assessmentData.status !== 'complete') {
        throw new functions.https.HttpsError('failed-precondition', 'Assessment must be complete before generating video');
    }
    // Update status to indicate video is being generated
    await assessmentRef.update({ videoStatus: 'generating' });
    try {
        const bucket = storage.bucket();
        // Download the audio file
        const audioPath = `audio-temp/${teacherId}/${assessmentId}/audio.webm`;
        const tempAudioPath = path.join(os.tmpdir(), `audio-${assessmentId}.webm`);
        await bucket.file(audioPath).download({ destination: tempAudioPath });
        // Generate video
        const tempVideoPath = path.join(os.tmpdir(), `video-${assessmentId}.mp4`);
        await (0, videoGenerator_1.generateVideo)({
            words: assessmentData.words,
            audioDuration: assessmentData.audioDuration,
            studentName: assessmentData.studentName || 'Unknown Student',
            wpm: ((_a = assessmentData.metrics) === null || _a === void 0 ? void 0 : _a.wordsPerMinute) || 0,
        }, tempAudioPath, tempVideoPath);
        // Upload video to storage
        const videoStoragePath = `videos/${teacherId}/${assessmentId}/video.mp4`;
        const downloadToken = (0, uuid_1.v4)();
        await bucket.upload(tempVideoPath, {
            destination: videoStoragePath,
            metadata: {
                contentType: 'video/mp4',
                metadata: {
                    firebaseStorageDownloadTokens: downloadToken,
                },
            },
        });
        // Generate download URL
        const videoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(videoStoragePath)}?alt=media&token=${downloadToken}`;
        // Update assessment with video URL
        await assessmentRef.update({
            videoUrl,
            videoStatus: 'complete',
            videoGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Clean up temp files
        fs.unlinkSync(tempAudioPath);
        fs.unlinkSync(tempVideoPath);
        console.log(`Video generated successfully for assessment ${assessmentId}`);
        return { videoUrl };
    }
    catch (error) {
        console.error('Video generation error:', error);
        await assessmentRef.update({
            videoStatus: 'error',
            videoError: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new functions.https.HttpsError('internal', 'Failed to generate video');
    }
});
/**
 * Callable function to generate a PDF report for an assessment
 */
exports.generateAssessmentPdf = functions
    .runWith({
    timeoutSeconds: 120,
    memory: '512MB',
})
    .https
    .onCall(async (data, context) => {
    var _a;
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teacherId, assessmentId } = data;
    const userId = context.auth.uid;
    // Verify the user owns this assessment
    if (teacherId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only generate PDFs for your own assessments');
    }
    // Get the assessment data
    const assessmentRef = db.collection('teachers').doc(teacherId)
        .collection('assessments').doc(assessmentId);
    const assessmentDoc = await assessmentRef.get();
    if (!assessmentDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Assessment not found');
    }
    const assessmentData = assessmentDoc.data();
    // Check if assessment is complete
    if (assessmentData.status !== 'complete') {
        throw new functions.https.HttpsError('failed-precondition', 'Assessment must be complete before generating PDF');
    }
    try {
        const bucket = storage.bucket();
        // Generate PDF
        const pdfBuffer = await (0, pdfGenerator_1.generatePdfReport)({
            studentName: assessmentData.studentName,
            assessmentDate: ((_a = assessmentData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date(),
            metrics: assessmentData.metrics || {
                accuracy: 0,
                wordsPerMinute: 0,
                prosodyScore: 0,
                prosodyGrade: '',
                totalWords: 0,
                correctCount: 0,
                errorCount: 0,
                skipCount: 0,
            },
            words: assessmentData.words || [],
            errorPatterns: assessmentData.errorPatterns || [],
        });
        // Upload PDF to storage
        const pdfStoragePath = `pdfs/${teacherId}/${assessmentId}/report.pdf`;
        const downloadToken = (0, uuid_1.v4)();
        const pdfFile = bucket.file(pdfStoragePath);
        await pdfFile.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                metadata: {
                    firebaseStorageDownloadTokens: downloadToken,
                },
            },
        });
        // Generate download URL
        const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pdfStoragePath)}?alt=media&token=${downloadToken}`;
        // Update assessment with PDF URL
        await assessmentRef.update({
            pdfUrl,
            pdfGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`PDF generated successfully for assessment ${assessmentId}`);
        return { pdfUrl };
    }
    catch (error) {
        console.error('PDF generation error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to generate PDF');
    }
});
//# sourceMappingURL=index.js.map