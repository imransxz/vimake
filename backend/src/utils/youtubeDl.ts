import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DownloadOptions {
  start_time: number;
  duration: number;
  ytdlpOptions?: string[];
}

export async function downloadVideo(url: string, options: {
  output: string;
  format: string;
  downloadOptions: DownloadOptions;
}): Promise<void> {
  try {
    const startTime = options.downloadOptions?.start_time ?? 0;
    const duration = options.downloadOptions?.duration;

    console.log(`Downloading video from ${url} starting at ${startTime}s with duration ${duration}s`);

    // Ensure output directory exists
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Ensure output path has proper extension
    const outputPath = options.output.endsWith('.mp4') ? options.output : `${options.output}.mp4`;
    
    // Debug output path
    console.log('Original output path:', options.output);
    console.log('Corrected output path:', outputPath);
    console.log('Output directory exists:', fs.existsSync(outputDir));

    // Créer un nom de fichier temporaire pour le téléchargement initial
    const tempFile = path.join(outputDir, `temp_${Date.now()}.mp4`);

    // Construire la commande yt-dlp pour télécharger la vidéo complète
    const args = [
      url,
      '--format', 'bestvideo[height>=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      '--merge-output-format', 'mp4',
      '-S', 'res,ext:mp4:m4a',
      '--output', tempFile,
      '--no-playlist',
      '--retries', '3'
    ];

    console.log('Downloading video with yt-dlp...');

    // Télécharger la vidéo complète
    await new Promise<void>((resolve, reject) => {
      const ytDlp = spawn('yt-dlp', args);
      
      let errorOutput = '';
      
      ytDlp.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.log('yt-dlp stderr:', message);
      });

      ytDlp.stdout.on('data', (data) => {
        console.log('yt-dlp stdout:', data.toString());
      });

      ytDlp.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempFile)) {
          resolve();
        } else {
          reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
        }
      });
    });

    // Vérifier que le fichier temporaire existe et contient de la vidéo
    const hasVideo = await new Promise<boolean>((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        tempFile
      ]);

      let output = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim() === 'video');
        } else {
          reject(new Error('Failed to analyze video file'));
        }
      });
    });

    if (!hasVideo) {
      throw new Error('Downloaded file contains no video stream');
    }

    console.log(`Video downloaded, extracting segment starting at ${startTime}s with duration ${duration}s...`);

    // Créer un fichier de sortie temporaire avec une extension .mp4 garantie
    const tempOutputFile = path.join(outputDir, `output_${Date.now()}.mp4`);
    
    console.log('Input file path:', tempFile);
    console.log('Output file path:', tempOutputFile);
    console.log('Output directory exists:', fs.existsSync(path.dirname(tempOutputFile)));
    
    // Extraire la section demandée avec ffmpeg en utilisant une approche différente
    await new Promise<void>((resolve, reject) => {
      // Convertir le temps de début en format HH:MM:SS pour une précision maximale
      const formattedStartTime = formatTimeForFFmpeg(startTime);
      console.log(`Using formatted start time: ${formattedStartTime}`);

      // Utiliser une approche différente pour le seeking
      const ffmpegArgs = [
        '-ss', formattedStartTime,  // Placer -ss avant -i pour un seeking plus précis
        '-i', tempFile,
        '-y'                        // Écraser le fichier de sortie s'il existe
      ];
      
      // Ajouter la durée si spécifiée
      if (duration) {
        ffmpegArgs.push('-t', duration.toString());
      }
      
      // Ajouter les options de sortie avec réencodage minimal
      ffmpegArgs.push(
        '-c:v', 'libx264',          // Utiliser libx264 pour la vidéo
        '-preset', 'ultrafast',     // Utiliser le preset le plus rapide
        '-crf', '23',               // Qualité raisonnable
        '-c:a', 'aac',              // Utiliser AAC pour l'audio
        '-b:a', '128k',             // Bitrate audio raisonnable
        '-pix_fmt', 'yuv420p',      // Format de pixel compatible
        '-movflags', '+faststart',  // Optimiser pour le streaming
        tempOutputFile              // Fichier de sortie
      );
      
      console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.log('ffmpeg stderr:', message);
      });
      
      ffmpeg.stdout.on('data', (data) => {
        console.log('ffmpeg stdout:', data.toString());
      });
      
      ffmpeg.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        console.log(`Output file exists: ${fs.existsSync(tempOutputFile)}`);
        
        if (code === 0 && fs.existsSync(tempOutputFile)) {
          try {
            console.log(`Copying from ${tempOutputFile} to ${outputPath}`);
            fs.copyFileSync(tempOutputFile, outputPath);
            console.log(`Successfully copied to ${outputPath}`);
            resolve();
          } catch (err) {
            console.error('Error copying output file:', err);
            reject(new Error(`Failed to copy output file: ${err.message}`));
          }
        } else {
          console.error(`FFmpeg failed with code ${code}`);
          console.error(`FFmpeg error output: ${errorOutput}`);
          reject(new Error(`ffmpeg failed with code ${code}`));
        }
      });
    });

    // Vérifier que le fichier de sortie existe et contient de la vidéo et de l'audio
    console.log(`Checking output file: ${outputPath}`);
    console.log(`Output file exists: ${fs.existsSync(outputPath)}`);
    
    const { hasVideo: outputHasVideo, hasAudio: outputHasAudio } = await getVideoStreams(outputPath);
    
    if (!outputHasVideo) {
      throw new Error('Output file contains no video stream');
    }
    
    if (!outputHasAudio) {
      console.warn('Warning: Output file contains no audio stream');
    }

    // Nettoyer les fichiers temporaires
    console.log('Cleaning up temporary files');
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempOutputFile)) {
        fs.unlinkSync(tempOutputFile);
      }
    } catch (err) {
      console.warn('Error cleaning up temporary files:', err);
    }

    console.log('Video processing completed successfully');

  } catch (error) {
    console.error('Erreur lors du téléchargement:', error);
    // Nettoyer les fichiers en cas d'erreur
    try {
      const tempFiles = fs.readdirSync(path.dirname(options.output))
        .filter(file => (file.startsWith('temp_') || file.startsWith('output_')) && file.endsWith('.mp4'))
        .map(file => path.join(path.dirname(options.output), file));
      
      const outputPath = options.output.endsWith('.mp4') ? options.output : `${options.output}.mp4`;
      
      [...tempFiles, outputPath].forEach(file => {
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file);
          } catch (err) {
            console.error(`Failed to delete file ${file}:`, err);
          }
        }
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

// Fonction pour formater le temps en HH:MM:SS pour FFmpeg
function formatTimeForFFmpeg(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// Fonction utilitaire pour vérifier si un fichier contient des flux vidéo et audio
async function getVideoStreams(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'json',
      filePath
    ]);

    let output = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(output);
          const streams = json.streams || [];
          const hasVideo = streams.some((stream: any) => stream.codec_type === 'video');
          const hasAudio = streams.some((stream: any) => stream.codec_type === 'audio');
          resolve({ hasVideo, hasAudio });
        } catch (error) {
          reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });
  });
} 