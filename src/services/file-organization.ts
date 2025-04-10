import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { VideoMetadata, TranscriptResponse } from '../types';

/**
 * Service for handling file organization in Obsidian
 */
export class FileOrganizationService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Organizes and saves a video summary note based on specified structure
     * @param content - The formatted summary content
     * @param metadata - Video metadata (or transcript response with metadata)
     * @param folderStructure - The folder structure template
     * @param fileNameTemplate - The file name template
     * @param baseFolder - The base folder for all summaries
     * @returns The path of the created file
     */
    public async saveOrganizedNote(
        content: string, 
        metadata: VideoMetadata | TranscriptResponse, 
        folderStructure: string,
        fileNameTemplate: string,
        baseFolder: string
    ): Promise<string> {
        // Create the base folder if it doesn't exist
        const basePath = normalizePath(baseFolder);
        await this.createFolderIfNeeded(basePath);
        
        // Extract required metadata
        const title = 'title' in metadata ? metadata.title : '';
        const author = 'author' in metadata ? metadata.author : '';
        const videoId = 'videoId' in metadata ? metadata.videoId : '';
        
        // Parse publish date for year and month if available
        let year = new Date().getFullYear().toString();
        let month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        
        if ('publishDate' in metadata && metadata.publishDate) {
            const date = new Date(metadata.publishDate);
            year = date.getFullYear().toString();
            month = (date.getMonth() + 1).toString().padStart(2, '0');
        }
        
        // Process folder structure template
        let folderPath = this.processTemplate(folderStructure, {
            creator: author,
            year,
            month,
            videoId
        });
        
        // Combine with base folder
        folderPath = normalizePath(`${basePath}/${folderPath}`);
        
        // Create all necessary folders
        await this.createFolderIfNeeded(folderPath);
        
        // Process filename template
        let fileName = this.processTemplate(fileNameTemplate, {
            title,
            creator: author,
            year,
            month,
            videoId
        });
        
        // Clean the filename of invalid characters and ensure it has .md extension
        fileName = this.sanitizeFileName(fileName);
        if (!fileName.endsWith('.md')) {
            fileName += '.md';
        }
        
        // Combine folder path and filename
        const filePath = normalizePath(`${folderPath}/${fileName}`);
        
        // Save the file
        await this.app.vault.adapter.write(filePath, content);
        
        return filePath;
    }
    
    /**
     * Creates a folder if it doesn't exist, including any parent folders
     * @param path - The folder path to create
     */
    private async createFolderIfNeeded(path: string): Promise<void> {
        const folderParts = path.split('/');
        let currentPath = '';
        
        for (const part of folderParts) {
            if (!part) continue;
            
            currentPath += (currentPath ? '/' : '') + part;
            
            // Check if the folder exists
            const folderExists = await this.app.vault.adapter.exists(currentPath);
            if (!folderExists) {
                // Create the folder
                await this.app.vault.createFolder(currentPath);
            }
        }
    }
    
    /**
     * Processes a template string by replacing placeholders with actual values
     * @param template - The template string with placeholders
     * @param values - The values to replace placeholders with
     * @returns The processed string
     */
    private processTemplate(template: string, values: Record<string, string>): string {
        let result = template;
        
        for (const [key, value] of Object.entries(values)) {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value || key);
        }
        
        return result;
    }
    
    /**
     * Sanitizes a filename by removing invalid characters
     * @param fileName - The raw filename
     * @returns The sanitized filename
     */
    private sanitizeFileName(fileName: string): string {
        // Replace characters that aren't allowed in filenames
        return fileName
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }
}