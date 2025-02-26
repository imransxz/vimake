import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { downloadVideo } from '../utils/youtubeDl';
import { ScriptProcessorService, WhisperSegment } from './scriptProcessor';
import { generateSRT } from '../../utils/generateSubtitles';
import axios from 'axios';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { isVideoValid, repairVideo } from '../utils/verifyVideo';

interface ConversionResult {
  success: boolean;
  outputPath: string;
  finalPath: string;
}

interface ConvertOptions {
  url: string;
  startTime: number;
  voice?: string;
  editingStyle?: 'minimal' | 'dynamic' | 'dramatic';
  subtitleStyle?: 'classic' | 'modern';
  language: string;
  backgroundMusic?: string;
}

interface TranscriptionResponse {
  transcription: string;
  segments: WhisperSegment[];
  [key: string]: any;
}

interface SubtitleDialogue {
  start: string;
  end: string;
  text: string;
}

interface ViralSegment {
  text: string;
  start: number;
  end: number;
  importance: number;  // Score de 0 à 1 pour la pertinence du segment
}

export class VideoConverterService extends EventEmitter {
  private tempDir: string;
  private outputDir: string;
  private scriptProcessor: ScriptProcessorService;
  private TARGET_DURATION = 60; // Target duration in seconds
  private MIN_SEGMENT_DURATION = 3; // Minimum segment duration in seconds
  private SEGMENT_DURATION = 8; // Default segment duration in seconds
  private readonly VIDEO_WIDTH = 720;
  private readonly VIDEO_HEIGHT = 1280;
  private scriptGenerationAttempts = 0;

