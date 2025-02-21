import { Request, Response } from 'express';
import { VideoConverterService } from '../services/videoConverter';
import { ScriptProcessorService } from '../services/scriptProcessor';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import youtubeDl from 'youtube-dl-exec';
import { db } from '../db';
import { Short } from '@prisma/client';
import FormData from 'form-data';

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
  endTime: number;
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
    const { 
      url, 
      voice, 
      editingStyle, 
      subtitleStyle,
      startTime,
      endTime 
    } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    if (editingStyle !== 'dynamic' && !voice) {
      return res.status(400).json({ success: false, error: 'Voice is required' });
    }
    if (!editingStyle) {
      return res.status(400).json({ success: false, error: 'Editing style is required' });
    }
    if (startTime === undefined || endTime === undefined) {
      return res.status(400).json({ success: false, error: 'Time range is required' });
    }

    // Initialiser les services
    const videoConverter = new VideoConverterService();
    const scriptProcessor = new ScriptProcessorService();

    // 1. Télécharger et convertir la vidéo en format court
    console.log('Étape 1: Conversion de la vidéo...');
    const result = await videoConverter.convertToShort({
      url,
      startTime: parseFloat(startTime),
      endTime: parseFloat(endTime),
      editingStyle
    });

    if (!result.outputPath) {
      throw new Error('Failed to convert video: No output path');
    }

    if (editingStyle === 'dynamic') {
      try {
        console.log('Generating dynamic version with ElevenLabs...');
        
        // Transcrire et améliorer le script
        const transcript = await scriptProcessor.transcribeVideo(result.outputPath);
        const improvedTranscript = await scriptProcessor.improveTranscript(transcript);
        
        // Générer l'audio avec ElevenLabs
        const audioPath = path.join(process.cwd(), 'temp', `audio_${Date.now()}.mp3`);
        if (voice) {
          console.log('Generating ElevenLabs audio with voice:', voice);
          await scriptProcessor.generateVoice(improvedTranscript, voice, audioPath);
        }

        // Créer les sous-titres
        const subtitlesPath = path.join(process.cwd(), 'temp', `subtitles_${Date.now()}.ass`);
        await videoConverter.createASSFile(
          improvedTranscript,
          subtitlesPath,
          1080,
          1920,
          audioPath
        );

        // Combiner vidéo, audio et sous-titres
        const finalPath = path.join(process.cwd(), 'temp', `final_${Date.now()}.mp4`);
        await videoConverter.combineVideoAndAudio(
          result.outputPath,
          voice ? audioPath : result.outputPath, // Utiliser l'audio ElevenLabs si une voix est spécifiée
          finalPath,
          subtitlesPath
        );

        return res.sendFile(finalPath);
      } catch (error) {
        console.error('Error in dynamic processing:', error);
        throw error;
      }
    }

    // 2. Transcrire la vidéo pour obtenir le script
    console.log('Étape 2: Transcription de la vidéo...');
    const transcript = await scriptProcessor.transcribeVideo(result.outputPath);

    // 3. Améliorer le script avec ChatGPT
    console.log('Étape 3: Amélioration du script...');
    // Ajout d'instructions pour obtenir un script assez long pour une vidéo de 1min01 à 1min40
    const prompt = transcript + "\n\nPlease expand and improve the above transcript to create a detailed script that lasts between 1 minute 01 seconds and 1 minute 40 seconds for the video. Do not include any emojis in the output.";
    const rawImprovedTranscript = await scriptProcessor.improveTranscript(prompt);
    const improvedTranscript = removeEmojis(rawImprovedTranscript);

    // 4. Générer la voix avec ElevenLabs
    console.log('Étape 4: Génération de la voix...');
    const audioPath = path.join(process.cwd(), 'temp', `audio_${Date.now()}.mp3`);
    await scriptProcessor.generateVoice(improvedTranscript, voice, audioPath);

    // Calculer la durée de l'audio puis définir la durée cible entre 61 et 100 secondes
    const audioDuration = await getAudioDuration(audioPath);
    const targetDuration = Math.min(Math.max(audioDuration, 61), 100);

    // 4.5. Créer les sous-titres
    const assPath = path.join(__dirname, '../../temp', `subtitles_${Date.now()}.ass`);
    const assContent = await videoConverter.createASSFile(
      improvedTranscript,
      assPath,
      1080,
      1920,
      audioPath
    );

    // 5. Combiner la vidéo avec la nouvelle piste audio
    console.log('Étape 5: Combinaison de la vidéo et de l\'audio...');
    const finalOutputPath = path.join(__dirname, '../../temp', `final_${Date.now()}.mp4`);
    await videoConverter.combineVideoAndAudio(result.outputPath, audioPath, finalOutputPath, assPath);

    // 6. Nettoyer les fichiers temporaires
    await videoConverter.cleanup(result.outputPath);
    await videoConverter.cleanup(audioPath);

    // 7. Envoyer le fichier final
    // TODO: Réactiver la sauvegarde en base de données une fois configurée

    return res.sendFile(finalOutputPath, (err) => {
      if (err) {
        console.error('Erreur lors de l\'envoi du fichier:', err);
        res.status(500).json({ success: false, error: 'Failed to send file' });
      }
      // Nettoyer le fichier final après l'envoi
      videoConverter.cleanup(finalOutputPath);
    });

  } catch (error) {
    console.error('Erreur lors de la conversion:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
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
    const { userId } = req.query;
    let shorts: ShortOutput[] = [];
    try {
      const dbShorts = await db.short.findMany({
        where: {
          userId: userId as string || undefined
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          title: true,
          thumbnail: true,
          duration: true,
          createdAt: true,
          views: true,
          downloadUrl: true,
          userId: true
        }
      });
      
      // Convertir les dates en chaînes
      shorts = dbShorts.map(short => ({
        ...short,
        createdAt: short.createdAt.toISOString()
      }));
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      shorts = [];
    }

    return res.json(shorts);
  } catch (error) {
    console.error('Error fetching shorts history:', error);
    return res.status(500).json({ error: 'Failed to fetch shorts history' });
  }
};

