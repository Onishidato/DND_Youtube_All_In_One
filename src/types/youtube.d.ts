// Type definitions for YouTube IFrame API
declare interface Window {
  YT: typeof YT;
  onYouTubeIframeAPIReady: () => void;
}

declare namespace YT {
  interface Player {
    // Playback controls
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    
    // Player state
    getPlayerState(): number;
    
    // Playback metrics
    getCurrentTime(): Promise<number>;
    getDuration(): number;
    getVideoLoadedFraction(): number;
    
    // Playback quality
    getPlaybackRate(): number;
    setPlaybackRate(rate: number): void;
    getAvailablePlaybackRates(): number[];
    
    // Video information
    getVideoUrl(): string;
    getVideoData(): {
      title: string;
      video_id: string;
      author: string;
    };
    
    // Volume
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;

    // Cleanup
    destroy(): void;
  }
  
  interface PlayerEvent {
    target: Player;
    data?: any;
  }
  
  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    host?: string;
    playerVars?: {
      autoplay?: 0 | 1;
      cc_load_policy?: 1;
      color?: 'red' | 'white';
      controls?: 0 | 1 | 2;
      disablekb?: 0 | 1;
      enablejsapi?: 0 | 1;
      end?: number;
      fs?: 0 | 1;
      hl?: string;
      iv_load_policy?: 1 | 3;
      list?: string;
      listType?: 'playlist' | 'search' | 'user_uploads';
      loop?: 0 | 1;
      modestbranding?: 1;
      origin?: string;
      playlist?: string;
      playsinline?: 0 | 1;
      rel?: 0 | 1;
      start?: number;
      widget_referrer?: string;
    };
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: PlayerEvent) => void;
      onPlaybackQualityChange?: (event: PlayerEvent) => void;
      onPlaybackRateChange?: (event: PlayerEvent) => void;
      onError?: (event: PlayerEvent) => void;
      onApiChange?: (event: PlayerEvent) => void;
    };
  }

  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
  }
}