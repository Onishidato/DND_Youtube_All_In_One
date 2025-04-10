import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, MarkdownView, Notice, Plugin, TFile, parseYaml, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { EventEmitter } from 'events';

import { PluginSettings, TranscriptResponse, VideoMetadata, MediaNotesPluginSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { GeminiService } from './services/gemini';
import { GrokService } from './services/grok';
import { LLMService } from './services/llm-service';
import { VideoSummarizerSettingTab } from './settings';
import { StorageService } from './services/storage';
import { VideoAnalysisService } from './services/video-analysis';
import { YouTubeService } from './services/youtube';
import { YouTubeURLModal } from './modals/youtube-url';
import { PromptService } from './services/prompt';
import { TimestampService } from './services/timestamp';
import { FileOrganizationService } from './services/file-organization';
import { createClickHandlerPlugin } from './viewPlugin';
import { MediaFrame, getVideoId } from './components/media-frame';
import { MiniPlayer } from './components/mini-player';
import { AppProvider } from './app-context';

// Type definition for debounced functions
type DebouncedFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
};

/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Represents the YouTube Summarizer Plugin.
 * This class extends the Plugin class and provides the main functionality
 * for the YouTube Summarizer Plugin.
 */
export default class YouTubeSummarizerPlugin extends Plugin {
	settings: PluginSettings;
	private storageService: StorageService;
	private youtubeService: YouTubeService;
	private promptService: PromptService;
	private llmService: LLMService;
	private videoAnalysisService: VideoAnalysisService;
	private timestampService: TimestampService;
	private fileOrganizationService: FileOrganizationService;
	private isProcessing = false;
  
	// Optimization: Track processing state per video to allow parallel processing
	private processingVideos: Set<string> = new Set();
	
	// Media player properties
	players: {
		[id: string]: {
			iframeElement: HTMLIFrameElement | null;
			mediaLink: string;
			eventEmitter: EventEmitter;
			root: ReturnType<typeof createRoot> | null;
			container: HTMLElement | null;
		};
	};
	
	// Mini player properties
	private miniPlayerContainer: HTMLElement | null = null;
	private miniPlayerRoot: ReturnType<typeof createRoot> | null = null;
	private miniPlayerActive: boolean = false;
	private activeMiniPlayerId: string | null = null;
	private eventEmitter: EventEmitter = new EventEmitter();

	// Performance enhancements: LRU cache for expensive operations
	private videoSummaryCache: Map<string, { timestamp: number, summary: string }> = new Map();
	private MAX_CACHE_ENTRIES = 10;
	private CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

	// CSS class constants
	public readonly mediaNotesContainerClass = "media-notes-container";
	public readonly mediaParentContainerVerticalClass = "media-container-parent-vertical";

	// Performance optimizations
	private playerRenderDebounce: DebouncedFunction<() => void> | null = null;
	private windowResizeHandler: (() => void) | null = null;
	private intersectionObserver: IntersectionObserver | null = null;

	// Event listeners
	private miniPlayerPositionChangedListener: (e: CustomEvent) => void;
	private miniPlayerResizedListener: (e: CustomEvent) => void;
	private keyboardEventHandler: (e: KeyboardEvent) => void;

	/**
	 * Creates a debounced function that delays invoking func until after wait milliseconds
	 * @param func - The function to debounce
	 * @param wait - The number of milliseconds to delay
	 * @returns Debounced function
	 */
	private debounce<T extends (...args: any[]) => any>(
		func: T,
		wait: number
	): DebouncedFunction<T> {
		let timeout: NodeJS.Timeout | null = null;
		
		const debounced = function(this: any, ...args: Parameters<T>) {
			const later = () => {
				timeout = null;
				func.apply(this, args);
			};
			
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			timeout = setTimeout(later, wait);
		} as DebouncedFunction<T>;
		
		debounced.cancel = function() {
			if (timeout !== null) {
				clearTimeout(timeout);
				timeout = null;
			}
		};
		
		return debounced;
	}
	
	/**
	 * Creates a throttled function that only executes once per wait period
	 * @param func - The function to throttle
	 * @param wait - The number of milliseconds to throttle
	 * @returns Throttled function
	 */
	private throttle<T extends (...args: any[]) => any>(
		func: T,
		wait: number
	): (...args: Parameters<T>) => void {
		let inThrottle = false;
		
		return function(this: any, ...args: Parameters<T>) {
			if (!inThrottle) {
				func.apply(this, args);
				inThrottle = true;
				setTimeout(() => {
					inThrottle = false;
				}, wait);
			}
		};
	}