export class VideoController {
  private videoConverter: VideoConverterService;
  private tempDir: string;

  constructor() {
    this.videoConverter = new VideoConverterService();
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  async convertVideo(req: Request, res: Response) {
    try {
      const { url, startTime, endTime, editingStyle, voice } = req.body;
      const options: ConvertOptions = {
        url,
        startTime,
        endTime,
        editingStyle,
        voice
      };

      // Convertir la vidéo
      const result = await this.videoConverter.convertToShort(options);
      const { outputPath, transcript, finalPath } = result as ConversionResult;

      if (options.editingStyle === 'dynamic' && transcript) {
        // Créer le fichier ASS pour les sous-titres
        const subtitlesFilePath = path.join(this.tempDir, `subtitles_${Date.now()}.ass`);
        const audioPath = voice ? path.join(this.tempDir, `audio_${Date.now()}.mp3`) : outputPath;
        const subtitlesContent = await this.videoConverter.createASSFile(
          transcript,
          subtitlesFilePath,
          1080,
          1920,
          audioPath
        );

        // Vérifier que le fichier existe avant de continuer
        if (fs.existsSync(subtitlesFilePath)) {
          // Ajouter les sous-titres à la vidéo
          await this.videoConverter.addSubtitlesToVideo(
            outputPath,
            subtitlesFilePath,
            finalPath
          );
        } else {
          throw new Error('Failed to create subtitles file');
        }
      }

      return res.json({ success: true, outputPath: finalPath });
    } catch (error) {
      console.error('Error in convertVideo:', error);
      return res.status(500).json({ error: 'Failed to convert video' });
    }
  }

  async convertWithVoice(req: Request, res: Response) {
    try {
      const { url, startTime, endTime, editingStyle, voice } = req.body;
      const options: ConvertOptions = {
        url,
        startTime,
        endTime,
        editingStyle,
        voice
      };

      // Convertir la vidéo et générer la voix
      const result = await this.videoConverter.convertToShort(options);
      const { outputPath, transcript, voicePath, finalPath } = result as ConversionResult;

      if (transcript && voicePath) {  // Vérifier que voicePath existe aussi
        // Créer le fichier ASS pour les sous-titres
        const subtitlesFilePath = path.join(this.tempDir, `subtitles_${Date.now()}.ass`);
        const audioPath = voice ? path.join(this.tempDir, `audio_${Date.now()}.mp3`) : outputPath;
        const subtitlesContent = await this.videoConverter.createASSFile(
          transcript,
          subtitlesFilePath,
          1080,
          1920,
          audioPath
        );

        // Vérifier que le fichier existe avant de continuer
        if (fs.existsSync(subtitlesFilePath)) {
          // Combiner la vidéo, l'audio et les sous-titres
          await this.videoConverter.combineVideoAndAudio(
            outputPath,
            voicePath,
            finalPath,
            subtitlesFilePath
          );
        } else {
          throw new Error('Failed to create subtitles file');
        }
      }

      return res.json({ success: true, outputPath: finalPath });
    } catch (error) {
      console.error('Error in convertWithVoice:', error);
      return res.status(500).json({ error: 'Failed to convert video with voice' });
    }
  }
} 