  private extractUrl(input: string): string {
    const match = input.match(/https?:\/\/[^\s'"]+/);
    if (!match) return input;
    return match[0].replace(/[.,!?;:]+$/, '');
  }

  constructor() {
    super(); // Initialize EventEmitter
    
    this.tempDir = path.join(__dirname, "../../temp");
    this.outputDir = path.join(__dirname, "../../output");
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.scriptProcessor = new ScriptProcessorService();
  }

  public async createViralShort(
    videoUrl: string,
    options: {
      targetDuration?: number;
      editingStyle?: string;
      subtitleStyle?: string;
      voiceStyle?: string;
      startTime?: number;
      language?: string;
      backgroundMusic?: string;
    } = {}
  ): Promise<string> {
    const sessionId = Date.now().toString();
    const sessionDir = path.join(this.tempDir, sessionId);
    
    // Ensure session directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    // Définir le chemin de sortie final
    const outputPath = path.join(this.outputDir, `viral_short_${sessionId}.mp4`);
    const processedPath = path.join(this.outputDir, `processed_${sessionId}.mp4`);
    const webOptimizedPath = path.join(this.outputDir, `web_optimized_${sessionId}.mp4`);
    
    // Déclarer la variable extractedSegments au niveau global de la fonction
    const extractedSegments: string[] = [];
    
    try {
      // Télécharger la vidéo
      console.log("Downloading video...");
      this.emitProgress('downloading', 10, 'Downloading video');
      const videoPath = await this.downloadVideo(videoUrl, sessionDir, options.startTime);
      console.log(`Video downloaded to: ${videoPath}`);
      this.emitProgress('downloading', 100, 'Video download complete');
      
      // Transcrire la vidéo
      console.log("Transcribing video...");
      this.emitProgress('transcribing', 20, 'Transcribing video content');
      let transcriptionResponse;
      try {
        transcriptionResponse = await this.transcribeVideo(videoPath);
        console.log(`Transcription completed with ${transcriptionResponse.segments.length} segments`);
        this.emitProgress('transcribing', 100, 'Transcription complete');
      } catch (transcriptionError) {
        console.error(`Error during transcription: ${transcriptionError.message}`);
        this.emitProgress('transcribing', 100, `Transcription completed with errors`);
        
        // Create a minimal placeholder transcription to continue the process
        transcriptionResponse = {
          transcription: "This video could not be automatically transcribed. Continuing with minimal processing.",
          segments: [
            {
              start: 0,
              end: 5,
              text: "This video could not be automatically transcribed.",
              words: [
                { word: "This", start: 0, end: 0.5 },
                { word: "video", start: 0.5, end: 1 },
                { word: "could", start: 1, end: 1.5 },
                { word: "not", start: 1.5, end: 2 },
                { word: "be", start: 2, end: 2.5 },
                { word: "automatically", start: 2.5, end: 3.5 },
                { word: "transcribed.", start: 3.5, end: 5 }
              ]
            }
          ]
        };
      }
      
      // Continue with the rest of the process...
      // ... existing code ...
      
      // Sélectionner les meilleurs segments
      console.log("Selecting best segments...");
      this.emitProgress('generating_script', 30, 'Analyzing content');
      const selectedSegments = await this.scriptProcessor.selectBestSegments(
        transcriptionResponse.segments
      );
      console.log(`Selected ${selectedSegments.length} segments`);
      
      // Générer un script viral
      console.log("Generating viral script...");
      this.emitProgress('generating_script', 60, 'Creating viral script');
      let viralScript = await this.generateViralScript(transcriptionResponse.transcription);
      console.log(`Generated viral script: ${viralScript}`);
      this.emitProgress('generating_script', 100, 'Script generation complete');
      
      // Extraire et combiner les segments vidéo
      console.log("Extracting and combining video segments...");
      this.emitProgress('creating_voice', 20, 'Processing video segments');
      let combinedVideoPath;
      
      if (selectedSegments.length === 0) {
        console.log("No segments selected, using full video");
        const fullVideoSegment = path.join(sessionDir, "full_video.mp4");
        fs.copyFileSync(videoPath, fullVideoSegment);
        combinedVideoPath = fullVideoSegment;
      } else {
        console.log(`Extracting ${selectedSegments.length} segments`);
        const extractedSegments: string[] = [];
        
        // Extraire les segments sélectionnés
        for (const segment of selectedSegments) {
          try {
            const segmentPath = await this.extractSegment(
              videoPath,
              segment.start,
              segment.end - segment.start,
              path.join(sessionDir, `segment_${segment.start.toFixed(2)}_${segment.end.toFixed(2)}.mp4`)
            );
            
            // Vérifier que le segment a été correctement extrait
            if (fs.existsSync(segmentPath) && fs.statSync(segmentPath).size > 1000) {
              extractedSegments.push(segmentPath);
              console.log(`Successfully extracted segment: ${segmentPath}`);
            } else {
              console.warn(`Skipping invalid segment: ${segmentPath}`);
            }
          } catch (error) {
            console.error(`Error extracting segment: ${error.message}`);
          }
        }
        
        if (extractedSegments.length === 0) {
          console.log("No valid segments extracted, using full video");
          const fullVideoSegment = path.join(sessionDir, "full_video.mp4");
          fs.copyFileSync(videoPath, fullVideoSegment);
          combinedVideoPath = fullVideoSegment;
        } else if (extractedSegments.length === 1) {
          console.log("Only one segment extracted, using it directly");
          combinedVideoPath = extractedSegments[0];
        } else {
          console.log(`Combining ${extractedSegments.length} segments`);
          const combinedPath = path.join(sessionDir, "combined_video.mp4");
          await this.combineSegments(extractedSegments, combinedPath);
          combinedVideoPath = combinedPath;
        }
      }
      
      console.log(`Combined video path: ${combinedVideoPath}`);
      
      // Vérifier la durée de la vidéo combinée
      const combinedDuration = await this.getVideoDuration(combinedVideoPath);
      console.log(`Combined video duration: ${combinedDuration}s (target: ${this.TARGET_DURATION}s)`);
      
      // Si la durée est trop courte, extraire des segments supplémentaires de la vidéo originale
      if (combinedDuration < this.TARGET_DURATION * 0.7) {
        console.log(`Combined video duration (${combinedDuration}s) is too short, extracting additional segments`);
        
        // Obtenir la durée totale de la vidéo originale
        const originalVideoDuration = await this.getVideoDuration(videoPath);
        console.log(`Original video duration: ${originalVideoDuration}s`);
        
        // Calculer combien de segments supplémentaires nous avons besoin
        const durationNeeded = this.TARGET_DURATION - combinedDuration;
        console.log(`Additional duration needed: ${durationNeeded}s`);
        
        // Extraire des segments supplémentaires à partir de points différents de la vidéo
        // en évitant les segments déjà extraits
        const additionalSegments: string[] = [];
        const existingStartTimes = selectedSegments.map(s => s.start);
        const existingEndTimes = selectedSegments.map(s => s.end);
        
        // Créer des points de départ pour les segments supplémentaires
        // en évitant les zones déjà utilisées
        const segmentCount = Math.ceil(durationNeeded / 10); // Segments d'environ 10 secondes
        const step = originalVideoDuration / (segmentCount * 2);
        
        for (let i = 0; i < segmentCount * 2 && additionalSegments.length < segmentCount; i++) {
          const startTime = i * step;
          
          // Vérifier que ce point de départ n'est pas trop proche d'un segment existant
          const isTooClose = existingStartTimes.some(time => Math.abs(time - startTime) < 5) ||
                            existingEndTimes.some(time => Math.abs(time - startTime) < 5);
          
          if (!isTooClose && startTime + 10 < originalVideoDuration) {
            const segmentPath = path.join(sessionDir, `additional_segment_${i}.mp4`);
            
            try {
              // Extraire un segment de 10 secondes
              await this.extractSegment(videoPath, startTime, 10, segmentPath);
              
              // Vérifier que le segment a été correctement extrait
              if (fs.existsSync(segmentPath) && fs.statSync(segmentPath).size > 1000) {
                additionalSegments.push(segmentPath);
                console.log(`Successfully extracted additional segment at ${startTime}s: ${segmentPath}`);
              }
            } catch (error) {
              console.error(`Error extracting additional segment at ${startTime}s: ${error.message}`);
            }
          }
        }
        
        if (additionalSegments.length > 0) {
          console.log(`Extracted ${additionalSegments.length} additional segments`);
          
          // Obtenir les segments originaux
          let originalSegments: string[] = [];
          
          // Si combinedVideoPath est un fichier combiné, nous devons récupérer les segments originaux
          if (combinedVideoPath.includes("combined_video.mp4")) {
            // Utiliser les segments extraits précédemment
            originalSegments = extractedSegments;
          } else {
            // Si c'est un seul segment ou la vidéo complète, l'utiliser comme segment unique
            originalSegments = [combinedVideoPath];
          }
          
          // Combiner tous les segments (originaux + supplémentaires)
          const allSegments = [...originalSegments, ...additionalSegments];
          const extendedPath = path.join(sessionDir, "extended_combined_video.mp4");
          
          await this.combineSegments(allSegments, extendedPath);
          combinedVideoPath = extendedPath;
          
          const newDuration = await this.getVideoDuration(combinedVideoPath);
          console.log(`Extended video duration: ${newDuration}s (target: ${this.TARGET_DURATION}s)`);
        }
      }
      
      // Générer l'audio de la voix
      console.log("Generating voice audio...");
      this.emitProgress('creating_voice', 60, 'Generating voiceover');
      const voiceAudioPath = path.join(sessionDir, "voice.mp3");
      await this.generateVoiceAudio(viralScript, voiceAudioPath, options.voiceStyle || "default");
      console.log(`Voice audio generated at: ${voiceAudioPath}`);
      this.emitProgress('creating_voice', 100, 'Voice generation complete');
      
      // Préparer les sous-titres
      console.log("Preparing subtitles...");
      this.emitProgress('adding_subtitles', 30, 'Creating subtitles');
      const subtitleLines = await this.prepareSubtitleLines(
        viralScript,
        transcriptionResponse.segments,
        voiceAudioPath
      );
      
      // Créer le fichier de sous-titres ASS
      console.log("Creating subtitles...");
      this.emitProgress('adding_subtitles', 60, 'Formatting subtitles');
      const subtitlesPath = path.join(sessionDir, "subtitles.ass");
      await this.createASS(subtitleLines, subtitlesPath);
      console.log(`Subtitles created at: ${subtitlesPath}`);
      this.emitProgress('adding_subtitles', 100, 'Subtitles created');
      
      // Ensure the final output directory exists
      const finalPath = path.join(__dirname, "../../output", `viral_short_${sessionId}.mp4`);
      const finalOutputDir = path.dirname(finalPath);
      if (!fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, { recursive: true });
      }
      
      // Appliquer le style d'édition final
      console.log("Applying editing style...");
      this.emitProgress('finalizing', 50, 'Applying final edits');
      const processedPath = await this.applyEditingStyle(
        combinedVideoPath,
        voiceAudioPath,
        subtitlesPath,
        finalPath,
        options.editingStyle || "dynamic",
        options.backgroundMusic
      );
      console.log(`Final video created at: ${processedPath}`);
      
      // Vérifier et optimiser la vidéo pour le web
      console.log("Optimizing video for web playback...");
      this.emitProgress('finalizing', 80, 'Optimizing for web playback');
      const webOptimizedPath = path.join(finalOutputDir, `web_optimized_${sessionId}.mp4`);
      
      try {
        await this.optimizeForWebPlayback(processedPath, webOptimizedPath);
        console.log(`Web-optimized video created at: ${webOptimizedPath}`);
        this.emitProgress('finalizing', 100, 'Video finalized');
        this.emitProgress('complete', 100, 'Processing complete');
        return webOptimizedPath;
      } catch (optimizeError) {
        console.error(`Error optimizing video: ${optimizeError.message}`);
        console.log("Using original processed video instead");
        this.emitProgress('finalizing', 100, 'Video finalized (without optimization)');
        this.emitProgress('complete', 100, 'Processing complete');
        return processedPath;
      }
    } catch (error) {
      console.error(`Error creating viral short: ${error.message}`);
      this.emitProgress('finalizing', 100, `Error: ${error.message}`);
      
      // Ensure we emit a complete event even after an error, so the UI doesn't get stuck
      setTimeout(() => {
        this.emitProgress('complete', 100, `Error: ${error.message}`);
        console.log('Emitted complete event after error');
      }, 1000);
      
      throw error;
    } finally {
      // Nettoyer les fichiers temporaires
      try {
        console.log(`Cleaning up temporary files in ${sessionDir}`);
        this.cleanupTempFiles(sessionDir);
      } catch (cleanupError) {
        console.error(`Error cleaning up: ${cleanupError.message}`);
      }
    }
  }

  private getEditingFilters(): Record<string, string> {
    return {
      minimal: '[0:v]split=2[original][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[blurred];[original]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920[fg];[blurred][fg]overlay=(W-w)/2:(H-h)/2[v]',
      dynamic: '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v]',
      dramatic: '[0:v]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920,curves=preset=stronger,unsharp=5:5:1.5[v]'
    };
  }

  private async cleanup(files: string[]): Promise<void> {
    for (const file of files) {
      if (fs.existsSync(file)) {
        await fs.promises.unlink(file);
      }
    }
  }

  private async applyEditingStyle(
    videoPath: string,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
    style: string = 'dynamic',
    backgroundMusic?: string
  ): Promise<string> {
    console.log(`Applying editing style '${style}' to video: ${videoPath}`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Get video duration
    const videoDuration = await this.getVideoDuration(videoPath);
    console.log(`Original video duration: ${videoDuration} seconds`);
    
    // Get audio duration
    const audioDuration = await this.getAudioDuration(audioPath);
    console.log(`Audio duration: ${audioDuration} seconds`);
    
    // Disable slowdown mechanism
    const targetDuration = 85; // 1 minute 25 seconds
    const needsExtension = false; // Force to false to avoid slowdown
    
    // Base FFmpeg command
    let ffmpegCommand = '';
    
    // Escape the subtitles path for FFmpeg
    const escapedSubtitlesPath = subtitlesPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    
    // Common parameters for better compatibility
    const videoCodecParams = '-c:v libx264 -profile:v baseline -level 3.0 -preset medium -crf 23 -pix_fmt yuv420p';
    const audioCodecParams = '-c:a aac -b:a 192k -ar 44100';
    const compatibilityParams = '-movflags +faststart'; // Optimize for web streaming
    
    // Check if background music is requested
    const useBackgroundMusic = backgroundMusic && backgroundMusic !== 'none';
    
    // Path to background music files (to be implemented with actual files)
    const musicPath = useBackgroundMusic 
      ? path.join(__dirname, '../../../assets/music', `${backgroundMusic}.mp3`) 
      : null;
    
    // Check if the music file exists
    const musicExists = musicPath && fs.existsSync(musicPath);
    
    if (useBackgroundMusic && !musicExists) {
      console.warn(`Background music file not found: ${musicPath}, proceeding without music`);
    }
    
    // Prepare filter complex with or without background music
    let filterComplex = '';
    
    if (style === 'dynamic') {
      console.log('Applying dynamic editing style with zoom for 9:16 format');
      
      // Dynamic style: zoom effect (current implementation)
      if (useBackgroundMusic && musicExists) {
        // With background music
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v];[v]ass='${escapedSubtitlesPath}'[outv];[1:a][2:a]amix=inputs=2:duration=longest:weights=3 1[a]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[a]" ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      } else {
        // Without background music
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v];[v]ass='${escapedSubtitlesPath}'[outv]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[outv]" -map 1:a ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      }
    } else if (style === 'minimal') {
      console.log('Applying minimal editing style with 120% scale and blurred background');
      
      // Minimal style: 120% scale with blurred background (duplicated video)
      if (useBackgroundMusic && musicExists) {
        // With background music
        filterComplex = `[0:v]split=2[original][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[blurred];[original]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920[fg];[blurred][fg]overlay=(W-w)/2:(H-h)/2[v];[v]ass='${escapedSubtitlesPath}'[outv];[1:a][2:a]amix=inputs=2:duration=longest:weights=3 1[a]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[a]" ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      } else {
        // Without background music
        filterComplex = `[0:v]split=2[original][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[blurred];[original]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920[fg];[blurred][fg]overlay=(W-w)/2:(H-h)/2[v];[v]ass='${escapedSubtitlesPath}'[outv]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[outv]" -map 1:a ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      }
    } else if (style === 'dramatic') {
      console.log('Applying dramatic editing style with 120% scale and no background');
      
      // Dramatic style: 120% scale without blurred background
      if (useBackgroundMusic && musicExists) {
        // With background music
        filterComplex = `[0:v]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920,curves=preset=stronger,unsharp=5:5:1.5[v];[v]ass='${escapedSubtitlesPath}'[outv];[1:a][2:a]amix=inputs=2:duration=longest:weights=3 1[a]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[a]" ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      } else {
        // Without background music
        filterComplex = `[0:v]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304:(iw-1296)/2:0,scale=1080:1920,curves=preset=stronger,unsharp=5:5:1.5[v];[v]ass='${escapedSubtitlesPath}'[outv]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[outv]" -map 1:a ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      }
    } else {
      // Default style (fallback to dynamic)
      console.log('Applying default editing style (fallback to dynamic)');
      
      if (useBackgroundMusic && musicExists) {
        // With background music
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v];[v]ass='${escapedSubtitlesPath}'[outv];[1:a][2:a]amix=inputs=2:duration=longest:weights=3 1[a]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[a]" ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      } else {
        // Without background music
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v];[v]ass='${escapedSubtitlesPath}'[outv]`;
        ffmpegCommand = `-i "${videoPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[outv]" -map 1:a ${videoCodecParams} ${audioCodecParams} ${compatibilityParams} -shortest "${outputPath}"`;
      }
    }
    
    console.log(`Executing FFmpeg command: ffmpeg ${ffmpegCommand}`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`ffmpeg ${ffmpegCommand}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`FFmpeg error: ${error.message}`);
            console.error(`FFmpeg stderr: ${stderr}`);
            reject(error);
            return;
          }
          console.log(`FFmpeg stdout: ${stdout}`);
          resolve();
        });
      });
      
      // Check that the output file exists and has a reasonable size
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        console.log(`Successfully created output file: ${outputPath}`);
        
        // Verify that the file is playable
        try {
          await this.verifyVideoPlayability(outputPath);
          console.log(`Verified that the output file is playable: ${outputPath}`);
        } catch (verifyError) {
          console.error(`Warning: Could not verify video playability: ${verifyError.message}`);
        }
        
        return outputPath;
      } else {
        throw new Error('Output file does not exist or is too small');
      }
    } catch (error) {
      console.error('Error applying editing style:', error);
      throw error;
    }
  }

  // Nouvelle méthode pour vérifier que la vidéo est lisible
  private async verifyVideoPlayability(videoPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
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
            console.log(`Video codec info: ${JSON.stringify(data)}`);
            resolve();
          } catch (error) {
            reject(new Error(`Failed to parse video info: ${error.message}`));
          }
        } else {
          reject(new Error(`Failed to verify video with code ${code}`));
        }
      });
    });
  }

  private async downloadVideo(url: string, outputDir: string, startTime?: number): Promise<string> {
    console.log(`Downloading video from ${url} to ${outputDir} ${startTime ? `starting at ${startTime} seconds` : ''}`);
    
    // Limiter la durée de téléchargement à 5 minutes (300 secondes) pour avoir suffisamment de contenu
    const MAX_DOWNLOAD_DURATION = 300; // 5 minutes en secondes
    
    // Vérifier que le répertoire de sortie existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, "input.mp4");
    const altOutputPath = path.join(outputDir, "input_alt.mp4");
    
    // Émettre un événement de progression initial
    this.emitProgress('downloading', 10, 'Initializing ultra high quality video download');
    
    try {
      // Définir un timeout pour permettre un téléchargement de qualité
      const downloadTimeout = 180 * 1000; // 3 minutes
      let downloadCompleted = false;
      
      // Méthode principale: ultra haute qualité
      try {
        this.emitProgress('downloading', 15, 'Downloading ultra high quality video');
        
        // Utiliser une approche qui privilégie la qualité maximale
        const ultraHighQualityArgs = [
          // Sélectionner la meilleure qualité vidéo disponible (jusqu'à 4K)
          '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
          '--format-sort', 'res:1440,fps:60,vcodec:h264,acodec:aac',
          '--merge-output-format', 'mp4',
          '--no-check-certificate',
          '--no-playlist',
          '--retries', '5',
          '--fragment-retries', '10',
          '--buffer-size', '16M',
          '--concurrent-fragments', '4',
          '--downloader', 'aria2c',
          '--downloader-args', 'aria2c:"-x 16 -s 16 -k 1M"',
          '--progress',
          '--newline',
          '-o', outputPath
        ];
        
        // Ajouter la limitation de durée
        if (startTime && startTime > 0) {
          ultraHighQualityArgs.push('--download-sections', `*${startTime}-${startTime + MAX_DOWNLOAD_DURATION}`);
          console.log(`Downloading 5 minutes of ultra high quality video: from ${startTime}s to ${startTime + MAX_DOWNLOAD_DURATION}s`);
        } else {
          ultraHighQualityArgs.push('--download-sections', `*0-${MAX_DOWNLOAD_DURATION}`);
          console.log(`Downloading first 5 minutes of ultra high quality video (${MAX_DOWNLOAD_DURATION}s)`);
        }
        
        // Ajouter l'URL à la fin
        ultraHighQualityArgs.push(url);
        
        console.log(`Executing ultra high quality download: yt-dlp ${ultraHighQualityArgs.join(' ')}`);
        
        let progressPercent = 15;
        let lastProgressUpdate = Date.now();
        
        const downloadProcess = spawn('yt-dlp', ultraHighQualityArgs);
        
        // Suivre la progression en analysant la sortie
        downloadProcess.stdout.on('data', (data) => {
          const output = data.toString();
          
          // Extraire le pourcentage de progression
          const progressMatch = output.match(/(\d+\.?\d*)%/);
          if (progressMatch) {
            progressPercent = Math.floor(parseFloat(progressMatch[1]));
            this.emitProgress('downloading', Math.min(95, progressPercent), `Downloading ultra high quality video: ${progressPercent}%`);
            lastProgressUpdate = Date.now();
          }
          
          // Log les informations sur la qualité si disponibles
          if (output.includes('format') && output.includes('resolution')) {
            console.log(`Format info: ${output.trim()}`);
          }
        });
        
        downloadProcess.stderr.on('data', (data) => {
          console.log(`yt-dlp stderr: ${data.toString().trim()}`);
        });
        
        // Mettre à jour la progression artificiellement si aucune mise à jour n'est reçue
        const progressInterval = setInterval(() => {
          const now = Date.now();
          if (!downloadCompleted && now - lastProgressUpdate > 8000) {
            // Si pas de mise à jour depuis 8 secondes, incrémenter artificiellement
            progressPercent += 2;
            if (progressPercent <= 90) {
              this.emitProgress('downloading', progressPercent, `Downloading video (estimated): ${progressPercent}%`);
              lastProgressUpdate = now;
            }
          }
        }, 8000);
        
        await new Promise<void>((resolve, reject) => {
          downloadProcess.on('close', (code) => {
            clearInterval(progressInterval);
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000000) { // Au moins 1MB
              downloadCompleted = true;
              this.emitProgress('downloading', 100, 'Ultra high quality video download complete');
              resolve();
            } else {
              reject(new Error(`Ultra high quality download failed with code ${code}`));
            }
          });
          
          // Timeout pour cette méthode
          setTimeout(() => {
            if (!downloadCompleted) {
              downloadProcess.kill();
              reject(new Error('Ultra high quality download timeout'));
            }
          }, downloadTimeout);
        });
        
        // Vérifier la qualité du fichier téléchargé
        const videoInfo = await this.checkVideoQuality(outputPath).catch(e => {
          console.warn(`Failed to check video quality: ${e.message}`);
          return { width: 0, height: 0 };
        });
        
        console.log(`Downloaded video quality: ${videoInfo.width}x${videoInfo.height}`);
        
        // Si la qualité est acceptable, retourner le chemin
        if (videoInfo.width >= 1280 && videoInfo.height >= 720) {
          console.log(`Successfully downloaded high quality video (${videoInfo.width}x${videoInfo.height})`);
          return outputPath;
        } else {
          console.warn(`Video quality below HD (${videoInfo.width}x${videoInfo.height}), trying alternative method`);
          throw new Error('Video quality below HD standard, trying alternative method');
        }
        
      } catch (ultraHighQualityError) {
        console.warn(`Ultra high quality download method failed: ${ultraHighQualityError.message}`);
        this.emitProgress('downloading', 60, 'Trying high quality download method');
        
        // Méthode alternative: haute qualité
        try {
          const highQualityArgs = [
            // Sélectionner la meilleure qualité vidéo (1080p)
            '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--no-check-certificate',
            '--no-playlist',
            '--retries', '3',
            '--fragment-retries', '5',
            '--buffer-size', '8M',
            '--progress',
            '--newline',
            '-o', altOutputPath
          ];
          
          // Ajouter la limitation de durée
          if (startTime && startTime > 0) {
            highQualityArgs.push('--download-sections', `*${startTime}-${startTime + MAX_DOWNLOAD_DURATION}`);
            console.log(`Downloading 5 minutes of high quality video: from ${startTime}s to ${startTime + MAX_DOWNLOAD_DURATION}s`);
          } else {
            highQualityArgs.push('--download-sections', `*0-${MAX_DOWNLOAD_DURATION}`);
            console.log(`Downloading first 5 minutes of high quality video (${MAX_DOWNLOAD_DURATION}s)`);
          }
          
          // Ajouter l'URL à la fin
          highQualityArgs.push(url);
          
          console.log(`Executing high quality download: yt-dlp ${highQualityArgs.join(' ')}`);
          
          let progressPercent = 60;
          let lastProgressUpdate = Date.now();
          
          const highQualityProcess = spawn('yt-dlp', highQualityArgs);
          
          // Suivre la progression
          highQualityProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const progressMatch = output.match(/(\d+\.?\d*)%/);
            if (progressMatch) {
              progressPercent = 60 + Math.floor(parseFloat(progressMatch[1]) * 0.2); // Scale to 60-80%
              this.emitProgress('downloading', progressPercent, `Downloading high quality video: ${progressPercent}%`);
              lastProgressUpdate = Date.now();
            }
          });
          
          highQualityProcess.stderr.on('data', (data) => {
            console.log(`High quality download stderr: ${data.toString().trim()}`);
          });
          
          // Mettre à jour la progression artificiellement
          const progressInterval = setInterval(() => {
            const now = Date.now();
            if (!downloadCompleted && now - lastProgressUpdate > 8000) {
              progressPercent += 2;
              if (progressPercent <= 80) {
                this.emitProgress('downloading', progressPercent, `Downloading high quality video (estimated): ${progressPercent}%`);
                lastProgressUpdate = now;
              }
            }
          }, 8000);
          
          await new Promise<void>((resolve, reject) => {
            highQualityProcess.on('close', (code) => {
              clearInterval(progressInterval);
              if (code === 0 && fs.existsSync(altOutputPath) && fs.statSync(altOutputPath).size > 500000) {
                downloadCompleted = true;
                this.emitProgress('downloading', 80, 'High quality download complete');
                resolve();
              } else {
                reject(new Error(`High quality download failed with code ${code}`));
              }
            });
            
            // Timeout pour cette méthode
            setTimeout(() => {
              if (!downloadCompleted) {
                highQualityProcess.kill();
                reject(new Error('High quality download timeout'));
              }
            }, downloadTimeout);
          });
          
          // Vérifier la qualité
          const videoInfo = await this.checkVideoQuality(altOutputPath).catch(e => {
            console.warn(`Failed to check video quality: ${e.message}`);
            return { width: 0, height: 0 };
          });
          
          console.log(`Alternative download video quality: ${videoInfo.width}x${videoInfo.height}`);
          
          return altOutputPath;
        } catch (highQualityError) {
          console.warn(`High quality download method failed: ${highQualityError.message}`);
          this.emitProgress('downloading', 80, 'Trying direct download method');
          
          // Méthode de dernier recours: téléchargement direct avec curl
          try {
            // Obtenir l'URL directe avec yt-dlp
            const directUrl = await new Promise<string>((resolve, reject) => {
              const getUrlArgs = [
                '--get-url',
                '-f', 'bestvideo+bestaudio/best',
                url
              ];
              
              const getUrlProcess = spawn('yt-dlp', getUrlArgs);
              
              let urlOutput = '';
              getUrlProcess.stdout.on('data', (data) => {
                urlOutput += data.toString().trim();
              });
              
              getUrlProcess.on('close', (code) => {
                if (code === 0 && urlOutput) {
                  resolve(urlOutput);
                } else {
                  reject(new Error('Failed to get direct URL'));
                }
              });
              
              setTimeout(() => {
                getUrlProcess.kill();
                reject(new Error('Get URL timeout'));
              }, 30000);
            });
            
            console.log(`Got direct URL, downloading with curl...`);
            
            // Télécharger avec curl
            await new Promise<void>((resolve, reject) => {
              const curlProcess = spawn('curl', [
                '-L',
                '--retry', '5',
                '--retry-delay', '2',
                '--connect-timeout', '30',
                '--max-time', '120',
                '-o', outputPath,
                directUrl
              ]);
              
              curlProcess.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100000) {
                  this.emitProgress('downloading', 100, 'Direct download complete');
                  resolve();
                } else {
                  reject(new Error(`curl download failed with code ${code}`));
                }
              });
              
              setTimeout(() => {
                curlProcess.kill();
                reject(new Error('curl download timeout'));
              }, 120000);
            });
            
            console.log(`Direct download completed: ${outputPath}`);
            return outputPath;
          } catch (directError) {
            console.error(`Direct download failed: ${directError.message}`);
            throw new Error('All download methods failed');
          }
        }
      }
    } catch (error) {
      console.error(`All download methods failed: ${error.message}`);
      
      // Créer un fichier vide pour éviter de bloquer le processus
      if (!fs.existsSync(outputPath)) {
        try {
          // Créer un fichier MP4 minimal valide
          const minimalMp4Path = path.join(__dirname, '../../../assets/minimal.mp4');
          if (fs.existsSync(minimalMp4Path)) {
            fs.copyFileSync(minimalMp4Path, outputPath);
          } else {
            // Si le fichier minimal n'existe pas, créer un fichier vide
            fs.writeFileSync(outputPath, Buffer.from([0]));
          }
          console.warn('Created placeholder file due to download failure');
        } catch (e) {
          console.error(`Failed to create placeholder file: ${e.message}`);
        }
      }
      
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  public async combineVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    subtitlesPath?: string
  ): Promise<void> {
    try {
      console.log(`Combining video, audio and subtitles:
      - Video: ${videoPath}
      - Audio: ${audioPath}
      - Subtitles: ${subtitlesPath || 'none'}
      - Output: ${outputPath}`);
      
      // Vérifier que tous les fichiers nécessaires existent
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
      if (subtitlesPath && !fs.existsSync(subtitlesPath)) {
        throw new Error(`Subtitles file not found: ${subtitlesPath}`);
      }

      // Ensure all paths are absolute
      const absoluteVideoPath = videoPath.startsWith(process.cwd())
        ? videoPath
        : path.resolve(process.cwd(), videoPath.replace(/^\//, ''));
      
      const absoluteAudioPath = path.resolve(audioPath);
      const absoluteOutputPath = path.resolve(outputPath);

      // Ensure absolute path and proper escaping for subtitles
      const subtitlesPathUnix = subtitlesPath 
        ? path.resolve(subtitlesPath).replace(/\\/g, '/').replace(/'/g, "'\\''")
        : '';
      
      // Vérifier que l'audio existe et a une durée
      const audioDuration = await this.getAudioDuration(absoluteAudioPath);
      console.log(`Audio duration: ${audioDuration}s`);
      if (audioDuration <= 0) {
        throw new Error('Audio file has no duration');
      }

      // Build filter_complex string optimisé pour les sous-titres verticaux
      let filterComplex: string;
      if (subtitlesPath) {
        const ext = path.extname(subtitlesPathUnix).toLowerCase();
        if (ext === '.ass') {
          // ASS permet un contrôle plus précis du style des sous-titres
          // Nous utilisons l'alignement 8 (centré) pour le format 9:16
          filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]ass='${subtitlesPathUnix}'[v]`;
        } else {
          filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]subtitles='${subtitlesPathUnix}:force_style=Fontname=Arial\\,FontSize=72\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1\\,BorderStyle=3\\,Outline=2\\,Shadow=0\\,Spacing=0.5:original_size=1080x1920'[v]`;
        }
      } else {
        filterComplex = '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[v]';
      }

      return new Promise((resolve, reject) => {
        // Construire une commande FFmpeg qui garantit une bonne synchronisation audio/sous-titres
        const ffmpegArgs = [
          '-i', absoluteVideoPath,       // Entrée vidéo
          '-i', absoluteAudioPath,       // Entrée audio
          '-filter_complex', filterComplex,
          '-map', '[v]',                 // Utiliser la sortie du filtre vidéo
          '-map', '1:a',                 // Utiliser l'audio d'ElevenLabs
          '-c:v', 'libx264',             // Codec vidéo
          '-profile:v', 'high',          // Profil vidéo haute qualité
          '-preset', 'medium',           // Bon équilibre vitesse/qualité
          '-crf', '18',                  // Qualité visuelle élevée
          '-c:a', 'aac',                 // Codec audio AAC compatible
          '-b:a', '192k',                // Bitrate audio (qualité)
          '-shortest',                   // Durée = flux le plus court
          '-async', '1',                 // Améliore la synchronisation A/V
          '-y',                          // Écraser fichier si existant
          absoluteOutputPath
        ];

        console.log('Executing FFmpeg with args:', ffmpegArgs.join(' '));

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        let stderr = '';

        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
          // Log uniquement les lignes importantes pour éviter de saturer les logs
          if (data.toString().includes('frame=') && data.toString().includes('time=')) {
            console.log('FFmpeg progress:', data.toString().trim());
          }
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('FFmpeg process completed successfully - Video, audio and subtitles combined');
            
            // Vérifier que le fichier de sortie existe et a une taille
            if (fs.existsSync(absoluteOutputPath)) {
              const stats = fs.statSync(absoluteOutputPath);
              console.log(`Output file size: ${stats.size} bytes`);
            }
            
            resolve();
          } else {
            console.error('FFmpeg error:', stderr);
            reject(new Error(`FFmpeg error: ${stderr}`));
          }
        });
      });
    } catch (error) {
      console.error('Error combining video and audio:', error);
      throw error;
    }
  }

  private async createASS(
    subtitleLines: Array<{ start: string; end: string; text: string }>,
    outputPath: string
  ): Promise<string> {
    console.log(`Creating ASS subtitle file with ${subtitleLines.length} lines at ${outputPath}`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Standard ASS header with simplified style
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
Aspect Ratio: 9:16
Collisions: Normal
Timer: 100.0000
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
; Style for all text - centered at bottom of screen (Alignment=2)
Style: Default,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,1,2,10,10,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Generate event lines for each subtitle with simplified formatting
    const events = subtitleLines.map(line => {
      // Escape special characters in ASS format
      const escapedText = line.text
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');
      
      // Use simple dialogue format without complex positioning
      return `Dialogue: 0,${line.start},${line.end},Default,,0,0,0,,${escapedText}`;
    }).join('\n');

    // Write the ASS file
    const content = header + events;
    fs.writeFileSync(outputPath, content);
    
    console.log(`ASS subtitle file created successfully: ${outputPath}`);
    return outputPath;
  }

  private async detectSilences(audioPath: string): Promise<Array<{start: number, end: number}>> {
    return new Promise((resolve, reject) => {
      const silences: Array<{start: number, end: number}> = [];
      
      console.log(`Detecting silences in ${audioPath}`);
      
      // Utiliser des paramètres plus sensibles pour la détection de silence
      // avec Elevenlabs, qui a souvent peu de silences nettes
      // noise: -30dB (plus sensible) et d: 0.2s (durée minimale)
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', 'silencedetect=noise=-30dB:d=0.2', 
        '-f', 'null',
        '-'
      ]);

      let output = '';
      ffmpeg.stderr.on('data', (data) => {
        output += data.toString();
      });

      ffmpeg.on('close', () => {
        console.log("Silence detection completed");
        
        // Analyser la sortie pour trouver les points de silence
        const silenceStarts = output.match(/silence_start: ([\d.]+)/g) || [];
        const silenceEnds = output.match(/silence_end: ([\d.]+)/g) || [];
        
        console.log(`Found ${silenceStarts.length} silence starts and ${silenceEnds.length} silence ends`);

        for (let i = 0; i < Math.min(silenceStarts.length, silenceEnds.length); i++) {
          const start = parseFloat(silenceStarts[i].split(': ')[1]);
          const end = parseFloat(silenceEnds[i].split(': ')[1]);
          
          // Ne prendre en compte que les silences significatifs (> 0.15s)
          if (end - start >= 0.15) {
            silences.push({ start, end });
            console.log(`Detected silence from ${start.toFixed(2)}s to ${end.toFixed(2)}s (duration: ${(end-start).toFixed(2)}s)`);
          }
        }
        
        // Si nous avons peu de silences mais un audio assez long, essayer de découper en segments réguliers
        if (silences.length < 3) {
          console.log("Few silences detected, attempting to add artificial breakpoints");
          
          // Tenter d'analyser la durée totale depuis la sortie si possible
          let totalDuration = 0;
          const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            totalDuration = hours * 3600 + minutes * 60 + seconds;
          }
          
          if (totalDuration > 15) {
            // Ajouter des points de segmentation artificiels tous les ~5-10 secondes
            // (mais pas là où il y a déjà des silences)
            const segmentInterval = 8; // Intervalle en secondes
            for (let time = segmentInterval; time < totalDuration - segmentInterval/2; time += segmentInterval) {
              // Vérifier que ce point n'est pas trop proche d'un silence existant
              const tooClose = silences.some(s => 
                (time >= s.start - 1 && time <= s.end + 1)
              );
              
              if (!tooClose) {
                // Ajouter un point de silence artificiel de 0.1s
                silences.push({ 
                  start: time - 0.05, 
                  end: time + 0.05 
                });
                console.log(`Added artificial breakpoint at ${time.toFixed(2)}s`);
              }
            }
          }
        }
        
        // Trier les silences par ordre chronologique
        silences.sort((a, b) => a.start - b.start);
        
        resolve(silences);
      });

      ffmpeg.on('error', (err) => {
        console.error("Error detecting silences:", err);
        reject(err);
      });
    });
  }

  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(parseFloat(output.trim()));
        } else {
          reject(new Error('Failed to get audio duration'));
        }
      });
    });
  }

  // Fonction pour formater le temps en format SRT (HH:MM:SS,mmm)
  private formatSRTTime(seconds: number): string {
    const date = new Date(seconds * 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
  }

  private formatASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);
    
    return `${hours.toString().padStart(1, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
  }

  // Ajouter cette nouvelle méthode pour vérifier la durée
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(parseFloat(output.trim()));
        } else {
          reject(new Error('Failed to get video duration'));
        }
      });
    });
  }

  async convertVideo(options: ConvertOptions): Promise<string> {
    const tempInputPath = path.join(this.tempDir, `temp_input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(this.tempDir, `temp_output_${Date.now()}.mp4`);
    
    try {
      // Télécharger la vidéo
      await downloadVideo(options.url, {
        output: tempInputPath,
        format: 'bestvideo[ext=mp4][height>=1080][vcodec^=avc1]/bestvideo[height>=1080]+bestaudio/best',
        downloadOptions: {
          start_time: options.startTime,
          duration: this.TARGET_DURATION,
          ytdlpOptions: [
            '--format-sort', 'res,fps,vcodec,acodec,br,size',
            '--no-format-sort-force',
            '--video-multistreams',
            '--audio-multistreams'
          ]
        }
      });

      if (!fs.existsSync(tempInputPath)) {
        throw new Error('Downloaded video file not found');
      }

      // Convertir la vidéo
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', tempInputPath,
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:v', '2M',
          '-y',
          tempOutputPath
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg process exited with code ${code}`));
          }
        });

        ffmpeg.on('error', (err) => {
          reject(new Error(`FFmpeg process error: ${err.message}`));
        });
      });

      // Vérifier que le fichier de sortie existe
      if (!fs.existsSync(tempOutputPath)) {
        throw new Error('Converted video file not found');
      }

      return tempOutputPath;

    } catch (error) {
      console.error('Erreur lors de la conversion:', error);
      // Nettoyer les fichiers temporaires en cas d'erreur
      this.cleanupTempFiles(tempInputPath);
      throw new Error(`Failed to convert video: ${error.message}`);
    }
  }

  private cleanupTempFiles(directory: string): void {
    try {
      if (fs.existsSync(directory)) {
        // Get all files in the directory
        const files = fs.readdirSync(directory);
        
        // Delete each file individually
        for (const file of files) {
          try {
            const filePath = path.join(directory, file);
            if (fs.lstatSync(filePath).isDirectory()) {
              // Recursively clean subdirectories
              this.cleanupTempFiles(filePath);
            } else {
              // Delete file
              fs.unlinkSync(filePath);
            }
          } catch (fileError) {
            console.warn(`Failed to cleanup temp file ${path.join(directory, file)}: ${fileError.message}`);
            // Continue with other files
          }
        }
        
        // Try to remove the directory itself, but don't fail if it can't be removed
        try {
          fs.rmdirSync(directory);
        } catch (dirError) {
          console.warn(`Could not remove directory ${directory}: ${dirError.message}`);
        }
      }
    } catch (error) {
      console.warn(`Error during cleanup of ${directory}: ${error.message}`);
      // Don't throw the error to avoid failing the whole process
    }
  }

  private async processVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0',
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '16',
        '-maxrate', '8M',
        '-bufsize', '16M',
        '-profile:v', 'high',
        '-level', '4.2',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '320k',
        '-ar', '48000',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data) => {
        console.log('FFmpeg progress:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg process failed with code ${code}`));
        }
      });
    });
  }

  public async addSubtitlesToVideo(
    inputPath: string,
    subtitlesPath: string,
    outputPath: string,
    style: 'classic' | 'modern' = 'modern'
  ): Promise<void> {
    try {
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      if (!fs.existsSync(subtitlesPath)) {
        throw new Error(`Subtitles file not found: ${subtitlesPath}`);
      }

      // Create a temporary output path if input and output are the same
      const tempOutputPath = inputPath === outputPath 
        ? path.join(path.dirname(outputPath), `temp_${Date.now()}_output.mp4`)
        : outputPath;

      // Ensure absolute path and proper escaping
      const subtitlesPathUnix = path.resolve(subtitlesPath).replace(/\\/g, '/').replace(/'/g, "'\\''");
      
      // Define the subtitle style
      const subtitleStyle = style === 'classic'
        ? 'Fontname=Montserrat\\,FontSize=48\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1\\,BorderStyle=3\\,Outline=1\\,MarginV=20'
        : 'Fontname=Arial\\,FontSize=48\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1\\,MarginV=20';
      
      // Build filter_complex string...
      let filterComplex: string;
      if (path.extname(subtitlesPathUnix).toLowerCase() === '.ass') {
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]ass='${subtitlesPathUnix}':force_style=${subtitleStyle}:original_size=1080x1920:y=h-h/4[v]`;
      } else {
        filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]subtitles='${subtitlesPathUnix}':force_style=${subtitleStyle}:original_size=1080x1920:y=h-h/4[v]`;
      }

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-filter_complex', filterComplex,
          '-map', '[v]',
          '-map', '0:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'copy',
          '-y',
          tempOutputPath
        ]);

        let errorOutput = '';

        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('FFmpeg progress:', output);
          errorOutput += output;
        });

        ffmpeg.on('error', (err) => {
          reject(new Error(`FFmpeg process error: ${err.message}\n${errorOutput}`));
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            if (fs.existsSync(tempOutputPath)) {
              // If we used a temp file, move it to the final destination
              if (tempOutputPath !== outputPath) {
                fs.renameSync(tempOutputPath, outputPath);
              }
              resolve();
            } else {
              reject(new Error(`Output file was not created: ${tempOutputPath}`));
            }
          } else {
            reject(new Error(`FFmpeg process failed with code ${code}\n${errorOutput}`));
          }
        });
      });
    } catch (error) {
      console.error('Error adding subtitles:', error);
      throw error;
    }
  }

  private async checkVideoQuality(videoPath: string): Promise<{width: number, height: number, fps?: number, codec?: string, bitrate?: number}> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,codec_name,bit_rate',
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
            const stream = data.streams[0];
            
            // Calculate fps from r_frame_rate (which is in the format "num/den")
            let fps = undefined;
            if (stream.r_frame_rate) {
              const [num, den] = stream.r_frame_rate.split('/').map(Number);
              if (!isNaN(num) && !isNaN(den) && den !== 0) {
                fps = Math.round((num / den) * 100) / 100; // Round to 2 decimal places
              }
            }
            
            // Convert bitrate from string to number if available
            let bitrate = undefined;
            if (stream.bit_rate) {
              bitrate = parseInt(stream.bit_rate, 10);
            }
            
            console.log(`Video quality details: ${stream.width}x${stream.height}, ${fps || 'unknown'} fps, codec: ${stream.codec_name || 'unknown'}, bitrate: ${bitrate ? (bitrate / 1000000).toFixed(2) + ' Mbps' : 'unknown'}`);
            
            resolve({
              width: stream.width,
              height: stream.height,
              fps: fps,
              codec: stream.codec_name,
              bitrate: bitrate
            });
          } catch (error) {
            console.error(`Failed to parse video quality info: ${error.message}`);
            reject(new Error('Failed to parse video quality info'));
          }
        } else {
          reject(new Error('Failed to get video quality'));
        }
      });
      
      // Add timeout to avoid hanging
      setTimeout(() => {
        reject(new Error('Video quality check timed out'));
      }, 10000);
    });
  }

  private async extractSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    outputPath: string
  ): Promise<string> {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Verify input file exists
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Input video file does not exist: ${videoPath}`);
      }

      // Validate parameters
      if (typeof startTime !== 'number' || isNaN(startTime)) {
        console.error(`Invalid start time: ${startTime}, using 0 instead`);
        startTime = 0;
      }

      if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) {
        console.error(`Invalid duration: ${duration}, using 5 seconds instead`);
        duration = 5;
      }

      // Ensure minimum duration and cap maximum duration
      if (duration < 3) {
        console.log(`Duration too short (${duration}s), setting to minimum 3 seconds`);
        duration = 3;
      } else if (duration > 30) {
        console.log(`Duration too long (${duration}s), capping at 30 seconds`);
        duration = 30;
      }

      // Handle negative start times
      if (startTime < 0) {
        console.log(`Negative start time (${startTime}s), adjusting to 0`);
        startTime = 0;
      }

      // Format time for FFmpeg
      const formattedStart = this.formatTimeForFFmpeg(startTime);
      const formattedDuration = this.formatTimeForFFmpeg(duration);
      
      console.log(`Extracting segment from ${formattedStart} (${startTime}s) with duration ${formattedDuration} (${duration}s)`);

      // Construct FFmpeg command
      const ffmpegArgs = [
        '-ss', formattedStart,
        '-i', videoPath,
        '-t', formattedDuration,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-reset_timestamps', '1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];

      // Log the FFmpeg command for debugging
      console.log(`FFmpeg command: ${ffmpegArgs.join(' ')}`);

      // Execute FFmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let errorOutput = '';
        
        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve();
          } else {
            console.error(`FFmpeg failed with code ${code}: ${errorOutput}`);
            reject(new Error(`FFmpeg failed with code ${code}`));
          }
        });
      });
      
      return outputPath;
    } catch (error) {
      console.error(`Error extracting segment: ${error.message}`);
      
      // Try fallback method with simpler parameters
      console.log(`Attempting fallback extraction method...`);
      try {
        return await this.extractSegmentFallback(videoPath, startTime, duration, outputPath);
      } catch (fallbackError) {
        console.error(`Fallback extraction also failed: ${fallbackError.message}`);
        throw new Error(`Failed to extract segment: ${error.message}`);
      }
    }
  }
  
  private async extractSegmentFallback(
    videoPath: string,
    startTime: number,
    duration: number,
    outputPath: string
  ): Promise<string> {
    console.log(`Using fallback extraction method for segment: start=${startTime}s, duration=${duration}s`);
    
    // Utiliser une méthode plus simple avec -c copy pour la vitesse
    const ffmpegCommand = `-ss ${this.formatTimeForFFmpeg(startTime)} -i "${videoPath}" -t ${this.formatTimeForFFmpeg(duration)} -c copy "${outputPath}"`;
    console.log(`Executing fallback FFmpeg command: ffmpeg ${ffmpegCommand}`);
    
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`ffmpeg ${ffmpegCommand}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Fallback FFmpeg error: ${error.message}`);
            console.error(`Fallback FFmpeg stderr: ${stderr}`);
            reject(error);
            return;
          }
          console.log(`Fallback FFmpeg stdout: ${stdout}`);
          resolve();
        });
      });
      
      // Vérifier que le fichier de sortie existe et a une taille valide
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Fallback output file does not exist: ${outputPath}`);
      }
      
      const fileSize = fs.statSync(outputPath).size;
      if (fileSize < 1000) {
        throw new Error(`Fallback output file is too small (${fileSize} bytes): ${outputPath}`);
      }
      
      console.log(`Fallback segment extraction successful: ${outputPath} (${fileSize} bytes)`);
      return outputPath;
    } catch (error) {
      console.error(`Fallback extraction failed: ${error.message}`);
      throw error;
    }
  }

  // Fonction pour formater le temps en HH:MM:SS.mmm pour FFmpeg
  private formatTimeForFFmpeg(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  private async getVideoStreams(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean }> {
    // Attendre un peu que le fichier soit complètement écrit
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    console.log('Checking streams for file:', filePath);
    
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-hide_banner',
        '-v', 'quiet',
        '-analyzeduration', '2147483647',
        '-probesize', '2147483647',
        '-show_streams',
        '-of', 'json',
        filePath
      ]);

      let output = '';
      let errorOutput = '';

      interface FFprobeStream {
        codec_type: string;
        width?: number;
        height?: number;
        channels?: number;
        sample_rate?: number;
      }

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(output);
            const streams = data.streams || [];
            console.log('Found streams:', streams.length);
            
            const hasVideo = streams.some((stream: FFprobeStream) => 
              stream.codec_type === 'video'
            );
            const hasAudio = streams.some((stream: FFprobeStream) => 
              stream.codec_type === 'audio'
            );
            console.log('Stream validation:', { hasVideo, hasAudio });
            resolve({
              hasVideo,
              hasAudio
            });
          } catch (err) {
            console.error('Failed to parse FFprobe output:', output);
            reject(new Error(`Failed to parse stream info: ${err.message}`));
          }
        } else {
          reject(new Error(`FFprobe failed with code ${code}. Error: ${errorOutput}`));
        }
      });
    });
  }

  private async combineSegments(
    segmentPaths: string[],
    outputPath: string,
    subtitlesPath?: string
  ): Promise<void> {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    try {
      console.log(`Combining ${segmentPaths.length} segments into ${outputPath}`);
      
      // Check if we have segments to combine
      if (segmentPaths.length === 0) {
        throw new Error('No segments to combine');
      }
      
      // If there's only one segment, just copy it
      if (segmentPaths.length === 1) {
        console.log('Only one segment, copying directly');
        fs.copyFileSync(segmentPaths[0], outputPath);
        return;
      }
      
      // Éliminer les doublons en comparant les chemins de fichiers
      const uniqueSegments = Array.from(new Set(segmentPaths));
      console.log(`Removed ${segmentPaths.length - uniqueSegments.length} duplicate segments`);
      
      // Create a temporary file list for ffmpeg concat
      const listFilePath = `${outputPath}.txt`;
      const listContent = uniqueSegments.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join('\n');
      
      fs.writeFileSync(listFilePath, listContent);
      console.log(`Created list file with ${uniqueSegments.length} unique segments: ${listFilePath}`);
      
      // Combine segments using ffmpeg concat demuxer
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', listFilePath,
        '-c', 'copy',
        outputPath
      ];
      
      console.log(`Running FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let stdoutData = '';
        let stderrData = '';
        
        ffmpeg.stdout.on('data', (data) => {
          stdoutData += data.toString();
        });
        
        ffmpeg.stderr.on('data', (data) => {
          stderrData += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            console.error(`FFmpeg exited with code ${code}`);
            console.error(`FFmpeg stderr: ${stderrData}`);
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });
      });
      
      // Verify the combined file exists and has a valid size
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Combined file does not exist: ${outputPath}`);
      }
      
      const fileSize = fs.statSync(outputPath).size;
      if (fileSize < 1000) {
        throw new Error(`Combined file is too small (${fileSize} bytes): ${outputPath}`);
      }
      
      console.log(`Combined file created successfully: ${outputPath} (${fileSize} bytes)`);
      
      // Verify the combined file has valid streams
      try {
        console.log(`Checking streams for combined file: ${outputPath}`);
        const { hasVideo, hasAudio } = await this.getVideoStreams(outputPath);
        console.log(`Combined file streams: ${JSON.stringify({ hasVideo, hasAudio })}`);
        
        if (!hasVideo) {
          throw new Error(`Combined file has no valid video stream: ${outputPath}`);
        }
      } catch (error) {
        console.error(`Error probing combined file: ${error}`);
        throw new Error(`Error probing combined file: ${error.message}`);
      }
    } catch (error) {
      console.error(`Error combining segments: ${error}`);
      
      // Try alternative combination method
      console.log('Attempting alternative segment combination method...');
      try {
        await this.combineSegmentsAlternative(segmentPaths, outputPath);
      } catch (altError) {
        console.error(`Alternative combination also failed: ${altError}`);
        
        // If we have at least one valid segment, use the first one as fallback
        if (segmentPaths.length > 0 && fs.existsSync(segmentPaths[0])) {
          console.log(`Using first segment as fallback: ${segmentPaths[0]}`);
          fs.copyFileSync(segmentPaths[0], outputPath);
        } else {
          throw new Error(`Failed to combine segments and no valid fallback available`);
        }
      }
    }
  }

  private async combineSegmentsAlternative(
    segmentPaths: string[],
    outputPath: string
  ): Promise<void> {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log(`Using alternative method to combine ${segmentPaths.length} segments`);
    
    // If there's only one segment, just copy it
    if (segmentPaths.length === 1) {
      console.log('Only one segment, copying directly');
      fs.copyFileSync(segmentPaths[0], outputPath);
      return;
    }
    
    // Create a temporary directory for intermediate files
    const tempDir = path.dirname(outputPath);
    const intermediateFile = path.join(tempDir, 'intermediate.mp4');
    
    // Start with the first segment
    fs.copyFileSync(segmentPaths[0], intermediateFile);
    
    // Add each segment one by one
    for (let i = 1; i < segmentPaths.length; i++) {
      const segmentPath = segmentPaths[i];
      const nextIntermediateFile = path.join(tempDir, `intermediate_${i}.mp4`);
      
      console.log(`Adding segment ${i}: ${segmentPath}`);
      
      // Use the filter_complex method to concatenate
      const ffmpegArgs = [
        '-i', intermediateFile,
        '-i', segmentPath,
        '-filter_complex', '[0:v][0:a][1:v][1:a] concat=n=2:v=1:a=1 [v] [a]',
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        nextIntermediateFile
      ];
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.on('close', (code) => {
          if (code === 0 && fs.existsSync(nextIntermediateFile)) {
            // Update the intermediate file for the next iteration
            fs.copyFileSync(nextIntermediateFile, intermediateFile);
            fs.unlinkSync(nextIntermediateFile);
            resolve();
          } else {
            reject(new Error(`Failed to add segment ${i}`));
          }
        });
      });
    }
    
    // Copy the final intermediate file to the output path
    fs.copyFileSync(intermediateFile, outputPath);
    
    // Clean up
    if (fs.existsSync(intermediateFile)) {
      fs.unlinkSync(intermediateFile);
    }
    
    console.log(`Alternative combination completed: ${outputPath}`);
  }

  private async prepareSubtitleLines(
    script: string,
    segments: WhisperSegment[],
    audioPath?: string
  ): Promise<Array<{ start: string; end: string; text: string }>> {
    console.log(`Preparing subtitle lines for script with ${script.length} characters and ${segments.length} segments`);
    
    // Nettoyage approfondi du script pour éliminer tous les caractères indésirables
    const cleanScript = script
      .replace(/[\{\}\\\/\[\]\(\)\*\+\?\|\^\$&%#@!~`<>]/g, '') // Supprime tous les symboles spéciaux
      .replace(/\d+/g, '') // Supprime tous les chiffres
      .replace(/\d+[.:]\d+/g, '') // Supprime les timestamps comme 1:30 ou 1.30
      .replace(/\[\d+\]/g, '') // Supprime les références comme [1], [2], etc.
      .replace(/^\d+\.\s*/gm, '') // Supprime les numéros de liste comme "1. ", "2. ", etc.
      .replace(/[A-Za-z]{1,2}\d+/g, '') // Supprime les codes comme A1, B2, etc.
      .replace(/\s+/g, ' ') // Normalise les espaces
      .trim();
    
    // Final subtitle lines array
    const subtitleLines: Array<{ start: string; end: string; text: string }> = [];
    
    // Get audio duration if available for better synchronization
    let audioDuration = 85; // Default duration: 85 seconds (1min25)
    
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        console.log(`Using audio file for subtitle synchronization: ${audioPath}`);
        // Get the actual audio duration
        audioDuration = await this.getAudioDuration(audioPath);
        console.log(`Detected audio duration: ${audioDuration} seconds`);
      } catch (error) {
        console.error("Error analyzing audio file:", error);
        console.log("Falling back to standard timing calculation");
      }
    } else {
      console.log("No audio file provided, using fallback timing calculation");
    }
    
    // Check if segments contain word-level timing information
    const hasWordTimings = segments.some(segment => 
      segment.words && segment.words.length > 0 && 
      segment.words[0].start !== undefined && 
      segment.words[0].end !== undefined
    );
    
    if (hasWordTimings) {
      console.log("Using word-level timings for karaoke-style subtitles");
      
      // Extract all words with their timings
      const allWords: Array<{word: string, start: number, end: number}> = [];
      
      segments.forEach(segment => {
        if (segment.words && segment.words.length > 0) {
          segment.words.forEach(word => {
            if (word.word && word.start !== undefined && word.end !== undefined) {
              // Nettoyage approfondi du mot - version améliorée
              let cleanWord = word.word.trim();
              
              // Supprimer tous les caractères non alphanumériques sauf les espaces et la ponctuation basique
              cleanWord = cleanWord.replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, '');
              
              // Supprimer les chiffres isolés
              cleanWord = cleanWord.replace(/\b\d+\b/g, '');
              
              // Supprimer les codes comme A1, B2, etc.
              cleanWord = cleanWord.replace(/\b[A-Za-z]{1,2}\d+\b/g, '');
              
              // Ignorer les mots vides ou la ponctuation isolée
              if (cleanWord && cleanWord.length > 0 && !/^[.,;:!?'"()[\]{}]$/.test(cleanWord)) {
                allWords.push({
                  word: cleanWord,
                  start: word.start,
                  end: word.end
                });
              }
            }
          });
        }
      });
      
      // Sort words by start time
      allWords.sort((a, b) => a.start - b.start);
      
      console.log(`Extracted ${allWords.length} words with timing information`);
      
      // Simplifier l'approche karaoké pour éviter les problèmes de formatage
      // Au lieu d'afficher plusieurs mots à la fois, nous n'afficherons que le mot actuel
      // et éventuellement quelques mots avant/après pour le contexte
      for (let i = 0; i < allWords.length; i++) {
        const currentWord = allWords[i];
        const nextWord = allWords[i + 1];
        
        // Current word becomes yellow from its start until the start of the next word
        const startTime = currentWord.start;
        // If it's the last word, use its end, otherwise use the start of the next word
        const endTime = nextWord ? nextWord.start : currentWord.end;
        
        // Limiter le nombre de mots affichés pour éviter les problèmes
        const maxWordsToShow = 3; // Réduire le nombre de mots affichés
        
        // Construire une phrase simple avec le mot actuel et quelques mots de contexte
        const contextWords = [];
        
        // Ajouter quelques mots précédents pour le contexte
        for (let j = Math.max(0, i - maxWordsToShow); j < i; j++) {
          contextWords.push(allWords[j].word);
        }
        
        // Ajouter le mot actuel
        contextWords.push(currentWord.word);
        
        // Ajouter quelques mots suivants pour le contexte
        for (let j = i + 1; j < Math.min(allWords.length, i + maxWordsToShow + 1); j++) {
          contextWords.push(allWords[j].word);
        }
        
        // Créer le texte final - version simplifiée sans balises ASS complexes
        const finalText = contextWords.join(' ').toUpperCase();
        
        // Ajouter le sous-titre
        subtitleLines.push({
          start: this.formatASSTime(startTime),
          end: this.formatASSTime(endTime),
          text: finalText
        });
      }
      
      console.log(`Created ${subtitleLines.length} simplified karaoke-style subtitle lines`);
      return subtitleLines;
    }
    
    // Fallback: use standard method if no word-level timings
    console.log("No word-level timings available, using standard subtitle generation");
    
    // Divide the script into shorter sentences for better synchronization
    const sentences = cleanScript
      .replace(/([.!?])\s*/g, "$1|")
      .split("|")
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());
    
    console.log(`Script divided into ${sentences.length} sentences`);
    
    // Limit maximum subtitle line length to 40 characters
    const MAX_LINE_LENGTH = 40;
    
    // Function to split a long sentence into shorter ones
    const splitLongSentence = (sentence: string): string[] => {
      if (sentence.length <= MAX_LINE_LENGTH) return [sentence];
      
      const parts: string[] = [];
      let currentPart = '';
      const words = sentence.split(' ');
      
      for (const word of words) {
        if ((currentPart + ' ' + word).trim().length <= MAX_LINE_LENGTH) {
          currentPart += (currentPart ? ' ' : '') + word;
        } else {
          if (currentPart) parts.push(currentPart.trim());
          currentPart = word;
        }
      }
      
      if (currentPart) parts.push(currentPart.trim());
      return parts;
    };
    
    // Split long sentences
    const shortSentences: string[] = [];
    for (const sentence of sentences) {
      if (sentence.length > MAX_LINE_LENGTH) {
        shortSentences.push(...splitLongSentence(sentence));
      } else {
        shortSentences.push(sentence);
      }
    }
    
    console.log(`After splitting long sentences: ${shortSentences.length} subtitle segments`);
    
    // Distribute subtitles evenly over the audio duration
    const totalDuration = audioDuration;
    const durationPerSentence = totalDuration / shortSentences.length;
    
    // Add a synchronization delay to better match subtitles with audio
    // This delay compensates for the time it takes for the listener to process speech
    const SYNC_DELAY = 0.5; // 0.5 second delay
    
    for (let i = 0; i < shortSentences.length; i++) {
      // Nettoyage final de la phrase avant de l'afficher - version améliorée
      let cleanSentence = shortSentences[i];
      
      // Supprimer tous les caractères non alphanumériques sauf les espaces et la ponctuation basique
      cleanSentence = cleanSentence.replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, '');
      
      // Supprimer les chiffres isolés
      cleanSentence = cleanSentence.replace(/\b\d+\b/g, '');
      
      // Supprimer les codes comme A1, B2, etc.
      cleanSentence = cleanSentence.replace(/\b[A-Za-z]{1,2}\d+\b/g, '');
      
      // Convertir en majuscules
      cleanSentence = cleanSentence.toUpperCase();
      
      // Add synchronization delay to start time
      const startTime = i * durationPerSentence + SYNC_DELAY;
      const endTime = Math.min((i + 1) * durationPerSentence + SYNC_DELAY, totalDuration);
      
      // Simplifier le formatage du texte pour éviter les problèmes avec ASS
      subtitleLines.push({
        start: this.formatASSTime(startTime),
        end: this.formatASSTime(endTime),
        text: cleanSentence
      });
    }
    
    console.log(`Created ${subtitleLines.length} standard subtitle lines`);
    return subtitleLines;
  }

  private async generateViralScript(transcript: string): Promise<string> {
    console.log('Début de la génération du script viral...');
    console.log(`Longueur de la transcription: ${transcript.length} caractères`);
    
    // Vérifier que la transcription n'est pas vide
    if (!transcript || transcript.trim().length === 0) {
      console.error("Transcription vide, impossible de générer un script");
      return "La transcription de cette vidéo n'a pas pu être générée correctement.";
    }
    
    // Vérifier que la clé API OpenAI est définie
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY n'est pas définie dans les variables d'environnement");
      console.log("Utilisation de la transcription originale comme fallback");
      return transcript;
    }
    
    const prompt = `
      Réécris ce contenu en un script viral de 85 secondes (1min25).
      IMPORTANT:
      - Le script DOIT ÊTRE DIRECTEMENT LIÉ AU CONTENU ORIGINAL DE LA VIDÉO
      - Utilise UNIQUEMENT les informations présentes dans le contenu original
      - Le script doit faire entre 200-250 mots (pour une durée de 85 secondes)
      - Divise le script en paragraphes courts et percutants
      - NE PAS numéroter ou étiqueter les segments (pas de "Segment 1:", etc.)
      - Garde tous les faits, chiffres et informations clés du contenu original
      - Utilise un style dynamique et engageant
      - Ajoute des transitions naturelles entre les idées
      - IMPORTANT: Assure-toi que le script est suffisamment long pour une vidéo de 85 secondes
      - N'UTILISE PAS de symboles spéciaux, de codes ou de caractères qui ne sont pas des lettres standard
      - ÉVITE ABSOLUMENT les caractères comme {}, [], (), *, +, ?, |, ^, $, &, %, #, @, !, ~, backtick, <, >
      - N'INCLUS PAS de chiffres ou de nombres dans le texte
      
      Contenu original: ${transcript}
    `;

    try {
      console.log('Génération du script viral avec GPT-4o...');
      console.log(`Clé API OpenAI disponible: ${process.env.OPENAI_API_KEY ? 'Oui' : 'Non'}`);
      
      // Tentative d'appel à l'API OpenAI avec un timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout lors de l'appel à l'API OpenAI")), 30000);
      });
      
      const apiCallPromise = axios.post<{
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      }>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "Tu es un expert en création de scripts viraux pour les réseaux sociaux. Ta tâche est de réécrire le contenu fourni en un script engageant qui CONSERVE FIDÈLEMENT les informations originales. N'invente JAMAIS de nouveaux faits ou informations qui ne sont pas dans le contenu original. Assure-toi que le script fait entre 200 et 250 mots pour une durée de lecture de 85 secondes. NE PAS inclure de numéros de segments ou d'étiquettes comme 'Segment 1:' dans le script final. N'utilise PAS de symboles spéciaux, de codes ou de caractères qui ne sont pas des lettres standard. Évite ABSOLUMENT les caractères comme {}, [], (), *, +, ?, |, ^, $, &, %, #, @, !, ~, backtick, <, >. N'inclus PAS de chiffres ou de nombres dans le texte."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          }
        }
      );
      
      // Race entre le timeout et l'appel API
      const response = await Promise.race([apiCallPromise, timeoutPromise]) as any;
      
      console.log('Réponse reçue de l\'API OpenAI');
      console.log(`Status de la réponse: ${response.status}`);
      console.log(`Nombre de choix: ${response.data?.choices?.length || 0}`);

      const script = response.data.choices[0]?.message?.content?.trim();
      
      if (!script) {
        console.error("Réponse vide de l'API GPT");
        console.log("Utilisation de la transcription originale comme fallback");
        return transcript;
      }
      
      console.log(`Script brut généré: ${script.substring(0, 100)}...`);
      
      // Nettoyer le script pour enlever les numéros de segments ou étiquettes
      let cleanedScript = script
        .replace(/Segment \d+\s*:?\s*/gi, '')
        .replace(/Section \d+\s*:?\s*/gi, '')
        .replace(/Partie \d+\s*:?\s*/gi, '')
        .replace(/\[\d+\]\s*/g, '')
        .replace(/^\d+\.\s*/gm, '');
      
      // Nettoyage approfondi pour éliminer tous les caractères indésirables
      cleanedScript = cleanedScript
        .replace(/[\{\}\\\/\[\]\(\)\*\+\?\|\^\$&%#@!~`<>]/g, '') // Supprime tous les symboles spéciaux
        .replace(/\d+/g, '') // Supprime tous les chiffres
        .replace(/\d+[.:]\d+/g, '') // Supprime les timestamps comme 1:30 ou 1.30
        .replace(/[A-Za-z]{1,2}\d+/g, '') // Supprime les codes comme A1, B2, etc.
        .replace(/\s+/g, ' ') // Normalise les espaces
        .trim();
      
      // Vérifier la longueur du script
      const wordCount = cleanedScript.split(/\s+/).length;
      console.log(`Script viral nettoyé généré (${wordCount} mots)`);
      
      // Si le script est trop court, essayer de l'étendre
      if (wordCount < 180) {
        console.log("Script trop court, tentative d'extension...");
        
        const extensionPrompt = `
          Le script suivant est trop court pour une vidéo de 85 secondes. 
          Étends-le pour qu'il atteigne 200-250 mots tout en conservant le même style et les mêmes informations.
          Ajoute plus de détails, d'exemples ou de répétitions des points clés.
          Ne change pas le sens ou le message principal.
          N'utilise PAS de symboles spéciaux, de codes ou de caractères qui ne sont pas des lettres standard.
          Évite ABSOLUMENT les caractères comme {}, [], (), *, +, ?, |, ^, $, &, %, #, @, !, ~, backtick, <, >.
          N'inclus PAS de chiffres ou de nombres dans le texte.
          
          Script à étendre: ${cleanedScript}
        `;
        
        try {
          const extensionResponse = await axios.post<{
            choices: Array<{
              message: {
                content: string;
              };
            }>;
          }>(
            "https://api.openai.com/v1/chat/completions",
            {
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "Tu es un expert en création de scripts viraux pour les réseaux sociaux. Ta tâche est d'étendre le script fourni pour qu'il atteigne 200-250 mots tout en conservant le même style et les mêmes informations. N'utilise PAS de symboles spéciaux, de codes ou de caractères qui ne sont pas des lettres standard. Évite ABSOLUMENT les caractères comme {}, [], (), *, +, ?, |, ^, $, &, %, #, @, !, ~, backtick, <, >. N'inclus PAS de chiffres ou de nombres dans le texte."
                },
                {
                  role: "user",
                  content: extensionPrompt
                }
              ],
              temperature: 0.7,
              max_tokens: 1000
            },
            {
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
              }
            }
          );
          
          let extendedScript = extensionResponse.data.choices[0]?.message?.content?.trim();
          
          if (extendedScript) {
            // Nettoyage approfondi du script étendu
            extendedScript = extendedScript
              .replace(/[\{\}\\\/\[\]\(\)\*\+\?\|\^\$&%#@!~`<>]/g, '') // Supprime tous les symboles spéciaux
              .replace(/\d+/g, '') // Supprime tous les chiffres
              .replace(/\d+[.:]\d+/g, '') // Supprime les timestamps comme 1:30 ou 1.30
              .replace(/[A-Za-z]{1,2}\d+/g, '') // Supprime les codes comme A1, B2, etc.
              .replace(/\s+/g, ' ') // Normalise les espaces
              .trim();
            
            const extendedWordCount = extendedScript.split(/\s+/).length;
            console.log(`Script étendu généré (${extendedWordCount} mots)`);
            return extendedScript;
          }
        } catch (extensionError) {
          console.error("Erreur lors de l'extension du script:", extensionError);
          // Continuer avec le script non étendu
        }
      }
      
      return cleanedScript;
    } catch (error) {
      console.error("Erreur lors de la génération du script viral:", error);
      console.log("Utilisation de la transcription originale comme fallback");
      
      // En cas d'erreur, utiliser la transcription originale comme fallback
      return transcript;
    }
  }

  // Helper method to deduplicate segments
  private deduplicateSegments(segments: WhisperSegment[]): WhisperSegment[] {
    const uniqueSegments: WhisperSegment[] = [];
    const seenKeys = new Set<string>();
    
    for (const segment of segments) {
      const key = `${segment.start}-${segment.end}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueSegments.push(segment);
      } else {
        console.log(`Skipping duplicate segment: ${segment.start}s-${segment.end}s`);
      }
    }
    
    return uniqueSegments;
  }

  private async transcribeVideo(videoPath: string, language: string = 'en'): Promise<TranscriptionResponse> {
    console.log(`Starting transcription for: ${videoPath}`);
    
    // Add a global timeout for the entire transcription process
    const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    let transcriptionTimedOut = false;
    
    // Create a timeout promise that will resolve after the global timeout
    const timeoutPromise = new Promise<TranscriptionResponse>((resolve) => {
      setTimeout(() => {
        console.log(`Transcription global timeout reached after ${GLOBAL_TIMEOUT/1000} seconds`);
        transcriptionTimedOut = true;
        
        // Create a placeholder response
        resolve({
          transcription: "This video could not be automatically transcribed due to timeout.",
          segments: [
            {
              start: 0,
              end: 5,
              text: "This video could not be automatically transcribed due to timeout.",
              words: [
                { word: "This", start: 0, end: 0.5 },
                { word: "video", start: 0.5, end: 1 },
                { word: "could", start: 1, end: 1.5 },
                { word: "not", start: 1.5, end: 2 },
                { word: "be", start: 2, end: 2.5 },
                { word: "automatically", start: 2.5, end: 3.5 },
                { word: "transcribed", start: 3.5, end: 4.5 },
                { word: "due", start: 4.5, end: 4.7 },
                { word: "to", start: 4.7, end: 4.8 },
                { word: "timeout.", start: 4.8, end: 5 }
              ]
            }
          ]
        });
      }, GLOBAL_TIMEOUT);
    });
    
    // Create the actual transcription promise
    const transcriptionPromise = (async () => {
      const MAX_RETRIES = 3;
      let retryCount = 0;
      let lastError: Error | null = null;
      
      while (retryCount < MAX_RETRIES && !transcriptionTimedOut) {
        try {
          // Call the transcribeVideo method from ScriptProcessorService
          const result = await this.scriptProcessor.transcribeVideo(videoPath);
          
          console.log(`Whisper API response: ${JSON.stringify({
            hasText: !!result.transcript,
            hasTranscription: !!result.transcript,
            segmentsCount: result.segments?.length || 0
          })}`);
          
          // If we got a valid response with transcript, return it
          if (result.transcript) {
            return {
              transcription: result.transcript,
              segments: result.segments || []
            };
          } else {
            // If no transcript but no error, retry
            console.warn(`Transcription attempt ${retryCount + 1} returned empty result, retrying...`);
            retryCount++;
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retryCount)));
          }
        } catch (error) {
          lastError = error as Error;
          console.error(`Error transcribing video (attempt ${retryCount + 1}): ${error.message}`);
          
          // Check if this is a retryable error
          const isRetryable = 
            error.message.includes('Prediction interrupted') || 
            error.message.includes('retry') ||
            error.message.includes('timeout') ||
            error.message.includes('rate limit');
          
          if (isRetryable && retryCount < MAX_RETRIES - 1) {
            retryCount++;
            console.log(`Retrying transcription in ${2 * Math.pow(2, retryCount)} seconds...`);
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retryCount)));
          } else {
            // If not retryable or last retry, try fallback method
            break;
          }
        }
      }
      
      // If we've exhausted retries or timed out, try a fallback approach
      if (!transcriptionTimedOut) {
        try {
          console.log('Attempting fallback transcription method...');
          this.emitProgress('transcribing', 50, 'Using fallback transcription method');
          
          // Try to extract audio first for better transcription
          const audioPath = path.join(path.dirname(videoPath), 'extracted_audio.mp3');
          
          await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
              '-i', videoPath,
              '-q:a', '0',
              '-map', 'a',
              '-y',
              audioPath
            ]);
            
            ffmpeg.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`Failed to extract audio with code ${code}`));
              }
            });
          });
          
          // Now try transcription with the extracted audio
          if (fs.existsSync(audioPath)) {
            const result = await this.scriptProcessor.transcribeVideo(audioPath);
            
            // Clean up the temporary audio file
            try {
              fs.unlinkSync(audioPath);
            } catch (e) {
              console.warn(`Failed to delete temporary audio file: ${e.message}`);
            }
            
            if (result.transcript) {
              return {
                transcription: result.transcript,
                segments: result.segments || []
              };
            }
          }
        } catch (fallbackError) {
          console.error(`Fallback transcription failed: ${fallbackError.message}`);
        }
      }
      
      // If we still don't have a transcript, create a minimal placeholder
      console.warn('Fallback transcription also failed, using placeholder');
      this.emitProgress('transcribing', 90, 'Creating placeholder transcript');
      
      return {
        transcription: "This video could not be automatically transcribed. Please try again later.",
        segments: [
          {
            start: 0,
            end: 5,
            text: "This video could not be automatically transcribed.",
            words: [
              { word: "This", start: 0, end: 0.5 },
              { word: "video", start: 0.5, end: 1 },
              { word: "could", start: 1, end: 1.5 },
              { word: "not", start: 1.5, end: 2 },
              { word: "be", start: 2, end: 2.5 },
              { word: "automatically", start: 2.5, end: 3.5 },
              { word: "transcribed.", start: 3.5, end: 5 }
            ]
          }
        ]
      };
    })();
    
    // Race between the timeout and the actual transcription
    return Promise.race([timeoutPromise, transcriptionPromise]);
  }

  private async generateVoiceAudio(script: string, outputPath: string, voiceStyle: string = "default"): Promise<string> {
    console.log(`Generating voice audio for script with ${script.length} characters`);
    
    // Vérifier que le répertoire de sortie existe
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    try {
      // Use the scriptProcessor's generateVoice method instead of gtts-cli
      const generatedPath = await this.scriptProcessor.generateVoice(script, voiceStyle);
      
      // Copy the generated file to the expected output path if they're different
      if (generatedPath !== outputPath && fs.existsSync(generatedPath)) {
        fs.copyFileSync(generatedPath, outputPath);
        // Clean up the original file
        try {
          fs.unlinkSync(generatedPath);
        } catch (err) {
          console.warn(`Warning: Could not delete temporary voice file: ${generatedPath}`, err);
        }
      }
      
      // Vérifier que le fichier a été généré
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Output file does not exist: ${outputPath}`);
      }
      
      const fileSize = fs.statSync(outputPath).size;
      if (fileSize < 1000) {
        throw new Error(`Output file is too small (${fileSize} bytes): ${outputPath}`);
      }
      
      console.log(`Voice audio generated successfully: ${outputPath} (${fileSize} bytes)`);
      return outputPath;
    } catch (error) {
      console.error(`Error generating voice audio: ${error.message}`);
      throw error;
    }
  }

  // Nouvelle méthode pour optimiser la vidéo pour la lecture web
  private async optimizeForWebPlayback(inputPath: string, outputPath: string): Promise<string> {
    console.log(`Optimizing video for web playback: ${inputPath} -> ${outputPath}`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create a temporary output path to avoid overwriting the input if they're the same
    const tempOutputPath = `${outputPath}.temp.mp4`;
    
    try {
      // Check if the input file exists and has a valid size
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file does not exist: ${inputPath}`);
      }
      
      const inputSize = fs.statSync(inputPath).size;
      if (inputSize < 1000) {
        throw new Error(`Input file is too small (${inputSize} bytes): ${inputPath}`);
      }
      
      // Verify that the input file is a valid video
      const isInputValid = await isVideoValid(inputPath);
      if (!isInputValid) {
        console.warn(`Input video file is not valid: ${inputPath}`);
        // Continue anyway, as we'll try to fix it during optimization
      }
      
      return new Promise<string>((resolve, reject) => {
        // Utiliser FFmpeg pour réencoder la vidéo avec des paramètres optimisés pour le web
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'mp4',
          '-y',
          tempOutputPath
        ]);
        
        let stderr = '';
        
        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
          // Log progress information
          const line = data.toString().trim();
          if (line.includes('time=')) {
            console.log(`Optimization progress: ${line}`);
          }
        });
        
        ffmpeg.on('close', async (code) => {
          if (code === 0) {
            console.log('Video optimization completed successfully');
            
            // Vérifier que le fichier de sortie existe et a une taille valide
            if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 1000) {
              // Verify that the output file is a valid video
              const isOutputValid = await isVideoValid(tempOutputPath);
              
              if (isOutputValid) {
                console.log('Optimized video is valid');
                // Renommer le fichier temporaire en fichier final
                fs.renameSync(tempOutputPath, outputPath);
                
                // Émettre l'événement de progression finale
                this.emitProgress('finalizing', 100, 'Video finalized');
                
                // Émettre l'événement de complétion avec un délai pour s'assurer qu'il est bien reçu
                setTimeout(() => {
                  this.emitProgress('complete', 100, 'Processing complete');
                  console.log('Emitted final complete event');
                }, 1000);
                
                resolve(outputPath);
              } else {
                console.error('Optimized video is not valid, attempting repair');
                
                // Try to repair the video
                const repairPath = `${tempOutputPath}.repaired.mp4`;
                const repaired = await repairVideo(tempOutputPath, repairPath);
                
                if (repaired) {
                  console.log('Video repair successful');
                  fs.renameSync(repairPath, outputPath);
                  
                  this.emitProgress('finalizing', 100, 'Video finalized (repaired)');
                  setTimeout(() => {
                    this.emitProgress('complete', 100, 'Processing complete');
                    console.log('Emitted final complete event after repair');
                  }, 1000);
                  
                  resolve(outputPath);
                } else {
                  console.error('Video repair failed, trying fallback optimization');
                  this.fallbackOptimization(inputPath, outputPath)
                    .then(resolve)
                    .catch(reject);
                }
              }
            } else {
              const errorMsg = `Optimized file is missing or too small: ${tempOutputPath}`;
              console.error(errorMsg);
              
              // Try fallback optimization
              console.log('Attempting fallback optimization...');
              this.fallbackOptimization(inputPath, outputPath)
                .then(resolve)
                .catch(reject);
            }
          } else {
            console.error(`FFmpeg exited with code ${code}`);
            console.error(`FFmpeg stderr: ${stderr}`);
            
            // Try fallback optimization
            console.log('Attempting fallback optimization...');
            this.fallbackOptimization(inputPath, outputPath)
              .then(resolve)
              .catch(reject);
          }
        });
      });
    } catch (error) {
      console.error(`Error in optimizeForWebPlayback: ${error.message}`);
      
      // Try fallback optimization
      console.log('Attempting fallback optimization due to error...');
      return this.fallbackOptimization(inputPath, outputPath);
    }
  }
  
  // Méthode de secours pour l'optimisation avec des paramètres plus simples
  private async fallbackOptimization(inputPath: string, outputPath: string): Promise<string> {
    console.log(`Using fallback optimization for video: ${inputPath} -> ${outputPath}`);
    
    return new Promise<string>((resolve, reject) => {
      // Utiliser des paramètres plus simples et plus compatibles
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',  // Plus rapide mais moins efficace
        '-crf', '28',            // Qualité légèrement inférieure
        '-vf', 'format=yuv420p', // Format de pixel standard
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
        if (code === 0) {
          console.log('Fallback video optimization completed successfully');
          
          // Vérifier que le fichier de sortie existe et a une taille valide
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
            // Verify that the output file is a valid video
            const isOutputValid = await isVideoValid(outputPath);
            
            if (isOutputValid) {
              console.log('Fallback optimized video is valid');
              // Émettre l'événement de progression finale
              this.emitProgress('finalizing', 100, 'Video finalized (fallback method)');
              
              // Émettre l'événement de complétion avec un délai pour s'assurer qu'il est bien reçu
              setTimeout(() => {
                this.emitProgress('complete', 100, 'Processing complete');
                console.log('Emitted final complete event from fallback optimization');
              }, 1000);
              
              resolve(outputPath);
            } else {
              console.error('Fallback optimized video is not valid, attempting simple copy');
              this.simpleCopyVideo(inputPath, outputPath)
                .then(resolve)
                .catch(reject);
            }
          } else {
            const errorMsg = 'Fallback optimized file is missing or too small';
            console.error(errorMsg);
            
            // Try simple copy as a last resort
            console.log('Attempting simple copy without re-encoding');
            this.simpleCopyVideo(inputPath, outputPath)
              .then(resolve)
              .catch(reject);
          }
        } else {
          console.error(`Fallback FFmpeg exited with code ${code}`);
          console.error(`Fallback FFmpeg stderr: ${stderr}`);
          
          // Try simple copy as a last resort
          console.log('Attempting simple copy without re-encoding');
          this.simpleCopyVideo(inputPath, outputPath)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  // New method for simple copy without re-encoding
  private async simpleCopyVideo(inputPath: string, outputPath: string): Promise<string> {
    console.log(`Performing simple copy of video: ${inputPath} -> ${outputPath}`);
    
    return new Promise<string>((resolve, reject) => {
      const simpleCopy = spawn('ffmpeg', [
        '-i', inputPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      let stderr = '';
      
      simpleCopy.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      simpleCopy.on('close', async (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          // Verify that the output file is a valid video
          const isOutputValid = await isVideoValid(outputPath);
          
          if (isOutputValid) {
            console.log('Simple copy video is valid');
            // Émettre l'événement de progression finale
            this.emitProgress('finalizing', 100, 'Video finalized (simple copy)');
            
            // Émettre l'événement de complétion avec un délai pour s'assurer qu'il est bien reçu
            setTimeout(() => {
              this.emitProgress('complete', 100, 'Processing complete');
              console.log('Emitted final complete event from simple copy');
            }, 1000);
            
            resolve(outputPath);
          } else {
            console.error('Simple copy video is not valid, attempting last resort repair');
            
            // Try to repair the video as a last resort
            const repairPath = `${outputPath}.repaired.mp4`;
            const repaired = await repairVideo(outputPath, repairPath);
            
            if (repaired) {
              console.log('Last resort video repair successful');
              fs.renameSync(repairPath, outputPath);
              
              this.emitProgress('finalizing', 100, 'Video finalized (last resort repair)');
              setTimeout(() => {
                this.emitProgress('complete', 100, 'Processing complete');
                console.log('Emitted final complete event after last resort repair');
              }, 1000);
              
              resolve(outputPath);
            } else {
              const copyErrorMsg = 'All video processing methods failed, cannot create valid video';
              console.error(copyErrorMsg);
              reject(new Error(copyErrorMsg));
            }
          }
        } else {
          const copyErrorMsg = 'Simple copy failed, cannot optimize video';
          console.error(copyErrorMsg);
          reject(new Error(copyErrorMsg));
        }
      });
    });
  }
  
  private generatePotentialStartPoints(
    sceneChanges: number[], 
    silences: Array<{start: number, end: number}>, 
    videoDuration: number
  ): number[] {
    const points: number[] = [];
    
    // Add scene changes as potential start points
    points.push(...sceneChanges);
    
    // Add the end of silence periods as potential start points
    silences.forEach(silence => {
      points.push(silence.end);
    });
    
    // Add some evenly distributed points throughout the video
    const step = videoDuration / 20;
    for (let i = 1; i < 19; i++) {
      points.push(i * step);
    }
    
    // Remove duplicates and sort
    const uniquePoints = Array.from(new Set(points))
      .filter(point => point > 1 && point < videoDuration - 5)
      .sort((a, b) => a - b);
    
    return uniquePoints;
  }
  
  private selectDiverseSegments(
    potentialStartPoints: number[], 
    segmentsNeeded: number, 
    videoDuration: number
  ): number[] {
    if (potentialStartPoints.length === 0) {
      // Fallback: create evenly spaced segments
      const segments = [];
      const step = (videoDuration - this.SEGMENT_DURATION) / (segmentsNeeded + 1);
      for (let i = 1; i <= segmentsNeeded; i++) {
        segments.push(i * step);
      }
      return segments;
    }
    
    if (potentialStartPoints.length <= segmentsNeeded) {
      return potentialStartPoints;
    }
    
    // Divide the video into regions and select one point from each region
    // to ensure good distribution throughout the video
    const selectedPoints: number[] = [];
    const regionSize = videoDuration / segmentsNeeded;
    
    for (let i = 0; i < segmentsNeeded; i++) {
      const regionStart = i * regionSize;
      const regionEnd = (i + 1) * regionSize;
      
      // Find points in this region
      const pointsInRegion = potentialStartPoints.filter(
        point => point >= regionStart && point < regionEnd
      );
      
      if (pointsInRegion.length > 0) {
        // Select a random point from this region
        const randomIndex = Math.floor(Math.random() * pointsInRegion.length);
        selectedPoints.push(pointsInRegion[randomIndex]);
      } else {
        // If no points in this region, use the middle of the region
        selectedPoints.push(regionStart + regionSize / 2);
      }
    }
    
    // Ensure minimum distance between segments to avoid selecting clips too close together
    const MIN_DISTANCE = this.SEGMENT_DURATION * 2;
    const finalPoints: number[] = [];
    
    for (const point of selectedPoints) {
      // Check if this point is too close to any already selected point
      const isTooClose = finalPoints.some(
        selectedPoint => Math.abs(selectedPoint - point) < MIN_DISTANCE
      );
      
      if (!isTooClose) {
        finalPoints.push(point);
      } else {
        // Find an alternative point
        const alternativePoint = this.findAlternativePoint(
          point, 
          finalPoints, 
          potentialStartPoints, 
          MIN_DISTANCE,
          videoDuration
        );
        
        if (alternativePoint !== null) {
          finalPoints.push(alternativePoint);
        }
      }
    }
    
    // If we don't have enough segments, add some more
    while (finalPoints.length < segmentsNeeded && potentialStartPoints.length > 0) {
      // Find the largest gap between selected points
      let largestGap = 0;
      let gapCenter = 0;
      
      const sortedPoints = [...finalPoints].sort((a, b) => a - b);
      
      for (let i = 0; i < sortedPoints.length - 1; i++) {
        const gap = sortedPoints[i + 1] - sortedPoints[i];
        if (gap > largestGap) {
          largestGap = gap;
          gapCenter = sortedPoints[i] + gap / 2;
        }
      }
      
      // Find the closest potential point to this gap center
      let closestPoint = null;
      let minDistance = Infinity;
      
      for (const point of potentialStartPoints) {
        if (!finalPoints.includes(point)) {
          const distance = Math.abs(point - gapCenter);
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
          }
        }
      }
      
      if (closestPoint !== null) {
        finalPoints.push(closestPoint);
      } else {
        break; // No more suitable points
      }
    }
    
    return finalPoints.sort((a, b) => a - b);
  }
  
  private findAlternativePoint(
    originalPoint: number,
    selectedPoints: number[],
    allPoints: number[],
    minDistance: number,
    videoDuration: number
  ): number | null {
    // Try to find a point that's not too close to any selected point
    for (const point of allPoints) {
      if (!selectedPoints.includes(point) && 
          point >= 1 && 
          point <= videoDuration - this.SEGMENT_DURATION - 1) {
        
        const isTooClose = selectedPoints.some(
          selectedPoint => Math.abs(selectedPoint - point) < minDistance
        );
        
        if (!isTooClose) {
          return point;
        }
      }
    }
    
    // If no suitable point found, create a new one
    // Try to find a gap between existing points
    const sortedPoints = [...selectedPoints].sort((a, b) => a - b);
    
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const gap = sortedPoints[i + 1] - sortedPoints[i];
      if (gap >= minDistance * 2) {
        // We can fit a point in this gap
        return sortedPoints[i] + gap / 2;
      }
    }
    
    // If no suitable gap, try beginning or end of video
    if (sortedPoints[0] >= minDistance + 1) {
      return 1; // Start of video
    }
    
    if (videoDuration - sortedPoints[sortedPoints.length - 1] >= minDistance + this.SEGMENT_DURATION) {
      return videoDuration - this.SEGMENT_DURATION - 1; // End of video
    }
    
    return null; // Could not find a suitable alternative
  }

  // Add the emitProgress method back
  private emitProgress(step: string, progress: number, message: string): void {
    // Valider les valeurs
    const validStep = step || 'downloading';
    const validProgress = Math.max(0, Math.min(100, progress));
    const validMessage = message || `Processing ${step}`;
    
    console.log(`Emitting progress event: ${validStep} - ${validProgress}% - ${validMessage}`);
    
    // Utiliser setTimeout pour éviter les problèmes de concurrence
    // et garantir que l'événement est émis même si le processus est occupé
    setTimeout(() => {
      this.emit('progress', validStep, validProgress, validMessage);
      
      // Enregistrer l'événement dans un fichier de log pour le débogage
      const logMessage = `[${new Date().toISOString()}] PROGRESS: ${validStep} - ${validProgress}% - ${validMessage}\n`;
      try {
        fs.appendFileSync(path.join(this.tempDir, 'progress.log'), logMessage);
      } catch (error) {
        // Ignorer les erreurs d'écriture de log
        console.warn(`Could not write to progress log: ${error.message}`);
      }
    }, 10);
  }
}