	/**
	 * Load plugin settings
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Reset all plugin settings to defaults
	 */
	async resetSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS);
		await this.saveSettings();
		
		// Reinitialize services with default settings
		this.initializeLLMService();
		
		// Update the video analysis service
		this.videoAnalysisService = new VideoAnalysisService(this.settings, this.llmService);
	}

	/**
	 * Save plugin settings to disk
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Initialize plugin services
	 */
	private async initializeServices(): Promise<void> {
		// Load plugin settings
		await this.loadSettings();
		
		// Initialize services
		this.storageService = new StorageService(this);
		this.youtubeService = new YouTubeService();
		this.promptService = new PromptService(
			this.settings.customPrompt,
			this.settings.savedPrompts,
			this.settings.selectedPromptId
		);
		this.timestampService = new TimestampService();
		this.fileOrganizationService = new FileOrganizationService(this.app);
		
		// Initialize LLM service based on settings
		this.initializeLLMService();
		
		// Initialize video analysis service
		this.videoAnalysisService = new VideoAnalysisService(this.settings, this.llmService);
		
		// Initialize IntersectionObserver for lazy loading media players
		this.setupIntersectionObserver();
	}
	
	/**
	 * Initializes the LLM service based on current settings
	 */
	private initializeLLMService(): void {
		if (this.settings.llmProvider === 'gemini') {
			this.llmService = new GeminiService(this.settings);
		} else if (this.settings.llmProvider === 'grok') {
			this.llmService = new GrokService(this.settings);
		} else {
			// Default to Gemini
			this.llmService = new GeminiService(this.settings);
		}
	}
	
	/**
	 * Setup IntersectionObserver for lazy loading media players
	 */
	private setupIntersectionObserver(): void {
		// Only create if not already created
		if (this.intersectionObserver) {
			// Clean up any existing observer first
			this.intersectionObserver.disconnect();
		}
		
		// Create IntersectionObserver to handle visibility of players
		this.intersectionObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const playerId = entry.target.getAttribute('data-player-id');
					if (!playerId) return;
					
					// Get the player container
					const player = this.players[playerId];
					if (!player) return;
					
					// If player is visible and not rendered, render it
					if (entry.isIntersecting) {
						if (!player.root && player.container) {
							this.renderPlayer(playerId, player.container, player.mediaLink);
						}
					} else {
						// If player is not visible and we want to unload for performance, clean up
						if (this.settings.unloadHiddenPlayers && player.root) {
							// Save current time before unmounting
							this.savePlayerTimestamp(playerId);
							// Unmount player
							if (player.root) {
								player.root.unmount();
								player.root = null;
							}
							// Clear the container but keep a placeholder
							if (player.container) {
								player.container.innerHTML = '<div class="player-placeholder">Player unloaded (scroll to view)</div>';
							}
						}
					}
				});
			},
			{
				root: null, // viewport
				rootMargin: '100px', // Load when within 100px of viewport
				threshold: 0.1 // Trigger when at least 10% visible
			}
		);
	}

	/**
	 * Handles video analysis when captions aren't available
	 * @param url - The URL of the YouTube video to analyze
	 * @returns Promise containing the summary text
	 */
	private async handleVideosWithoutCaptions(url: string): Promise<{summary: string, metadata: VideoMetadata}> {
		// Check cache first
		const videoId = getVideoId(url);
		if (videoId) {
			const cached = this.videoSummaryCache.get(videoId);
			if (cached && (Date.now() - cached.timestamp < this.CACHE_EXPIRY_MS)) {
				// Found valid cached summary
				const metadata = await this.youtubeService.fetchVideoMetadata(url);
				return { summary: cached.summary, metadata };
			}
		}
		
		// Extract metadata from the video
		new Notice('No captions available, analyzing video using alternative methods...');
		const metadata = await this.youtubeService.fetchVideoMetadata(url);
		
		let summary: string;
		
		// Choose analysis method based on settings
		if (this.settings.videoAnalysisMethod === 'multimodal' && this.settings.multimodalEnabled) {
			// Use multimodal analysis if enabled in settings
			try {
				new Notice('Analyzing video using multimodal AI...');
				const videoUrl = this.youtubeService.getVideoContentUrl(metadata.videoId);
				summary = await this.videoAnalysisService.generateMultimodalSummary(videoUrl, metadata);
			} catch (error) {
				// Fall back to metadata analysis if multimodal fails
				if (this.settings.fallbackToMetadata) {
					new Notice('Multimodal analysis failed, falling back to metadata analysis...');
					summary = await this.videoAnalysisService.generateMetadataSummary(metadata);
				} else {
					throw new Error(`Multimodal analysis failed: ${error.message}`);
				}
			}
		} else {
			// Use metadata analysis
			new Notice('Analyzing video using metadata...');
			summary = await this.videoAnalysisService.generateMetadataSummary(metadata);
		}
		
		// Cache the result
		if (videoId) {
			this.addToSummaryCache(videoId, summary);
		}
		
		return { summary, metadata };
	}
	
	/**
	 * Opens a mini player for the given YouTube URL
	 * @param url - The YouTube video URL
	 * @param title - Optional title for the mini player
	 * @param currentTime - Optional timestamp to start the video at
	 */
	openMiniPlayer(url: string, title?: string, currentTime?: number): void {
		// Get the video ID from the URL
		const videoId = getVideoId(url);
		if (!videoId) {
			new Notice('Invalid YouTube URL');
			return;
		}
		
		// Close any existing mini player
		if (this.miniPlayerActive) {
			this.closeMiniPlayer();
		}
		
		// Create container for mini player
		this.miniPlayerContainer = document.createElement('div');
		this.miniPlayerContainer.className = 'mini-player-root';
		document.body.appendChild(this.miniPlayerContainer);
		
		// Get saved position if available
		let savedPosition;
		try {
			const positionString = localStorage.getItem('mini-player-position');
			if (positionString) {
				savedPosition = JSON.parse(positionString);
			}
		} catch (e) {
			console.error('Failed to load mini-player position:', e);
		}
		
		// Create or get player entry
		const playerId = videoId;
		if (!this.players[playerId]) {
			this.players[playerId] = {
				iframeElement: null,
				mediaLink: url,
				eventEmitter: new EventEmitter(),
				root: null,
				container: null
			};
		}
		
		 // Apply position to mini-player container
		this.setMiniPlayerPositionFromSettings(savedPosition);
		
		// Create root and render mini player
		this.miniPlayerRoot = createRoot(this.miniPlayerContainer);
		if (this.miniPlayerRoot) {
			this.miniPlayerRoot.render(
				<MiniPlayer
					videoId={videoId}
					title={title || 'YouTube Video'}
					currentTime={currentTime}
					initialPosition={savedPosition}
					rememberPosition={true}
					onClose={() => this.closeMiniPlayer()}
					onJumpToNote={() => this.jumpToVideoNote(url)}
				/>
			);
		}
		
		// Update state
		this.miniPlayerActive = true;
		this.activeMiniPlayerId = videoId;
		
		// Capture the iframe element from the mini player
		setTimeout(() => {
			if (this.miniPlayerContainer) {
				const iframeElement = this.miniPlayerContainer.querySelector('iframe');
				if (iframeElement && this.players[playerId]) {
					this.players[playerId].iframeElement = iframeElement as HTMLIFrameElement;
				}
			}
		}, 300); // Small delay to ensure the iframe is rendered
	}
	
	/**
	 * Closes the currently active mini player
	 */
	private closeMiniPlayer(): void {
		if (this.miniPlayerRoot && this.miniPlayerContainer) {
			this.miniPlayerRoot.unmount();
			this.miniPlayerContainer.remove();
			this.miniPlayerRoot = null;
			this.miniPlayerContainer = null;
			this.miniPlayerActive = false;
			this.activeMiniPlayerId = null;
		}
	}
	
	/**
	 * Jumps to the note containing the specified YouTube URL
	 * @param url - The YouTube URL to find in notes
	 */
	private async jumpToVideoNote(url: string): Promise<void> {
		// Find files containing the YouTube URL
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const content = await this.app.vault.read(file);
			if (content.includes(url)) {
				// Open the file if it contains the URL
				await this.app.workspace.getLeaf().openFile(file);
				return;
			}
		}
		
		// Notify if no matching note is found
		new Notice('No note found with this video');
	}

	/**
	 * Add an entry to the summary cache with LRU behavior
	 * @param videoId - The video ID
	 * @param summary - The generated summary
	 */
	private addToSummaryCache(videoId: string, summary: string): void {
		// If cache is full, remove oldest entry
		if (this.videoSummaryCache.size >= this.MAX_CACHE_ENTRIES) {
			// Find oldest entry
			let oldestKey = '';
			let oldestTime = Date.now();
			
			for (const [key, value] of this.videoSummaryCache.entries()) {
				if (value.timestamp < oldestTime) {
					oldestTime = value.timestamp;
					oldestKey = key;
				}
			}
			
			// Remove oldest entry
			if (oldestKey) {
				this.videoSummaryCache.delete(oldestKey);
			}
		}
		
		// Add new entry
		this.videoSummaryCache.set(videoId, {
			timestamp: Date.now(),
			summary
		});
	}

	/**
	 * Summarizes the YouTube video for the given URL and updates the markdown view with the summary.
	 * @param url - The URL of the YouTube video to summarize.
	 * @param editor - The active markdown editor where the summary will be inserted.
	 * @returns {Promise<void>} A promise that resolves when the video is summarized.
	 */
	private async summarizeVideo(url: string, editor: Editor): Promise<void> {
		const videoId = getVideoId(url);
		
		// Check if this specific video is already being processed
		if (!videoId || this.processingVideos.has(videoId)) {
			new Notice(`Already processing this video, please wait...`);
			return;
		}

		try {
			// Mark this video as being processed
			this.processingVideos.add(videoId);
			this.isProcessing = true;
			
			// Ensure the appropriate API key is set
			if (this.settings.llmProvider === 'gemini' && !this.settings.geminiApiKey) {
				new Notice('Gemini API key is missing. Please set it in the plugin settings.');
				return;
			} else if (this.settings.llmProvider === 'grok' && !this.settings.grokApiKey) {
				new Notice('Grok API key is missing. Please set it in the plugin settings.');
				return;
			}

			// Check cache first for quick response
			const cached = this.videoSummaryCache.get(videoId);
			if (cached && (Date.now() - cached.timestamp < this.CACHE_EXPIRY_MS)) {
				// Use cached summary data
				const metadata = await this.youtubeService.fetchVideoMetadata(url);
				const thumbnailUrl = YouTubeService.getThumbnailUrl(videoId);
				let formattedSummary = this.generateMetadataSummary(
					metadata,
					thumbnailUrl,
					cached.summary
				);
				
				// Add media link frontmatter if needed
				if (this.settings.mediaPlayerEnabled) {
					formattedSummary = this.addMediaLinkFrontmatter(formattedSummary, url);
				}
				
				// Insert into editor or organize as note
				await this.insertOrOrganizeSummary(formattedSummary, metadata, editor);
				new Notice('Summary loaded from cache!');
				return;
			}

			// Fetch the video transcript or metadata
			new Notice('Fetching video information...');
			const transcript = await this.youtubeService.fetchTranscript(url);
			
			let summaryText: string;
			let formattedSummary: string;
			let metadata: VideoMetadata | null = null;
			
			// Check if captions are available
			if (transcript.lines.length > 0) {
				// Captions are available, use traditional method
				const thumbnailUrl = YouTubeService.getThumbnailUrl(transcript.videoId);
				
				// Extract timestamps if enabled
				interface TimestampData {
					time: string;
					text: string;
					url: string;
				}
				
				let timestampData: TimestampData[] = [];
				if (this.settings.includeTimestamps) {
					timestampData = this.timestampService.extractKeyTimestamps(transcript.lines, transcript.videoId);
				}
				
				// Build the prompt for LLM, including timestamp information if available
				let promptText = this.promptService.buildPrompt(transcript.lines.map((line) => line.text).join(' '));
				
				// If timestamps are enabled, append timestamp information to the prompt
				if (this.settings.includeTimestamps && timestampData.length > 0) {
					const timestampPrompt = `\n\nHere are some key timestamps from the video that you can reference:\n` +
						timestampData.map(ts => `- [${ts.time}]: ${ts.text}`).join('\n');
					promptText += timestampPrompt;
				}
				
				// Generate the summary using the selected LLM service
				new Notice(`Generating summary using ${this.settings.llmProvider.charAt(0).toUpperCase() + this.settings.llmProvider.slice(1)}...`);
				summaryText = await this.llmService.summarize(promptText);
				
				// Cache the summary for future use
				this.addToSummaryCache(transcript.videoId, summaryText);
				
				// Create the summary content based on the selected format
				formattedSummary = this.generateFormattedSummary(
					transcript,
					thumbnailUrl,
					url,
					summaryText,
					timestampData
				);
			} else {
				// No captions available, use alternative methods
				const result = await this.handleVideosWithoutCaptions(url);
				summaryText = result.summary;
				metadata = result.metadata;
				
				// Get thumbnail URL
				const thumbnailUrl = YouTubeService.getThumbnailUrl(metadata.videoId);
				
				// Create the summary content using metadata
				formattedSummary = this.generateMetadataSummary(
					metadata,
					thumbnailUrl,
					summaryText
				);
			}

			// Add frontmatter with media_link to enable the embedded player
			if (this.settings.mediaPlayerEnabled) {
				formattedSummary = this.addMediaLinkFrontmatter(formattedSummary, url);
			}

			// Insert the summary into the markdown view or organize as a new note
			await this.insertOrOrganizeSummary(
				formattedSummary,
				metadata || transcript,
				editor
			);
			
		} catch (error) {
			new Notice(`Error: ${error.message}`);
		} finally {
			// Reset the processing flags
			if (videoId) {
				this.processingVideos.delete(videoId);
			}
			
			this.isProcessing = this.processingVideos.size > 0;
		}
	}
	
	/**
	 * Insert summary into editor or organize as a note based on settings
	 * @param formattedSummary - The formatted summary content
	 * @param metadataOrTranscript - Video metadata or transcript
	 * @param editor - The active editor
	 */
	private async insertOrOrganizeSummary(
		formattedSummary: string,
		metadataOrTranscript: VideoMetadata | TranscriptResponse,
		editor: Editor
	): Promise<void> {
		// Handle note organization if enabled
		if (this.settings.organizationEnabled) {
			try {
				new Notice('Organizing note according to your settings...');
				const filePath = await this.fileOrganizationService.saveOrganizedNote(
					formattedSummary,
					metadataOrTranscript,
					this.settings.folderStructure,
					this.settings.fileNameTemplate,
					this.settings.organizationFolder
				);
				
				// Open the created file
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file && file instanceof TFile) {
					this.app.workspace.getLeaf().openFile(file);
					new Notice(`Summary saved to ${filePath}`);
				} else {
					// If file organization worked but file can't be found, insert in current editor as fallback
					editor.replaceSelection(formattedSummary);
					new Notice(`Summary saved to ${filePath} but couldn't be opened automatically.`);
				}
			} catch (error) {
				// Fall back to inserting directly if file organization fails
				new Notice(`File organization failed: ${error.message}. Inserting summary directly.`);
				editor.replaceSelection(formattedSummary);
			}
		} else {
			// Insert the summary into the markdown view if organization is disabled
			editor.replaceSelection(formattedSummary);
			new Notice('Summary generated successfully!');
		}
	}

	/**
	 * Adds the media_link frontmatter to the summary content
	 * @param content - The summary content
	 * @param url - The YouTube URL
	 * @returns The content with frontmatter added
	 */
	private addMediaLinkFrontmatter(content: string, url: string): string {
		const frontmatter = `---
media_link: ${url}
---

`;
		
		// Check if there's already frontmatter in the content
		if (content.startsWith('---')) {
			// Find the end of the existing frontmatter
			const endOfFrontmatter = content.indexOf('---', 3);
			if (endOfFrontmatter !== -1) {
				// Insert the media_link into the existing frontmatter
				const existingFrontmatter = content.substring(0, endOfFrontmatter);
				const contentAfterFrontmatter = content.substring(endOfFrontmatter);
				
				// Only add media_link if it doesn't already exist
				if (!existingFrontmatter.includes('media_link:')) {
					return existingFrontmatter + `media_link: ${url}\n` + contentAfterFrontmatter;
				}
				return content;
			}
		}
		
		// No existing frontmatter, add new frontmatter
		return frontmatter + content;
	}

	/**
	 * Get the media link from frontmatter
	 * @param frontmatter - The frontmatter object
	 * @returns The media link or null if not found
	 */
	private getMediaLinkFromFrontmatter(frontmatter: any): string | null {
		if (!frontmatter) return null;
		
		// Check for media_link property
		if (frontmatter.media_link) {
			return frontmatter.media_link;
		}
		
		return null;
	}

	/**
	 * Registers events for handling the media player
	 */
	private registerMediaPlayerEvents(): void {
		// Create a debounced version of renderPlayerInView
		this.playerRenderDebounce = this.debounce(() => {
			if (!this.settings.mediaPlayerEnabled) return;
			
			const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				this.renderPlayerInView(markdownView);
			}
		}, 300);

		// Handle layout changes to re-render players
		this.registerEvent(
			this.app.workspace.on("layout-change", this.throttle(() => {
				if (!this.settings.mediaPlayerEnabled) return;
				
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!markdownView) {
					// Save timestamps for all players when view is closed
					this.saveMiniPlayerAllTimestamps();
					return;
				}
				
				// Use debounced render to avoid performance issues during rapid layout changes
				if (this.playerRenderDebounce) {
					this.playerRenderDebounce();
				}
			}, 200))
		);

		// Handle frontmatter changes to update player if media_link changes
		this.registerEvent(
			this.app.metadataCache.on("changed", this.throttle((file) => {
				if (!this.settings.mediaPlayerEnabled) return;
				
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (frontmatter && this.getMediaLinkFromFrontmatter(frontmatter)) {
					// Use debounced render when frontmatter changes
					if (this.playerRenderDebounce) {
						this.playerRenderDebounce();
					}
				}
			}, 200))
		);

		// Add window resize handler for responsive adjustments
		this.windowResizeHandler = this.throttle(() => {
			// Adjust mini-player position if it's active to ensure it stays within viewport
			if (this.miniPlayerActive && this.miniPlayerContainer) {
				const rect = this.miniPlayerContainer.getBoundingClientRect();
				const maxX = window.innerWidth - rect.width;
				const maxY = window.innerHeight - rect.height;
				
				let left = parseFloat(this.miniPlayerContainer.style.left);
				let top = parseFloat(this.miniPlayerContainer.style.top);
				
				// Ensure mini-player stays within viewport
				if (left > maxX) {
					this.miniPlayerContainer.style.left = `${maxX}px`;
				}
				
				if (top > maxY) {
					this.miniPlayerContainer.style.top = `${maxY}px`;
				}

				// Ensure the iframe inside the mini-player is sized properly
				this.resizeMiniPlayerContent();
			}
		}, 100);
		
		window.addEventListener('resize', this.windowResizeHandler);
		
		// Add event listener for mini-player position changes
		this.miniPlayerPositionChangedListener = (e: CustomEvent) => {
			if (e.detail && this.settings.rememberMiniPlayerPosition) {
				this.saveMiniPlayerPosition(e.detail.x, e.detail.y);
			}
		};
		window.addEventListener('mini-player-position-changed', this.miniPlayerPositionChangedListener);
		
		// Add event listener for mini-player resize
		this.miniPlayerResizedListener = (e: CustomEvent) => {
			if (this.miniPlayerActive) {
				this.resizeMiniPlayerContent();
			}
		};
		window.addEventListener('mini-player-resized', this.miniPlayerResizedListener);
	}

	/**
	 * Renders a player in a container for a given playerId
	 * @param playerId - The ID of the player
	 * @param container - The HTML container element
	 * @param mediaLink - The YouTube URL
	 */
	public renderPlayer(playerId: string, container: HTMLElement, mediaLink: string): void {
		if (!container) return;
		
		// Clear existing content
		container.empty();
		container.setAttribute('data-player-id', playerId);
		
		// Create player if it doesn't exist
		if (!this.players[playerId]) {
			this.players[playerId] = {
				iframeElement: null,
				mediaLink,
				eventEmitter: new EventEmitter(),
				root: null,
				container: null
			};
		}
		
		// Update container reference
		this.players[playerId].container = container;
		
		// Get saved timestamp for this player
		const initialTimeSeconds = this.getPlayerTimestamp(playerId);
		
		// Create root if it doesn't exist
		if (!this.players[playerId].root) {
			this.players[playerId].root = createRoot(container);
		}
		
		 // Safely get player dimensions from settings
		const playerHeight = this.getNumericSetting(this.settings.playerHeight, 400);
		
		// Render the player with React - Add null check to satisfy TypeScript
		const root = this.players[playerId].root;
		if (root) {
			root.render(
				<AppProvider
					settingsParam={this.settings as MediaNotesPluginSettings}
					eventEmitter={this.players[playerId].eventEmitter}
				>
					<MediaFrame
						url={mediaLink}
						containerHeight={playerHeight}
						containerWidth="100%"
						initialTimeSeconds={initialTimeSeconds}
						onTimestampInsert={this.handleTimestampInsert.bind(this)}
						addCommand={(command: any) => {
							// We'd add commands here if needed for this specific player
						}}
						removeCommand={(id: string) => {
							// We'd remove commands here if needed for this specific player
						}}
					/>
				</AppProvider>
			);
		}
		
		// Observe this player container for visibility
		if (this.intersectionObserver) {
			this.intersectionObserver.observe(container);
		}
	}

	/**
	 * Save the current timestamp for a player to settings
	 * @param playerId - The ID of the player
	 */
	public async savePlayerTimestamp(playerId: string): Promise<void> {
		try {
			// Get the player
			const player = this.players[playerId];
			if (!player || !player.iframeElement) {
				return;
			}
			
			// Get the player's current time
			const iframe = player.iframeElement;
			if (iframe && iframe.contentWindow) {
				const currentTime = await this.getIframeCurrentTime(iframe);
				
				// Only save if we have a valid time (not null and > 0)
				if (currentTime !== null && !isNaN(currentTime) && currentTime > 0) {
					// Create the saved timestamps data structure if it doesn't exist
					if (!this.settings.savedTimestamps) {
						this.settings.savedTimestamps = {};
					}
					
					// Save the timestamp (we've already verified it's not null)
					this.settings.savedTimestamps[playerId] = currentTime;
					
					// Save settings
					this.saveSettings();
				}
			}
		} catch (error) {
			console.error('Error saving player timestamp:', error);
		}
	}
	
	/**
	 * Get the saved timestamp for a player from settings
	 * @param playerId - The ID of the player
	 * @returns The saved timestamp in seconds, or 0 if not found
	 */
	private getPlayerTimestamp(playerId: string): number {
		try {
			if (this.settings.savedTimestamps && 
				this.settings.savedTimestamps[playerId] !== undefined) {
				return this.settings.savedTimestamps[playerId];
			}
		} catch (error) {
			console.error('Error getting player timestamp:', error);
		}
		
		return 0;
	}
	
	/**
	 * Save the mini player position to settings
	 * @param x - The x position
	 * @param y - The y position
	 */
	private saveMiniPlayerPosition(x: number, y: number): void {
		// Ensure the values are valid
		if (isNaN(x) || isNaN(y)) return;
		
		// Update settings
		this.settings.miniPlayerX = x;
		this.settings.miniPlayerY = y;
		
		// Use debounce to avoid frequent disk writes
		this.debounceSettingsSave();
	}
	
	/**
	 * Jump to the mini player position stored in settings when opening
	 * @param position - Optional position to override settings
	 */
	private setMiniPlayerPositionFromSettings(position?: { x: number; y: number }): void {
		if (!this.miniPlayerContainer) return;
		
		try {
			// Use provided position or fetch from settings
			let posX = position?.x;
			let posY = position?.y;
			
			// If no position provided, try to get from settings
			if (posX === undefined || posY === undefined) {
				// Try the modern position format first
				if (this.settings.miniPlayerPosition) {
					posX = this.settings.miniPlayerPosition.left;
					posY = this.settings.miniPlayerPosition.top;
				} 
				// Try legacy format
				else if (this.settings.miniPlayerX !== undefined && this.settings.miniPlayerY !== undefined) {
					posX = this.settings.miniPlayerX;
					posY = this.settings.miniPlayerY;
				}
			}
			
			// Apply position if we have valid coordinates
			if (posX !== undefined && posY !== undefined && !isNaN(posX) && !isNaN(posY)) {
				// Adjust for viewport bounds
				const maxX = window.innerWidth - 320; // Assuming width of 320px
				const maxY = window.innerHeight - 240; // Assuming height of 240px
				
				// Ensure the player stays within the viewport
				posX = Math.max(0, Math.min(posX, maxX));
				posY = Math.max(0, Math.min(posY, maxY));
				
				// Set the position
				this.miniPlayerContainer.style.left = `${posX}px`;
				this.miniPlayerContainer.style.top = `${posY}px`;
			}
		} catch (error) {
			console.error('Error setting mini-player position:', error);
		}
	}
	
	/**
	 * Handles the insertion of a timestamp into the editor
	 * @param time - The timestamp in seconds
	 * @param text - Optional text to associate with the timestamp
	 */
	private handleTimestampInsert(time: number, text?: string): void {
		try {
			// Get active editor
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || !activeView.editor) return;
			
			// Format the timestamp
			const formattedTime = this.timestampService.formatTime(time);
			
			// Make sure file isn't null before accessing its properties
			if (!activeView.file) return;
			
			let insertText = `[${formattedTime}](https://youtu.be/${getVideoId(activeView.file.basename)})`;
			if (text) {
				insertText = `[${formattedTime}: ${text}](https://youtu.be/${getVideoId(activeView.file.basename)})`;
			}
			
			// Insert at cursor position
			activeView.editor.replaceSelection(insertText);
			
			// Show a brief notice
			new Notice(`Timestamp ${formattedTime} inserted`);
		} catch (error) {
			console.error('Error inserting timestamp:', error);
			new Notice('Failed to insert timestamp');
		}
	}
	
	// Save settings with debounce to avoid excessive disk I/O
	private settingsSaveTimeout: NodeJS.Timeout | null = null;
	private debounceSettingsSave(): void {
		if (this.settingsSaveTimeout) {
			clearTimeout(this.settingsSaveTimeout);
		}
		
		this.settingsSaveTimeout = setTimeout(() => {
			this.saveSettings();
			this.settingsSaveTimeout = null;
		}, 1000); // 1 second debounce
	}
	
	/**
	 * Handle a click on a timestamp in the document
	 * @param timestamp - The timestamp text
	 * @returns Whether the timestamp was handled
	 */
	handleTimestampClick = (timestamp: string): boolean | undefined => {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return false;
			
			// Calculate seconds from timestamp
			const seconds = convertTimestampToSeconds(timestamp);
			if (isNaN(seconds)) {
				console.error('Invalid timestamp format:', timestamp);
				return false;
			}
			
			// First try to use existing player in view
			const player = this.getActiveViewYoutubePlayer(activeView);
			
			if (player && player.iframeElement && player.iframeElement.contentWindow) {
				// Use YouTube iframe API to seek to position
				this.sendYouTubeCommand(player.iframeElement, 'seekTo', [seconds, true]);
				
				// Emit event for any listeners
				player.eventEmitter?.emit("handleAction", {
					type: "timestampClick",
				});
				
				// Return true to indicate we handled the click
				return true;
			} 
			
			// If no player found but auto-open is enabled, try to open mini-player
			if (this.settings.autoOpenMiniPlayerOnTimestampClick && activeView.file) {
				// Get media link from frontmatter
				const frontmatter = this.app.metadataCache.getFileCache(activeView.file)?.frontmatter;
				const mediaLink = this.getMediaLinkFromFrontmatter(frontmatter);
				
				if (mediaLink) {
					// Open mini player at the timestamp
					this.openMiniPlayer(mediaLink, activeView.file.basename, seconds);
					return true;
				}
			}
			
			return false;
		} catch (error) {
			console.error('Error handling timestamp click:', error);
			return false;
		}
	};
	/**
	 * Checks if a player is currently active
	 * @param playerId - The ID of the player to check
	 * @returns Whether the player is active
	 */
	private isPlayerActive(playerId: string): boolean {
		return this.activeMiniPlayerId === playerId;
	}

	/**
	 * Render media player in markdown
	 */
	private renderMediaPlayer(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		// Get all iframe elements
		const iframes = el.querySelectorAll('iframe');
		
		iframes.forEach((iframe) => {
			const src = iframe.getAttribute('src');
			if (!src) return;
			
			// Check if it's a YouTube video
			if (src.includes('youtube.com/embed/') || src.includes('youtu.be/')) {
				// Create a wrapper for the iframe
				const wrapper = document.createElement('div');
				wrapper.className = 'youtube-player-wrapper';
				
				// Create a button to open mini player
				const miniPlayerBtn = document.createElement('button');
				miniPlayerBtn.className = 'mini-player-btn';
				miniPlayerBtn.textContent = 'Open Mini Player';
				miniPlayerBtn.addEventListener('click', () => {
					// Extract video ID from src
					const videoId = getVideoId(src);
					if (videoId) {
						// Open mini player
						this.openMiniPlayer(`https://www.youtube.com/watch?v=${videoId}`, ctx.sourcePath.split('/').pop()?.split('.').shift() || 'Video');
					}
				});
				
				// Add the button after the iframe
				iframe.parentNode?.insertBefore(wrapper, iframe);
				wrapper.appendChild(iframe);
				wrapper.appendChild(miniPlayerBtn);
			}
			// Add click event listeners to timestamp links in read mode
			el.querySelectorAll("a.external-link").forEach((link) => {
				const linkText = link.textContent;
				const href = link.getAttribute('href');
				// Check if it's a YouTube timestamp link
				if (linkText && href && (
					/^(\d+:)?[0-5]?\d:[0-5]\d$/.test(linkText) || // MM:SS format
					/^\d+:\d+:\d+$/.test(linkText)) // HH:MM:SS format
				) {
					link.addEventListener("click", (event) => {
						const isHandled = this.handleTimestampClick(linkText);
						if (isHandled) {
							event.preventDefault();
							event.stopPropagation();
						}
					});
				}
			});
		});
	}

	/**
	 * Register commands for controlling the mini player
	 */
	private registerMiniPlayerCommands(): void {
		// Command to toggle play/pause for active mini player
		this.addCommand({
			id: 'toggle-mini-player-playback',
			name: 'Toggle mini player play/pause',
			callback: () => {
				const activeMiniPlayer = Object.values(this.players).find(player => 
									player.container && player.container.classList.contains('active')
								);
								
								if (activeMiniPlayer && activeMiniPlayer.iframeElement) {
									this.toggleIframePlayback(activeMiniPlayer.iframeElement);
								}
			}
		});
		
		// Command to skip backward in active mini player
		this.addCommand({
			id: 'mini-player-skip-backward',
			name: 'Mini player skip backward',
			callback: async () => {
				const activeMiniPlayer = Object.values(this.players).find(player => 
					player.container && player.container.classList.contains('active')
				);
				
				if (activeMiniPlayer && activeMiniPlayer.iframeElement) {
					const currentTime = await this.getIframeCurrentTime(activeMiniPlayer.iframeElement);
					if (currentTime !== null) {
						this.seekIframeToTime(activeMiniPlayer.iframeElement, Math.max(0, currentTime - this.settings.seekSeconds));
					}
				}
			}
		});
		
		// Command to skip forward in active mini player
		this.addCommand({
			id: 'mini-player-skip-forward',
			name: 'Mini player skip forward',
			callback: async () => {
				const activeMiniPlayer = Object.values(this.players).find(player => 
					player.container && player.container.classList.contains('active')
				);
				
				if (activeMiniPlayer && activeMiniPlayer.iframeElement) {
					const currentTime = await this.getIframeCurrentTime(activeMiniPlayer.iframeElement);
					const duration = await this.getIframeDuration(activeMiniPlayer.iframeElement);
					if (currentTime !== null && duration !== null) {
						this.seekIframeToTime(activeMiniPlayer.iframeElement, Math.min(duration, currentTime + this.settings.seekSeconds));
					}
				}
			}
		});
	}

	/**
	 * Called when the plugin is loaded.
	 */
	async onload() {
		try {
			// Initialize services
			await this.initializeServices();

			// Add settings tab
			this.addSettingTab(new VideoSummarizerSettingTab(this.app, this));

			// Register commands
			this.registerCommands();
			
			// Register editor extension for timestamp clicking
			this.registerEditorExtension([
				createClickHandlerPlugin(this.handleTimestampClick.bind(this)),
			]);
			
			// Initialize players object for media player
			this.players = {};
			
			// Register events for media player
			this.registerMediaPlayerEvents();
			
			// Process all markdown leaves to add players where needed
			if (this.settings.mediaPlayerEnabled) {
				this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
					const view = leaf.view as MarkdownView;
					this.renderPlayerInView(view);
				});
			}
			
			// Register markdown post processor for read mode
			this.registerMarkdownPostProcessor(
				(el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
					// Render the player in read mode if needed
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view && view.getMode() === "preview") {
						// Only process if we don't already have a player
						const existingPlayer = view.containerEl.querySelector(
							"." + this.mediaNotesContainerClass
						);
						if (!existingPlayer) {
							const file = view.file;
							if (file) {
								const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
								const mediaLink = this.getMediaLinkFromFrontmatter(frontmatter);
								if (mediaLink) {
									ctx.addChild(new MediaPlayerRenderChild(el, this, mediaLink));
								}
							}
						}
					}

					// Add click event listeners to timestamp links in read mode
					el.querySelectorAll("a.external-link").forEach((link) => {
						const linkText = link.textContent;
						const timestampRegex = /^(\d+:)?[0-5]?\d:[0-5]\d$/;
						if (linkText && timestampRegex.test(linkText)) {
							link.addEventListener("click", (event) => {
								event.preventDefault();
								event.stopPropagation();
								this.handleTimestampClick(linkText);
							});
						}
					});
				}
			);
			
			// Register mini-player commands
			this.registerMiniPlayerCommands();
			
			// Register keyboard shortcuts if enabled
			if (this.settings.enableKeyboardShortcuts) {
				this.registerKeyboardShortcuts();
			}
			
		} catch (error) {
			new Notice(`Error: ${error.message}`);
		}
	}

	onunload() {
		// Save timestamps for all players before unloading
		if (this.players) {
			this.saveMiniPlayerAllTimestamps();
		}
		
		// Clean up React components
		Object.keys(this.players).forEach((playerId) => {
			const root = this.players[playerId].root;
			if (root) {
				root.unmount();
			}
			delete this.players[playerId];
		});
		
		// Remove window resize handler
		if (this.windowResizeHandler) {
			window.removeEventListener('resize', this.windowResizeHandler);
			this.windowResizeHandler = null;
		}
		
		// Cancel any debounced functions
		if (this.playerRenderDebounce) {
			this.playerRenderDebounce.cancel();
			this.playerRenderDebounce = null;
		}
		
		// Clean up mini-player
		this.closeMiniPlayer();
		
		// Clean up event listeners
		if (this.miniPlayerPositionChangedListener) {
			window.removeEventListener('mini-player-position-changed', this.miniPlayerPositionChangedListener);
		}
		
		if (this.miniPlayerResizedListener) {
			window.removeEventListener('mini-player-resized', this.miniPlayerResizedListener);
		}
		
		// Disconnect IntersectionObserver
		if (this.intersectionObserver) {
			this.intersectionObserver.disconnect();
			this.intersectionObserver = null;
		}
		
		// Clear memory caches
		this.youtubeService.purgeCache();
		this.videoSummaryCache.clear();
	}

	/**
	 * Save timestamps for all active players to settings
	 */
	private saveMiniPlayerAllTimestamps(): void {
		Object.keys(this.players).forEach((id) => {
			this.savePlayerTimestamp(id);
		});
	}

	/**
	 * Register the plugin commands
	 */
	private registerCommands(): void {
		// Command to summarize YouTube URL from clipboard
		this.addCommand({
			id: 'summarize-youtube-url-from-clipboard',
			name: 'Summarize YouTube URL from clipboard',
			editorCallback: async (editor: Editor) => {
				try {
					// Get URL from clipboard
					const clipboard = await navigator.clipboard.readText();
					const url = clipboard.trim();
					
					// Check if URL is a YouTube URL
					if (YouTubeService.isYouTubeUrl(url)) {
						await this.summarizeVideo(url, editor);
					} else {
						new Notice('Clipboard does not contain a valid YouTube URL');
					}
				} catch (error) {
					new Notice(`Error: ${error.message}`);
				}
			}
		});

		// Command to provide a YouTube URL via modal
		this.addCommand({
			id: 'summarize-youtube-url-input',
			name: 'Summarize YouTube URL (input)',
			editorCallback: (editor: Editor) => {
				const modal = new YouTubeURLModal(this.app, async (url: string) => {
					await this.summarizeVideo(url, editor);
				});
				modal.open();
			}
		});

		// Command to open mini player for current note
		this.addCommand({
			id: 'open-mini-player',
			name: 'Open mini player for current note',
			checkCallback: (checking: boolean) => {
				// Get active view
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!markdownView || !markdownView.file) return false;
				
				// Check if frontmatter contains media_link
				const frontmatter = this.app.metadataCache.getFileCache(markdownView.file)?.frontmatter;
				const mediaLink = this.getMediaLinkFromFrontmatter(frontmatter);
				
				if (!mediaLink) return false;
				
				// If just checking, return true
				if (checking) return true;
				
				// Open mini player
				this.openMiniPlayer(mediaLink, markdownView.file.basename);
				return true;
			}
		});
		
		// Command to toggle mini player visibility
		this.addCommand({
			id: 'toggle-mini-player',
			name: 'Toggle mini player visibility',
			callback: () => {
				if (this.miniPlayerActive) {
					this.closeMiniPlayer();
				} else {
					// Try to open mini player for current note
					const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!markdownView || !markdownView.file) return;
					
					// Check if frontmatter contains media_link
					const frontmatter = this.app.metadataCache.getFileCache(markdownView.file)?.frontmatter;
					const mediaLink = this.getMediaLinkFromFrontmatter(frontmatter);
					
					if (mediaLink) {
						this.openMiniPlayer(mediaLink, markdownView.file.basename);
					}
				}
			}
		});
	}

	/**
	 * Resize the content inside the mini-player container
	 */
	private resizeMiniPlayerContent(): void {
		if (this.miniPlayerContainer) {
			const iframe = this.miniPlayerContainer.querySelector('iframe');
			if (iframe) {
				const rect = this.miniPlayerContainer.getBoundingClientRect();
				iframe.style.width = `${rect.width}px`;
				iframe.style.height = `${rect.height}px`;
			}
		}
	}

	/**
	 * Get the current playback time from a YouTube iframe
	 * @param iframe - The YouTube iframe element
	 * @returns Current time in seconds or null if unavailable
	 */
	private getIframeCurrentTime(iframe: HTMLIFrameElement): Promise<number | null> {
		return new Promise((resolve) => {
			if (!iframe || !iframe.contentWindow) {
				resolve(null);
				return;
			}
			
			// Create a unique message ID for this request
			const messageId = `yt_getCurrentTime_${Date.now()}`;
			
			// Set up a one-time event listener for the response
			const handleMessage = (event: MessageEvent) => {
				// Verify the message is from YouTube
				if (event.origin !== 'https://www.youtube.com') return;
				
				try {
					const data = JSON.parse(event.data);
					if (data.id === messageId && data.event === 'getCurrentTime' && 'info' in data) {
						window.removeEventListener('message', handleMessage);
						resolve(data.info);
					}
				} catch (e) {
					// Not a JSON message or not our response
					console.error('Error parsing YouTube API response:', e);
				}
			};
			
			// Add the event listener
			window.addEventListener('message', handleMessage);
			
			// Send the request to the iframe
			this.sendYouTubeCommand(iframe, 'getCurrentTime', [], messageId)
				.catch(() => {
					console.error('Failed to send getCurrentTime command to YouTube player');
				});
			
			// Set a timeout to clean up if we don't get a response
			setTimeout(() => {
				window.removeEventListener('message', handleMessage);
				resolve(null);
			}, 1000);
		});
	}
	
	/**
	 * Get the duration from a YouTube iframe
	 * @param iframe - The YouTube iframe element
	 * @returns Duration in seconds or null if unavailable
	 */
	private getIframeDuration(iframe: HTMLIFrameElement): Promise<number | null> {
		return new Promise((resolve) => {
			if (!iframe || !iframe.contentWindow) {
				resolve(null);
				return;
			}
			
			// Create a unique message ID for this request
			const messageId = `yt_getDuration_${Date.now()}`;
			
			// Set up a one-time event listener for the response
			const handleMessage = (event: MessageEvent) => {
				// Verify the message is from YouTube
				if (event.origin !== 'https://www.youtube.com') return;
				
				try {
					const data = JSON.parse(event.data);
					if (data.id === messageId && data.event === 'getDuration' && 'info' in data) {
						window.removeEventListener('message', handleMessage);
						resolve(data.info);
					}
				} catch (e) {
					// Not a JSON message or not our response
					console.error('Error parsing YouTube duration response:', e);
				}
			};
			
			// Add the event listener
			window.addEventListener('message', handleMessage);
			
			// Send the request to the iframe
			this.sendYouTubeCommand(iframe, 'getDuration', [], messageId);
			
			// Set a timeout to clean up if we don't get a response
			setTimeout(() => {
				window.removeEventListener('message', handleMessage);
				resolve(null);
			}, 1000);
		});
	}
	
	/**
	 * Seek the YouTube iframe to a specific time
	 * @param iframe - The YouTube iframe element
	 * @param timeInSeconds - The time to seek to in seconds
	 */
	private seekIframeToTime(iframe: HTMLIFrameElement, timeInSeconds: number): void {
		if (!iframe || !iframe.contentWindow) return;
		
		this.sendYouTubeCommand(iframe, 'seekTo', [timeInSeconds, true]);
	}
	
	/**
	 * Toggle playback state of the YouTube iframe
	 * @param iframe - The YouTube iframe element
	 */
	private toggleIframePlayback(iframe: HTMLIFrameElement): void {
		if (!iframe || !iframe.contentWindow) return;
		
		// Create a unique message ID for this request
		const messageId = `yt_getPlayerState_${Date.now()}`;
		
		// Set up a one-time event listener for the response
		const handleMessage = (event: MessageEvent) => {
			// Verify the message is from YouTube
			if (event.origin !== 'https://www.youtube.com') return;
			
			try {
				const data = JSON.parse(event.data);
				if (data.id === messageId && data.event === 'getPlayerState' && 'info' in data) {
					window.removeEventListener('message', handleMessage);
					
					// 1 = playing, 2 = paused
					if (data.info === 1) {
						this.sendYouTubeCommand(iframe, 'pauseVideo');
					} else {
						this.sendYouTubeCommand(iframe, 'playVideo');
					}
				}
			} catch (e) {
				// Not a JSON message or not our response
				console.error('Error processing YouTube message:', e);
			}
		};
		
		// Add the event listener
		window.addEventListener('message', handleMessage);
		
		// Send the request to the iframe
		const commandSent = this.sendYouTubeCommand(iframe, 'getPlayerState', [], messageId);
		
		// Set a timeout to clean up if we don't get a response
		setTimeout(() => {
			window.removeEventListener('message', handleMessage);
			
			// If we don't get a response, just try to play
			this.sendYouTubeCommand(iframe, 'playVideo');
		}, 500);
	}

	/**
	 * Formats the summary content using metadata only (no transcript)
	 * @param metadata - The video metadata
	 * @param thumbnailUrl - The URL of the video thumbnail
	 * @param summaryText - The generated summary text
	 * @returns The formatted summary
	 */
	private generateMetadataSummary(
		metadata: VideoMetadata,
		thumbnailUrl: string,
		summaryText: string
	): string {
		return [
			`# ${metadata.title}`,
			'',
			`![${metadata.title}](${thumbnailUrl})`,
			'',
			`## Channel: ${metadata.author || metadata.channelTitle || 'Unknown'}`,
			`## Published: ${new Date(metadata.publishDate).toLocaleDateString()}`,
			`## Duration: ${metadata.duration}`,
			'',
			'## Summary',
			summaryText,
			'',
			`## Original Video`,
			`[Watch on YouTube](https://www.youtube.com/watch?v=${metadata.videoId})`,
			''
		].join('\n');
	}

	/**
	 * Formats the summary content with transcript and timestamps
	 * @param transcript - The video transcript data
	 * @param thumbnailUrl - The URL of the video thumbnail
	 * @param videoUrl - The URL of the YouTube video
	 * @param summaryText - The generated summary text
	 * @param timestamps - Optional array of timestamp data
	 * @returns The formatted summary
	 */
	private generateFormattedSummary(
		transcript: TranscriptResponse,
		thumbnailUrl: string,
		videoUrl: string,
		summaryText: string,
		timestamps: { time: string; text: string; url: string }[] = []
	): string {
		const lines = [
			`# ${transcript.title}`,
			'',
			`![${transcript.title}](${thumbnailUrl})`,
			'',
			`## Channel: ${transcript.channelTitle}`,
			`## Published: ${transcript.publishDate ? new Date(transcript.publishDate).toLocaleDateString() : 'Unknown'}`,
			`## Duration: ${transcript.duration}`,
			'',
			'## Summary',
			summaryText,
			''
		];
		
		// Add timestamps section if available
		if (timestamps.length > 0) {
			lines.push(
				'## Key Timestamps',
				...timestamps.map(ts => `- [${ts.time}](${ts.url}) - ${ts.text}`),
				''
			);
		}
		
		// Add original video link
		lines.push(
			'## Original Video',
			`[Watch on YouTube](${videoUrl})`,
			''
		);
		
		return lines.join('\n');
	}

	/**
	 * Renders a player in a markdown view if it contains a media_link in frontmatter
	 * @param view - The markdown view to render the player in
	 */
	private renderPlayerInView(view: MarkdownView): void {
		// Skip if media player is disabled
		if (!this.settings.mediaPlayerEnabled) return;
		
		// Parse frontmatter from the view
		const frontmatter = parseYaml(view.getViewData()?.split('---')[1] || '');
		
		// Check if view has valid media link in frontmatter
		if (frontmatter && this.getMediaLinkFromFrontmatter(frontmatter)) {
			// Check if player already exists
			const existingContainer = view.containerEl.querySelector(`.${this.mediaNotesContainerClass}`);
			
			// If container already exists, check if it's for the same media
			if (existingContainer) {
				const existingPlayerId = existingContainer.getAttribute('data-player-id') || '';
				const player = this.players[existingPlayerId];
				
				// If player exists and has the same media link, don't recreate
				if (player && player.mediaLink === this.getMediaLinkFromFrontmatter(frontmatter)) {
					return;
				}
				
				// Remove existing container for different media
				existingContainer.remove();
				
				// Save timestamp before removing
				this.savePlayerTimestamp(existingPlayerId);
				
				// Remove from players object
				delete this.players[existingPlayerId];
			}
			
			// Create new container for player
			const container = document.createElement('div');
			const playerId = this.generateUniqueId();
			container.className = this.mediaNotesContainerClass;
			
			// Find the appropriate location to insert the player
			const contentContainer = 
				view.containerEl.querySelector('.markdown-reading-view') || 
				view.containerEl.querySelector('.markdown-source-view.mod-cm6 .cm-content') ||
				view.containerEl.querySelector('.markdown-preview-view');
			
			// Insert at the beginning of the content container
			if (contentContainer?.firstChild) {
				contentContainer.insertBefore(container, contentContainer.firstChild);
			} else if (contentContainer) {
				contentContainer.appendChild(container);
			}
			
			// Render the player
			this.renderPlayer(
				playerId, 
				container, 
				this.getMediaLinkFromFrontmatter(frontmatter) || ''
			);
		}
	}
	
	/**
	 * Generates a unique ID for player elements
	 * @returns A random string ID
	 */
	private generateUniqueId(): string {
		return Math.random().toString(36).substring(2, 15);
	}

	/**
	 * Register keyboard event listeners for controlling the mini player
	 */
	private registerKeyboardShortcuts(): void {
		// Store reference to bound handler to allow proper cleanup
		this.keyboardEventHandler = this.handleKeyboardEvent.bind(this);
		this.registerDomEvent(document, 'keydown', this.keyboardEventHandler);
	}
	
	/**
	 * Keyboard event handler function
	 */
	private handleKeyboardEvent(event: KeyboardEvent): void {
		// Only handle keyboard shortcuts if mini player is active and user is not typing
		if (this.miniPlayerActive && !this.isUserTyping()) {
			// Handle space key to toggle play/pause
			if (event.key === ' ') {
				event.preventDefault();
				this.togglePlayPause();
			}
			// Handle left arrow key to skip backward
			else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				this.skipBackward();
			}
			// Handle right arrow key to skip forward
			else if (event.key === 'ArrowRight') {
				event.preventDefault();
				this.skipForward();
			}
		}
	}

	/**
	 * Check if the user is currently typing in an input field
	 * @returns True if the user is typing in an input field
	 */
	private isUserTyping(): boolean {
		const activeElement = document.activeElement;
		return (
			activeElement instanceof HTMLInputElement ||
			activeElement instanceof HTMLTextAreaElement ||
			activeElement?.getAttribute('contenteditable') === 'true'
		);
	}

	/**
	 * Toggle play/pause state of the active mini player
	 */
	private async togglePlayPause(): Promise<void> {
		try {
			if (this.activeMiniPlayerId && this.players[this.activeMiniPlayerId]?.iframeElement) {
				const iframe = this.players[this.activeMiniPlayerId].iframeElement;
				if (iframe && await this.getIframeCurrentTime(iframe) !== null) {
					this.toggleIframePlayback(iframe);
				}
			}
		} catch (error) {
			console.error('Error toggling play/pause:', error);
		}
	}

	/**
	 * Skip backward in the active mini player
	 */
	private async skipBackward(): Promise<void> {
		try {
			if (this.activeMiniPlayerId && this.players[this.activeMiniPlayerId]?.iframeElement) {
				const iframe = this.players[this.activeMiniPlayerId].iframeElement;
				if (iframe) {
					const currentTime = await this.getIframeCurrentTime(iframe);
					if (currentTime !== null) {
						const skipSeconds = this.settings.seekSeconds || 10;
						this.seekIframeToTime(iframe, Math.max(0, currentTime - skipSeconds));
					}
				}
			}
		} catch (error) {
			console.error('Error skipping backward:', error);
		}
	}

	/**
	 * Skip forward in the active mini player
	 */
	private async skipForward(): Promise<void> {
		try {
			if (this.activeMiniPlayerId && this.players[this.activeMiniPlayerId]?.iframeElement) {
				const iframe = this.players[this.activeMiniPlayerId].iframeElement;
				if (iframe) {
					const currentTime = await this.getIframeCurrentTime(iframe);
					const duration = await this.getIframeDuration(iframe);
					if (currentTime !== null && duration !== null) {
						const skipSeconds = this.settings.seekSeconds || 10;
						this.seekIframeToTime(iframe, Math.min(duration, currentTime + skipSeconds));
					}
				}
			}
		} catch (error) {
			console.error('Error skipping forward:', error);
		}
	}

	/**
	 * Gets the YouTube player associated with the active view
	 * @param view - The markdown view to get the player from
	 * @returns The player object or null if not found
	 */
	private getActiveViewYoutubePlayer(view: MarkdownView) {
		if (!view) return null;

		// First, find the container by class name
		const existingContainer = view.containerEl.querySelector(
			"." + this.mediaNotesContainerClass
		);
		
		if (!existingContainer) {
			// No container found, so no player in this view
			return null;
		}
		
		// Get the player ID from the container
		const playerId = existingContainer.getAttribute("data-player-id") ?? "";
		if (!playerId) return null;
		
		// Get the player object from our collection
		const player = this.players[playerId];
		if (!player) return null;
		
		// Ensure the player has an iframe element
		if (!player.iframeElement) {
			// Try to find the iframe if it exists but wasn't captured
			const iframe = existingContainer.querySelector('iframe');
			if (iframe) {
				player.iframeElement = iframe as HTMLIFrameElement;
			} else {
				// No iframe found in the player container
				return null;
			}
		}
		
		// Return the player if we found it and it has an iframe
		return player.iframeElement ? player : null;
	}

	/**
	 * Safely send a message to YouTube iframe with error handling
	 * @param iframe - The YouTube iframe element
	 * @param command - The command to send
	 * @param args - Arguments for the command
	 * @param messageId - Optional unique message ID for identifying responses
	 * @returns Promise that resolves to true if successful, false otherwise
	 */
	private sendYouTubeCommand(
		iframe: HTMLIFrameElement, 
		command: string, 
		args: any[] = [],
		messageId?: string
	): Promise<boolean> {
		return new Promise((resolve) => {
			if (!iframe || !iframe.contentWindow) {
				resolve(false);
				return;
			}
			
			try {
				const message = {
					event: 'command',
					func: command,
					args: args,
					id: messageId
				};
				
				iframe.contentWindow.postMessage(JSON.stringify(message), '*');
				resolve(true);
			} catch (error) {
				console.error(`Error sending YouTube command ${command}:`, error);
				resolve(false);
			}
		});
	}

	/**
	 * Get numerical value from setting that could be string or number
	 * @param value - The setting value which could be string or number
	 * @param defaultValue - Default value to use if parsing fails
	 * @returns Numerical value
	 */
	private getNumericSetting(value: string | number | undefined, defaultValue: number): number {
		if (value === undefined) return defaultValue;
		
		if (typeof value === 'number') return value;
		
		// Try to parse string as number
		const parsed = parseFloat(value);
		if (!isNaN(parsed)) return parsed;
		
		// Return default if all else fails
		return defaultValue;
	}
}

