import { PluginSettings, VideoMetadata } from 'src/types';
import { LLMService } from './llm-service';

// Cache for generated summaries to avoid repeat API calls
interface SummaryCache {
  [videoId: string]: {
    summary: string;
    timestamp: number;
  };
}

/**
 * Service for analyzing video content directly when captions aren't available.
 * This class provides methods for generating video summaries using multimodal AI.
 */
export class VideoAnalysisService {
    private settings: PluginSettings;
    private llmService: LLMService;
    
    // Cache management
    private static summaryCache: SummaryCache = {};
    private static readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
    private readonly CACHE_STORAGE_KEY = 'video-summary-cache';

    /**
     * Creates an instance of VideoAnalysisService.
     * @param settings - The plugin settings
     * @param llmService - The LLM service to use for generating summaries
     */
    constructor(settings: PluginSettings, llmService: LLMService) {
        this.settings = settings;
        this.llmService = llmService;
        
        // Load cache from storage on initialization
        this.loadCacheFromStorage();
        
        // Setup cache cleanup interval
        setInterval(() => this.cleanCache(), VideoAnalysisService.CACHE_EXPIRY_MS / 2);
    }
    
    /**
     * Loads summary cache from localStorage if available
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
                        now - parsedCache[key].timestamp < VideoAnalysisService.CACHE_EXPIRY_MS) {
                        VideoAnalysisService.summaryCache[key] = parsedCache[key];
                    }
                });
                
                console.log(`Loaded ${Object.keys(VideoAnalysisService.summaryCache).length} video summaries from cache`);
            }
        } catch (error) {
            console.error('Failed to load summary cache from storage:', error);
            // If loading fails, reset cache to prevent issues
            VideoAnalysisService.summaryCache = {};
        }
    }
    
    /**
     * Saves summary cache to localStorage for persistence
     */
    private saveCacheToStorage(): void {
        try {
            // Clean cache before saving
            this.cleanCache();
            
            // Only store if we have cache entries
            if (Object.keys(VideoAnalysisService.summaryCache).length > 0) {
                localStorage.setItem(
                    this.CACHE_STORAGE_KEY, 
                    JSON.stringify(VideoAnalysisService.summaryCache)
                );
            }
        } catch (error) {
            console.error('Failed to save summary cache to storage:', error);
        }
    }
    
    /**
     * Cleans expired entries from the cache
     */
    private cleanCache(): void {
        const now = Date.now();
        const cache = VideoAnalysisService.summaryCache;
        let cleanedEntries = 0;
        
        // Remove expired entries
        Object.keys(cache).forEach(key => {
            if (now - cache[key].timestamp > VideoAnalysisService.CACHE_EXPIRY_MS) {
                delete cache[key];
                cleanedEntries++;
            }
        });
        
        // If cache grows too large, trim it
        const MAX_CACHE_ENTRIES = 50; // Summaries can be large, so keep fewer
        if (Object.keys(cache).length > MAX_CACHE_ENTRIES) {
            // Sort by timestamp (oldest first)
            const sortedKeys = Object.keys(cache).sort(
                (a, b) => cache[a].timestamp - cache[b].timestamp
            );
            
            // Remove oldest entries
            const keysToRemove = sortedKeys.slice(0, Object.keys(cache).length - MAX_CACHE_ENTRIES);
            keysToRemove.forEach(key => {
                delete cache[key];
                cleanedEntries++;
            });
        }
        
        if (cleanedEntries > 0) {
            console.log(`Cleaned ${cleanedEntries} expired summary cache entries`);
        }
    }
    
    /**
     * Gets a cached summary if available
     * @param videoId - The video ID to check
     * @returns The cached summary or null if not found/expired
     */
    private getCachedSummary(videoId: string): string | null {
        this.cleanCache();
        
        const cacheEntry = VideoAnalysisService.summaryCache[videoId];
        if (cacheEntry) {
            return cacheEntry.summary;
        }
        
        return null;
    }
    
