import YouTubeSummarizerPlugin from '../main';

// Extend the type definition of the plugin to include the openMiniPlayer method
declare module '../main' {
  interface YouTubeSummarizerPlugin {
    openMiniPlayer(url: string, title?: string, currentTime?: number): void;
    closeMiniPlayer(): void;
    registerCommands(): void;
  }
}

export {};