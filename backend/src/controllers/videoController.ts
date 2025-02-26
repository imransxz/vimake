import { Request, Response } from 'express';
import { VideoConverterService } from '../services/videoConverter';
import { ScriptProcessorService } from '../services/scriptProcessor';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import youtubeDl from 'youtube-dl-exec';
import { db } from '../db';
import FormData from 'form-data';
import { exec } from 'child_process';

// Progress tracking system
interface ProgressData {
  step: 'downloading' | 'transcribing' | 'generating_script' | 'creating_voice' | 'adding_subtitles' | 'finalizing' | 'complete';
  progress: number; // 0-100
  message?: string;
  timestamp: number;
  videoUrl?: string;
  downloadUrl?: string;
  fileName?: string;
}

// Map to store progress data for each video URL
const progressMap = new Map<string, ProgressData>();

// Helper function to update progress
export const updateProgress = (url: string, data: Partial<ProgressData>) => {
  // Normaliser l'URL pour éviter les problèmes de clés différentes pour la même vidéo
  const normalizedUrl = url.trim().replace(/\/$/, '');
  
  const currentProgress = progressMap.get(normalizedUrl) || {
    step: 'downloading',
    progress: 0,
    timestamp: Date.now()
  };
  
  const updatedProgress = {
    ...currentProgress,
    ...data,
    timestamp: Date.now()
  };
  
  progressMap.set(normalizedUrl, updatedProgress);
  
  console.log(`Progress updated for ${normalizedUrl}: ${updatedProgress.step} - ${updatedProgress.progress}% - ${updatedProgress.message || 'No message'}`);
  
  // Log the current state of the progress map for debugging
  console.log(`Current progress map has ${progressMap.size} entries`);
  for (const [key, value] of progressMap.entries()) {
    console.log(`- ${key}: ${value.step} (${value.progress}%)`);
  }
  
  // Auto-complete mechanism: If we're at finalizing 100% for more than 2 minutes, 
  // automatically transition to complete state
  if (updatedProgress.step === 'finalizing' && updatedProgress.progress === 100) {
    setTimeout(() => {
      const currentData = progressMap.get(normalizedUrl);
      if (currentData && 
          currentData.step === 'finalizing' && 
          currentData.progress === 100) {
        
        console.log(`Auto-completing stuck process for ${normalizedUrl} after timeout`);
        
        // Find the most recent video file
        try {
          const outputDir = path.join(__dirname, '../../output');
          const files = fs.readdirSync(outputDir)
            .filter(file => file.endsWith('.mp4'))
            .map(file => ({
              name: file,
              path: path.join(outputDir, file),
              mtime: fs.statSync(path.join(outputDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);
          
          if (files.length > 0) {
            const latestFile = files[0];
            console.log(`Found latest video file: ${latestFile.name}`);
            
            // Update to complete state with the latest file
            progressMap.set(normalizedUrl, {
              ...currentData,
              step: 'complete',
              progress: 100,
              message: 'Video processing complete (auto-completed)',
              videoUrl: `/api/video/stream?path=${encodeURIComponent(latestFile.path)}`,
              downloadUrl: `/api/video/download?path=${encodeURIComponent(latestFile.path)}`,
              fileName: latestFile.name,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.error('Error in auto-complete mechanism:', error);
        }
      }
    }, 2 * 60 * 1000); // 2 minutes timeout
  }
};

// Clean up old progress data (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [url, data] of progressMap.entries()) {
    if (now - data.timestamp > 60 * 60 * 1000) {
      progressMap.delete(url);
    }
  }
}, 15 * 60 * 1000); // Run every 15 minutes

interface ShortOutput {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  createdAt: string;
  views: number;
  downloadUrl: string;
  userId: string | null;
}

interface YoutubeDlOutput {
  duration: number;
}

interface ConvertOptions {
  url: string;
  startTime: number;
  downloadDuration: number;
  editingStyle: 'minimal' | 'dynamic' | 'dramatic';
  voice?: string;
}

interface ConversionResult {
  success: boolean;
  outputPath: string;
  transcript?: string;
  voicePath?: string;
  finalPath: string;
  error?: string;
}

// Constantes globales
const TARGET_DURATION = 85; // 1min25 pour un short viral
const DOWNLOAD_DURATION = 180; // 3 minutes de contenu pour avoir de la marge

// Fonction utilitaire pour obtenir la durée d'un fichier audio à l'aide de ffprobe
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    let durationData = '';
    ffprobe.stdout.on('data', (data) => {
      durationData += data.toString();
    });
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Failed to get audio duration, code ${code}`));
      }
      const duration = parseFloat(durationData);
      resolve(duration);
    });
  });
}

// Fonction utilitaire pour supprimer les emojis d'une chaîne de caractères
function removeEmojis(text: string): string {
  // Ajout du flag "u" pour activer le mode Unicode
  return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C\uDC00-\uD83D\uDDFF]|[\uD83E\uDD00-\uD83E\uDDFF])/gu, '');
}

export const convertVideo = async (req: Request, res: Response) => {
  try {
    const { url, startTime, voice, language = 'fr', backgroundMusic, editingStyle } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    // Vérifier que startTime est un nombre valide
    const parsedStartTime = startTime !== undefined ? Number(startTime) : 0;
    if (isNaN(parsedStartTime)) {
      return res.status(400).json({ success: false, error: 'Start time must be a valid number' });
    }

    console.log(`Converting video with start time: ${parsedStartTime} seconds`);
    console.log(`Editing style received: "${editingStyle}"`);
    
    // Normaliser l'URL pour la cohérence
    const normalizedUrl = url.trim().replace(/\/$/, '');
    
    // Réinitialiser la progression pour cette URL
    updateProgress(normalizedUrl, { 
      step: 'downloading', 
      progress: 0,
      message: 'Initializing video processing' 
    });

    const videoConverter = new VideoConverterService();
    
    // Set up progress listeners with verification
    let lastProgressUpdate = Date.now();
    let lastProgressStep = 'downloading';
    let lastProgressPercent = 0;
    
    // Mécanisme de vérification pour détecter les blocages
    const progressVerificationInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastProgressUpdate;
      
      // Si pas de mise à jour depuis 30 secondes, vérifier l'état
      if (timeSinceLastUpdate > 30000) {
        console.log(`No progress updates for ${Math.floor(timeSinceLastUpdate/1000)}s, checking status for ${normalizedUrl}`);
        
        const currentProgress = progressMap.get(normalizedUrl);
        if (currentProgress) {
          // Si bloqué à la même étape et au même pourcentage
          if (currentProgress.step === lastProgressStep && currentProgress.progress === lastProgressPercent) {
            console.log(`Progress appears to be stuck at ${currentProgress.progress}% in step ${currentProgress.step}, updating to continue`);
            
            // Mettre à jour artificiellement la progression
            let nextProgress = currentProgress.progress + 10;
            if (nextProgress > 95) nextProgress = 95;
            
            updateProgress(normalizedUrl, {
              step: currentProgress.step,
              progress: nextProgress,
              message: `${currentProgress.step} in progress (estimated)`
            });
            
            // Si bloqué en téléchargement pendant très longtemps, passer à l'étape suivante
            if (currentProgress.step === 'downloading' && timeSinceLastUpdate > 3 * 60 * 1000) {
              console.log('Download appears to be stuck for more than 3 minutes, moving to next step');
              updateProgress(normalizedUrl, {
                step: 'transcribing',
                progress: 10,
                message: 'Starting transcription (recovery mode)'
              });
            }
          }
        }
      }
    }, 15000); // Vérifier toutes les 15 secondes
    
    videoConverter.on('progress', (step, progress, message) => {
      console.log(`Progress event received: ${step} - ${progress}% - ${message}`);
      
      // Mettre à jour les variables de suivi
      lastProgressUpdate = Date.now();
      lastProgressStep = step;
      lastProgressPercent = progress;
      
      updateProgress(normalizedUrl, {
        step: step as ProgressData['step'],
        progress,
        message
      });
    });
    
    // Démarrer la conversion de manière asynchrone
    const conversionPromise = videoConverter.createViralShort(normalizedUrl, {
      targetDuration: TARGET_DURATION,
      editingStyle: editingStyle,
      voiceStyle: voice,
      startTime: parsedStartTime,
      language: language || 'fr',
      backgroundMusic: backgroundMusic || 'none'
    });
    
    // Répondre immédiatement au client pour éviter les timeouts
    res.json({
      success: true,
      message: 'Video processing started',
      status: 'processing',
      progressUrl: `/api/video/progress?url=${encodeURIComponent(normalizedUrl)}`
    });
    
    // Continuer le traitement en arrière-plan
    conversionPromise.then(result => {
      // Nettoyer l'intervalle de vérification
      clearInterval(progressVerificationInterval);
      
      // Marquer comme terminé
      updateProgress(normalizedUrl, { 
        step: 'complete', 
        progress: 100,
        message: 'Video processing complete',
        videoUrl: `/api/video/stream?path=${encodeURIComponent(result)}`,
        downloadUrl: `/api/video/download?path=${encodeURIComponent(result)}`,
        fileName: `viral_short_${Date.now()}.mp4`
      });
      
      console.log(`Video processing completed successfully: ${result}`);
    }).catch(error => {
      // Nettoyer l'intervalle de vérification
      clearInterval(progressVerificationInterval);
      
      console.error('Error during video conversion:', error);
      updateProgress(normalizedUrl, {
        step: 'finalizing',
        progress: 100,
        message: `Error: ${error.message || 'Unknown error occurred'}`
      });
    });

    return; // Ajout d'un return explicite pour indiquer la fin de la fonction

  } catch (error) {
    console.error('Erreur lors de la conversion:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
};

// Endpoint to get progress
export const getProgress = async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    // Normaliser l'URL pour correspondre à celle utilisée dans updateProgress
    const normalizedUrl = url.trim().replace(/\/$/, '');
    console.log(`Checking progress for normalized URL: ${normalizedUrl}`);
    
    // Log all keys in the progress map for debugging
    console.log(`Progress map contains ${progressMap.size} entries:`);
    for (const [key, value] of progressMap.entries()) {
      console.log(`- ${key}: ${value.step} (${value.progress}%)`);
    }
    
    const progress = progressMap.get(normalizedUrl);
    
    if (!progress) {
      console.log(`No progress data found for URL: ${normalizedUrl}`);
      // Retourner un état par défaut plutôt qu'une erreur
      return res.json({ 
        step: 'downloading', 
        progress: 0,
        message: 'Starting process...',
        timestamp: Date.now()
      });
    }
    
    // Check if the process is stuck in finalizing state for too long (more than 5 minutes)
    const now = Date.now();
    if (progress.step === 'finalizing' && progress.progress === 100 && 
        now - progress.timestamp > 5 * 60 * 1000) {
      
      console.log(`Process appears to be stuck in finalizing state for ${normalizedUrl}, attempting auto-completion`);
      
      // Find the most recent video file
      try {
        const outputDir = path.join(__dirname, '../../output');
        const files = fs.readdirSync(outputDir)
          .filter(file => file.endsWith('.mp4'))
          .map(file => ({
            name: file,
            path: path.join(outputDir, file),
            mtime: fs.statSync(path.join(outputDir, file)).mtime.getTime()
          }))
          .sort((a, b) => b.mtime - a.mtime);
        
        if (files.length > 0) {
          const latestFile = files[0];
          console.log(`Found latest video file for auto-completion: ${latestFile.name}`);
          
          // Update to complete state with the latest file
          const updatedProgress = {
            ...progress,
            step: 'complete' as ProgressData['step'],
            progress: 100,
            message: 'Video processing complete (auto-completed)',
            videoUrl: `/api/video/stream?path=${encodeURIComponent(latestFile.path)}`,
            downloadUrl: `/api/video/download?path=${encodeURIComponent(latestFile.path)}`,
            fileName: latestFile.name,
            timestamp: now
          };
          
          progressMap.set(normalizedUrl, updatedProgress);
          
          // Return the updated progress
          const responseData = {
            ...updatedProgress,
            _debug: {
              normalizedUrl,
              mapSize: progressMap.size,
              serverTime: new Date().toISOString(),
              autoCompleted: true
            }
          };
          
          console.log(`Auto-completed progress for ${normalizedUrl}: ${updatedProgress.step} (${updatedProgress.progress}%)`);
          return res.json(responseData);
        }
      } catch (error) {
        console.error('Error in auto-completion during getProgress:', error);
      }
    }
    
    // Ajouter des informations supplémentaires pour aider le débogage côté client
    const responseData = {
      ...progress,
      _debug: {
        normalizedUrl,
        mapSize: progressMap.size,
        serverTime: new Date().toISOString()
      }
    };
    
    console.log(`Returning progress for ${normalizedUrl}: ${progress.step} (${progress.progress}%)`);
    return res.json(responseData);
  } catch (error) {
    console.error('Error getting progress:', error);
    return res.status(500).json({ error: 'Failed to get progress data' });
  }
};

export const getVideoDuration = async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Utiliser youtube-dl pour obtenir la durée
    const output = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true
    }) as YoutubeDlOutput;
    
    const duration = Math.floor(output.duration);

    return res.json({ duration });
  } catch (error) {
    console.error('Error getting video duration:', error);
    return res.status(500).json({ error: 'Failed to get video duration' });
  }
};

export const getShortsHistory = async (req: Request, res: Response) => {
  try {
    return res.json([]); // Mock data for now
  } catch (error) {
    console.error('Error fetching shorts history:', error);
    return res.status(500).json({ error: 'Failed to fetch shorts history' });
  }
};

export const streamVideo = async (req: Request, res: Response) => {
  try {
    const { path: videoPath } = req.query;
    
    if (!videoPath || typeof videoPath !== 'string') {
      return res.status(400).json({ error: 'Video path is required' });
    }
    
    // Ensure we're working with an absolute path
    const absolutePath = path.isAbsolute(videoPath) 
      ? videoPath 
      : path.join(__dirname, '../../', videoPath);
    
    console.log(`Streaming video from: ${absolutePath}`);
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`Video file not found: ${absolutePath}`);
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Check file size
    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;
    
    if (fileSize === 0) {
      console.error(`Video file is empty: ${absolutePath}`);
      return res.status(500).json({ error: 'Video file is empty' });
    }
    
    console.log(`Video file size: ${fileSize} bytes`);
    
    // Verify that the file is a valid MP4
    try {
      const fileInfo = await new Promise<{mime: string}>((resolve, reject) => {
        exec(`file --mime-type "${absolutePath}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          
          const mimeMatch = stdout.match(/: (.+)$/);
          if (mimeMatch && mimeMatch[1]) {
            resolve({ mime: mimeMatch[1].trim() });
          } else {
            reject(new Error('Could not determine file MIME type'));
          }
        });
      });
      
      console.log(`File MIME type for streaming: ${fileInfo.mime}`);
      
      // Check if it's a video file
      if (!fileInfo.mime.startsWith('video/')) {
        console.warn(`File is not a video: ${fileInfo.mime}`);
        // Continue anyway, as the mime type detection might be incorrect
      }
    } catch (error) {
      console.warn(`Could not check file MIME type: ${error.message}`);
      // Continue even if we can't check the MIME type
    }
    
    // Set common headers for better browser compatibility
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Add complete CORS headers to avoid playback issues
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Handle range requests for video streaming
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range
      if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
        console.error(`Invalid range request: ${range} for file size ${fileSize}`);
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`
        });
        return res.end();
      }
      
      const chunksize = (end - start) + 1;
      console.log(`Streaming range: bytes ${start}-${end}/${fileSize} (${chunksize} bytes)`);
      
      const fileStream = fs.createReadStream(absolutePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
      });
      
      fileStream.on('error', (err) => {
        console.error(`Error streaming file range: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file' });
        } else {
          res.end();
        }
      });
      
      fileStream.pipe(res);
      return;
    } else {
      // Stream the entire file
      console.log(`Streaming entire file: ${fileSize} bytes`);
      
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      
      const fileStream = fs.createReadStream(absolutePath);
      
      fileStream.on('error', (err) => {
        console.error(`Error streaming entire file: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file' });
        } else {
          res.end();
        }
      });
      
      fileStream.pipe(res);
      return;
    }
  } catch (error) {
    console.error('Error streaming video:', error);
    return res.status(500).json({ error: 'Failed to stream video' });
  }
};

export const downloadVideo = async (req: Request, res: Response) => {
  try {
    const { path: videoPath } = req.query;
    const fileName = req.query.fileName || `viral_short_${Date.now()}.mp4`;
    
    if (!videoPath || typeof videoPath !== 'string') {
      return res.status(400).json({ error: 'Video path is required' });
    }
    
    // Ensure we're working with an absolute path
    const absolutePath = path.isAbsolute(videoPath) 
      ? videoPath 
      : path.join(__dirname, '../../', videoPath);
    
    console.log(`Preparing to download video: ${absolutePath}`);
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`Video file not found for download: ${absolutePath}`);
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Check file size
    const fileSize = fs.statSync(absolutePath).size;
    console.log(`File size for download: ${fileSize} bytes`);
    
    if (fileSize === 0) {
      console.error(`Video file is empty: ${absolutePath}`);
      return res.status(500).json({ error: 'Video file is empty' });
    }
    
    // Verify that the file is a valid MP4
    try {
      const fileInfo = await new Promise<{mime: string}>((resolve, reject) => {
        exec(`file --mime-type "${absolutePath}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          
          const mimeMatch = stdout.match(/: (.+)$/);
          if (mimeMatch && mimeMatch[1]) {
            resolve({ mime: mimeMatch[1].trim() });
          } else {
            reject(new Error('Could not determine file MIME type'));
          }
        });
      });
      
      console.log(`File MIME type for download: ${fileInfo.mime}`);
      
      // Check if it's a video file
      if (!fileInfo.mime.startsWith('video/')) {
        console.warn(`File is not a video: ${fileInfo.mime}`);
        // Continue anyway, as the mime type detection might be incorrect
      }
      
      // Ensure the filename has the .mp4 extension
      let safeFileName = String(fileName);
      if (!safeFileName.toLowerCase().endsWith('.mp4')) {
        safeFileName = `${safeFileName}.mp4`;
      }
      
      // Set headers for file download with proper MIME type
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'max-age=31536000'); // Cache for 1 year
      
      // Add complete CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition');
      
      // Stream the file for download
      console.log(`Streaming file for download: ${safeFileName} (${fileSize} bytes)`);
      const fileStream = fs.createReadStream(absolutePath);
      
      // Track download progress
      let bytesSent = 0;
      fileStream.on('data', (chunk) => {
        bytesSent += chunk.length;
        const progress = Math.round((bytesSent / fileSize) * 100);
        if (progress % 10 === 0) { // Log every 10%
          console.log(`Download progress: ${progress}% (${bytesSent}/${fileSize} bytes)`);
        }
      });
      
      fileStream.on('end', () => {
        console.log(`Download completed: ${safeFileName} (${fileSize} bytes)`);
      });
      
      fileStream.on('error', (err) => {
        console.error(`Error streaming file for download: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file for download' });
        } else {
          res.end();
        }
      });
      
      fileStream.pipe(res);
      return;
    } catch (fileError) {
      console.error(`Error checking file type: ${fileError.message}`);
      
      // Continue with default headers if file check fails
      // Ensure the filename has the .mp4 extension
      let safeFileName = String(fileName);
      if (!safeFileName.toLowerCase().endsWith('.mp4')) {
        safeFileName = `${safeFileName}.mp4`;
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Stream the file for download
      console.log(`Streaming file for download (fallback): ${safeFileName} (${fileSize} bytes)`);
      const fileStream = fs.createReadStream(absolutePath);
      
      fileStream.on('error', (err) => {
        console.error(`Error streaming file (fallback): ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file for download' });
        } else {
          res.end();
        }
      });
      
      fileStream.pipe(res);
      return;
    }
  } catch (error) {
    console.error('Error downloading video:', error);
    return res.status(500).json({ error: 'Failed to download video' });
  }
}; 