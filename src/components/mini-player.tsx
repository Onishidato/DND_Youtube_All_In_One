import { App, setIcon } from 'obsidian';
import * as React from 'react';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import YouTube, { YouTubeEvent, YouTubeProps } from "react-youtube";

interface MiniPlayerProps {
  videoId: string;
  title?: string;
  currentTime?: number;
  initialPosition?: { x: number; y: number } | { left: number; top: number };
  rememberPosition?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onJumpToNote?: () => void;
  ytRef?: React.RefObject<any>;
}

// Create a debounce function for position updates
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

export const MiniPlayer = React.memo<MiniPlayerProps>(({
  videoId,
  title = "YouTube Mini Player",
  currentTime,
  initialPosition,
  rememberPosition = false,
  onClose,
  onMinimize,
  onJumpToNote,
  ytRef
}) => {
  // Convert initialPosition from { left, top } format to { x, y } if needed
  const normalizedPosition = useMemo(() => {
    if (!initialPosition) return { x: 20, y: 20 };
    
    // Check if position has left/top format and convert it
    if ('left' in initialPosition && 'top' in initialPosition) {
      return { 
        x: typeof initialPosition.left === 'number' ? initialPosition.left : parseFloat(initialPosition.left as string), 
        y: typeof initialPosition.top === 'number' ? initialPosition.top : parseFloat(initialPosition.top as string) 
      };
    }
    
    return initialPosition;
  }, [initialPosition]);
  
  const [position, setPosition] = useState(normalizedPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTube>(null);
  const rafRef = useRef<number | null>(null);
  
  // Memoize position calculations to prevent unnecessary re-renders
  const stylePosition = useMemo(() => ({
    left: `${position.x}px`,
    top: `${position.y}px`,
  }), [position.x, position.y]);

  // Save position to localStorage - using debounce to avoid excessive writes
  const savePosition = useCallback(
    debounce(() => {
      if (rememberPosition) {
        localStorage.setItem('mini-player-position', JSON.stringify(position));
        
        // Dispatch custom event for the main plugin to capture
        window.dispatchEvent(new CustomEvent('mini-player-position-changed', { 
          detail: position 
        }));
      }
    }, 200),
    [position, rememberPosition]
  );

  // Pass ref to external components if needed
  useEffect(() => {
    if (ytRef && youtubeRef.current) {
      (ytRef as React.MutableRefObject<YouTube>).current = youtubeRef.current;
    }
  }, [ytRef, youtubeRef.current]);

  useEffect(() => {
    // Try to load position from localStorage on mount if not provided in props
    if (!initialPosition && rememberPosition) {
      try {
        const savedPosition = localStorage.getItem('mini-player-position');
        if (savedPosition) {
          const parsed = JSON.parse(savedPosition);
          // Verify the position is still within the viewport
          const maxX = window.innerWidth - 320; // Assuming width of 320px
          const maxY = window.innerHeight - 220; // Assuming height ~220px
          
          setPosition({
            x: Math.max(0, Math.min(parsed.x, maxX)),
            y: Math.max(0, Math.min(parsed.y, maxY))
          });
        }
      } catch (e) {
        console.error('Failed to load mini-player position:', e);
      }
    }
    
    // Save position when component unmounts if rememberPosition is enabled
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      savePosition();
    };
  }, [initialPosition, rememberPosition, savePosition]);

  // Optimize drag operations with event delegation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging when clicking on the header
    if (e.target instanceof HTMLElement && 
        e.target.closest('.mini-player-header') && 
        playerRef.current && 
        !e.target.closest('.mini-player-button')) {
      // Set dragging state immediately
      setIsDragging(true);
      
      // Store the precise offset where the user clicked within the header
      // This is critical to ensure the player doesn't jump when dragging starts
      const rect = playerRef.current.getBoundingClientRect();
      const headerOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      setDragOffset(headerOffset);
      
      // Add dragging class for styling
      playerRef.current.classList.add('mini-player-dragging');
      
      // Prevent text selection during drag
      e.preventDefault();
    }
  }, []);

  // Use requestAnimationFrame for smooth dragging and precise positioning
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && playerRef.current) {
      // Cancel any existing animation frame to prevent queuing multiple updates
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // Use requestAnimationFrame for smooth visual updates
      rafRef.current = requestAnimationFrame(() => {
        if (!playerRef.current) return;
        
        // Calculate new position by subtracting the original click offset from current mouse position
        // This ensures the relative position of the cursor on the header stays constant
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        // Apply viewport boundaries to keep the player visible
        const maxX = window.innerWidth - playerRef.current.offsetWidth;
        const maxY = window.innerHeight - playerRef.current.offsetHeight;
        
        // Update position state with the precise coordinates
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && playerRef.current) {
      setIsDragging(false);
      savePosition();
      
      // Remove dragging class
      playerRef.current.classList.remove('mini-player-dragging');
      
      // Cancel any ongoing animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
  }, [isDragging, savePosition]);

  // Optimize event listeners with passive mode when possible
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp);
      
      // Add a global cursor style
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = '';
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // YouTube player options
  const opts: YouTubeProps['opts'] = useMemo(() => {
    const options: YouTubeProps['opts'] = {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        controls: 1, // Enable controls for mini-player
        enablejsapi: 1,
        origin: window.location.origin,
      }
    };
    
    // Add start time if provided
    if (currentTime && currentTime > 0) {
      options.playerVars = {
        ...options.playerVars,
        start: Math.floor(currentTime)
      };
    }
    
    return options;
  }, [currentTime]);

  // Handle YouTube player ready event
  const handleReady = useCallback((event: YouTubeEvent) => {
    // If initial time is set, seek to it to ensure it's applied
    if (currentTime && currentTime > 0) {
      event.target.seekTo(currentTime, true);
    }
  }, [currentTime]);

  // Memoize button click handlers
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    onClose();
  }, [onClose]);

  const handleJumpToNote = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    onJumpToNote?.();
  }, [onJumpToNote]);

  const handleMinimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    onMinimize?.();
  }, [onMinimize]);

  // Memoize the controls to prevent unnecessary re-renders
  const controls = useMemo(() => (
    <div className="mini-player-controls">
      {onJumpToNote && (
        <button 
          className="mini-player-button"
          onClick={handleJumpToNote}
          aria-label="Jump to Note"
        >
          <div className="mini-player-icon" ref={el => el && setIcon(el, 'arrow-left-circle')}></div>
        </button>
      )}
      {onMinimize && (
        <button 
          className="mini-player-button"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <div className="mini-player-icon" ref={el => el && setIcon(el, 'expand')}></div>
        </button>
      )}
      <button 
        className="mini-player-button"
        onClick={handleClose}
        aria-label="Close"
      >
        <div className="mini-player-icon" ref={el => el && setIcon(el, 'x')}></div>
      </button>
    </div>
  ), [onJumpToNote, onMinimize, handleJumpToNote, handleMinimize, handleClose]);

  // Handler for YouTube player errors
  const handleError = useCallback((event: YouTubeEvent) => {
    console.error('YouTube player error:', event);
  }, []);

  return (
    <div 
      className="mini-player-container" 
      ref={playerRef}
      style={{
        position: 'fixed',
        ...stylePosition,
        zIndex: 1000,
        width: '320px',
        backgroundColor: 'var(--background-primary)',
        borderRadius: '6px',
        boxShadow: '0 2px 8px var(--background-modifier-box-shadow)',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease-in-out'
      }}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="mini-player-header"
        style={{
          padding: '8px',
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundColor: 'var(--background-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span className="mini-player-title" title={title}>{title}</span>
        {controls}
      </div>
      <div className="mini-player-content">
        <YouTube
          videoId={videoId}
          opts={opts}
          onError={handleError}
          onReady={handleReady}
          className="youtube-player"
          ref={youtubeRef}
        />
      </div>
    </div>
  );
});

// Add display name for debugging
MiniPlayer.displayName = 'MiniPlayer';