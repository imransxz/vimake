import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Verifies if a video file is valid and playable
 * @param videoPath Path to the video file
 * @returns Promise that resolves to true if the video is valid, false otherwise
 */
export async function isVideoValid(videoPath: string): Promise<boolean> {
  if (!fs.existsSync(videoPath)) {
    console.error(`Video file does not exist: ${videoPath}`);
    return false;
  }

  const fileSize = fs.statSync(videoPath).size;
  if (fileSize < 1000) {
    console.error(`Video file is too small (${fileSize} bytes): ${videoPath}`);
    return false;
  }

  try {
    // Use ffprobe to check if the file has valid video and audio streams
    return new Promise<boolean>((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height',
        '-of', 'json',
        videoPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(output);
            const hasVideoStream = data.streams && data.streams.length > 0;
            console.log(`Video validation result for ${videoPath}: ${hasVideoStream ? 'Valid' : 'Invalid'}`);
            resolve(hasVideoStream);
          } catch (error) {
            console.error(`Failed to parse ffprobe output: ${error.message}`);
            resolve(false);
          }
        } else {
          console.error(`ffprobe exited with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error(`Error validating video: ${error.message}`);
    return false;
  }
}

/**
 * Attempts to repair a damaged video file
 * @param inputPath Path to the damaged video file
 * @param outputPath Path where the repaired video should be saved
 * @returns Promise that resolves to true if repair was successful, false otherwise
 */
export async function repairVideo(inputPath: string, outputPath: string): Promise<boolean> {
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file does not exist: ${inputPath}`);
    return false;
  }

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    return new Promise<boolean>((resolve) => {
      // Use ffmpeg to try to repair the video by re-encoding it
      const ffmpeg = spawn('ffmpeg', [
        '-err_detect', 'ignore_err',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          // Verify the repaired video
          const isValid = await isVideoValid(outputPath);
          console.log(`Video repair result for ${inputPath}: ${isValid ? 'Success' : 'Failed'}`);
          resolve(isValid);
        } else {
          console.error(`Failed to repair video. FFmpeg exited with code ${code}`);
          console.error(`FFmpeg stderr: ${stderr}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error(`Error repairing video: ${error.message}`);
    return false;
  }
}

/**
 * Scans the output directory for damaged videos and attempts to repair them
 * @param outputDir Directory containing video files to check
 * @returns Promise that resolves when all videos have been checked and repaired if needed
 */
export async function scanAndRepairVideos(outputDir: string = path.join(__dirname, '../../output')): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    console.error(`Output directory does not exist: ${outputDir}`);
    return;
  }

  const videoFiles = fs.readdirSync(outputDir)
    .filter(file => file.endsWith('.mp4'))
    .map(file => path.join(outputDir, file));

  console.log(`Found ${videoFiles.length} video files in ${outputDir}`);

  for (const videoPath of videoFiles) {
    console.log(`Checking video: ${videoPath}`);
    const isValid = await isVideoValid(videoPath);

    if (!isValid) {
      console.log(`Video is damaged, attempting to repair: ${videoPath}`);
      const repairPath = `${videoPath}.repaired.mp4`;
      const repaired = await repairVideo(videoPath, repairPath);

      if (repaired) {
        console.log(`Successfully repaired video. Replacing original with repaired version.`);
        // Backup the original file
        const backupPath = `${videoPath}.backup`;
        fs.renameSync(videoPath, backupPath);
        fs.renameSync(repairPath, videoPath);
      } else {
        console.error(`Failed to repair video: ${videoPath}`);
      }
    } else {
      console.log(`Video is valid: ${videoPath}`);
    }
  }
} 