import {
	AUTHOR_REGEX,
	CHANNEL_ID_REGEX,
	TITLE_REGEX,
	VIDEO_ID_REGEX,
} from 'src/constants';
import {
	ThumbnailQuality,
	TranscriptLine,
	TranscriptResponse,
	VideoMetadata,
} from 'src/types';

import { Notice } from 'obsidian';
import { parse } from 'node-html-parser';
import { request } from 'obsidian';

// Cache for video metadata to reduce repeated API calls
interface VideoCache {
	[videoId: string]: {
		data: VideoMetadata | TranscriptResponse;
		timestamp: number;
	};
}

// Request queue to prevent too many concurrent fetches
interface QueuedRequest {
	resolve: (data: any) => void;
	reject: (error: Error) => void;
	url: string;
	timeoutMs: number;
}

/**
 * Service class for interacting with YouTube videos.
 * Provides methods to fetch video thumbnails and transcripts.
 */
export class YouTubeService {
	// In-memory cache for video data with 30-minute expiration
	private static readonly CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
	private static videoCache: VideoCache = {};
	
	// Request queue management
	private requestQueue: QueuedRequest[] = [];
	private processingQueue = false;
	private MAX_CONCURRENT_REQUESTS = 2;
	private activeRequests = 0;
	
	// Cache persistence
	private readonly CACHE_STORAGE_KEY = 'youtube-video-summarizer-cache';
	