/**
 * Converts a timestamp string to seconds
 * @param timestamp - Timestamp in format like "1:23" or "1:23:45"
 * @returns Seconds as a number
 */
export function convertTimestampToSeconds(timestamp: string): number {
	const timestampParts = timestamp.split(":").map(Number);
	let seconds = 0;
	
	if (timestampParts.length === 3) {
		// HH:MM:SS format
		seconds += timestampParts[0] * 3600; // Hours
		seconds += timestampParts[1] * 60;   // Minutes
		seconds += timestampParts[2];        // Seconds
	} else if (timestampParts.length === 2) {
		// MM:SS format
		seconds += timestampParts[0] * 60;   // Minutes
		seconds += timestampParts[1];        // Seconds
	} else if (timestampParts.length === 1) {
		// SS format
		seconds += timestampParts[0];        // Seconds
	}
	
	return seconds;
}

// Create a render child class to handle mounting and unmounting our player in reading mode
class MediaPlayerRenderChild extends MarkdownRenderChild {
	plugin: YouTubeSummarizerPlugin;
	mediaLink: string;
	uniqueId: string;
	eventEmitter: EventEmitter;
	
	constructor(containerEl: HTMLElement, plugin: YouTubeSummarizerPlugin, mediaLink: string) {
		super(containerEl);
		this.plugin = plugin;
		this.mediaLink = mediaLink;
		this.uniqueId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
		this.eventEmitter = new EventEmitter();
	}
	