    /**
     * Caches a generated summary
     * @param videoId - The video ID
     * @param summary - The generated summary
     */
    private cacheSummary(videoId: string, summary: string): void {
        VideoAnalysisService.summaryCache[videoId] = {
            summary,
            timestamp: Date.now()
        };
        
        // Save to storage using debounce to avoid frequent writes
        this.debouncedSaveCache();
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
     * Generates a summary of a video based on its metadata when captions aren't available
     * @param metadata - The video metadata
     * @returns Promise containing the generated summary
     */
    async generateMetadataSummary(metadata: VideoMetadata): Promise<string> {
        // Check cache first
        const cachedSummary = this.getCachedSummary(`metadata_${metadata.videoId}`);
        if (cachedSummary) {
            return cachedSummary;
        }
        
        // Build a comprehensive prompt based on video metadata
        const metadataPrompt = `
I need you to create a comprehensive summary of a YouTube video based only on its metadata.

## Video Metadata
- Title: ${metadata.title}
- Author: ${metadata.author}
- Channel: ${metadata.channelUrl}
- Published: ${metadata.publishDate}
- Tags: ${metadata.tags.join(', ')}

## Video Description
${metadata.description}

## Task
Based on the title, description, tags, and other metadata, create a comprehensive summary of what this video likely contains.
Since no transcript is available, use your knowledge about the topic and the video creator to make educated inferences.

Your summary should:
1. Identify the main topic of the video
2. Outline likely key points based on the description and tags
3. Mention relevant technologies or concepts referenced in the metadata
4. Clearly indicate that this summary is based on metadata only, not on the actual video content

Please structure your response in markdown format with appropriate sections, including a summary, key points, and related concepts.`;

        try {
            // Generate the summary using the LLM service
            const summary = await this.llmService.summarize(metadataPrompt);
            
            // Cache the result
            this.cacheSummary(`metadata_${metadata.videoId}`, summary);
            
            return summary;
        } catch (error) {
            console.error('Failed to generate metadata summary:', error);
            throw error;
        }
    }

    /**
     * Generates a summary of a video using multimodal AI when captions aren't available
     * This approach sends the video URL directly to a multimodal model for analysis
     * @param videoUrl - URL of the video to analyze
     * @param metadata - The video metadata for additional context
     * @returns Promise containing the generated summary
     */
    async generateMultimodalSummary(videoUrl: string, metadata: VideoMetadata): Promise<string> {
        // Check cache first
        const cachedSummary = this.getCachedSummary(`multimodal_${metadata.videoId}`);
        if (cachedSummary) {
            return cachedSummary;
        }
        
        try {
            let summary: string;
            
            // For Gemini models that support multimodal input
            if (this.settings.llmProvider === 'gemini') {
                const multimodalPrompt = `
Please analyze this YouTube video and create a comprehensive summary.

## Video Details
- Title: ${metadata.title}
- Author: ${metadata.author}
- URL: ${videoUrl}

## Task
Create a detailed summary of the video content. Focus on:
1. The main topic and purpose of the video
2. Key points discussed or demonstrated
3. Important visual elements or demonstrations
4. Any technical concepts presented
5. The overall message or conclusion

Format your response in markdown with appropriate headings.

The video is available at: ${videoUrl}`;

                // Generate the summary using the LLM service
                summary = await this.llmService.summarize(multimodalPrompt);
            } 
            // For Grok's vision models
            else if (this.settings.llmProvider === 'grok' && this.settings.modelName.includes('vision')) {
                const multimodalPrompt = `
Please analyze this YouTube video and create a comprehensive summary.

## Video Details
- Title: ${metadata.title}
- Author: ${metadata.author}
- URL: ${videoUrl}

## Task
Create a detailed summary of the video content. Focus on:
1. The main topic and purpose of the video
2. Key points discussed or demonstrated
3. Important visual elements or demonstrations
4. Any technical concepts presented
5. The overall message or conclusion

Format your response in markdown with appropriate headings.

The video is available at: ${videoUrl}`;

                // Generate the summary using the LLM service
                summary = await this.llmService.summarize(multimodalPrompt);
            }
            // Fallback to metadata-based summary if multimodal not supported
            else {
                return await this.generateMetadataSummary(metadata);
            }
            
            // Cache the result
            this.cacheSummary(`multimodal_${metadata.videoId}`, summary);
            
            return summary;
        } catch (error) {
            console.error('Failed to generate multimodal summary:', error);
            
            // If configured to fall back to metadata-based summary on failure
            if (this.settings.fallbackToMetadata) {
                console.log('Falling back to metadata-based summary due to error');
                return await this.generateMetadataSummary(metadata);
            }
            
            throw error;
        }
    }
    
    /**
     * Clears summary cache for a specific video or all videos
     * @param videoId - Optional video ID to clear specific cache, or undefined to clear all
     */
    clearCache(videoId?: string): void {
        if (videoId) {
            // Clear specific video
            delete VideoAnalysisService.summaryCache[`metadata_${videoId}`];
            delete VideoAnalysisService.summaryCache[`multimodal_${videoId}`];
        } else {
            // Clear all summaries
            VideoAnalysisService.summaryCache = {};
        }
        
        // Update storage
        this.saveCacheToStorage();
    }
}