	constructor() {
		// Try to load cache from localStorage on initialization
		this.loadCacheFromStorage();
		
		// Set up periodic cache cleanup
		setInterval(() => this.cleanCache(), YouTubeService.CACHE_EXPIRY_MS / 2);
		
		// Listen for app going to background to save cache
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				this.saveCacheToStorage();
			}
		});
	}

	/**
	 * Gets the thumbnail URL for a YouTube video
	 * @param videoId - The YouTube video identifier
	 * @param quality - Desired thumbnail quality (default: 'maxres')
	 * @returns URL string for the video thumbnail
	 */
	static getThumbnailUrl(
		videoId: string,
		quality: keyof ThumbnailQuality = 'maxres'
	): string {
		const qualities: ThumbnailQuality = {
			default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
			medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
			high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
			standard: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
			maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		};
		return qualities[quality];
	}

	/**
	 * Checks if a URL is a valid YouTube URL
	 * @param url - The URL to check
	 * @returns True if the URL is a YouTube URL, false otherwise
	 */
	static isYouTubeUrl(url: string): boolean {
		return (
			url.startsWith('https://www.youtube.com/') ||
			url.startsWith('https://youtu.be/')
		);
	}

	/**
	 * Loads cache from localStorage if available
	 * Called during initialization
	 */
	private loadCacheFromStorage(): void {
		try {
			const cachedData = localStorage.getItem(this.CACHE_STORAGE_KEY);
			if (cachedData) {
				const parsedCache = JSON.parse(cachedData);
				
				// Validate cache entries before restoring
				const now = Date.now();
				Object.keys(parsedCache).forEach(key => {
					if (parsedCache[key] && 
					    parsedCache[key].timestamp && 
					    now - parsedCache[key].timestamp < YouTubeService.CACHE_EXPIRY_MS) {
						YouTubeService.videoCache[key] = parsedCache[key];
					}
				});
				
				console.log(`Loaded ${Object.keys(YouTubeService.videoCache).length} items from cache`);
			}
		} catch (error) {
			console.error('Failed to load cache from storage:', error);
			// If loading fails, reset cache to prevent issues
			YouTubeService.videoCache = {};
		}
	}
	
	/**
	 * Saves cache to localStorage for persistence between sessions
	 */
	private saveCacheToStorage(): void {
		try {
			// Clean cache before saving to avoid storing expired entries
			this.cleanCache();
			
			// Only store if we have cache entries
			if (Object.keys(YouTubeService.videoCache).length > 0) {
				localStorage.setItem(
					this.CACHE_STORAGE_KEY, 
					JSON.stringify(YouTubeService.videoCache)
				);
			}
		} catch (error) {
			console.error('Failed to save cache to storage:', error);
		}
	}

	/**
	 * Cleans the memory by removing expired cache entries
	 * Called automatically during data fetching operations
	 */
	private cleanCache(): void {
		const now = Date.now();
		const cache = YouTubeService.videoCache;
		let cleanedEntries = 0;

		// Remove expired entries
		Object.keys(cache).forEach((key) => {
			if (now - cache[key].timestamp > YouTubeService.CACHE_EXPIRY_MS) {
				delete cache[key];
				cleanedEntries++;
			}
		});
		
		// If cache grows too large, trim it further
		const MAX_CACHE_ENTRIES = 100;
		if (Object.keys(cache).length > MAX_CACHE_ENTRIES) {
			// Sort by timestamp (oldest first)
			const sortedKeys = Object.keys(cache).sort(
				(a, b) => cache[a].timestamp - cache[b].timestamp
			);
			
			// Remove oldest entries to get back to max size
			const keysToRemove = sortedKeys.slice(0, Object.keys(cache).length - MAX_CACHE_ENTRIES);
			keysToRemove.forEach(key => {
				delete cache[key];
				cleanedEntries++;
			});
		}
		
		if (cleanedEntries > 0) {
			console.log(`Cleaned ${cleanedEntries} expired cache entries`);
		}
	}

	/**
	 * Queues a request with a controlled concurrency
	 * @param url - The URL to fetch
	 * @param timeoutMs - Timeout in milliseconds
	 * @returns Promise with the response
	 */
	private queueRequest(url: string, timeoutMs: number = 10000): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			// Add request to queue
			this.requestQueue.push({
				url,
				timeoutMs,
				resolve,
				reject
			});
			
			// Start processing the queue if not already processing
			if (!this.processingQueue) {
				this.processQueue();
			}
		});
	}
	
	/**
	 * Processes the request queue with controlled concurrency
	 */
	private async processQueue(): Promise<void> {
		if (this.requestQueue.length === 0 || this.processingQueue) {
			return;
		}
		
		this.processingQueue = true;
		
		while (this.requestQueue.length > 0) {
			// Wait until we can make more requests
			if (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS) {
				await new Promise(resolve => setTimeout(resolve, 100));
				continue;
			}
			
			// Get next request from queue
			const nextRequest = this.requestQueue.shift();
			if (!nextRequest) continue;
			
			// Process the request
			this.activeRequests++;
			this.fetchWithTimeout(nextRequest.url, nextRequest.timeoutMs)
				.then(response => {
					nextRequest.resolve(response);
					this.activeRequests--;
				})
				.catch(error => {
					nextRequest.reject(error);
					this.activeRequests--;
				});
		}
		
		this.processingQueue = false;
	}

	/**
	 * Fetches and processes a YouTube video transcript
	 * @param url - Full YouTube video URL
	 * @param langCode - Language code for caption track (default: 'en')
	 * @returns Promise containing video metadata and transcript
	 * @throws Error if transcript cannot be fetched or processed
	 */
	async fetchTranscript(
		url: string,
		langCode = 'en'
	): Promise<TranscriptResponse> {
		try {
			// Extract video ID from URL
			const videoId = this.extractMatch(url, VIDEO_ID_REGEX);
			if (!videoId) throw new Error('Invalid YouTube URL');

			// Check cache first
			this.cleanCache();
			const cacheKey = `transcript_${videoId}_${langCode}`;
			if (YouTubeService.videoCache[cacheKey]) {
				return YouTubeService.videoCache[cacheKey].data as TranscriptResponse;
			}

			// Fetch the video page content through our queue system
			const videoPageBody = await this.queueRequest(url);

			// Extract video metadata from page content
			const title = this.extractMatch(videoPageBody, TITLE_REGEX);
			const author = this.extractMatch(videoPageBody, AUTHOR_REGEX);
			const channelId = this.extractMatch(
				videoPageBody,
				CHANNEL_ID_REGEX
			);

			try {
				const captions = await this.extractCaptions(
					videoPageBody,
					langCode
				);

				const response = {
					url,
					videoId,
					title: this.decodeHTML(title || 'Unknown'),
					author: this.decodeHTML(author || 'Unknown'),
					channelUrl: channelId
						? `https://www.youtube.com/channel/${channelId}`
						: '',
					lines: this.parseCaptions(captions),
				};

				// Cache the results
				YouTubeService.videoCache[cacheKey] = {
					data: response,
					timestamp: Date.now(),
				};
				
				// Save to persistent storage periodically
				// Use a debounced approach to avoid frequent writes
				this.debouncedSaveCache();

				return response;
			} catch (captionError) {
				// If captions are not available, create a minimal transcript response
				// with empty lines array, so the calling code can handle appropriately
				const minimalResponse = {
					url,
					videoId,
					title: this.decodeHTML(title || 'Unknown'),
					author: this.decodeHTML(author || 'Unknown'),
					channelUrl: channelId
						? `https://www.youtube.com/channel/${channelId}`
						: '',
					lines: [],
				};

				// Cache even failed attempts to avoid repeated failures
				YouTubeService.videoCache[cacheKey] = {
					data: minimalResponse,
					timestamp: Date.now(),
				};

				return minimalResponse;
			}
		} catch (error) {
			throw new Error(`Failed to fetch transcript: ${error.message}`);
		}
	}

	/**
	 * Fetches a URL with a timeout to prevent hanging requests
	 * @param url - The URL to fetch
	 * @param timeoutMs - Timeout in milliseconds (default: 10000)
	 * @returns Promise with the response text
	 */
	private async fetchWithTimeout(
		url: string,
		timeoutMs: number = 10000
	): Promise<string> {
		return new Promise(async (resolve, reject) => {
			// Set a timeout to abort if the request takes too long
			const timeoutId = setTimeout(() => {
				reject(new Error(`Request timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			try {
				const response = await request({
					url,
					// Add cache busting to prevent browser cache issues
					// but only for non-static resources
					method: 'GET',
					headers: {
						'Cache-Control': 'no-cache',
						'Pragma': 'no-cache'
					}
				});
				clearTimeout(timeoutId);
				resolve(response);
			} catch (error) {
				clearTimeout(timeoutId);
				reject(error);
			}
		});
	}
	
	// Debounce function to limit storage writes
	private saveTimeout: NodeJS.Timeout | null = null;
	private debouncedSaveCache(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(() => {
			this.saveCacheToStorage();
			this.saveTimeout = null;
		}, 5000); // 5 second debounce
	}

	/**
	 * Fetches detailed metadata for a YouTube video
	 * @param url - Full YouTube video URL
	 * @returns Promise containing video metadata
	 * @throws Error if metadata cannot be fetched or processed
	 */
	async fetchVideoMetadata(url: string): Promise<VideoMetadata> {
		try {
			// Extract video ID from URL
			const videoId = this.extractMatch(url, VIDEO_ID_REGEX);
			if (!videoId) throw new Error('Invalid YouTube URL');

			// Check cache first
			this.cleanCache();
			const cacheKey = `metadata_${videoId}`;
			if (YouTubeService.videoCache[cacheKey]) {
				return YouTubeService.videoCache[cacheKey].data as VideoMetadata;
			}

			// Fetch the video page content with queue system
			const videoPageBody = await this.queueRequest(url);

			// Extract basic metadata from page content
			const title = this.extractMatch(videoPageBody, TITLE_REGEX);
			const author = this.extractMatch(videoPageBody, AUTHOR_REGEX);
			const channelId = this.extractMatch(videoPageBody, CHANNEL_ID_REGEX);

			// Find the script containing player data to extract more metadata
			const parsedBody = parse(videoPageBody);
			// Use a more optimized approach for finding the script
			const scripts = parsedBody.getElementsByTagName('script');
			
			// Process scripts more efficiently
			let playerScript = null;
			let dataString = '';
			for (let i = 0; i < scripts.length; i++) {
				const script = scripts[i];
				const content = script.textContent;
				const marker = 'var ytInitialPlayerResponse = ';
				if (content.includes(marker)) {
					playerScript = script;
					const start = content.indexOf(marker) + marker.length;
					const end = content.indexOf('};', start) + 1;
					dataString = content.slice(start, end);
					break;
				}
			}

			if (!playerScript) throw new Error('Failed to find player data');

			// Use try/catch to handle potential JSON parsing errors
			let data;
			try {
				data = JSON.parse(dataString);
			} catch (jsonError) {
				console.error('Failed to parse player data:', jsonError);
				data = {};
			}

			// Extract additional metadata from player data
			const videoDetails = data?.videoDetails || {};
			const description = videoDetails.shortDescription || '';
			const tags = videoDetails.keywords || [];
			const publishDate =
				data?.microformat?.playerMicroformatRenderer?.publishDate || '';

			const metadata: VideoMetadata = {
				title: this.decodeHTML(title || videoDetails.title || 'Unknown'),
				description: this.decodeHTML(description),
				author: this.decodeHTML(author || videoDetails.author || 'Unknown'),
				channelUrl: channelId
					? `https://www.youtube.com/channel/${channelId}`
					: '',
				tags,
				publishDate,
				videoId,
				url,
			};

			// Cache the results
			YouTubeService.videoCache[cacheKey] = {
				data: metadata,
				timestamp: Date.now(),
			};
			
			// Save cache with debounce
			this.debouncedSaveCache();

			return metadata;
		} catch (error) {
			throw new Error(`Failed to fetch video metadata: ${error.message}`);
		}
	}

	/**
	 * Gets direct video URL for multimodal AI processing
	 * This method provides a URL that can be used to fetch the video content
	 * @param videoId - The YouTube video ID
	 * @returns URL that can be used to access the video content
	 */
	getVideoContentUrl(videoId: string): string {
		// Return the embed URL which can be used for multimodal AI processing
		return `https://www.youtube.com/embed/${videoId}`;
	}

	/**
	 * Purges the service cache to free up memory
	 * Call this method when you know the cache is no longer needed
	 */
	purgeCache(): void {
		YouTubeService.videoCache = {};
		localStorage.removeItem(this.CACHE_STORAGE_KEY);
		console.log('YouTube service cache purged');
	}

	/**
	 * Extracts the first match of a regex pattern from a string
	 * Uses a more efficient approach for large texts
	 */
	private extractMatch(text: string, regex: RegExp): string | null | '' {
		if (!text) return null;
		
		// For very large texts, using exec can be more efficient than match
		const match = regex.exec(text);
		return match && match[1] ? match[1] : null;
	}

	/**
	 * Extracts and fetches captions from the video page content
	 * @param pageBody - HTML content of the YouTube video page
	 * @param langCode - Language code for caption track
	 * @returns Promise containing raw captions XML
	 * @throws Error if captions cannot be fetched
	 */
	private async extractCaptions(
		pageBody: string,
		langCode: string
	): Promise<string> {
		// Find the script containing player data - use more efficient approach
		const parsedBody = parse(pageBody);
		let playerScript = null;
		let dataString = '';
		
		const scripts = parsedBody.getElementsByTagName('script');
		for (let i = 0; i < scripts.length; i++) {
			const script = scripts[i];
			const content = script.textContent;
			const marker = 'var ytInitialPlayerResponse = ';
			if (content.includes(marker)) {
				playerScript = script;
				const start = content.indexOf(marker) + marker.length;
				const end = content.indexOf('};', start) + 1;
				dataString = content.slice(start, end);
				break;
			}
		}

		if (!playerScript) throw new Error('Failed to find player data');

		// Use try/catch to handle JSON parsing errors
		let data;
		try {
			data = JSON.parse(dataString);
		} catch (jsonError) {
			throw new Error('Failed to parse caption data');
		}

		// Find available caption tracks and select the desired language
		const captionTracks =
			data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
		
		// Find best matching language track
		let captionTrack = null;
		if (langCode) {
			// Try exact match first
			captionTrack = captionTracks.find((track: any) => 
				track.languageCode === langCode
			);
			
			// If no exact match, try partial match
			if (!captionTrack) {
				captionTrack = captionTracks.find((track: any) => 
					track.languageCode.includes(langCode)
				);
			}
		}
		
		// Fall back to first available track if no match found
		captionTrack = captionTrack || captionTracks[0];

		if (!captionTrack) throw new Error('No captions available');

		// Format and fetch captions URL with our queue system
		const captionsUrl = captionTrack.baseUrl.startsWith('https://')
			? captionTrack.baseUrl
			: `https://www.youtube.com${captionTrack.baseUrl}`;
		return await this.queueRequest(captionsUrl, 5000);
	}

	/**
	 * Processes raw captions data into structured format
	 * Optimized for better performance with large caption datasets
	 */
	private parseCaptions(captionsXML: string): TranscriptLine[] {
		try {
			const parsedXML = parse(captionsXML);
			const textElements = parsedXML.getElementsByTagName('text');
			
			// Preallocate array for better performance with large datasets
			const result: TranscriptLine[] = new Array(textElements.length);
			
			for (let i = 0; i < textElements.length; i++) {
				const cue = textElements[i];
				result[i] = {
					text: this.decodeHTML(cue.textContent),
					duration: parseFloat(cue.attributes.dur || '0') * 1000,
					offset: parseFloat(cue.attributes.start || '0') * 1000,
				};
			}
			
			return result;
		} catch (error) {
			console.error('Error parsing captions:', error);
			return [];
		}
	}

	/**
	 * Decodes HTML entities in a text string
	 * Uses a more efficient implementation for large texts
	 */
	private decodeHTML(text: string): string {
		if (!text) return '';
		
		// Create a virtual element to decode entities efficiently
		const textarea = document.createElement('textarea');
		textarea.innerHTML = text
			.replace(/&#39;/g, "'")
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&#x27;/g, "'")
			.replace(/&#x2F;/g, '/');
		
		return textarea.value;
	}
}
