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

1. Download the plugin from the Obsidian community plugins directory.
2. Enable the plugin in Obsidian by navigating to `Settings > Community Plugins`.
3. Configure the plugin settings as described below.

## Requirements

- Obsidian (latest version recommended)
- API keys for Gemini AI or Grok (depending on your chosen provider)
- YouTube API key for fetching video metadata and transcripts

## Setup and Configuration

### AI Provider Settings
1. Open plugin settings.
2. Choose your preferred AI provider (Gemini or Grok).
3. Enter your API key.
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
1. Open plugin settings.
2. Go to "Video Analysis Settings".
3. Choose your preferred analysis method.
4. Enable or disable fallback to metadata analysis.

### Media Player Settings
1. Enable or disable the integrated media player.
2. Adjust the mini-player's position and size.
3. Configure keyboard shortcuts for video control.

### File Organization Settings
Customize how and where your video summary notes are saved:

1. Default Folder: Specify where to save video summary notes.
2. Filename Template: Customize filenames using variables:
   - `{{title}}`: Video title
   - `{{videoId}}`: YouTube video ID
   - `{{date}}`: Current date
3. Folder Structure: Organize notes in a hierarchical structure.

### Managing Prompts Manually

This plugin allows you to customize and manage the prompts sent to the AI for generating summaries. Follow these steps to manually manage your prompts:

1. Open the plugin settings.
2. Navigate to the "Prompt Management" section.
3. Edit the default prompts or create new ones:
   - Use placeholders like `{{transcript}}`, `{{title}}`, and `{{timestamps}}` to dynamically insert video data.
   - Example prompt: "Summarize the following YouTube video transcript: {{transcript}}."
4. Save your changes to apply the custom prompts.

By customizing prompts, you can tailor the AI's output to better suit your needs.

## Usage

### Summarizing a YouTube Video
1. Open a Markdown file in Obsidian.
2. Use the command palette to launch the "Summarize YouTube Video" command.
3. Enter the YouTube video URL.
4. Choose your preferred summary format and analysis method.
5. The plugin will generate a summary and insert it into your note.

### Working with the Media Player
1. Open a Markdown file containing a YouTube video link.
2. The mini-player will appear automatically.
3. Use the player controls or keyboard shortcuts to navigate the video.
4. Insert timestamps into your notes with a single click.

## Keyboard Shortcuts

- `Ctrl+Alt+P`: Play/Pause the video
- `Ctrl+Alt+Left`: Seek backward
- `Ctrl+Alt+Right`: Seek forward
- `Ctrl+Alt+T`: Insert current timestamp

## Troubleshooting

### Common Issues
- **API Key Errors**: Ensure your API keys are correctly entered and have the necessary permissions.
- **Video Not Found**: Verify the YouTube URL and ensure the video is publicly accessible.

### Debugging
- Check the Obsidian console for error messages.
- Clear the plugin cache if summaries are outdated or incorrect.

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
