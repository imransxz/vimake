import React, { useState } from 'react';
import '../styles/TimeSelector.css';

interface TimeSelectorProps {
  duration: number;
  onStartTimeChange: (time: number) => void;
}

export const TimeSelector: React.FC<TimeSelectorProps> = ({ duration, onStartTimeChange }) => {
  const [startTime, setStartTime] = useState(0);

  const handleStartTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newStartTime = parseInt(event.target.value, 10);
    setStartTime(newStartTime);
    onStartTimeChange(newStartTime);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="time-selector">
      <div className="time-input">
        <label>Sélectionnez le moment de départ de la vidéo :</label>
        <input
          type="range"
          min={0}
          max={Math.max(0, duration - 180)} // Limite à la durée - 3min
          value={startTime}
          onChange={handleStartTimeChange}
          className="time-slider"
        />
        <div className="time-display">
          Début à {formatTime(startTime)}
        </div>
        <div className="time-hint">
          Le short sera créé à partir de ce moment
        </div>
      </div>
    </div>
  );
}; 