import * as React from "react";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import YouTube, { YouTubeEvent, YouTubeProps } from "react-youtube";
// Add YouTubePlayer import from @types/youtube-player
import { YouTubePlayer } from 'youtube-player/dist/types';
import ProgressBar from "../components/progress-bar";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import { useAppContext } from "../app-context";
import { MiniPlayer } from "./mini-player";
import { MediaNotesPluginSettings } from "../types";

// Extend YouTubePlayer type to include missing methods
interface ExtendedYouTubePlayer extends YouTubePlayer {
  getVideoData: () => { title: string; video_id: string };
}

// Utility function to extract video ID from YouTube URL
export function getVideoId(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check if hostname is a YouTube domain
    if (
      !(
        hostname === "youtube.com" ||
        hostname === "www.youtube.com" ||
        hostname === "youtu.be" ||
        hostname === "www.youtu.be"
      )
    ) {
      return "";
    }

    // Extract video ID from YouTube URL
    let videoId = "";
    if (hostname === "youtu.be" || hostname === "www.youtu.be") {
      videoId = urlObj.pathname.substring(1);
    } else {
      const searchParams = new URLSearchParams(urlObj.search);
      videoId = searchParams.get("v") || "";
    }

    return videoId;
  } catch (e) {
    return "";
  }
}

interface PlayerProps {
  url: string;
  containerHeight: string | number | undefined;
  containerWidth: string;
  initialTimeSeconds?: number;
  onTimestampInsert?: (timestampString: string) => void;
  addCommand?: (command: any) => void;
  removeCommand?: (callbackId: string) => void;
}

interface VideoInfo {
  videoId: string;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  speed: number;
}

interface SeekIconProps {
  direction: "forward" | "backward";
  visible: boolean;
}

// Performance optimization: Memoize the SeekIcon component
const SeekIcon = React.memo<SeekIconProps>(({ direction, visible }) => {
  return (
    <TransitionGroup component={null}>
      {visible && (
        <CSSTransition
          timeout={200}
          classNames="seek-icon"
        >
          <div
            className={`seek-icon ${
              direction === "forward" ? "next" : "back"
            }`}
          ></div>
        </CSSTransition>
      )}
    </TransitionGroup>
  );
});

