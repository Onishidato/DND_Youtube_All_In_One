import { GEMINI_MODELS, GROK_MODELS, LLM_PROVIDERS, SUMMARY_FORMATS, VIDEO_ANALYSIS_METHODS } from './constants';

/**
 * List of supported video analysis methods
 */
export type VideoAnalysisMethod = typeof VIDEO_ANALYSIS_METHODS[number];

/**
 * List of supported LLM providers
 */
export type LLMProvider = typeof LLM_PROVIDERS[number];

/**
 * List of supported Gemini models
 */
export type GeminiModel = typeof GEMINI_MODELS[number];

/**
 * List of supported Grok models
 */
export type GrokModel = typeof GROK_MODELS[number];

/**
 * Unified model type that can be either Gemini or Grok
 */
export type LLMModel = GeminiModel | GrokModel;

/**
 * List of supported summary formats
 */
export type SummaryFormat = typeof SUMMARY_FORMATS[number];

/**
 * Represents basic video information
 */
export interface VideoBasicInfo {
	videoId: string;
	title: string;
	channelTitle: string;
	publishDate: string;
	viewCount: string;
	likeCount: string;
	duration: string;
	thumbnailUrl: string;
}

/**
 * Represents a named prompt template
 */
export interface NamedPrompt {
	id: string;
	name: string;
	promptText: string;
}

/** Represents the plugin settings */
export interface PluginSettings {
	// API Keys
	apiKey: string;
	geminiApiKey: string;
	grokApiKey: string;
	youtubeApiKey: string;

	// LLM Provider settings
	llmProvider: LLMProvider;
	modelName: GeminiModel | GrokModel;
	temperatureVal: number;
	maxOutputTokens: number;
	topK: number;
	topP: number;

	// Prompt settings
	promptTemplate: string;
	customPrompt: string;
	savedPrompts: NamedPrompt[];
	selectedPromptId: string;
	hidePrompt: boolean;
	formatOutput: boolean;

	// Video analysis settings
	videoAnalysisMethod: VideoAnalysisMethod;
	summaryFormat: SummaryFormat;
	includeTimestamps: boolean;
	multimodalEnabled: boolean;
	fallbackToMetadata: boolean;

	// Content generation settings
	genSummary: boolean;
	genKeyIdeas: boolean;
	genResearchQuestions: boolean;
	genActionItems: boolean;

	// Video content settings
	videoIdExtractRegex: string;
	includeVideoTitle: boolean;
	includeThumbnail: boolean;
	includeVideoMetaData: boolean;

	// File organization settings
	organizationEnabled: boolean;
	fileNameTemplate: string;
	folderStructure: string;
	organizationFolder: string;
	folderPath: string;

	// Media player settings
	mediaPlayerEnabled: boolean;
	seekSeconds: number;
	verticalPlayerHeight: number;
	horizontalPlayerWidth: number;
	timestampTemplate: string;
	timestampOffsetSeconds: number;
	backgroundColor: string;
	progressBarColor: string;
	displayProgressBar: boolean;
	displayTimestamp: boolean;
	pauseOnTimestampInsert: boolean;
	defaultSplitMode: string;
	unloadHiddenPlayers: boolean;
	playerHeight: number;
	playerWidth: number;
	savedTimestamps: Record<string, number>;
	autoOpenMiniPlayerOnTimestampClick: boolean;
	mediaData: Record<string, {
		mediaLink: string;
		lastUpdated: string;
		lastTimestampSeconds: number;
	}>;

	// Mini-player settings
	miniPlayerEnabled: boolean;
	rememberMiniPlayerPosition: boolean;
	enableKeyboardShortcuts: boolean;
	miniPlayerPosition: { left: number; top: number; };
	miniPlayerX: number;
	miniPlayerY: number;
	miniPlayerWidth: number;
	miniPlayerHeight: number;
	miniPlayerDefaultWidth: number;
	miniPlayerDefaultHeight: number;
}

/** Settings specific to the MediaNotes functionality */
export interface MediaNotesPluginSettings {
	// Gemini API settings
	geminiApiKey: string;
	modelName: string;
	temperatureVal: number;
	maxOutputTokens: number;
	topK: number;
	topP: number;
	genSummary: boolean;
	genKeyIdeas: boolean;
	genResearchQuestions: boolean;
	genActionItems: boolean;

	// Grok API settings
	grokApiKey: string;

	// YouTube settings
	youtubeApiKey: string;

	// LLM Provider
	llmProvider: string;

	// Video data extraction settings
	videoIdExtractRegex: string;
	includeVideoTitle: boolean;
	includeThumbnail: boolean;
	includeVideoMetaData: boolean;

	// Output formatting
	hidePrompt: boolean;
	promptTemplate: string;
	formatOutput: boolean;

	// File Organization
	fileNameTemplate: string;
	folderPath: string;

	// UI settings
	seekSeconds: number;
	displayProgressBar: boolean;
	progressBarColor: string;
	displayTimestamp: boolean;
	pauseOnTimestampInsert: boolean;
	timestampOffsetSeconds: number;
	timestampTemplate: string;
	verticalPlayerHeight: number;
	horizontalPlayerWidth: number;
	backgroundColor: string;
	defaultSplitMode: string;
	playerHeight: number; // Added to match PluginSettings
	playerWidth: number; // Added to match PluginSettings

	// Mini-player settings
	miniPlayerEnabled: boolean;
	rememberMiniPlayerPosition: boolean;
	enableKeyboardShortcuts: boolean;
	miniPlayerPosition: { left: number; top: number }; // Changed from {x,y} to {left,top} to match PluginSettings
	miniPlayerDefaultWidth: number; // Default width for the mini-player
	miniPlayerDefaultHeight: number; // Default height for the mini-player
	mediaData: Record<string, {
		mediaLink: string;
		lastUpdated: string;
		lastTimestampSeconds: number;
	}>;
}

/** Represents a single line of video transcript with timing information */
export interface TranscriptLine {
	text: string;
	duration: number;
	offset: number;
}

/** Response structure for video transcript and metadata */
export interface TranscriptResponse {
	url: string;
	videoId: string;
	title: string;
	author: string;
	channelUrl: string;
	channelTitle?: string; // Added to fix TypeScript error
	publishDate?: string; // Added to fix TypeScript error
	duration?: string; // Added to fix TypeScript error
	lines: TranscriptLine[];
}

/** Video metadata when captions aren't available */
export interface VideoMetadata {
	title: string;
	description: string;
	author: string;
	channelTitle?: string; // Added to fix TypeScript error
	channelUrl: string;
	tags: string[];
	publishDate: string;
	videoId: string;
	url: string;
	duration?: string; // Added to fix TypeScript error
}

/** Available thumbnail quality options with dimensions */
export interface ThumbnailQuality {
	default: string; // 120x90
	medium: string; // 320x180
	high: string; // 480x360
	standard: string; // 640x480
	maxres: string; // 1280x720
}

/**
 * Represents a timestamp with text and URL
 */
export interface VideoTimestamp {
	time: string;  // Format: MM:SS or HH:MM:SS
	text: string;
	url: string;
}

/** Represents the result of video analysis */
export interface VideoAnalysisResult {
	text: string;
	videoInfo?: VideoBasicInfo;
}
