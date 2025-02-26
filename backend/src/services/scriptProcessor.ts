import fs from "fs";
import path from "path";
import axios from "axios";
import Replicate from "replicate";
import { spawn } from "child_process";
import FormData from 'form-data';
import { v2 as cloudinary } from 'cloudinary';

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface Voice {
  voice_id: string;
  name: string;
  preview_url: string;
}

interface ReplicatePrediction {
  urls: { get: string };
  status: string;
  output?: string;
  text?: string;
  created_at: string;
}

interface WhisperResponse {
  text: string;
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words: WhisperWord[];
}

interface WhisperOutput {
  text: string;
  segments: WhisperSegment[];
  translation?: string | null;
  detected_language?: string;
  [key: string]: any;
}

interface ReplicateResponse {
  id: string;
  status: string;
  output: string;
}

interface ConvertOptions {
  url: string;
  startTime: number;
  voice?: string;
  editingStyle?: 'minimal' | 'dynamic' | 'dramatic';
  subtitleStyle?: 'classic' | 'modern';
  language: string; // 'fr', 'en', etc.
}

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export class ScriptProcessorService {
  private openaiClient: any;
  private replicate: Replicate;
  private elevenlabsApiKey: string;
  private openaiApiKey: string;
  private outputDir: string;

  constructor() {
    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN || '',
    });
    this.elevenlabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.outputDir = path.join(__dirname, "../../temp");

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.openaiClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            const response = await axios.post(
              'https://api.openai.com/v1/chat/completions',
              params,
              {
                headers: {
                  'Authorization': `Bearer ${this.openaiApiKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            return response.data;
          }
        }
      }
    };
  }

  private async cleanup(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * Transcrit le contenu audio de la vidéo via le modèle Whisper de Replicate.
   * La vidéo est lue depuis le chemin passé en paramètre.
   */
  async transcribeVideo(videoPath: string): Promise<{ transcript: string; segments: WhisperSegment[] }> {
    try {
      console.log("Starting transcription for:", videoPath);
      
      // 1. Extraire l'audio en WAV
      const absoluteVideoPath = path.resolve(videoPath);
      if (!fs.existsSync(absoluteVideoPath)) {
        throw new Error(`Video file not found: ${absoluteVideoPath}`);
      }
      const outputAudioPath = path.join(path.dirname(absoluteVideoPath), `temp_audio_${Date.now()}.wav`);
      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', absoluteVideoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        outputAudioPath
      ];
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        let errorOutput = '';
        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        ffmpeg.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg failed: ${code}\n${errorOutput}`));
          }
        });
      });

      // 2. Convertir le fichier audio en base64
      const audioFile = fs.readFileSync(outputAudioPath);
      const base64Audio = audioFile.toString('base64');
      const audioUri = `data:audio/mp4;base64,${base64Audio}`;

      // 3. Appeler l'API Replicate pour démarrer la transcription
      const output = await this.replicate.run(
        "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
        {
          input: {
            audio: audioUri,
            model: "large",
            word_timestamps: true
          }
        }
      ) as WhisperOutput;

      // 4. Nettoyer
      fs.unlinkSync(outputAudioPath);

      // Log the output for debugging
      console.log("Whisper API response:", JSON.stringify({
        hasText: !!output.text,
        hasTranscription: !!output.transcription,
        segmentsCount: output.segments?.length || 0
      }));

      // Ensure segments exist and have proper structure
      const segments = output.segments || [];
      
      // If no segments but we have text, create a synthetic segment
      if ((!segments || segments.length === 0) && (output.text || output.transcription)) {
        console.log("No segments found in Whisper output, creating a synthetic segment");
        const text = output.transcription || output.text || "";
        // Create a synthetic segment covering the whole audio
        const syntheticSegment: WhisperSegment = {
          start: 0,
          end: 60, // Assume 60 seconds if we don't know the duration
          text: text,
          words: []
        };
        
        // 5. Retourner un objet contenant le transcript pur et les segments pour la synchronisation
        return {
          transcript: text,
          segments: [syntheticSegment]
        };
      }

      // 5. Retourner un objet contenant le transcript pur et les segments pour la synchronisation
      return {
         transcript: output.transcription || output.text || "",
         segments: segments
      };
    } catch (error) {
      console.error("Error transcribing video:", error);
      throw error;
    }
  }

  /**
   * Améliore le script fourni via l'API ChatGPT utilisant le modèle "o3-mini".
   */
  public async improveTranscript(text: string | any): Promise<string> {
    try {
      // S'assurer que text est une chaîne
      const cleanText = typeof text === 'object'
         ? (text.transcript || text.transcription || text.text || '')
         : String(text || '');

      // Nettoyer le texte des emojis et caractères spéciaux
      const cleanTranscript = cleanText
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[^\x00-\x7F]/g, ' ')
        .trim();

      if (!cleanTranscript) {
        console.warn('Empty transcript after cleaning');
        return '';
      }

      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Tu es un expert en amélioration de scripts. Ta tâche est d'améliorer le script EXISTANT en:\n1) Conservant EXACTEMENT le même contenu et message\n2) Améliorant uniquement la clarté et la fluidité\n3) Ne pas inventer de nouveau contenu\n4) Ne pas ajouter d'emojis ou de formatage"
            },
            {
              role: "user",
              content: `Voici le script à améliorer (garde le même contenu, améliore juste la formulation) :\n${cleanTranscript}`
            }
          ],
          temperature: 0.3
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.openaiApiKey}`
          }
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (err) {
      console.error("Erreur lors de l'amélioration du transcript:", err);
      return typeof text === 'string' ? text : '';
    }
  }

  async getAvailableVoices(): Promise<Voice[]> {
    // Vérifier que l'API Key est définie
    if (!this.elevenlabsApiKey) {
      throw new Error("ELEVENLABS_API_KEY is not set");
    }
    try {
      const response = await axios.get<{ voices: Voice[] }>(
        'https://api.elevenlabs.io/v1/voices',
        {
          headers: {
            'xi-api-key': this.elevenlabsApiKey,
            'Accept': 'application/json'
          }
        }
      );
      console.log("Voices fetched:", response.data);
      return response.data.voices;
    } catch (err) {
      console.error("Erreur lors de la récupération des voix:", err);
      throw err;
    }
  }

  async generateViralScript(
    transcript: string,
    targetDuration: number,
    language: string,
    forceLonger?: boolean
  ): Promise<string> {
    console.log('Starting viral script generation...');
    const prompt = `
      Réécrivez ce transcript en un script viral de ${targetDuration} secondes.
      IMPORTANT:
      - Utilisez UNIQUEMENT les informations du transcript original
      - Le script doit faire environ 300-350 mots au total
      - Divisez le script en 7 parties égales
      - Gardez tous les faits et chiffres exacts
      - Utilisez un style dynamique et engageant
      
      Original transcript: ${transcript}
    `;

    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // Ajouter un délai entre les tentatives
        if (retryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
        }

        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `Vous êtes un expert en création de scripts viraux. Réécrivez le transcript en un script long et engageant de 300-350 mots, en restant fidèle au contenu original.`
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          temperature: 0.5,
          max_tokens: 1000
        });

        const script = response.choices[0].message.content.trim();
        const wordCount = script.split(/\s+/).length;
        console.log(`Script généré avec ${wordCount} mots`);
        return script;
      } catch (error) {
        lastError = error;
        console.error(`Tentative ${retryCount + 1} échouée:`, error.message);
        retryCount++;
        
        if (error.response?.status === 429) {
          // Attendre plus longtemps en cas de rate limit
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    console.error('Toutes les tentatives ont échoué:', lastError);
    throw new Error(`Échec de la génération du script après ${maxRetries} tentatives: ${lastError.message}`);
  }

  async generateVoice(
    text: string,
    voice?: string,
    targetDuration?: number
  ): Promise<string> {
    try {
      if (!this.elevenlabsApiKey) {
        throw new Error('ELEVENLABS_API_KEY is not set');
      }
      
      const outputPath = path.join(process.cwd(), 'temp', `audio_${Date.now()}.mp3`);
      
      // Utiliser la voix par défaut si aucune n'est spécifiée
      const voiceId = voice || 'pNInz6obpgDQGcFmaJgB';
      
      const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': this.elevenlabsApiKey,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
            speaking_rate: targetDuration ? text.split(/\s+/).length / targetDuration : 1.0
          }
        }),
        responseType: 'arraybuffer'
      });
      
      await fs.promises.writeFile(outputPath, response.data);
      console.log('Voice audio generated successfully at:', outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Error generating voice:', error);
      throw error;
    }
  }

  async selectBestSegments(segments: WhisperSegment[]): Promise<WhisperSegment[]> {
    const TARGET_DURATION = 85; // 1min25 en secondes
    const MIN_SEGMENT_DURATION = 3; // Reduced minimum duration to find more valid segments
    const MAX_SEGMENT_DURATION = 25; // Increased maximum duration for more flexibility
    let currentDuration = 0;
    let selectedSegments: WhisperSegment[] = [];

    // Log the input segments for debugging
    console.log(`Received ${segments?.length || 0} segments for selection`);
    
    // Check if segments is undefined or empty
    if (!segments || segments.length === 0) {
      console.warn("No segments provided to selectBestSegments");
      // Create a synthetic segment as fallback
      return [{
        start: 0,
        end: TARGET_DURATION,
        text: "No segments available",
        words: []
      }];
    }

    // Filter segments with invalid properties
    let validSegments = segments.filter(segment => {
      // Verify that start and end are defined and are valid numbers
      if (segment.start === undefined || segment.end === undefined || 
          isNaN(segment.start) || isNaN(segment.end) || 
          segment.start >= segment.end) {
        console.warn(`Invalid segment found: start=${segment.start}, end=${segment.end}`);
        return false;
      }
      
      const duration = segment.end - segment.start;
      return duration >= MIN_SEGMENT_DURATION && duration <= MAX_SEGMENT_DURATION;
    });

    console.log(`Found ${validSegments.length} valid segments (duration between ${MIN_SEGMENT_DURATION}s and ${MAX_SEGMENT_DURATION}s)`);

    // If we have very few valid segments, try to be more lenient with duration requirements
    if (validSegments.length < 8) { // Increased from 5 to 8 to get more segments
      console.log("Few valid segments found, relaxing duration constraints");
      
      // Accept shorter segments down to 1.5 seconds
      const shortSegments = segments.filter(segment => 
        segment.start !== undefined && 
        segment.end !== undefined && 
        !isNaN(segment.start) && 
        !isNaN(segment.end) && 
        segment.start < segment.end &&
        segment.end - segment.start >= 1.5 && // Reduced from 2 to 1.5 seconds
        segment.end - segment.start < MIN_SEGMENT_DURATION
      );
      
      if (shortSegments.length > 0) {
        console.log(`Adding ${shortSegments.length} shorter segments to the valid pool`);
        validSegments = [...validSegments, ...shortSegments];
      }
      
      // Try to split longer segments
      const longSegments = segments.filter(segment => 
        segment.start !== undefined && 
        segment.end !== undefined && 
        !isNaN(segment.start) && 
        !isNaN(segment.end) && 
        segment.start < segment.end &&
        segment.end - segment.start > MAX_SEGMENT_DURATION
      );
      
      if (longSegments.length > 0) {
        console.log(`Splitting ${longSegments.length} long segments`);
        
        for (const longSegment of longSegments) {
          const segmentDuration = longSegment.end - longSegment.start;
          // Aim for ~10 second segments
          const numSubSegments = Math.ceil(segmentDuration / 10);
          const subSegmentDuration = segmentDuration / numSubSegments;
          
          for (let i = 0; i < numSubSegments; i++) {
            const start = longSegment.start + (i * subSegmentDuration);
            const end = Math.min(longSegment.start + ((i + 1) * subSegmentDuration), longSegment.end);
            
            // Create a new segment
            const newSegment: WhisperSegment = {
              start,
              end,
              text: longSegment.text,
              words: longSegment.words ? longSegment.words.filter(word => word.start >= start && word.end <= end) : []
            };
            
            validSegments.push(newSegment);
          }
        }
        
        console.log(`Created ${validSegments.length} segments after splitting long segments`);
      }
    }

    // If we still have no valid segments, use all segments that have valid start/end times
    if (validSegments.length === 0) {
      console.warn("No valid segments found even after relaxing criteria");
      validSegments = segments.filter(segment => 
        segment.start !== undefined && 
        segment.end !== undefined && 
        !isNaN(segment.start) && 
        !isNaN(segment.end) && 
        segment.start < segment.end
      );
      
      if (validSegments.length === 0) {
        console.warn("No segments with valid start/end times found, creating synthetic segment");
        return [{
          start: 0,
          end: TARGET_DURATION,
          text: segments.length > 0 ? segments[0].text : "No valid segments",
          words: []
        }];
      }
    }

    // Sort segments by importance score
    const scoredSegments = validSegments.map(segment => ({
      ...segment,
      importance: this.calculateImportanceScore(segment)
    })).sort((a, b) => b.importance - a.importance);

    // Take top segments up to a reasonable number
    const topSegments = scoredSegments.slice(0, Math.min(30, scoredSegments.length)); // Increased from 20 to 30
    
    // Sort by chronological order
    const chronologicalSegments = [...topSegments].sort((a, b) => a.start - b.start);
    
    // Select segments with minimal overlap
    for (const segment of chronologicalSegments) {
      if (currentDuration >= TARGET_DURATION) break;
      
      const segmentDuration = segment.end - segment.start;
      
      // Check for significant overlap (more than 1 second)
      const hasSignificantOverlap = selectedSegments.some(selected => {
        const overlapStart = Math.max(segment.start, selected.start);
        const overlapEnd = Math.min(segment.end, selected.end);
        return overlapEnd - overlapStart > 1;
      });
      
      if (!hasSignificantOverlap) {
        selectedSegments.push(segment);
        currentDuration += segmentDuration;
        console.log(`Added segment: ${segment.start}s-${segment.end}s (${segmentDuration}s), total: ${currentDuration}s`);
      }
    }
    
    // If we don't have enough segments, add more even if they overlap
    if (currentDuration < TARGET_DURATION * 0.7) { // Increased from 0.6 to 0.7
      console.log(`Insufficient duration (${currentDuration}s), adding segments with overlap`);
      
      // Get remaining segments not already selected
      const remainingSegments = chronologicalSegments
        .filter(segment => !selectedSegments.some(s => 
          s.start === segment.start && s.end === segment.end
        ))
        .sort((a, b) => a.start - b.start);
      
      for (const segment of remainingSegments) {
        if (currentDuration >= TARGET_DURATION) break;
        
        const segmentDuration = segment.end - segment.start;
        selectedSegments.push(segment);
        currentDuration += segmentDuration;
        console.log(`Added overlapping segment: ${segment.start}s-${segment.end}s (${segmentDuration}s), total: ${currentDuration}s`);
      }
    }
    
    // If we still don't have enough segments, add segments from the original list
    if (currentDuration < TARGET_DURATION * 0.5 && segments.length > 0) { // Increased from 0.4 to 0.5
      console.log(`Still insufficient duration (${currentDuration}s), adding segments from original list`);
      
      // Get segments from the original list that have valid start/end times
      const originalValidSegments = segments
        .filter(segment => 
          segment.start !== undefined && 
          segment.end !== undefined && 
          !isNaN(segment.start) && 
          !isNaN(segment.end) && 
          segment.start < segment.end &&
          !selectedSegments.some(s => s.start === segment.start && s.end === segment.end)
        )
        .sort((a, b) => a.start - b.start);
      
      for (const segment of originalValidSegments) {
        if (currentDuration >= TARGET_DURATION) break;
        
        const segmentDuration = segment.end - segment.start;
        selectedSegments.push(segment);
        currentDuration += segmentDuration;
        console.log(`Added original segment: ${segment.start}s-${segment.end}s (${segmentDuration}s), total: ${currentDuration}s`);
      }
    }
    
    // Si nous n'avons toujours pas assez de segments, extraire des segments plus longs de la vidéo originale
    if (currentDuration < TARGET_DURATION * 0.8) {
      console.log(`Final duration still insufficient (${currentDuration}s), will extract longer segments from original video`);
    }

    // Sort the selected segments by start time
    selectedSegments.sort((a, b) => a.start - b.start);
    
    // Ensure we have at least one segment
    if (selectedSegments.length === 0) {
      console.warn("No segments selected, creating synthetic segment");
      selectedSegments = [{
        start: 0,
        end: TARGET_DURATION,
        text: segments.length > 0 ? segments[0].text : "No valid segments",
        words: []
      }];
    }

    console.log(`Selected ${selectedSegments.length} segments, total duration: ${currentDuration}s`);
    return selectedSegments;
  }

  private calculateImportanceScore(segment: WhisperSegment): number {
    const duration = segment.end - segment.start;
    
    // Favoriser les segments de durée optimale (7-8 secondes)
    const durationScore = 1 - Math.abs(7.5 - duration) / 5;
    
    // Favoriser les segments avec plus de mots (plus de contenu)
    const wordsScore = segment.words ? segment.words.length / 20 : 0.5;
    
    // Score final pondéré
    return (durationScore * 0.6 + wordsScore * 0.4);
  }

  public async createASSFile(
    subtitleLines: Array<{ start: string; end: string; text: string }>,
    outputPath: string,
    width: number,
    height: number,
    style: 'classic' | 'modern' = 'modern'
  ): Promise<void> {
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,${height/16},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${height/60},${height/60},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    const content = header + subtitleLines.map(line => 
      `Dialogue: 0,${line.start},${line.end},Default,,0,0,0,,{\\pos(${width/2},${height*0.9})\\an2}${line.text.toUpperCase()}`
    ).join('\n');

    await fs.promises.writeFile(outputPath, content);
  }
} 