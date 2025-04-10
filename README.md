# DND YouTube All In One

An advanced Obsidian plugin that transforms YouTube videos into comprehensive AI-generated notes, featuring an integrated media player and smart timestamp management for enhanced video analysis and note-taking.



## Features

### Core Functionality
- 🎥 Extract and analyze YouTube video transcripts
- 🧠 Generate intelligent summaries using Gemini AI or Grok
- 📝 Create structured notes with key points and technical terms
- 🔍 Automatically extract and format important timestamps
- 🎬 Integrated media player for seamless video watching while taking notes

### Advanced Features
- 📺 Smart analysis for videos without captions via metadata or multimodal AI
- 🤖 Multi-provider AI support (Gemini and Grok) with customizable settings
- 📋 Flexible summary formats to match your note-taking style
- 📊 Intelligent extraction of key timestamps with clickable navigation
- 🔄 Convenient mini-player that stays visible as you navigate between notes
- ⌨️ Keyboard shortcuts for efficient video control
- 📌 One-click timestamp insertion at your current video position
- 📁 Smart file organization with customizable templates and folder structures

## Installation

### Method 1: From Obsidian Community Plugins
1. Open Obsidian Settings
2. Go to "Community Plugins" and disable Safe Mode
3. Click "Browse" and search for "DND YouTube All In One"
4. Install and enable the plugin

### Method 2: Manual Installation
1. Download the latest release from the [GitHub repository](https://github.com/yourusername/DND_Youtube_All_In_One/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian settings under "Community Plugins"

## Requirements

- Obsidian v0.15.0+
- One of the following API keys:
  - Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))
  - Grok API key ([Get one here](https://www.grok.com/))
- Optional: YouTube Data API key for enhanced metadata retrieval

## Setup and Configuration

### AI Provider Settings
1. Open plugin settings
2. Choose your preferred AI provider (Gemini or Grok)
3. Enter your API key
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
   - Progress Bar: Show/hide and customize the video progress bar
   - Timestamp Display: Show/hide the current time and duration

3. **Timestamp Settings**:
   - Timestamp Template: Format for inserting timestamps
   - Timestamp Offset: Subtract seconds from current time (useful for reaction time)
   - Auto-pause: Configure if video should pause when inserting a timestamp

4. **Mini Player Settings**:
   - Enable Mini Player: Allow videos to be detached into floating mini player
   - Remember Position: Save mini player position between sessions
   - Keyboard Shortcuts: Use keyboard to control playback

### File Organization Settings
Customize how and where your video summary notes are saved:

1. Default Folder: Specify where to save video summary notes
2. Filename Template: Customize filenames using variables:
   - `{{title}}`: Video title
   - `{{videoId}}`: YouTube video ID
   - `{{date}}`: Current date
3. Folder Structure: Organize notes in a hierarchical structure

## Usage

### Summarizing a YouTube Video

#### Method 1: From Clipboard
1. Copy a YouTube URL to your clipboard
2. Open the command palette (`Ctrl/Cmd + P`)
3. Run "Summarize YouTube URL from clipboard"
4. Wait for the summary to be generated

#### Method 2: Manual Input
1. Open the command palette (`Ctrl/Cmd + P`)
2. Run "Summarize YouTube URL (input)"
3. Paste or type the YouTube URL when prompted
4. Wait for the summary to be generated

### Working with the Media Player

Any note with a YouTube URL in its frontmatter will automatically display the embedded player:

```yaml
---
media_link: https://www.youtube.com/watch?v=VIDEO_ID
---
```

#### Player Controls
- Play/Pause: Click the play button or use the space key
- Seek Forward/Backward: Use arrow buttons or keyboard shortcuts
- Speed Control: Adjust playback speed with the controls
- Full Screen: Click the expand button

#### Working with Timestamps
1. Position the video at the desired point
2. Use the command palette to run "Insert Video Timestamp"
3. A formatted timestamp will be inserted at your cursor position
4. Click on any timestamp in your notes to jump to that position in the video

#### Mini Player Mode
1. Open a note with an embedded video
2. Use the command palette to run "Open mini player for current note"
3. The video will detach into a floating window
4. Drag to reposition or resize
5. Close using the X button or "Toggle mini player visibility" command

## Keyboard Shortcuts

- **Space**: Play/Pause video
- **Left Arrow**: Seek backward
- **Right Arrow**: Seek forward
- **Up Arrow**: Increase playback speed
- **Down Arrow**: Decrease playback speed
- **T**: Insert timestamp at current position (when enabled)
- **Esc**: Exit fullscreen mode
- **M**: Toggle mini player (when enabled)

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

4. **Mini player not responding**:
   - Try closing and reopening the mini player
   - Check that keyboard shortcuts are enabled in settings

### Performance Optimization
- Enable "Unload hidden players" in settings to reduce resource usage
- Use cache settings to optimize repeated video analyses
- Close mini player when not in use

## Privacy and Data Usage

This plugin:
- Does not collect or store your personal data
- Sends video transcripts to your chosen AI provider (Gemini or Grok)
- Uses your API key only for generating summaries
- Stores settings and API keys locally in your vault

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Uses React for the media player interface
- Powered by Gemini AI and Grok for text generation
- Thanks to the Obsidian community for feedback and support