// Create a throttle function for performance-critical operations
function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export const MediaFrame: React.FC<PlayerProps> = ({
  url,
  containerHeight,
  containerWidth,
  initialTimeSeconds = 0,
  onTimestampInsert,
  addCommand,
  removeCommand,
}) => {
  // Extract videoId immediately to use in initial state
  const videoId = getVideoId(url);
  
  const [videoInfo, setVideoInfo] = useState<VideoInfo>({
    videoId: videoId, // Initialize with the extracted videoId
    currentTime: initialTimeSeconds,
    isPlaying: false,
    duration: 0,
    speed: 1,
  });
  const [displayBackwardSeek, setDisplayBackwardSeek] = useState(false);
  const [displayForwardSeek, setDisplayForwardSeek] = useState(false);
  const [displayPlayPause, setDisplayPlayPause] = useState(false);
  const [displaySpeed, setDisplaySpeed] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [miniPlayerTitle, setMiniPlayerTitle] = useState("");
  const previousTimeRef = useRef(initialTimeSeconds);
  const containerRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTube>(null);
  const animationFrameRef = useRef<number | null>(null);
  const { settings } = useAppContext();

  // YouTube player options - Updated to match mini-player controls style
  const opts: YouTubeProps['opts'] = useMemo(() => {
    const options: YouTubeProps['opts'] = {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1, // Enable native YouTube controls like in mini-player
        rel: 0,
        fs: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        origin: window.location.origin,
        enablejsapi: 1,
      }
    };
    
    // Add start time if provided
    if (initialTimeSeconds > 0) {
      options.playerVars = {
        ...options.playerVars,
        start: Math.floor(initialTimeSeconds)
      };
    }
    
    return options;
  }, [initialTimeSeconds]);

  // Memoize heavy UI operations
  const formatCurrentTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m
        .toString()
        .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    } else {
      return `${m.toString().padStart(2, "0")}:${s
        .toString()
        .padStart(2, "0")}`;
    }
  }, []);

  // Calculate progress percentage efficiently
  const progressPercentage = useMemo(() => 
    videoInfo.duration > 0
      ? (videoInfo.currentTime / videoInfo.duration) * 100
      : 0,
    [videoInfo.currentTime, videoInfo.duration]
  );

  // Event handler for the YouTube player ready event
  const handleReady = useCallback((event: YouTubeEvent) => {
    // Get video title
    try {
      // Cast the player to ExtendedYouTubePlayer to use getVideoData
      const player = event.target as ExtendedYouTubePlayer;
      const videoData = player.getVideoData();
      setMiniPlayerTitle(videoData.title || `YouTube: ${videoId}`);
    } catch (e) {
      setMiniPlayerTitle(`YouTube: ${videoId}`);
    }
    
    // If initial time is set, seek to it
    if (initialTimeSeconds > 0) {
      event.target.seekTo(initialTimeSeconds, true);
    }
    
    // Get duration
    try {
      const duration = event.target.getDuration();
      // Ensure duration is a number, not a Promise
      if (duration && typeof duration === 'number') {
        setVideoInfo(prev => ({ ...prev, duration }));
      }
    } catch (e) {
      console.error("Error getting duration:", e);
    }
    
    // // Set player to play automatically
    // event.target.playVideo();
    
    // Initialize the videos
    setVideoInfo(prev => ({
      ...prev,
      videoId
    }));
  }, [videoId, initialTimeSeconds]);

  // Event handler for YouTube player state changes
  const handleStateChange = useCallback(async (event: YouTubeEvent) => {
    // Update playing state
    const playerState = await event.target.getPlayerState();
    const isPlaying = playerState === 1; // 1 = playing
    
    // Update speed with explicit type
    let speed: number;
    try {
      speed = await event.target.getPlaybackRate();
    } catch (e) {
      speed = 1;
    }
    
    // Update video info
    setVideoInfo(prev => ({
      ...prev,
      isPlaying,
      speed
    }));
  }, []);

  // Event handler for YouTube player errors
  const handleError = useCallback((event: YouTubeEvent) => {
    console.error("YouTube player error:", event);
  }, []);

  // Setup keyboard shortcuts - useCallback for stability
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle if our container has focus
    if (!containerRef.current?.contains(document.activeElement)) {
      return;
    }

    switch (e.key) {
      case " ": // Spacebar
        togglePlayPause();
        e.preventDefault();
        break;
      case "ArrowLeft":
        seekBackward();
        e.preventDefault();
        break;
      case "ArrowRight":
        seekForward();
        e.preventDefault();
        break;
      case "m":
        toggleMiniPlayer();
        e.preventDefault();
        break;
      case "s":
        cycleSpeed();
        e.preventDefault();
        break;
      default:
        break;
    }
  }, [videoInfo]); // Only depends on current video state

  useEffect(() => {
    if (!settings.enableKeyboardShortcuts) return;
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, settings.enableKeyboardShortcuts]);

  // Function to toggle play/pause - useCallback for stability
  const togglePlayPause = useCallback(() => {
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;
    
    if (videoInfo.isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }

    // Show play/pause icon
    setDisplayPlayPause(true);
    setTimeout(() => setDisplayPlayPause(false), 500);
  }, [videoInfo.isPlaying]);

  // Function to cycle through playback speeds - useCallback for stability
  const cycleSpeed = useCallback(() => {
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;
    
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentSpeedIndex = speeds.indexOf(videoInfo.speed);
    const nextSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    const newSpeed = speeds[nextSpeedIndex];

    player.setPlaybackRate(newSpeed);
    setVideoInfo((prev) => ({ ...prev, speed: newSpeed }));

    // Show speed indicator
    setDisplaySpeed(true);
    setTimeout(() => setDisplaySpeed(false), 1000);
  }, [videoInfo.speed]);

  // Function to seek backward - useCallback for stability
  const seekBackward = useCallback(async () => {
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;
    
    try {
      const currentTime = await player.getCurrentTime();
      player.seekTo(Math.max(0, currentTime - settings.seekSeconds), true);

      // Update current time in state
      setVideoInfo(prev => ({
        ...prev,
        currentTime: Math.max(0, currentTime - settings.seekSeconds)
      }));
      
      // Show backward seek icon
      setDisplayBackwardSeek(true);
      setTimeout(() => setDisplayBackwardSeek(false), 500);
    } catch (e) {
      console.error("Error seeking backward:", e);
    }
  }, [settings.seekSeconds]);

  // Function to seek forward - useCallback for stability
  const seekForward = useCallback(async () => {
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;
    
    try {
      const currentTime = await player.getCurrentTime();
      const newTime = Math.min(videoInfo.duration, currentTime + settings.seekSeconds);
      
      player.seekTo(newTime, true);

      // Update current time in state
      setVideoInfo(prev => ({
        ...prev,
        currentTime: newTime
      }));
      
      // Show forward seek icon
      setDisplayForwardSeek(true);
      setTimeout(() => setDisplayForwardSeek(false), 500);
    } catch (e) {
      console.error("Error seeking forward:", e);
    }
  }, [videoInfo.duration, settings.seekSeconds]);

  // Toggle mini-player mode - useCallback for stability
  const toggleMiniPlayer = useCallback(() => {
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;

    // If we're entering mini-player mode, pause the main player
    if (!showMiniPlayer && videoInfo.isPlaying) {
      player.pauseVideo();
    }

    setShowMiniPlayer(!showMiniPlayer);
  }, [showMiniPlayer, videoInfo.isPlaying]);

  // Insert a timestamp at the current playback position - useCallback for stability
  const insertTimestamp = useCallback(async () => {
    if (!onTimestampInsert) return;
    
    const player = youtubeRef.current?.getInternalPlayer();
    if (!player) return;
    
    try {
      const currentSeconds = await player.getCurrentTime();

      // Format timestamp for display (HH:MM:SS or MM:SS depending on duration)
      const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
          return `${h.toString().padStart(2, "0")}:${m
            .toString()
            .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        } else {
          return `${m.toString().padStart(2, "0")}:${s
            .toString()
            .padStart(2, "0")}`;
        }
      };

      // Adjust by offset time if needed
      const offsetSeconds = Math.max(
        0,
        currentSeconds - (settings.timestampOffsetSeconds || 0)
      );
      const timestamp = formatTime(offsetSeconds);

      // Build the timestamped link
      const timestampQueryParam = Math.floor(offsetSeconds);
      const timestampedUrl = url.includes("?")
        ? `${url}&t=${timestampQueryParam}`
        : `${url}?t=${timestampQueryParam}`;

      // Insert using the template from settings
      let insertText = (settings.timestampTemplate || "[{ts}]({link})\n")
        .replace("{ts}", timestamp)
        .replace("{link}", timestampedUrl)
        .replace("\\n", "\n");

      onTimestampInsert(insertText);

      // Pause if configured to pause on insert
      if (settings.pauseOnTimestampInsert) {
        player.pauseVideo();
      }
    } catch (e) {
      console.error("Error inserting timestamp:", e);
    }
  }, [onTimestampInsert, url, settings.timestampOffsetSeconds, settings.timestampTemplate, settings.pauseOnTimestampInsert]);

  // Register commands for the Obsidian command palette
  useEffect(() => {
    if (!addCommand) return;
    
    const commands = [
      {
        id: "toggle-play-pause",
        name: "Toggle Play/Pause",
        callback: togglePlayPause,
      },
      {
        id: "seek-backward",
        name: "Seek Backward",
        callback: seekBackward,
      },
      {
        id: "seek-forward",
        name: "Seek Forward",
        callback: seekForward,
      },
      {
        id: "toggle-mini-player",
        name: "Toggle Mini Player",
        callback: toggleMiniPlayer,
      },
      {
        id: "cycle-speed",
        name: "Cycle Playback Speed",
        callback: cycleSpeed,
      },
      {
        id: "insert-timestamp",
        name: "Insert Timestamp",
        callback: insertTimestamp,
      }
    ];
    
    commands.forEach(cmd => addCommand(cmd));

    // Cleanup
    return () => {
      if (removeCommand) {
        commands.forEach(cmd => removeCommand(cmd.id));
      }
    };
  }, [
    addCommand, 
    removeCommand, 
    togglePlayPause, 
    seekBackward, 
    seekForward, 
    toggleMiniPlayer, 
    cycleSpeed, 
    insertTimestamp
  ]);

  // Update current time while video is playing - using requestAnimationFrame for better performance
  useEffect(() => {
    if (!youtubeRef.current || !videoInfo.isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const updateCurrentTime = async () => {
      try {
        const player = youtubeRef.current?.getInternalPlayer();
        if (player) {
          const currentTime = await player.getCurrentTime();
          // Only update if time has actually changed
          if (Math.abs(currentTime - previousTimeRef.current) > 0.1) {
            setVideoInfo((prev) => ({ ...prev, currentTime }));
            previousTimeRef.current = currentTime;
          }
        }
      } catch (e) {
        console.error("Error getting current time:", e);
      }
      
      // Continue the animation loop if still playing
      if (videoInfo.isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      }
    };

    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [videoInfo.isPlaying]);

  // Handle jumping back to the note from mini-player
  const handleJumpToNote = useCallback(() => {
    setShowMiniPlayer(false);
    
    // Focus on the container with a small delay to ensure rendering is complete
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        containerRef.current.focus();
      }
    }, 100);
  }, []);

  // Save mini player position when closed if enabled
  const handleMiniPlayerClose = useCallback(() => {
    if (settings.rememberMiniPlayerPosition && containerRef.current) {
      const miniPlayerContainer = document.querySelector('.mini-player-container');
      if (miniPlayerContainer) {
        const rect = miniPlayerContainer.getBoundingClientRect();
        settings.miniPlayerPosition = { left: rect.left, top: rect.top };
      }
    }
    setShowMiniPlayer(false);
  }, [settings]);

  // Memoize mini-player props to prevent unnecessary re-renders
  const miniPlayerProps = useMemo(() => ({
    videoId: videoInfo.videoId,
    title: miniPlayerTitle,
    currentTime: videoInfo.currentTime,
    onClose: handleMiniPlayerClose,
    onJumpToNote: handleJumpToNote,
    initialPosition: settings.rememberMiniPlayerPosition ? settings.miniPlayerPosition : undefined,
    rememberPosition: settings.rememberMiniPlayerPosition
  }), [
    videoInfo.videoId,
    miniPlayerTitle,
    videoInfo.currentTime,
    handleMiniPlayerClose,
    handleJumpToNote,
    settings.rememberMiniPlayerPosition,
    settings.miniPlayerPosition
  ]);

  // Memoize the handleInsertTimestamp callback
  const handleInsertTimestamp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    insertTimestamp();
  }, [insertTimestamp]);

  // Memoize the toggleMiniPlayerClick callback
  const handleToggleMiniPlayer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMiniPlayer();
  }, [toggleMiniPlayer]);

  // Get title for the player header
  useEffect(() => {
    if (!miniPlayerTitle && videoId) {
      // If title isn't set yet, use a default with videoId
      setMiniPlayerTitle(`YouTube: ${videoId}`);
    }
  }, [miniPlayerTitle, videoId]);

  return (
    <div
      className="media-top-container"
      ref={containerRef}
      tabIndex={0} // Make container focusable for keyboard events
      style={{ outline: "none" }} // Remove focus outline
    >
      {videoId && !showMiniPlayer && (
        <div
          className="media-player-container"
          style={{
            width: containerWidth,
            height: containerHeight,
            backgroundColor: 'var(--background-primary)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px var(--background-modifier-box-shadow)',
            overflow: 'hidden',
          }}
        >
          {/* Player Header - Similar to mini-player header */}
          <div 
            className="media-player-header"
            style={{
              padding: '8px',
              backgroundColor: 'var(--background-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span className="media-player-title" title={miniPlayerTitle}>{miniPlayerTitle}</span>
            <div className="media-player-controls">
              {/* Insert timestamp button */}
              {onTimestampInsert && (
                <button 
                  className="media-player-button"
                  onClick={handleInsertTimestamp}
                  aria-label="Insert Timestamp"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    marginRight: '4px'
                  }}
                >
                  <div 
                    className="media-player-icon" 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              )}
              
              {/* Mini-player button */}
              {settings.miniPlayerEnabled && (
                <button 
                  className="media-player-button"
                  onClick={handleToggleMiniPlayer}
                  aria-label="Open Mini Player"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  <div 
                    className="media-player-icon"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 8V4H20V8M4 12V20H12V12H4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              )}
            </div>
          </div>
          
          {/* Player Content */}
          <div className="media-player-content">
            <YouTube
              videoId={videoId}
              opts={opts}
              onReady={handleReady}
              onStateChange={handleStateChange}
              onError={handleError}
              className="youtube-player"
              ref={youtubeRef}
              data-testid="youtube-player"
            />
          </div>
          
          {/* Progress bar at the bottom if enabled */}
          {settings.displayProgressBar && (
            <ProgressBar
              progress={progressPercentage}
              color={settings.progressBarColor || "#FF0000"}
            />
          )}
        </div>
      )}
      
      {/* Mini-player */}
      {videoId && settings.miniPlayerEnabled && showMiniPlayer && (
        <MiniPlayer
          {...miniPlayerProps}
        />
      )}
    </div>
  );
};