	onload() {
		// Find the reading-view container instead of using the passed containerEl directly
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "preview") return;
		
		// Get the markdown-reading-view element
		const readingView = view.containerEl.querySelector(".markdown-reading-view");
		if (!readingView) return;
		
		// Create the player container
		const div = document.createElement("div");
		div.className = this.plugin.mediaNotesContainerClass;
		div.dataset.playerId = this.uniqueId;
		
		// Set appropriate sizing based on layout mode
		if (this.plugin.settings.defaultSplitMode === "Vertical") {
			div.style.width = this.plugin.settings.horizontalPlayerWidth + "%";
			div.style.height = "100%";
			view.containerEl.classList.add(this.plugin.mediaParentContainerVerticalClass);
		} else {
			div.style.height = this.plugin.settings.verticalPlayerHeight + "%";
			div.style.width = "100%";
			view.containerEl.classList.remove(this.plugin.mediaParentContainerVerticalClass);
		}
		
		// Add the div to the reading view's parent container
		readingView.prepend(div);
		
		// Store player reference
		this.plugin.players[this.uniqueId] = {
			iframeElement: null,
			mediaLink: this.mediaLink,
			eventEmitter: this.eventEmitter,
			root: null,
			container: div
		};
		
		// Render the player with the stored media link
		this.plugin.renderPlayer(this.uniqueId, div, this.mediaLink);
	}
	
	onunload() {
		// Save timestamp before unmounting
		this.plugin.savePlayerTimestamp(this.uniqueId);
		
		// Remove from players object
		delete this.plugin.players[this.uniqueId];
	}
}
