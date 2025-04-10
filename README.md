# Obsidian Youtube All In One

An Obsidian plugin that generates AI-powered summaries of YouTube videos directly in your notes, with an integrated media player for enhanced video analysis and note-taking.

![Demo](assets/demo.gif)

## Features

### Core Functionality
- 🎥 Extract transcripts from YouTube videos
- 🧠 Generate comprehensive summaries using Gemini AI or Grok
- 📝 Create structured notes with key points and technical terms
- 🔍 Automatically extract and format important timestamps
- 🎬 Integrated media player for watching videos while taking notes

### Advanced Features
- 📺 Analyze videos without captions via metadata or multimodal AI
- 🤖 Support for multiple AI providers (Gemini and Grok)
- 📋 Customizable summary formats (Standard, Detailed, Bullet, Chapters)
- 📊 Intelligent extraction of key timestamps
- 🔄 Mini-player that stays visible as you navigate between notes
- ⌨️ Keyboard shortcuts for controlling video playback
- 📌 One-click timestamp insertion at current video position
- 📁 Intelligent file organization with customizable templates

## Installation

### Method 1: From Obsidian Community Plugins
1. Open Obsidian Settings
2. Go to "Community Plugins" and disable Safe Mode
3. Click "Browse" and search for "YouTube Video Summarizer"
4. Install and enable the plugin

### Method 2: Manual Installation
1. Download the latest release from the [GitHub repository](https://github.com/yourusername/obsidian-yt-video-summarizer/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian settings under "Community Plugins"

## Requirements

- Obsidian v0.15.0+
- One of the following API keys:
  - Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))
  - Grok API key ([Get one here](https://www.grok.com/))
- Optional: YouTube Data API key for enhanced metadata retrieval ([Get one here](https://console.cloud.google.com/apis/library/youtube.googleapis.com))

## Setup and Configuration

### AI Provider Settings
1. Open plugin settings
2. Choose your preferred AI provider (Gemini or Grok)
3. Enter the appropriate API key
4. Select your preferred model:
   - For text-only analysis: `gemini-pro` or `grok-1.5-pro`
   - For multimodal analysis: `gemini-1.5-pro-vision` or `grok-1.5-vision`
5. Adjust generation settings:
   - Temperature (0.0-1.0): Lower for more deterministic outputs, higher for more creative responses
   - Max Output Tokens: Maximum length of the generated summary

### Video Analysis Settings
This plugin offers multiple ways to analyze YouTube videos:

- **Caption Analysis**: The traditional method using video captions/transcripts
- **Metadata Analysis**: For videos without captions, extracts and analyzes video metadata
- **Multimodal Analysis**: Uses vision-capable AI models to directly analyze video content

Configure how videos without captions are handled:
1. Open plugin settings
2. Go to "Video Analysis Settings"
3. Choose your preferred analysis method
4. Enable or disable fallback to metadata analysis

### Media Player Settings
The plugin includes an embedded media player that appears in notes with a `media_link` frontmatter:

1. **Layout Settings**:
   - Vertical Player Height: Adjust the height of the player in vertical mode
   - Horizontal Player Width: Adjust the width of the player in horizontal mode
   - Toggle between layouts with the command palette

2. **Playback Controls**:
   - Seek Seconds: How many seconds to jump when using seek controls
   - Display Progress Bar: Show/hide the video progress bar
   - Progress Bar Color: Customize the color of the progress bar
   - Display Timestamp: Show/hide the current time and duration

3. **Timestamp Settings**:
   - Timestamp Template: Format for inserting timestamps (`{ts}` for timestamp, `{link}` for URL)
   - Timestamp Offset: Subtract seconds from current time (useful for reaction time)
   - Pause on Timestamp Insert: Automatically pause video when inserting a timestamp

4. **Mini Player Settings**:
   - Enable Mini Player: Allow videos to be detached into floating mini player
   - Remember Mini Player Position: Save position between sessions
   - Enable Keyboard Shortcuts: Use keyboard to control playback

### File Organization Settings
Customize how and where your video summary notes are saved:

1. Default Folder: Specify where to save video summary notes
2. Filename Template: Customize filenames using variables:
   - `{{title}}`: Video title
   - `{{videoId}}`: YouTube video ID
   - `{{date}}`: Current date

## Usage

### Summarizing a YouTube Video

#### Method 1: Command Palette
1. Open the command palette (`Ctrl/Cmd + P`)
2. Search for "Summarize YouTube Video"
3. Paste the YouTube URL when prompted
4. Wait for the summary to be generated

#### Method 2: From Selected Text
1. Paste a YouTube URL in your note
2. Select the URL text
3. Open the command palette and run "Summarize YouTube Video"
4. The summary will replace the selected URL

### Watching Videos in Notes

Any note with a YouTube URL in its frontmatter will automatically display the embedded player:

```yaml
---
media_link: https://www.youtube.com/watch?v=VIDEO_ID
---
```

#### Player Controls
- Play/Pause: Click the play button or use space key
- Seek Forward/Backward: Use arrow buttons or keyboard shortcuts
- Speed Control: Adjust playback speed with the speed controls
- Full Screen: Click the expand button

#### Working with Timestamps
1. Position the video at the desired point
2. Use the command palette to run "Insert Video Timestamp"
3. A formatted timestamp will be inserted at your cursor position
4. Click on any timestamp to jump to that position in the video

#### Mini Player Mode
1. Open a note with an embedded video
2. Use the command palette to run "Toggle Mini Player"
3. The video will detach into a floating window
4. Drag to reposition or resize
5. Close using the X button or "Close Mini Player" command

## Output Formats

### Standard Format
The default summary format includes:
- Video title and thumbnail
- Author and channel link
- Comprehensive summary
- Key points and insights
- Technical terms with explanations
- Conclusion

### Bullet Format
Presents information in an easy-to-scan bullet point format

### Chapters Format
Structures the summary around key timestamps, creating a chapter-based overview

### Detailed Format
Provides the most comprehensive analysis with extended explanations

## Keyboard Shortcuts

- **Space**: Play/Pause video
- **Left Arrow**: Seek backward
- **Right Arrow**: Seek forward
- **Up Arrow**: Increase playback speed
- **Down Arrow**: Decrease playback speed
- **T**: Insert timestamp at current position
- **Esc**: Exit fullscreen mode
- **M**: Toggle mini player

## Troubleshooting

### Common Issues

1. **No summary generated**:
   - Verify your API key is correct
   - Check if the video has captions available
   - Enable multimodal analysis for videos without captions

2. **Player not appearing**:
   - Ensure the note has a `media_link` in the frontmatter
   - Verify the URL is a valid YouTube link

3. **Slow summaries**:
   - Long videos may take more time to process
   - Consider using a model with faster inference time

### Reporting Issues
If you encounter any bugs or have feature requests, please submit an issue on the [GitHub repository](https://github.com/yourusername/obsidian-yt-video-summarizer/issues).

## Privacy and Data Usage

This plugin:
- Does not collect or store your data
- Sends video transcripts to your chosen AI provider (Gemini or Grok)
- Uses your API key only for generating summaries
- Stores settings and API keys locally in your vault

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Inspired by the original plugin from @mbramani
- Uses React for the media player interface
- Powered by Gemini AI and Grok for text generation
