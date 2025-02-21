import React from 'react';
import ReactPlayer from 'react-player/youtube';

interface CustomVideoPlayerProps {
  videoId: string;
  isPlaying: boolean;
  onProgress: (seconds: number) => void;
  onReady: () => void;
  onPlay: () => void;
}

export const CustomVideoPlayer = React.forwardRef<any, CustomVideoPlayerProps>(({
  videoId,
  isPlaying,
  onProgress,
  onReady,
  onPlay,
}, ref) => {
  return (
    <div className="relative w-full h-[400px] bg-black">
      <ReactPlayer
        ref={ref}
        url={`https://www.youtube.com/watch?v=${videoId}`}
        width="100%"
        height="100%"
        playing={isPlaying}
        controls={true}
        onReady={onReady}
        onProgress={({ playedSeconds }) => onProgress(playedSeconds)}
        config={{
          playerVars: {
            modestbranding: 1,
            showinfo: 1
          }
        }}
      />
      
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center" onClick={onPlay}>
          <button
            className="bg-black/50 p-4 rounded-full hover:bg-black/70"
          >
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-5.197-3.036A1 1 0 008 9.028v5.944a1 1 0 001.555.832l5.197-3.036a1 1 0 000-1.664z"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});