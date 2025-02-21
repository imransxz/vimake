import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DownloadOptions {
  start_time: number;
  duration: number;
  editingStyle: string;
  ytdlpOptions?: string[];
}

export async function downloadVideo(url: string, options: {
  output: string;
  format?: string;
  downloadOptions?: DownloadOptions;
}): Promise<void> {
  try {
    const startTime = options.downloadOptions?.start_time ?? 0;
    const duration = options.downloadOptions?.duration;

    // Créer un nom de fichier temporaire pour le téléchargement initial
    const tempFile = path.join(path.dirname(options.output), `temp_${Date.now()}.mp4`);

    // Construire la commande yt-dlp pour télécharger la vidéo complète
    const args = [
      url,
      '--format', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
      '--output', tempFile,
      '--no-playlist',
      '--merge-output-format', 'mp4',
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

    console.log('Video downloaded, extracting segment...');

    // Extraire la section demandée avec ffmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpegArgs = [
        '-i', tempFile,
        '-ss', startTime.toString(),
        ...(duration ? ['-t', duration.toString()] : []),
        '-c:v', 'copy',  // Copier le flux vidéo sans réencodage
        '-c:a', 'aac',   // Réencoder l'audio en AAC
        '-y',            // Écraser le fichier de sortie s'il existe
        options.output
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        console.log('ffmpeg stderr:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(options.output)) {
          resolve();
        } else {
          reject(new Error(`ffmpeg failed with code ${code}`));
        }
      });
    });

    // Nettoyer le fichier temporaire
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    console.log('Video processing completed successfully');

  } catch (error) {
    console.error('Erreur lors du téléchargement:', error);
    // Nettoyer les fichiers en cas d'erreur
    [options.output, path.join(path.dirname(options.output), `temp_*.mp4`)].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    throw new Error(`Failed to download video: ${error.message}`);
  }
} 