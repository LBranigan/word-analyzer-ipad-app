import { createCanvas, CanvasRenderingContext2D, Canvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Use node-canvas types explicitly
type NodeCanvasContext = CanvasRenderingContext2D;
type NodeCanvas = Canvas;

export interface WordLayout {
  word: string;
  x: number;
  y: number;
  width: number;
  status: 'correct' | 'misread' | 'skipped' | 'substituted';
  startTime?: number;
  endTime?: number;
  hesitation?: boolean;
  pauseDuration?: number;
  isRepeat?: boolean;
}

export interface VideoGeneratorInput {
  words: Array<{
    expected: string;
    spoken?: string | null;
    status: 'correct' | 'misread' | 'skipped' | 'substituted';
    startTime?: number;
    endTime?: number;
    hesitation?: boolean;
    pauseDuration?: number;
    isRepeat?: boolean;
  }>;
  audioDuration: number;
  studentName: string;
  wpm: number;
}

interface KeyFrame {
  time: number;
  duration: number;
  imagePath: string;
}

/**
 * Generate a video with word highlighting synchronized to audio
 * OPTIMIZED: Uses keyframe-only approach - generates frames only when word states change
 * This reduces frame count from 1800+ to ~100-200 frames for a 60s video
 */
export async function generateVideo(
  input: VideoGeneratorInput,
  audioPath: string,
  outputPath: string
): Promise<string> {
  const { words, audioDuration, studentName, wpm } = input;

  // Video settings
  const width = 1280;
  const height = 720;
  const padding = 60;
  const lineHeight = 50;
  const fontSize = 36;

  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Prepare word layouts
  const wordLayouts = prepareWordLayouts(words, ctx, width, padding, lineHeight, fontSize);

  // Create temporary directory for keyframes
  const tempDir = path.join(os.tmpdir(), `video-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Find all transition points (when word highlighting changes)
  const transitionTimes = findTransitionTimes(wordLayouts, audioDuration);
  console.log(`Found ${transitionTimes.length} transition points (vs ${Math.ceil(audioDuration * 30)} frames at 30fps)`);

  // Generate keyframes only at transition points
  const keyframes: KeyFrame[] = [];

  for (let i = 0; i < transitionTimes.length; i++) {
    const currentTime = transitionTimes[i];
    const nextTime = transitionTimes[i + 1] ?? audioDuration;
    const duration = nextTime - currentTime;

    // Skip very short durations (less than 1 frame at 30fps)
    if (duration < 0.033) continue;

    renderFrame(ctx, canvas, wordLayouts, currentTime, padding, fontSize, studentName, wpm);

    // Save keyframe as JPEG (much faster than PNG, minimal quality loss)
    const framePath = path.join(tempDir, `frame-${String(i).padStart(4, '0')}.jpg`);
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
    fs.writeFileSync(framePath, buffer);

    keyframes.push({
      time: currentTime,
      duration: duration,
      imagePath: framePath,
    });

    // Log progress every 50 keyframes
    if (i % 50 === 0) {
      console.log(`Generated keyframe ${i}/${transitionTimes.length}`);
    }
  }

  console.log(`Generated ${keyframes.length} keyframes, creating video...`);

  // Create concat file for FFmpeg
  const concatFilePath = path.join(tempDir, 'concat.txt');
  const concatContent = keyframes
    .map(kf => `file '${kf.imagePath.replace(/\\/g, '/')}'\nduration ${kf.duration.toFixed(4)}`)
    .join('\n');

  // Add last frame again (FFmpeg concat demuxer quirk)
  const lastFrame = keyframes[keyframes.length - 1];
  const fullConcatContent = concatContent + `\nfile '${lastFrame.imagePath.replace(/\\/g, '/')}'`;
  fs.writeFileSync(concatFilePath, fullConcatContent);

  // Combine keyframes with audio using FFmpeg concat demuxer
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFilePath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',        // Faster encoding (was default/medium)
        '-crf 23',             // Good quality (lower = better, 18-28 typical)
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
        '-movflags +faststart',
        '-vsync vfr',          // Variable frame rate (matches our keyframe approach)
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Encoding: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        // Clean up temp files
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('Video generation complete');
        resolve(outputPath);
      })
      .on('error', (err) => {
        // Clean up temp files
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Find all times when the visual state of the video changes
 * This includes: start of video, each word start, each word end, end of video
 */
function findTransitionTimes(wordLayouts: WordLayout[], audioDuration: number): number[] {
  const times = new Set<number>();

  // Always include start
  times.add(0);

  // Add all word transitions
  wordLayouts.forEach(layout => {
    if (layout.startTime !== undefined) {
      times.add(layout.startTime);
    }
    if (layout.endTime !== undefined) {
      times.add(layout.endTime);
      // Add a tiny bit after end time to show the "dimmed" state
      times.add(layout.endTime + 0.001);
    }
  });

  // Add end of audio
  times.add(audioDuration);

  // Sort and return
  return Array.from(times).sort((a, b) => a - b);
}

/**
 * Prepare word layouts for video rendering
 */
function prepareWordLayouts(
  words: VideoGeneratorInput['words'],
  ctx: NodeCanvasContext,
  canvasWidth: number,
  padding: number,
  lineHeight: number,
  fontSize: number
): WordLayout[] {
  const wordLayouts: WordLayout[] = [];
  let xPos = padding;
  let yPos = padding + fontSize + 50; // Leave room for header

  ctx.font = `${fontSize}px Arial`;

  words.forEach((item) => {
    const word = item.expected;
    const wordWidth = ctx.measureText(word + ' ').width;

    // Wrap to next line if needed
    if (xPos + wordWidth > canvasWidth - padding) {
      xPos = padding;
      yPos += lineHeight;
    }

    wordLayouts.push({
      word: word,
      x: xPos,
      y: yPos,
      width: wordWidth,
      status: item.status,
      startTime: item.startTime,
      endTime: item.endTime,
      hesitation: item.hesitation,
      pauseDuration: item.pauseDuration,
      isRepeat: item.isRepeat,
    });

    xPos += wordWidth;
  });

  return wordLayouts;
}

/**
 * Render a single video frame
 */
function renderFrame(
  ctx: NodeCanvasContext,
  canvas: NodeCanvas,
  wordLayouts: WordLayout[],
  currentTime: number,
  padding: number,
  fontSize: number,
  studentName: string,
  wpm: number
): void {
  // Clear canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw header
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('Oral Fluency Analysis', padding, 35);

  // Draw student info
  ctx.font = '20px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText(`Student: ${studentName}  |  WPM: ${wpm}`, padding, 65);

  // Draw each word with appropriate highlighting
  wordLayouts.forEach((layout) => {
    const { color, isCurrentWord } = getWordColor(layout, currentTime);

    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(layout.word, layout.x, layout.y);

    // Draw underline for current word
    if (isCurrentWord) {
      ctx.fillRect(layout.x, layout.y + 8, layout.width - 10, 3);
    }

    // Draw repeat indicator (small "↺" symbol after word)
    if (layout.isRepeat) {
      ctx.fillStyle = '#9333ea'; // Darker purple
      ctx.font = '18px Arial';
      ctx.fillText('↺', layout.x + layout.width - 20, layout.y);
    }
  });

  // Draw legend at bottom
  drawLegend(ctx, canvas.width, canvas.height, padding);

  // Draw progress bar
  const progressWidth = canvas.width - (padding * 2);
  const progressY = canvas.height - 80;

  // Background
  ctx.fillStyle = '#e5e5e5';
  ctx.fillRect(padding, progressY, progressWidth, 8);

  // Find total duration from word timings
  let maxEndTime = 0;
  wordLayouts.forEach((w) => {
    if (w.endTime && w.endTime > maxEndTime) {
      maxEndTime = w.endTime;
    }
  });

  if (maxEndTime > 0) {
    const progress = Math.min(currentTime / maxEndTime, 1);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(padding, progressY, progressWidth * progress, 8);
  }
}

/**
 * Get color for word based on status and timing
 * Priority: misread/substituted/skipped errors take precedence over hesitation
 * Hesitation (purple) only shows if word was otherwise read correctly
 */
function getWordColor(
  layout: WordLayout,
  currentTime: number
): { color: string; isCurrentWord: boolean } {
  let color = '#cccccc'; // Default: not yet spoken
  let isCurrentWord = false;

  // Check if this word is being spoken right now
  if (layout.startTime !== undefined && layout.endTime !== undefined) {
    if (currentTime >= layout.startTime && currentTime <= layout.endTime) {
      isCurrentWord = true;
      // Highlight current word based on status
      // Error colors take priority over hesitation
      switch (layout.status) {
        case 'correct':
          // Only show purple hesitation if word was read correctly
          color = layout.hesitation ? '#7c3aed' : '#22c55e'; // Purple if hesitation, else green
          break;
        case 'misread':
        case 'substituted':
          color = '#f97316'; // Orange - takes priority over hesitation
          break;
        case 'skipped':
          color = '#ef4444'; // Red - takes priority over hesitation
          break;
      }
    } else if (currentTime > layout.endTime) {
      // Already spoken - use dimmer colors
      switch (layout.status) {
        case 'correct':
          // Only show light purple hesitation if word was read correctly
          color = layout.hesitation ? '#c4b5fd' : '#86efac'; // Light purple if hesitation, else light green
          break;
        case 'misread':
        case 'substituted':
          color = '#fdba74'; // Light orange - takes priority over hesitation
          break;
        case 'skipped':
          color = '#fca5a5'; // Light red - takes priority over hesitation
          break;
      }
    }
  } else {
    // No timing data - use status colors dimly
    switch (layout.status) {
      case 'correct':
        color = layout.hesitation ? '#c4b5fd' : '#86efac';
        break;
      case 'misread':
      case 'substituted':
        color = '#fdba74';
        break;
      case 'skipped':
        color = '#fca5a5';
        break;
    }
  }

  return { color, isCurrentWord };
}

/**
 * Draw legend at bottom of video frame
 */
function drawLegend(
  ctx: NodeCanvasContext,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): void {
  const legendY = canvasHeight - 40;
  ctx.font = '16px Arial';

  ctx.fillStyle = '#22c55e';
  ctx.fillText('● Correct', padding, legendY);

  ctx.fillStyle = '#f97316';
  ctx.fillText('● Misread', padding + 100, legendY);

  ctx.fillStyle = '#ef4444';
  ctx.fillText('● Skipped', padding + 200, legendY);

  ctx.fillStyle = '#7c3aed';
  ctx.fillText('● Hesitation', padding + 300, legendY);

  ctx.fillStyle = '#9333ea';
  ctx.fillText('↺ Repeat', padding + 420, legendY);

  ctx.fillStyle = '#cccccc';
  ctx.fillText('● Not Yet Spoken', padding + 530, legendY);
}
