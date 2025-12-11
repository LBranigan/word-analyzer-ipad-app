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

/**
 * Generate a video with word highlighting synchronized to audio
 * Returns the path to the generated video file
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
  const fps = 30;
  const padding = 60;
  const lineHeight = 50;
  const fontSize = 36;

  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Prepare word layouts
  const wordLayouts = prepareWordLayouts(words, ctx, width, padding, lineHeight, fontSize);

  // Create temporary directory for frames
  const tempDir = path.join(os.tmpdir(), `video-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Generate frames
  const totalFrames = Math.ceil(audioDuration * fps);
  console.log(`Generating ${totalFrames} frames for ${audioDuration}s video...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = frame / fps;
    renderFrame(ctx, canvas, wordLayouts, currentTime, padding, fontSize, studentName, wpm);

    // Save frame
    const framePath = path.join(tempDir, `frame-${String(frame).padStart(6, '0')}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(framePath, buffer);

    // Log progress every 100 frames
    if (frame % 100 === 0) {
      console.log(`Generated frame ${frame}/${totalFrames}`);
    }
  }

  console.log('All frames generated, creating video...');

  // Combine frames with audio using FFmpeg
  return new Promise((resolve, reject) => {
    const framePattern = path.join(tempDir, 'frame-%06d.png');

    ffmpeg()
      .input(framePattern)
      .inputFPS(fps)
      .input(audioPath)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-shortest',
        '-movflags +faststart'
      ])
      .output(outputPath)
      .on('end', () => {
        // Clean up temp frames
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('Video generation complete');
        resolve(outputPath);
      })
      .on('error', (err) => {
        // Clean up temp frames
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .run();
  });
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

    // Draw hesitation indicator (purple dotted line above word)
    if (layout.hesitation) {
      ctx.fillStyle = '#7c3aed'; // Purple
      ctx.font = '14px Arial';
      // Draw pause indicator above the word
      const pauseMs = layout.pauseDuration ? Math.round(layout.pauseDuration * 1000) : 500;
      ctx.fillText(`⏸ ${pauseMs}ms`, layout.x, layout.y - fontSize - 5);
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
      switch (layout.status) {
        case 'correct':
          color = '#22c55e'; // Bright green
          break;
        case 'misread':
        case 'substituted':
          color = '#f97316'; // Orange
          break;
        case 'skipped':
          color = '#ef4444'; // Red
          break;
      }
      // Add purple tint if hesitation
      if (layout.hesitation) {
        color = '#7c3aed'; // Purple for hesitation
      }
    } else if (currentTime > layout.endTime) {
      // Already spoken - use dimmer colors
      switch (layout.status) {
        case 'correct':
          color = '#86efac'; // Light green
          break;
        case 'misread':
        case 'substituted':
          color = '#fdba74'; // Light orange
          break;
        case 'skipped':
          color = '#fca5a5'; // Light red
          break;
      }
      // Add purple tint if hesitation
      if (layout.hesitation) {
        color = '#c4b5fd'; // Light purple for hesitation
      }
    }
  } else {
    // No timing data - use status colors dimly
    switch (layout.status) {
      case 'correct':
        color = '#86efac';
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
