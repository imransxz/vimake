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
    
    if (!hasEnoughCredits()) {
      toast.error("Not enough credits");
      return;
    }

    setIsProcessing(true);
    try {
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
          startTime: timeRange[0],
          endTime: timeRange[1]
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }

      const data = await response.json();
      
      if (data.success) {
        spendCredits();
        toast.success("Video created successfully!");
        // ... reste du code
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to create video");
    } finally {
      setIsProcessing(false);
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
                  <Button onClick={handlePaste}>
                    <Clipboard className="h-4 w-4 mr-2" />
                    {t('videoConverter.paste')}
                  </Button>
                )}
              </div>
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
                    onError={(e) => console.error("Player error:", e)}
                    onProgress={({ playedSeconds }) => handleTimeUpdate({ playedSeconds })}
                    ref={playerRef}
                  />
                </div>

                {/* Time Range Selector */}
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Select video segment (1-3 min)</h3>
                    <span className="text-sm text-gray-500">
                      {Math.floor(timeRange[0] / 60)}:{String(Math.floor(timeRange[0] % 60)).padStart(2, '0')} - 
                      {Math.floor(timeRange[1] / 60)}:{String(Math.floor(timeRange[1] % 60)).padStart(2, '0')}
                    </span>
                  </div>
                  <Slider
                    value={timeRange}
                    onChange={handleTimeRangeChange}
                    onMouseDown={handleSliderDragStart}
                    min={0}
                    max={videoDuration}
                    step={1}
                    disableSwap
                    sx={{
                      '& .MuiSlider-thumb': {
                        backgroundColor: '#543CE5',
                      },
                      '& .MuiSlider-track': {
                        backgroundColor: '#543CE5',
                      },
                      '& .MuiSlider-rail': {
                        backgroundColor: '#E5E7EB',
                      }
                    }}
                  />
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Min: 1 min</span>
                    <span>Max: 3 min</span>
                  </div>
                </div>
              </div>

              {/* Colonne droite : Contrôles */}
              <div className="space-y-6">
                {/* Voice Selection - Maintenant visible pour tous les styles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('videoConverter.selectVoice')}</h3>
                  <div className="relative">
                    <Select.Root value={selectedVoice} onValueChange={setSelectedVoice}>
                      <Select.Trigger
                        className={cn(
                          "w-full flex items-center justify-between",
                          "pl-4 pr-3 py-4 text-base bg-background rounded-xl",
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

                {/* Editing Style */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t('converter.editingStyle')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {editingStyles.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => handleEditingStyleChange(style.value)}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all duration-200",
                          "hover:border-[#543CE5] hover:bg-[#543CE5]/5",
                          editingStyle === style.value
                            ? "border-[#543CE5] bg-[#543CE5]/5"
                            : "border-gray-200 dark:border-gray-800",
                          "flex flex-col items-center gap-2 text-center"
                        )}
                      >
                        <div className="text-2xl">
                          {style.value === 'dynamic' && '🎬'}
                          {style.value === 'minimal' && '✨'}
                          {style.value === 'dramatic' && '🎭'}
                        </div>
                        <div className="font-medium text-sm">{style.label}</div>
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
                          "p-6 rounded-xl border-2 transition-all duration-200",
                          "hover:border-[#543CE5] hover:bg-[#543CE5]/5",
                          subtitleStyle === style.value
                            ? "border-[#543CE5] bg-[#543CE5]/5"
                            : "border-gray-200 dark:border-gray-800",
                          "flex flex-col items-center gap-2 text-center"
                        )}
                      >
                        <div className="w-full h-32 flex items-center justify-center">
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
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleCreateVideo}
                  className="w-full h-12"
                  disabled={!selectedVoice || isProcessing}
                >
                  {t('videoConverter.createButton')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
};
