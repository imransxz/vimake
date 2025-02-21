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

interface WhisperOutput {
  text: string;
  segments?: Array<{ text: string }>;
  translation?: string | null;
  detected_language?: string;
  [key: string]: any;
}

interface ReplicateResponse {
  id: string;
  status: string;
  output: string;
}

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export class ScriptProcessorService {
  private replicate: Replicate;
  private openaiApiKey: string;
  private elevenlabsApiKey: string;
  private outputDir: string;

  constructor() {
    // Initialise le client Replicate avec le token depuis l'environnement
    this.replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || "" });
    this.openaiApiKey = process.env.OPENAI_API_KEY || "";
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenlabsKey) {
      throw new Error("ELEVENLABS_API_KEY n'est pas définie dans les variables d'environnement");
    }
    this.elevenlabsApiKey = elevenlabsKey;
    this.outputDir = path.join(__dirname, "../../temp");

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
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
  async transcribeVideo(videoPath: string): Promise<string> {
    try {
      console.log("Starting transcription for:", videoPath);
      
      // 1. Extraire l'audio en WAV
      const audioPath = path.join(path.dirname(videoPath), `temp_audio_${Date.now()}.wav`);
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoPath,
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '16000',
          '-ac', '1',
          '-y',
          audioPath
        ]);

        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${code}`)));
      });

      // 2. Convertir le fichier audio en base64
      const audioFile = fs.readFileSync(audioPath);
      const base64Audio = audioFile.toString('base64');

      // 3. Appeler l'API Replicate pour démarrer la transcription
      const prediction = await axios.post<ReplicateResponse>(
        'https://api.replicate.com/v1/predictions',
        {
          version: "3c08daf437fe359eb158a5123c395673f0a113dd8b4bd01ddce5936850e2a981",
          input: {
            audio: `data:audio/wav;base64,${base64Audio}`,
            model: "large-v3",
            language: "auto"
          }
        },
        {
          headers: {
            'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // 4. Attendre le résultat avec polling
      const predictionId = prediction.data.id;
      let result;
      let attempts = 0;
      const maxAttempts = 60; // 1 minute maximum d'attente
      
      while (attempts < maxAttempts) {
        const response = await axios.get<ReplicateResponse>(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: {
              'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
            }
          }
        );
        
        if (response.data.status === 'succeeded') {
          result = response.data;
          break;
        } else if (response.data.status === 'failed') {
          throw new Error('Transcription failed');
        } else if (response.data.status === 'processing') {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }

      if (!result) {
        throw new Error('Transcription timeout');
      }

      // 5. Nettoyer
      fs.unlinkSync(audioPath);

      // 6. Extraire et retourner le texte
      return result.output ?? "Désolé, je n'ai pas pu transcrire cette vidéo correctement.";

    } catch (error) {
      console.error("Error transcribing video:", error);
      return "Désolé, je n'ai pas pu transcrire cette vidéo correctement.";
    }
  }

  /**
   * Améliore le script fourni via l'API ChatGPT utilisant le modèle "o3-mini".
   */
  public async improveTranscript(text: string | any): Promise<string> {
    try {
      // S'assurer que text est une chaîne
      const cleanText = typeof text === 'object' 
        ? text.transcription || text.text || ''
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

  /**
   * Génère une piste vocale via ElevenLabs Text-To-Speech à partir du script fourni.
   * @param text Texte à convertir en audio.
   * @param voiceId L'identifiant de la voix à utiliser.
   * @param outputPath Le chemin vers le fichier audio généré.
   */
  public async generateVoice(text: string, voiceId: string, outputPath: string): Promise<void> {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not configured');
      }

      console.log('Generating voice with ElevenLabs...', { voiceId, outputLength: text.length });

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.promises.writeFile(outputPath, Buffer.from(buffer));

      console.log('Voice generation completed successfully');
    } catch (error) {
      console.error('Error generating voice:', error);
      throw error;
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
} 