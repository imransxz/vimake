import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LoaderCircle, Clipboard, Play, Download, Share2, Calendar, Pause, PlayIcon } from "lucide-react";
import folderIcon from '/folder.svg';
import folderDarkIcon from '/folderdark.svg';
import { cn } from "@/lib/utils";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TextShimmerWave } from '@/components/core/text-shimmer-wave';
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Slider } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Subtitles } from './subtitles/SubtitleStyles';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import ReactPlayer from 'react-player/youtube';
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useCredits } from '@/hooks/useCredits';
import { LoadingPage } from "@/components/ui/LoadingAnimation";

interface Short {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  createdAt: string;
  views: number;
  downloadUrl: string;
}

// Styles pour les nouveaux composants
const StyledSection = styled('div')`
  margin: 20px 0;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
`;

const StyledLabel = styled('label')`
  display: block;
  margin-bottom: 10px;
  color: #fff;
  font-weight: 500;
`;

const API_BASE_URL = 'http://localhost:3000/api/video';

// Fonction utilitaire pour extraire l'URL d'une chaîne d'entrée
const extractUrl = (input: string): string => {
  const trimmedInput = input.trim();
  const match = trimmedInput.match(/https?:\/\/[^\s'"]+/i);
  if (!match) return '';
  return match[0].replace(/[.,!?;:]+$/, '');
};

interface VideoConverterProps {
  isOpen: boolean;
}

export const VideoConverter = ({ isOpen }: VideoConverterProps) => {
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const processingSteps = [
    'Downloading video',
    'Transcribing content',
    'Generating viral script',
    'Creating voiceover',
    'Adding subtitles',
    'Finalizing your video'
  ];
  const [processingStatus, setProcessingStatus] = useState("Processing your video...");
  const [voices, setVoices] = useState<Array<{ 
    voice_id: string; 
    name: string;
    preview_url: string;
  }>>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [shorts, setShorts] = useState<Short[]>([]);
  const { t } = useLanguage();
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 0]);
  const [videoDuration, setVideoDuration] = useState(0);
  const [editingStyle, setEditingStyle] = useState('dynamic');
  const [subtitleStyle, setSubtitleStyle] = useState<"modern" | "classic" | "creative">("modern");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isLoadingDuration, setIsLoadingDuration] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [startMarker, setStartMarker] = useState(0);
  const [endMarker, setEndMarker] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { hasEnoughCredits, spendCredits } = useCredits();
  const [step, setStep] = useState<'input' | 'edit'>('input');
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>('fr');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [showResultSection, setShowResultSection] = useState(false);
  const [videoPlayerError, setVideoPlayerError] = useState(false);
  const [selectedSong, setSelectedSong] = useState<string | null>(null);

  // Styles de montage disponibles
  const editingStyles = [
    { value: 'dynamic', label: t('editing.dynamic') },
    { value: 'minimal', label: t('editing.minimal') },
    { value: 'dramatic', label: t('editing.dramatic') }
  ];
  
  // Styles de sous-titres disponibles
  const subtitleStyles = [
    { value: 'modern', label: t('subtitles.modern') },
    { value: 'classic', label: t('subtitles.classic') },
    { value: 'creative', label: t('subtitles.creative') }
  ];

  // Available languages
  const languages = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'Anglais' },
    { value: 'es', label: 'Espagnol' },
    { value: 'de', label: 'Allemand' },
    { value: 'it', label: 'Italien' },
    { value: 'pt', label: 'Portugais' },
    { value: 'nl', label: 'Néerlandais' },
    { value: 'ru', label: 'Russe' }
  ];

  // Placeholder songs (to be replaced with actual songs later)
  const backgroundSongs = [
    { value: 'none', label: 'No Music', preview_url: '' },
    { value: 'lofi', label: 'Lo-Fi Beats', preview_url: 'https://example.com/lofi-preview.mp3' },
    { value: 'ambient', label: 'Ambient', preview_url: 'https://example.com/ambient-preview.mp3' },
    { value: 'cinematic', label: 'Cinematic', preview_url: 'https://example.com/cinematic-preview.mp3' },
    { value: 'electronic', label: 'Electronic', preview_url: 'https://example.com/electronic-preview.mp3' },
    { value: 'acoustic', label: 'Acoustic', preview_url: 'https://example.com/acoustic-preview.mp3' }
  ];

  // Handle cancellation of video processing
  const handleCancelProcessing = () => {
    // Show confirmation dialog
    if (window.confirm('Are you sure you want to cancel the video processing? This action cannot be undone.')) {
      setIsProcessing(false);
      setCurrentStep(0);
      toast.info('Video processing cancelled');
    }
  };

  // Fonction pour formater le temps en HH:MM:SS
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Charger les voix disponibles au montage du composant
    const fetchVoices = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/voices`);
        const data = await response.json();
        console.log('Fetched voices with preview URLs:', data.map(v => ({
          id: v.voice_id,
          name: v.name,
          preview: v.preview_url
        })));
        setVoices(data);
        if (data.length > 0) {
          setSelectedVoice(data[0].voice_id);
        }
      } catch (error) {
        console.error('Failed to fetch voices:', error);
        toast.error('Failed to load available voices');
      }
    };
    fetchVoices();
  }, []);

  useEffect(() => {
    const fetchShorts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/shorts/history`);
        if (!response.ok) throw new Error('Failed to fetch shorts history');
        const data = await response.json();
        setShorts(data);
      } catch (error) {
        console.error('Error fetching shorts history:', error);
        toast.error('Failed to load shorts history');
      }
    };
    fetchShorts();
  }, []);

  useEffect(() => {
    // Simuler un chargement
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("URL soumise:", url);
    if (!url) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#\&\?]*).*/);
    const extractedId = videoIdMatch ? videoIdMatch[1] : null;
    console.log("ID extrait:", extractedId);

    if (!extractedId) {
      toast.error("Invalid YouTube URL");
      return;
    }

    setVideoId(extractedId);
    console.log("VideoId mis à jour:", extractedId);
    
    // Charger la durée de la vidéo
    handleNext();
    setVideoUrl(url);
    setStep('edit');
  };

  const handleNext = async () => {
    if (!url) return;
    
    setIsLoadingDuration(true);
    try {
      const response = await fetch(`${API_BASE_URL}/duration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error('Failed to get video duration');

      const { duration } = await response.json();
      setVideoDuration(duration);
      setTimeRange([0, Math.min(duration, 100)]);
      setShowAdvancedOptions(true);
      console.log('Switching to advanced options', { duration, timeRange: [0, Math.min(duration, 100)] });
    } catch (error) {
      console.error(error);
      toast.error('Failed to get video duration');
    } finally {
      setIsLoadingDuration(false);
    }
  };

  useEffect(() => {
    console.log("VideoUrl actualisée:", videoUrl);
  }, [videoUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url) {
      toast.error(t('videoConverter.errorMessage'));
      return;
    }

    setIsProcessing(true);
    setCurrentStep(0); // Start at the first step
    setProcessingStatus('Initializing video processing...');
    
    try {
      console.log(`Submitting video conversion with start time: ${startTime} seconds`);
      
      // Démarrer le polling avant de lancer la conversion
      let progressCheckInterval: NodeJS.Timeout;
      const startProgressPolling = () => {
        console.log("Starting progress polling");
        
        // Nettoyer tout intervalle existant
        if (progressCheckInterval) {
          clearInterval(progressCheckInterval);
        }
        
        // Créer un nouvel intervalle de polling
        progressCheckInterval = setInterval(async () => {
          try {
            const encodedUrl = encodeURIComponent(url);
            console.log(`Checking progress for URL: ${encodedUrl}`);
            
            const progressResponse = await fetch(`${API_BASE_URL}/progress?url=${encodedUrl}`);
            if (!progressResponse.ok) {
              console.warn(`Progress check failed with status: ${progressResponse.status}`);
              return;
            }
            
            const progressData = await progressResponse.json();
            console.log("Progress data:", progressData);
            
            if (progressData.step) {
              // Map backend step to our UI steps
              const stepMapping: Record<string, number> = {
                'downloading': 0,
                'transcribing': 1,
                'generating_script': 2,
                'creating_voice': 3,
                'adding_subtitles': 4,
                'finalizing': 5,
                'complete': 5
              };
              
              const newStep = stepMapping[progressData.step];
              if (newStep !== undefined) {
                console.log(`Updating step from ${currentStep} to ${newStep} (${progressData.step})`);
                setCurrentStep(newStep);
                
                // Mettre à jour le message de statut si disponible
                if (progressData.message) {
                  setProcessingStatus(progressData.message);
                } else {
                  // Utiliser un message par défaut basé sur l'étape
                  setProcessingStatus(processingSteps[newStep]);
                }
              }
              
              // Si le processus est terminé, arrêter le polling et afficher le résultat
              if (progressData.step === 'complete') {
                console.log("Process complete, stopping polling");
                clearInterval(progressCheckInterval);
                
                // Si les données de vidéo sont disponibles, les afficher
                if (progressData.videoUrl) {
                  setVideoUrl(progressData.videoUrl);
                  setDownloadUrl(progressData.downloadUrl || '');
                  setFileName(progressData.fileName || '');
                  setShowResultSection(true);
                  
                  // Masquer l'animation de chargement après un court délai
                  setTimeout(() => {
                    setIsProcessing(false);
                  }, 1500);
                  
                  spendCredits();
                  toast.success("Video created successfully!");
                }
              }
            }
          } catch (error) {
            console.error('Error checking progress:', error);
          }
        }, 1000); // Check every second for more responsive updates
        
        return progressCheckInterval;
      };
      
      // Démarrer le polling immédiatement
      const pollingInterval = startProgressPolling();
      
      // Lancer la conversion
      const response = await fetch(`${API_BASE_URL}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          voice: selectedVoice,
          editingStyle,
          subtitleStyle,
          startTime: startTime,
          language: selectedLanguage || 'fr',
          backgroundMusic: selectedSong
        }),
      });
      
      if (!response.ok) {
        clearInterval(pollingInterval);
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }

      const data = await response.json();
      
      if (!data.success) {
        clearInterval(pollingInterval);
        throw new Error(data.error || 'Conversion failed');
      }
      
      console.log("Conversion started successfully:", data);
      toast.success("Video processing started. This may take a few minutes.");
      
      // Le polling continuera à vérifier la progression et mettra à jour l'interface
      // quand le traitement sera terminé
      
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to create video");
      setIsProcessing(false);
      setCurrentStep(0);
    }
  };

  const playPreview = (voiceId: string, previewUrl: string) => {
    console.log('Playing preview:', voiceId, previewUrl);
    
    // Arrêter toute lecture en cours
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    
    // Si on clique sur la même voix qui est en train de jouer, on l'arrête
    if (isPlayingPreview === voiceId) {
      setIsPlayingPreview(null);
      return;
    }
    
    if (!previewUrl) {
      console.error('No preview URL provided');
      toast.error('Preview not available');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
      return;
    }

    const audio = new Audio(previewUrl);
    console.log('Created audio element with URL:', previewUrl);
    
    audio.onerror = (e) => {
      console.error('Error loading audio:', e, audio.error);
      toast.error('Failed to play preview');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    };
    
    setCurrentAudio(audio);
    setIsPlayingPreview(voiceId);
    
    audio.play().catch(error => {
      console.error('Error playing audio:', error);
      toast.error('Failed to play preview');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    });
    
    audio.onended = () => {
      console.log('Audio playback ended');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    };
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      toast.error("Failed to paste from clipboard");
    }
  };

  // Validation du timeRange
  const validateTimeRange = (start: number, end: number) => {
    const duration = end - start;
    return duration >= 61 && duration <= 100;
  };

  const handleSeekChange = (newValue: number) => {
    setPlayed(newValue);
  };

  const handleVideoProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    if (!isDragging) {
      setCurrentTime(playedSeconds);
      setPlayed(playedSeconds);
    }
  };

  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    const [start, end] = newValue as [number, number];
    const duration = end - start;
    
    if (duration < 60) {
      setTimeRange([start, start + 60]);
    } else if (duration > 180) {
      setTimeRange([start, start + 180]);
    } else {
      setTimeRange([start, end]);
    }
  };

  const handleSliderDragStart = () => {
    setIsDragging(true);
    setIsPlaying(false);
  };

  const handleSliderDragEnd = () => {
    setIsDragging(false);
  };

  const handleTimeRangeChange = (_: Event, newValue: number | number[]) => {
    const [start, end] = newValue as [number, number];
    const duration = end - start;
    
    if (duration < 60) {
      setTimeRange([start, start + 60]);
    } else if (duration > 180) {
      setTimeRange([start, start + 180]);
    } else {
      setTimeRange([start, end]);
    }
    
    // Synchroniser la vidéo avec le slider
    if (playerRef.current) {
      playerRef.current.seekTo(start, 'seconds');
    }
  };

  const handleTimeUpdate = ({ playedSeconds }: { playedSeconds: number }) => {
    if (!isDraggingPreview) {
      setCurrentTime(playedSeconds);
      setPlayed(playedSeconds);
    }
  };

  const handleMarkerDrag = (type: 'start' | 'end', time: number) => {
    if (type === 'start') {
      setTimeRange([Math.min(time, timeRange[1]), timeRange[1]]);
    } else {
      setTimeRange([timeRange[0], Math.max(time, timeRange[0])]);
    }
  };

  const handleEditingStyleChange = (style: string) => {
    setEditingStyle(style);
    // Réinitialiser la voix si on passe en mode dynamic
    if (style === 'dynamic') {
      setSelectedVoice('');
    }
  };

  const handleSubtitleStyleChange = (style: string) => {
    setSubtitleStyle(style as "modern" | "classic" | "creative");
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
    if (playerRef.current) {
      if (!isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  };

  const handleCreateVideo = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!url || !selectedVoice || isProcessing) {
      toast.error(t('videoConverter.errorMessage'));
      return;
    }

    if (timeRange[0] === timeRange[1]) {
      toast.error("Please select a time range for your video");
      return;
    }

    handleSubmit(e);
  };

  const handleConvert = async () => {
    console.log(`Converting video with start time: ${startTime} seconds (${formatTime(startTime)})`);
    
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        startTime,
        voice: selectedVoice,
        language: selectedLanguage || 'fr',
        backgroundMusic: selectedSong
      })
    });
  };

  const playSongPreview = (songId: string, previewUrl: string) => {
    console.log('Playing song preview:', songId, previewUrl);
    
    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    
    // If clicking on the same song that's playing, stop it
    if (isPlayingPreview === songId) {
      setIsPlayingPreview(null);
      return;
    }
    
    if (!previewUrl) {
      console.error('No preview URL provided');
      toast.error('Preview not available');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
      return;
    }

    const audio = new Audio(previewUrl);
    console.log('Created audio element with URL:', previewUrl);
    
    audio.onerror = (e) => {
      console.error('Error loading audio:', e, audio.error);
      toast.error('Failed to play preview');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    };
    
    setCurrentAudio(audio);
    setIsPlayingPreview(songId);
    
    audio.play().catch(error => {
      console.error('Error playing audio:', error);
      toast.error('Failed to play preview');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    });
    
    audio.onended = () => {
      console.log('Audio playback ended');
      setIsPlayingPreview(null);
      setCurrentAudio(null);
    };
  };

  return (
    <Tooltip.Provider>
      <div className="w-full">
        {step === 'input' ? (
          // Première étape : Input URL
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-[#1A2042] dark:text-white text-[40px] font-bold">
                {t('videoConverter.title')}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                {t('videoConverter.description')}
              </p>
            </div>

            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('videoConverter.inputPlaceholder')}
                  className={cn(
                    "w-full pl-4 pr-4 py-6 text-lg bg-background rounded-xl",
                    "border-0",
                    "transition-all duration-200 ease-in-out",
                    "shadow-[inset_0_0_0_2px_#E5E7EB] dark:shadow-[inset_0_0_0_2px_#374151]",
                    "hover:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.1)]",
                    "focus:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.2)]",
                    "focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                    "dark:hover:shadow-[inset_0_0_0_2px_#9C92FF,0_0_0_4px_rgba(156,146,255,0.1)]",
                    "dark:focus:shadow-[inset_0_0_0_2px_#9C92FF,0_0_0_4px_rgba(156,146,255,0.2)]"
                  )}
                  style={{ WebkitAppearance: "none" }}
                />
                {!url && (
                  <Button onClick={handlePaste} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Clipboard className="h-4 w-4 mr-2" />
                    {t('videoConverter.paste')}
                  </Button>
                )}
              </div>
              
              <Button 
                type="submit"
                className={cn(
                  "w-full py-6 text-lg font-medium",
                  "bg-gradient-to-tr from-[#543CE5] to-[#9C92FF]",
                  "text-white rounded-xl",
                  "hover:opacity-90 transition-opacity",
                  "disabled:opacity-50"
                )}
                disabled={!url}
              >
                Next Step
              </Button>
            </form>
          </div>
        ) : (
          // Deuxième étape : Edition
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 gap-8">
              {/* Colonne gauche : Video Player */}
              <div className="space-y-6">
                <div className="relative h-[500px] rounded-xl overflow-hidden">
                  <ReactPlayer
                    url={videoUrl}
                    width="100%"
                    height="100%"
                    style={{ position: 'absolute', top: 0 }}
                    playing={isPlaying}
                    controls={true}
                    onReady={() => console.log("Player ready")}
                    onError={(e) => {
                      console.error("Player error:", e);
                      setVideoPlayerError(true);
                    }}
                    onProgress={({ playedSeconds }) => handleTimeUpdate({ playedSeconds })}
                    ref={playerRef}
                  />
                </div>

                {/* Time Range Selector */}
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Sélectionnez le moment de départ</h3>
                    <span className="text-sm text-gray-500">
                      Début à {formatTime(startTime)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Un short viral de 1min25 sera créé à partir de ce moment
                  </div>

                  <Slider
                    min={0}
                    max={Math.max(0, videoDuration - 180)}
                    value={startTime}
                    onChange={(_, value) => {
                      const newStartTime = value as number;
                      setStartTime(newStartTime);
                      console.log(`Start time changed to: ${newStartTime} seconds (${formatTime(newStartTime)})`);
                      
                      // Positionner la vidéo YouTube au temps sélectionné
                      if (playerRef.current) {
                        playerRef.current.seekTo(newStartTime, 'seconds');
                        // Si la vidéo n'est pas en cours de lecture, la démarrer
                        if (!isPlaying) {
                          setIsPlaying(true);
                        }
                      }
                    }}
                    aria-label="Temps de début"
                    valueLabelDisplay="auto"
                    valueLabelFormat={formatTime}
                  />
                </div>
              </div>

              {/* Colonne droite : Contrôles */}
              <div className="space-y-6">
                {/* Editing Style - Maintenant au-dessus des styles de sous-titres */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('converter.editingStyle')}</h3>
                  <div className="grid grid-cols-3 gap-6">
                    {editingStyles.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => handleEditingStyleChange(style.value)}
                        className={cn(
                          "p-3 rounded-xl border-2 transition-all duration-200 relative",
                          "hover:border-[#543CE5] hover:bg-[#543CE5]/5",
                          editingStyle === style.value
                            ? "border-[#543CE5] bg-[#543CE5]/5"
                            : "border-gray-200 dark:border-gray-800",
                          "flex flex-col items-center gap-2 text-center"
                        )}
                      >
                        <div className="w-full h-20 flex items-center justify-center">
                          <div className="text-4xl">
                            {style.value === 'dynamic' && '🎬'}
                            {style.value === 'minimal' && '✨'}
                            {style.value === 'dramatic' && '🎭'}
                          </div>
                        </div>
                        <div className="font-medium text-sm">{style.label}</div>
                        {editingStyle === style.value && (
                          <div className="absolute top-2 right-2 border-2 border-[#543CE5] bg-transparent text-[#543CE5] rounded-full p-0">
                            <Check className="h-4 w-4 stroke-[2.5px]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle Style */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('converter.subtitleStyle')}</h3>
                  <div className="grid grid-cols-3 gap-6">
                    {subtitleStyles.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => handleSubtitleStyleChange(style.value)}
                        className={cn(
                          "p-3 rounded-xl border-2 transition-all duration-200 relative",
                          "hover:border-[#543CE5] hover:bg-[#543CE5]/5",
                          subtitleStyle === style.value
                            ? "border-[#543CE5] bg-[#543CE5]/5"
                            : "border-gray-200 dark:border-gray-800",
                          "flex flex-col items-center gap-2 text-center"
                        )}
                      >
                        <div className="w-full h-20 flex items-center justify-center">
                          <img
                            src={
                              style.value === 'modern' 
                                ? '/THE QUICK BROWN FOX.svg'
                                : style.value === 'classic'
                                  ? '/THE QUICK BROWN FOX (1).svg'
                                  : '/THE QUICK BROWN FOX (2).svg'
                            }
                            alt={`${style.value} subtitle style`}
                            className="w-full h-full object-contain p-2"
                          />
                        </div>
                        <div className="font-medium text-sm">{style.label}</div>
                        {subtitleStyle === style.value && (
                          <div className="absolute top-2 right-2 border-2 border-[#543CE5] bg-transparent text-[#543CE5] rounded-full p-0">
                            <Check className="h-4 w-4 stroke-[2.5px]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Selection - Déplacé avant les sélecteurs de langue et musique */}
                <div className="space-y-3 mt-6">
                  <h3 className="text-lg font-medium">{t('videoConverter.selectVoice')}</h3>
                  <div className="relative">
                    <Select.Root value={selectedVoice} onValueChange={setSelectedVoice}>
                      <Select.Trigger
                        className={cn(
                          "w-full flex items-center justify-between",
                          "pl-4 pr-3 py-3 text-base bg-background rounded-xl",
                          "border-0",
                          "transition-all duration-200 ease-in-out",
                          "shadow-[inset_0_0_0_2px_#E5E7EB] dark:shadow-[inset_0_0_0_2px_#374151]",
                          "hover:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.1)]",
                          "focus:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.2)]",
                          "focus:outline-none"
                        )}
                      >
                        <Select.Value placeholder={t('videoConverter.selectVoicePlaceholder')} />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Select.Icon>
                      </Select.Trigger>

                      <Select.Portal>
                        <Select.Content
                          position="popper"
                          sideOffset={8}
                          className={cn(
                            "z-50 w-[var(--radix-select-trigger-width)] max-h-[300px] overflow-hidden rounded-xl border border-gray-200",
                            "bg-white dark:bg-gray-900 dark:border-gray-800",
                            "shadow-lg animate-in fade-in-80"
                          )}
                        >
                          <Select.ScrollUpButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                            <ChevronUp className="h-4 w-4" />
                          </Select.ScrollUpButton>
                          <Select.Viewport className="p-1">
                            {voices.map((voice) => (
                              <div key={voice.voice_id} className="relative flex items-center justify-between px-4 py-3">
                                <Select.Item
                                  value={voice.voice_id}
                                  className={cn(
                                    "flex-1 text-sm cursor-default select-none group",
                                    "data-[highlighted]:bg-[#543CE5]/5 dark:data-[highlighted]:bg-[#543CE5]/10",
                                    "rounded-lg px-3 py-2 transition-all duration-200",
                                    "hover:bg-[#543CE5]/5 dark:hover:bg-[#543CE5]/10",
                                    "data-[state=checked]:text-[#543CE5] dark:data-[state=checked]:text-[#9C92FF]",
                                    "outline-none cursor-pointer"
                                  )}
                                >
                                  <Select.ItemText>
                                    <span className="font-medium">{voice.name}</span>
                                  </Select.ItemText>
                                  <Select.ItemIndicator>
                                    <Check className="h-4 w-4" />
                                  </Select.ItemIndicator>
                                </Select.Item>
                                <Button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPreview(voice.voice_id, voice.preview_url);
                                  }}
                                  className={cn(
                                    "h-7 px-2 ml-2",
                                    "text-[#543CE5] bg-[#543CE5]/10 hover:bg-[#543CE5]/20",
                                    "dark:text-[#9C92FF] dark:bg-[#9C92FF]/10 dark:hover:bg-[#9C92FF]/20",
                                    "rounded-lg flex items-center gap-1.5 transition-all duration-200",
                                    "text-xs font-medium",
                                    "opacity-100"
                                  )}
                                >
                                  {isPlayingPreview === voice.voice_id ? (
                                    <>
                                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                                      Playing
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3" />
                                      Preview
                                    </>
                                  )}
                                </Button>
                              </div>
                            ))}
                          </Select.Viewport>
                          <Select.ScrollDownButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                            <ChevronDown className="h-4 w-4" />
                          </Select.ScrollDownButton>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                </div>

                {/* Two-column layout for language and music selection */}
                <div className="grid grid-cols-2 gap-6 mt-6">
                  {/* Language Selection */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-medium">{t('Langue') || 'Select Language'}</h3>
                    <div className="relative">
                      <Select.Root value={selectedLanguage || 'fr'} onValueChange={setSelectedLanguage}>
                        <Select.Trigger
                          className={cn(
                            "w-full flex items-center justify-between",
                            "pl-4 pr-3 py-3 text-base bg-background rounded-xl",
                            "border-0",
                            "transition-all duration-200 ease-in-out",
                            "shadow-[inset_0_0_0_2px_#E5E7EB] dark:shadow-[inset_0_0_0_2px_#374151]",
                            "hover:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.1)]",
                            "focus:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.2)]",
                            "focus:outline-none"
                          )}
                        >
                          <Select.Value placeholder="Select language" />
                          <Select.Icon>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Select.Icon>
                        </Select.Trigger>

                        <Select.Portal>
                          <Select.Content
                            position="popper"
                            sideOffset={8}
                            className={cn(
                              "z-50 w-[var(--radix-select-trigger-width)] max-h-[300px] overflow-hidden rounded-xl border border-gray-200",
                              "bg-white dark:bg-gray-900 dark:border-gray-800",
                              "shadow-lg animate-in fade-in-80"
                            )}
                          >
                            <Select.ScrollUpButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                              <ChevronUp className="h-4 w-4" />
                            </Select.ScrollUpButton>
                            <Select.Viewport className="p-1">
                              {languages.map((language) => (
                                <Select.Item
                                  key={language.value}
                                  value={language.value}
                                  className={cn(
                                    "flex items-center justify-between text-sm cursor-default select-none",
                                    "data-[highlighted]:bg-[#543CE5]/5 dark:data-[highlighted]:bg-[#543CE5]/10",
                                    "rounded-lg px-3 py-2 transition-all duration-200",
                                    "hover:bg-[#543CE5]/5 dark:hover:bg-[#543CE5]/10",
                                    "data-[state=checked]:text-[#543CE5] dark:data-[state=checked]:text-[#9C92FF]",
                                    "outline-none cursor-pointer"
                                  )}
                                >
                                  <Select.ItemText>{language.label}</Select.ItemText>
                                  <Select.ItemIndicator>
                                    <Check className="h-4 w-4" />
                                  </Select.ItemIndicator>
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                            <Select.ScrollDownButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                              <ChevronDown className="h-4 w-4" />
                            </Select.ScrollDownButton>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                  </div>

                  {/* Background Music Selection */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-medium">{t('Musique de fond') || 'Background Music'}</h3>
                    <div className="relative">
                      <Select.Root value={selectedSong || 'none'} onValueChange={setSelectedSong}>
                        <Select.Trigger
                          className={cn(
                            "w-full flex items-center justify-between",
                            "pl-4 pr-3 py-3 text-base bg-background rounded-xl",
                            "border-0",
                            "transition-all duration-200 ease-in-out",
                            "shadow-[inset_0_0_0_2px_#E5E7EB] dark:shadow-[inset_0_0_0_2px_#374151]",
                            "hover:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.1)]",
                            "focus:shadow-[inset_0_0_0_2px_#543CE5,0_0_0_4px_rgba(84,60,229,0.2)]",
                            "focus:outline-none"
                          )}
                        >
                          <Select.Value placeholder="Select background music" />
                          <Select.Icon>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Select.Icon>
                        </Select.Trigger>

                        <Select.Portal>
                          <Select.Content
                            position="popper"
                            sideOffset={8}
                            className={cn(
                              "z-50 w-[var(--radix-select-trigger-width)] max-h-[300px] overflow-hidden rounded-xl border border-gray-200",
                              "bg-white dark:bg-gray-900 dark:border-gray-800",
                              "shadow-lg animate-in fade-in-80"
                            )}
                          >
                            <Select.ScrollUpButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                              <ChevronUp className="h-4 w-4" />
                            </Select.ScrollUpButton>
                            <Select.Viewport className="p-1">
                              {backgroundSongs.map((song) => (
                                <div key={song.value} className="relative flex items-center justify-between px-4 py-3">
                                  <Select.Item
                                    value={song.value}
                                    className={cn(
                                      "flex-1 text-sm cursor-default select-none group",
                                      "data-[highlighted]:bg-[#543CE5]/5 dark:data-[highlighted]:bg-[#543CE5]/10",
                                      "rounded-lg px-3 py-2 transition-all duration-200",
                                      "hover:bg-[#543CE5]/5 dark:hover:bg-[#543CE5]/10",
                                      "data-[state=checked]:text-[#543CE5] dark:data-[state=checked]:text-[#9C92FF]",
                                      "outline-none cursor-pointer"
                                    )}
                                  >
                                    <Select.ItemText>
                                      <span className="font-medium">{song.label}</span>
                                    </Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check className="h-4 w-4" />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                  {song.value !== 'none' && song.preview_url && (
                                    <Button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        playSongPreview(song.value, song.preview_url);
                                      }}
                                      className={cn(
                                        "h-7 px-2 ml-2",
                                        "text-[#543CE5] bg-[#543CE5]/10 hover:bg-[#543CE5]/20",
                                        "dark:text-[#9C92FF] dark:bg-[#9C92FF]/10 dark:hover:bg-[#9C92FF]/20",
                                        "rounded-lg flex items-center gap-1.5 transition-all duration-200",
                                        "text-xs font-medium",
                                        "opacity-100"
                                      )}
                                    >
                                      {isPlayingPreview === song.value ? (
                                        <>
                                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                                          Playing
                                        </>
                                      ) : (
                                        <>
                                          <Play className="h-3 w-3" />
                                          Preview
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </Select.Viewport>
                            <Select.ScrollDownButton className="flex items-center justify-center h-8 bg-white dark:bg-gray-900 cursor-default">
                              <ChevronDown className="h-4 w-4" />
                            </Select.ScrollDownButton>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleCreateVideo}
                  className={cn(
                    "w-full py-6 text-lg font-medium",
                    "bg-gradient-to-tr from-[#543CE5] to-[#9C92FF]",
                    "text-white rounded-xl",
                    "hover:opacity-90 transition-opacity",
                    "disabled:opacity-50"
                  )}
                  disabled={!selectedVoice || isProcessing}
                >
                  {isProcessing ? (
                    <span className="flex items-center">
                      <span className="mr-2">Processing</span>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9C92FF] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#543CE5]"></span>
                      </span>
                    </span>
                  ) : (
                    t('videoConverter.createButton')
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <LoadingPage 
        isLoading={isProcessing} 
        steps={processingSteps}
        currentStep={currentStep}
        onCancel={handleCancelProcessing}
      />
      
      {/* Result Section - Show after processing is complete */}
      {showResultSection && (
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
          <h2 className="text-2xl font-bold mb-4">Your Viral Short is Ready!</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Video Player */}
            <div className="relative aspect-[9/16] w-full max-w-[400px] mx-auto bg-black rounded-lg overflow-hidden">
              {videoUrl && (
                <>
                  {videoPlayerError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white p-4">
                      <div className="text-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-lg font-medium">Video preview unavailable</p>
                        <p className="text-sm text-gray-300 mt-1">The video can't be previewed in the browser, but you can still download it.</p>
                      </div>
                      <a 
                        href={downloadUrl}
                        download={fileName || "viral_short.mp4"}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Download Video
                      </a>
                    </div>
                  ) : (
                    <video 
                      className="w-full h-full object-contain"
                      controls
                      autoPlay
                      playsInline
                      poster="/video-placeholder.jpg"
                      onError={(e) => {
                        console.error("Video playback error:", e);
                        setVideoPlayerError(true);
                        toast.error("Error playing video. You can still download it.");
                      }}
                    >
                      <source src={videoUrl} type="video/mp4" />
                      <source src={videoUrl} type="video/webm" />
                      Your browser does not support the video tag.
                    </video>
                  )}
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <a 
                      href={videoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-white bg-black/50 px-3 py-1 rounded-full text-sm hover:bg-black/70 transition-colors"
                    >
                      Open in new tab
                    </a>
                  </div>
                </>
              )}
            </div>
            
            {/* Download and Share Options */}
            <div className="flex flex-col justify-center space-y-4">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Your video has been successfully created! You can now download it or share it directly.
              </p>
              
              <div className="flex flex-col space-y-3">
                <a 
                  href={downloadUrl}
                  download={fileName || "viral_short.mp4"}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#543CE5] to-[#9C92FF] text-white py-3 px-6 rounded-lg font-medium hover:opacity-90 transition-opacity"
                  onClick={(e) => {
                    // Vérifier si le téléchargement a commencé
                    setTimeout(() => {
                      toast.success("Download started! If it doesn't work, try right-clicking and 'Save link as...'");
                    }, 1000);
                  }}
                >
                  <Download className="h-5 w-5" />
                  Download Video
                </a>
                
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: 'My Viral Short',
                        text: 'Check out this viral short I created!',
                        url: window.location.origin + downloadUrl
                      }).catch(err => console.error('Error sharing:', err));
                    } else {
                      navigator.clipboard.writeText(window.location.origin + downloadUrl);
                      toast.success('Download link copied to clipboard!');
                    }
                  }}
                  className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Share2 className="h-5 w-5" />
                  Share Video
                </button>
                
                {/* Lien de téléchargement alternatif */}
                <div className="mt-2 text-sm text-gray-500">
                  <p>Si le téléchargement ne fonctionne pas, essayez ce lien direct:</p>
                  <a 
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#543CE5] hover:underline break-all"
                  >
                    {window.location.origin + downloadUrl}
                  </a>
                </div>
                
                <button
                  onClick={() => {
                    setShowResultSection(false);
                    setUrl('');
                    setVideoUrl(null);
                    setDownloadUrl('');
                    setStep('input');
                    setVideoPlayerError(false);
                  }}
                  className="text-[#543CE5] dark:text-[#9C92FF] font-medium mt-2"
                >
                  Create Another Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Tooltip.Provider>
  );
};
