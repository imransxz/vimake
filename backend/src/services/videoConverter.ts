import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { downloadVideo } from '../utils/youtubeDl';
import { ScriptProcessorService } from './scriptProcessor';

interface ConversionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  transcript?: string;
  finalPath?: string;
  voicePath?: string;
}

interface ConvertOptions {
  url: string;
  startTime: number;
  endTime: number;  // On garde endTime pour la compatibilité
  editingStyle: 'minimal' | 'dynamic' | 'dramatic';
  voice?: string;
}

interface TranscriptionResponse {
  transcription: string;
  [key: string]: any;
}

interface SubtitleDialogue {
  start: string;
  end: string;
  text: string;
}

export class VideoConverterService {
  private readonly tempDir: string;
  private readonly targetDuration: number = 61; // 1min01s

  constructor() {
    // Utiliser un seul répertoire temporaire
    this.tempDir = path.join(process.cwd(), 'temp');
    console.log('Temp directory:', this.tempDir);

    // S'assurer que le dossier temp existe avec les bonnes permissions
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
        console.log('Created temp directory');
      }
      // Vérifier les permissions
      fs.accessSync(this.tempDir, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      console.error('Error setting up temp directory:', err);
      throw new Error('Failed to setup temp directory with proper permissions');
    }
  }

  // Fonction utilitaire pour extraire une URL depuis une chaîne d'entrée
  private extractUrl(input: string): string {
    // Extrait l'URL en utilisant une regex qui s'arrête avant les guillemets ou la fin de ligne
    const match = input.match(/https?:\/\/[^\s'"]+/);
    if (!match) return input;
    // Supprime d'éventuelles ponctuations terminales (point, virgule, point d'interrogation, etc.)
    return match[0].replace(/[.,!?;:]+$/, '');
  }

  async convertToShort(options: ConvertOptions): Promise<ConversionResult> {
    try {
      const tempInputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`);
      const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}.mp4`);
      const finalPath = path.join(this.tempDir, `final_${Date.now()}.mp4`);
      const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);

      console.log('Starting video conversion...');
      console.log('Input path:', tempInputPath);
      console.log('Output path:', tempOutputPath);
      console.log('Final path:', finalPath);

      // 1. Télécharger la vidéo en meilleure qualité
      console.log('Downloading video in best quality...');
      await downloadVideo(options.url, {
        output: tempInputPath,
        format: 'bestvideo[ext=mp4][height>=1080][vcodec^=avc1]/bestvideo[height>=1080]+bestaudio/best',
        downloadOptions: {
          start_time: options.startTime,
          duration: this.targetDuration,
          editingStyle: options.editingStyle,
          ytdlpOptions: [
            '--format-sort', 'res,fps,vcodec,acodec,br,size',
            '--no-format-sort-force',
            '--video-multistreams',
            '--audio-multistreams'
          ]
        }
      });

      // Vérifier la qualité de la vidéo téléchargée
      const videoQuality = await this.checkVideoQuality(tempInputPath);
      console.log('Downloaded video quality:', videoQuality);

      if (videoQuality.height < 1080) {
        console.warn(`Warning: Video quality is only ${videoQuality.height}p`);
      }

      if (!fs.existsSync(tempInputPath)) {
        throw new Error('Downloaded video file not found');
      }

      // 2. Convertir en format vertical avec haute qualité
      await this.processVideo(tempInputPath, tempOutputPath);

      if (!fs.existsSync(tempOutputPath)) {
        throw new Error('Converted video file not found');
      }

      // Si ce n'est pas le style dynamic, on retourne la vidéo convertie
      if (options.editingStyle !== 'dynamic') {
        // Après la création de la vidéo finale, copier vers le dossier de l'utilisateur
        const userDownloadPath = path.join(process.env.USER_DOWNLOAD_PATH || path.join(process.cwd(), 'downloads'), `video_${Date.now()}.mp4`);
        
        // S'assurer que le dossier de destination existe
        const downloadDir = path.dirname(userDownloadPath);
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }

        // Copier le fichier final
        await fs.promises.copyFile(finalPath || tempOutputPath, userDownloadPath);

        // Nettoyer les fichiers temporaires
        await this.cleanup(tempInputPath);
        await this.cleanup(tempOutputPath);
        await this.cleanup(finalPath);
        await this.cleanup(audioPath);

        return {
          success: true,
          outputPath: userDownloadPath,
          finalPath: userDownloadPath,
          voicePath: options.voice ? audioPath : undefined
        };
      }

      // 3. Pour le style dynamic, continuer avec la transcription et les sous-titres
      try {
        const scriptProcessor = new ScriptProcessorService();
        
        // Transcription
        console.log("1. Starting transcription...");
        const transcript = await scriptProcessor.transcribeVideo(tempOutputPath);
        console.log("Raw transcript:", transcript);

        // Amélioration du script
        console.log("2. Improving transcript...");
        const improvedTranscript = await scriptProcessor.improveTranscript(transcript);
        console.log("Improved transcript:", improvedTranscript);

        // Générer l'audio avec ElevenLabs si une voix est spécifiée
        let audioPath = tempOutputPath;
        if (options.voice) {
          console.log("4. Generating ElevenLabs audio...");
          audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
          await scriptProcessor.generateVoice(improvedTranscript, options.voice, audioPath);
          console.log("Audio generated at:", audioPath);
        }

        // Créer les sous-titres après avoir généré l'audio
        console.log("3. Creating subtitles...");
        const subtitlesPath = path.join(this.tempDir, `subtitles_${Date.now()}.ass`);
        await this.createASSFile(improvedTranscript, subtitlesPath, 1080, 1920, audioPath);
        console.log("Subtitles created at:", subtitlesPath);

        // Vérifier que tous les fichiers existent
        if (!fs.existsSync(subtitlesPath)) {
          throw new Error(`Subtitles file not found at: ${subtitlesPath}`);
        }
        if (options.voice && !fs.existsSync(audioPath)) {
          throw new Error(`Audio file not found at: ${audioPath}`);
        }

        // Combiner vidéo, audio et sous-titres
        console.log("5. Combining video, audio and subtitles...");
        await this.combineVideoAndAudio(tempOutputPath, audioPath, finalPath, subtitlesPath);
        console.log("Final video created at:", finalPath);

        return {
          success: true,
          outputPath: tempOutputPath,
          transcript: improvedTranscript,
          finalPath,
          voicePath: options.voice ? audioPath : undefined
        };
      } catch (error) {
        console.error('Error in dynamic processing:', error);
        throw error;
      }

    } catch (error) {
      console.error('Erreur lors de la conversion:', error);
      return {
        success: false,
        outputPath: '',
        finalPath: '',
        error: `Failed to convert video: ${error.message}`
      };
    }
  }

  private async applyEditingStyle(
    inputPath: string,
    outputPath: string,
    style: 'minimal' | 'dynamic' | 'dramatic',
    filters: Record<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputPath,
        '-filter_complex', filters[style],
        '-map', '[v]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '18',
        '-y',
        outputPath
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        console.log('FFmpeg Log:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
    });
  }

  private async downloadAndTrim(url: string, outputPath: string): Promise<void> {
    const tempPath = `${outputPath}.temp.mp4`;
    const cleanUrl = this.extractUrl(url);

    return new Promise(async (resolve, reject) => {
      try {
        console.log('Starting download...');
        const ytDlp = spawn('yt-dlp', [
          cleanUrl,
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
          '--merge-output-format', 'mp4',
          '--output', tempPath,
          '--no-playlist',
        ]);

        let downloadError = '';
        ytDlp.stderr.on('data', (data) => {
          downloadError += data.toString();
          console.log('Download progress:', data.toString());
        });

        await new Promise((res, rej) => {
          ytDlp.on('close', code => {
            if (code === 0) {
              console.log('Download completed');
              res(null);
            } else {
              console.error('Download failed:', downloadError);
              rej(new Error(`Download failed: ${downloadError}`));
            }
          });
          ytDlp.on('error', (err) => {
            console.error('Download error:', err);
            rej(err);
          });
        });

        console.log('Starting FFmpeg conversion...');
        // Utilise l'URL extraite pour déterminer si on applique l'effet complet (seulement pour YouTube/Bilibili)
        const applyEffect = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be') || cleanUrl.includes('bilibili.com');

        // Prépare la liste des arguments FFmpeg en fonction de la source, en forçant le format final à 9:16 (1080×1920)
        const ffmpegArgs = [
          '-i', tempPath,
          '-t', `${this.targetDuration}`,
          '-filter_complex',
          '[0:v]split=2[base][top];' +
          '[base]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=50:steps=6[blurred];' +
          '[top]scale=iw*1.2:ih*1.2,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black@0[main];' +
          '[blurred][main]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p'
        ];

        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-c:a', 'copy',
          '-preset', 'ultrafast',
          '-crf', '18',
          '-shortest',
          '-threads', 'auto',
          '-y',
          outputPath
        );

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        let ffmpegError = '';
        ffmpeg.stderr.on('data', (data) => {
          ffmpegError += data.toString();
          console.log('FFmpeg progress:', data.toString());
        });

        await new Promise((res, rej) => {
          ffmpeg.on('close', code => {
            if (code === 0) {
              console.log('Conversion completed');
              res(null);
            } else {
              console.error('Conversion failed:', ffmpegError);
              rej(new Error(`Conversion failed: ${ffmpegError}`));
            }
          });
          ffmpeg.on('error', (err) => {
            console.error('FFmpeg error:', err);
            rej(err);
          });
        });

        if (fs.existsSync(tempPath)) {
          await fs.promises.unlink(tempPath);
          console.log('Temp file cleaned up');
        }

        resolve();
      } catch (error) {
        console.error('Process error:', error);
        reject(error);
      }
    });
  }

  async cleanup(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  public async combineVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    subtitlesPath: string,
    style: 'classic' | 'modern' = 'classic'
  ): Promise<void> {
    const assPath = subtitlesPath.replace(/\\/g, '/').replace(/^([A-Z]):/i, '$1\\:');
    
    const subtitleStyle = style === 'classic' 
      ? 'Fontname=Montserrat\\ Bold\\,FontSize=78\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1\\,BorderStyle=1\\,Outline=2'
      : 'Fontname=Arial\\,FontSize=78\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1';

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', videoPath,
        '-i', audioPath,
        '-filter_complex',
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]subtitles='${assPath}':force_style=${subtitleStyle}:original_size=1080x1920[v]`,
        '-map', '[v]',
        '-map', '1:a',
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
      ];

      console.log('Executing FFmpeg with args:', ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('FFmpeg progress:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('FFmpeg process completed successfully');
          resolve();
        } else {
          console.error('FFmpeg error:', stderr);
          reject(new Error(`FFmpeg error: ${stderr}`));
        }
      });
    });
  }

  public async createASSFile(text: string, outputPath: string, videoWidth: number, videoHeight: number, audioPath: string, style: 'classic' | 'modern' = 'classic'): Promise<void> {
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,"Montserrat Bold",78,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,50,1`;

    const audioDuration = await this.getAudioDuration(audioPath);
    const words = text.split(/\s+/);
    const dialogues: SubtitleDialogue[] = [];
    let currentTime = 0;

    // Paramètres optimisés pour plus de réactivité
    const minGroupDuration = 0.15;  // Plus court
    const maxGroupDuration = 0.25;  // Plus court
    const groupSpacing = 0.01;      // Espacement minimal
    const wordsPerGroup = 4;        // Plus de mots par groupe avec police plus petite

    for (let i = 0; i < words.length; i += wordsPerGroup) {
      const group = words.slice(i, i + wordsPerGroup);
      const groupText = group.join(' ');
      
      const groupDuration = Math.min(
        maxGroupDuration,
        Math.max(minGroupDuration, groupText.length * 0.02)
      );

      dialogues.push({
        start: this.formatASSTime(currentTime),
        end: this.formatASSTime(currentTime + groupDuration),
        text: `{\\pos(${videoWidth/2},${videoHeight*0.85})\\an2}${groupText.toUpperCase()}`
      });

      currentTime += groupDuration;  // Suppression du groupSpacing pour enchaînement plus rapide
    }

    // Ajustement plus précis à la durée audio
    const scale = audioDuration / currentTime;
    dialogues.forEach(d => {
      const start = parseFloat(d.start.split(':').pop() || '0') * scale;
      const end = parseFloat(d.end.split(':').pop() || '0') * scale;
      d.start = this.formatASSTime(start);
      d.end = this.formatASSTime(end);
    });

    const content = header + '\n' + dialogues.map(d => 
      `Dialogue: 0,${d.start},${d.end},Default,,0,0,0,,${d.text}`
    ).join('\n');
    
    await fs.promises.writeFile(outputPath, content);
  }

  private async detectSilences(audioPath: string): Promise<Array<{start: number, end: number}>> {
    return new Promise((resolve, reject) => {
      const silences: Array<{start: number, end: number}> = [];
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', 'silencedetect=noise=-35dB:d=0.1', // Paramètres plus sensibles
        '-f', 'null',
        '-'
      ]);

      let output = '';
      ffmpeg.stderr.on('data', (data) => {
        output += data.toString();
      });

      ffmpeg.on('close', () => {
        const silenceStarts = output.match(/silence_start: [\d.]+/g) || [];
        const silenceEnds = output.match(/silence_end: [\d.]+/g) || [];

        for (let i = 0; i < silenceStarts.length; i++) {
          const start = parseFloat(silenceStarts[i].split(': ')[1]);
          const end = parseFloat(silenceEnds[i].split(': ')[1]);
          silences.push({ start, end });
        }

        resolve(silences);
      });

      ffmpeg.on('error', reject);
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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor((seconds - Math.floor(seconds)) * 100); // centièmes de seconde
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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
          duration: this.targetDuration,
          editingStyle: options.editingStyle,
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
      this.cleanupTempFiles(tempInputPath, tempOutputPath);
      throw new Error(`Failed to convert video: ${error.message}`);
    }
  }

  private cleanupTempFiles(...files: string[]) {
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${file}:`, error);
      }
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

      // Échapper correctement le chemin Windows
      const assPath = subtitlesPath
        .replace(/\\/g, '/')
        .replace(/^([A-Z]):/i, '$1\\:');
      
      // Définir les styles en échappant les virgules avec des backslashes
      const subtitleStyle = style === 'classic' 
        ? 'Fontname=Montserrat\\,FontSize=120\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1\\,BorderStyle=3\\,Outline=2'
        : 'Fontname=Arial\\,FontSize=120\\,PrimaryColour=&HFFFFFF&\\,Alignment=2\\,Bold=1';
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-filter_complex',
          `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[scaled];[scaled]subtitles='${assPath}':force_style=${subtitleStyle}:original_size=1080x1920[v]`,
          '-map', '[v]',
          '-map', '0:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'copy',
          '-y',
          outputPath
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
            if (fs.existsSync(outputPath)) {
              resolve();
            } else {
              reject(new Error(`Output file was not created: ${outputPath}`));
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

  private async checkVideoQuality(videoPath: string): Promise<{width: number, height: number}> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
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
            resolve({
              width: stream.width,
              height: stream.height
            });
          } catch (error) {
            reject(new Error('Failed to parse video quality info'));
          }
        } else {
          reject(new Error('Failed to get video quality'));
        }
      });
    });
  }
}