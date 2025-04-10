import { TranscriptLine } from '../types';

/**
 * Service for processing and generating timestamps from video transcripts
 */
export class TimestampService {
    /**
     * Extracts key timestamps from a transcript based on content significance
     * @param lines - The transcript lines
     * @param videoId - The YouTube video ID
     * @returns Array of timestamps with text and URLs
     */
    public extractKeyTimestamps(lines: TranscriptLine[], videoId: string): { time: string, text: string, url: string }[] {
        const timestamps: { time: string, text: string, url: string }[] = [];
        
        // Process only if we have transcript lines
        if (!lines || lines.length === 0) {
            return timestamps;
        }
        
        // Simple algorithm to extract potentially important timestamps
        // 1. Beginning of the video
        // 2. Every ~2-3 minutes 
        // 3. End of the video
        
        // Start with the first line
        const firstLine = lines[0];
        timestamps.push({
            time: this.formatTime(firstLine.offset),
            text: this.cleanTranscriptText(firstLine.text),
            url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(firstLine.offset)}`
        });
        
        // Sample throughout the video at regular intervals
        const totalDuration = lines.reduce((sum, line) => sum + line.duration, 0);
        const interval = Math.min(180, totalDuration / 5); // Every 3 minutes or 1/5 of the total length
        
        let currentTime = interval;
        while (currentTime < totalDuration - interval) {
            const nearestLine = this.findNearestLine(lines, currentTime);
            if (nearestLine) {
                timestamps.push({
                    time: this.formatTime(nearestLine.offset),
                    text: this.cleanTranscriptText(nearestLine.text),
                    url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(nearestLine.offset)}`
                });
            }
            currentTime += interval;
        }
        
        // End with the last line
        const lastLine = lines[lines.length - 1];
        timestamps.push({
            time: this.formatTime(lastLine.offset),
            text: this.cleanTranscriptText(lastLine.text),
            url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(lastLine.offset)}`
        });
        
        return timestamps;
    }
    
    /**
     * Find the transcript line closest to a given time
     * @param lines - The transcript lines
     * @param targetTime - The target time in seconds
     * @returns The nearest transcript line or undefined
     */
    private findNearestLine(lines: TranscriptLine[], targetTime: number): TranscriptLine | undefined {
        let currentTime = 0;
        let bestMatch: TranscriptLine | undefined;
        let bestDiff = Number.MAX_VALUE;
        
        for (const line of lines) {
            const diff = Math.abs(currentTime - targetTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestMatch = line;
            }
            currentTime += line.duration;
            
            // If we've passed the target and found a match, return it
            if (currentTime > targetTime && bestMatch) {
                return bestMatch;
            }
        }
        
        return bestMatch;
    }
    
    /**
     * Formats seconds into MM:SS or HH:MM:SS format
     * @param seconds - Time in seconds
     * @returns Formatted time string
     */
    public formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    /**
     * Cleans transcript text for better readability
     * @param text - Raw transcript text
     * @returns Cleaned text
     */
    private cleanTranscriptText(text: string): string {
        // Remove redundant spaces, normalize capitalization
        return text.trim()
            .replace(/\s+/g, ' ')
            .replace(/^[a-z]/, (match) => match.toUpperCase());
    }
}