import * as React from 'react';

interface ProgressBarProps {
  progress: number;  // Progress percentage (0-100)
  color: string;     // Color of the progress bar
}

/**
 * A simple progress bar component for the media player
 */
const ProgressBar: React.FC<ProgressBarProps> = ({ progress, color }) => {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar" 
        style={{
          width: `${Math.min(100, Math.max(0, progress))}%`,
          backgroundColor: color,
          height: '3px',
          position: 'absolute',
          bottom: 0,
          left: 0,
          transition: 'width 0.1s linear'
        }}
      />
    </div>
  );
};

export default ProgressBar;