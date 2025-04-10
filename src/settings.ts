import { App, Modal, Notice, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import { DEFAULT_PROMPTS, DEFAULT_SETTINGS, GEMINI_MODELS, GROK_MODELS, LLM_PROVIDERS, SUMMARY_FORMATS, VIDEO_ANALYSIS_METHODS } from './constants';

import { GeminiModel, GrokModel, LLMProvider, NamedPrompt, SummaryFormat, VideoAnalysisMethod } from './types';
import type YouTubeSummarizerPlugin from './main';

/**
 * Modal for adding or editing a prompt template
 */
class PromptModal extends Modal {
	private name: string;
	private promptText: string;
	private onSubmit: (name: string, promptText: string) => void;
	private editing: boolean;

	constructor(
		app: App,
		name = '',
		promptText = '',
		onSubmit: (name: string, promptText: string) => void,
		editing = false
	) {
		super(app);
		this.name = name;
		this.promptText = promptText;
		this.onSubmit = onSubmit;
		this.editing = editing;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.editing ? 'Edit Prompt Template' : 'Add New Prompt Template' });

		new Setting(contentEl)
			.setName('Name')
			.setDesc('Enter a name for this prompt template')
			.addText((text) => 
				text
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
					})
			);

		contentEl.createEl('h3', { text: 'Prompt Text' });
		
		const promptContainer = contentEl.createDiv();
		promptContainer.style.margin = '0 0 1em 0';
		
		const textArea = new TextAreaComponent(promptContainer);
		textArea.setValue(this.promptText);
		textArea.onChange((value) => {
			this.promptText = value;
		});
		
		textArea.inputEl.style.width = '100%';
		textArea.inputEl.style.height = '200px';

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '10px';

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		const submitButton = buttonContainer.createEl('button', { text: this.editing ? 'Save Changes' : 'Add Prompt', cls: 'mod-cta' });
		submitButton.addEventListener('click', () => {
			if (!this.name) {
				new Notice('Please enter a name for the prompt template');
				return;
			}
			if (!this.promptText) {
				new Notice('Please enter prompt text');
				return;
			}
			this.onSubmit(this.name, this.promptText);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Represents the settings tab for the YouTube Summarizer Plugin.
 * This class extends the PluginSettingTab and provides a user interface
 * for configuring the plugin's settings.
 */
export class VideoSummarizerSettingTab extends PluginSettingTab {
	plugin: YouTubeSummarizerPlugin;

	/**
	 * Creates an instance of VideoSummarizerSettingTab.
	 * @param app - The Obsidian app instance.
	 * @param plugin - The YouTube Summarizer Plugin instance.
	 */
	constructor(app: App, plugin: YouTubeSummarizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Displays the settings tab UI.
	 * This method is responsible for rendering the settings controls
	 * and handling user interactions.
	 */
	display(): void {
		let { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h1", { text: "YouTube Video Summarizer Settings" });

		// Helper function to create section headers
		const createSectionHeader = (title: string, description?: string) => {
			containerEl.createEl('h2', { text: title });
			if (description) {
				containerEl.createEl('p', { text: description });
			}
			containerEl.createEl('hr');
		};

		 // Prompt Settings
		createSectionHeader("Prompt Management", "Create and manage your custom prompts for video summarization");
		
		// Dropdown to select prompt template
		const promptDropdownContainer = containerEl.createDiv();
		promptDropdownContainer.className = "prompt-selection-container";
		
		const promptDropdownSetting = new Setting(promptDropdownContainer)
			.setName("Select Prompt Template")
			.setDesc("Choose a saved prompt template to use for summarization");
			
		// Get all available prompts
		const prompts = this.plugin.settings.savedPrompts;
		
		// Create dropdown with all prompts
		const dropdown = promptDropdownSetting.addDropdown(dropdown => {
			// Add custom prompt option
			dropdown.addOption('custom', 'Custom Prompt');
			
			// Add all saved prompts
			prompts.forEach(prompt => {
				dropdown.addOption(prompt.id, prompt.name);
			});
			
			// Set current selection
			dropdown.setValue(this.plugin.settings.selectedPromptId || 'custom');
			
			// Handle selection change
			dropdown.onChange(async (value) => {
				this.plugin.settings.selectedPromptId = value;
				await this.plugin.saveSettings();
				
				// Update the text area visibility based on selection
				const isCustom = value === 'custom';
				customPromptContainer.style.display = isCustom ? 'block' : 'none';
				
				// Refresh the prompt description
				if (!isCustom) {
					const selectedPrompt = prompts.find(p => p.id === value);
					if (selectedPrompt) {
						promptPreviewEl.innerText = selectedPrompt.promptText.substring(0, 100) + 
							(selectedPrompt.promptText.length > 100 ? '...' : '');
					}
				}
			});
		});
		
		// Container for prompt management buttons
		const promptButtonsContainer = containerEl.createDiv();
		promptButtonsContainer.className = "prompt-buttons-container";
		promptButtonsContainer.style.display = "flex";
		promptButtonsContainer.style.gap = "10px";
		promptButtonsContainer.style.marginTop = "10px";
		
		// Add new prompt button
		const addPromptButton = promptButtonsContainer.createEl('button', { text: 'Add New Prompt' });
		addPromptButton.addEventListener('click', () => {
			new PromptModal(
				this.app,
				'',
				'',
				async (name, promptText) => {
					// Create a unique ID for the new prompt
					const id = 'prompt_' + Date.now();
					
					// Add the new prompt to saved prompts
					this.plugin.settings.savedPrompts.push({
						id,
						name,
						promptText
					});
					
					// Save settings
					await this.plugin.saveSettings();
					
					// Refresh display
					this.display();
				}
			).open();
		});
		
		// Edit selected prompt button (only visible when a saved prompt is selected)
		const editPromptButton = promptButtonsContainer.createEl('button', { text: 'Edit Selected' });
		editPromptButton.addEventListener('click', () => {
			const selectedId = this.plugin.settings.selectedPromptId;
			if (selectedId === 'custom') {
				new Notice('Cannot edit the custom prompt here. Use the text area below.');
				return;
			}
			
			const selectedPrompt = prompts.find(p => p.id === selectedId);
			if (selectedPrompt) {
				new PromptModal(
					this.app,
					selectedPrompt.name,
					selectedPrompt.promptText,
					async (name, promptText) => {
						// Update the prompt
						selectedPrompt.name = name;
						selectedPrompt.promptText = promptText;
						
						// Save settings
						await this.plugin.saveSettings();
						
						// Refresh display
						this.display();
					},
					true
				).open();
			}
		});
		
		// Delete selected prompt button (only visible when a saved prompt is selected)
		const deletePromptButton = promptButtonsContainer.createEl('button', { text: 'Delete Selected' });
		deletePromptButton.addEventListener('click', () => {
			const selectedId = this.plugin.settings.selectedPromptId;
			if (selectedId === 'custom') {
				new Notice('Cannot delete the custom prompt.');
				return;
			}
			
			// Confirm deletion
			if (confirm(`Are you sure you want to delete the prompt "${prompts.find(p => p.id === selectedId)?.name}"?`)) {
				// Remove the prompt from saved prompts
				this.plugin.settings.savedPrompts = this.plugin.settings.savedPrompts.filter(p => p.id !== selectedId);
				
				// Reset to custom prompt
				this.plugin.settings.selectedPromptId = 'custom';
				
				// Save settings
				this.plugin.saveSettings().then(() => {
					// Refresh display
					this.display();
				});
			}
		});
		
		// Prompt preview section
		const promptPreviewContainer = containerEl.createDiv();
		promptPreviewContainer.className = "prompt-preview-container";
		promptPreviewContainer.style.marginTop = "10px";
		
		const promptPreviewLabel = promptPreviewContainer.createEl('h3', { text: 'Prompt Preview:' });
		const promptPreviewEl = promptPreviewContainer.createEl('div', { cls: 'prompt-preview' });
		promptPreviewEl.style.padding = "10px";
		promptPreviewEl.style.backgroundColor = "var(--background-secondary)";
		promptPreviewEl.style.borderRadius = "4px";
		promptPreviewEl.style.maxHeight = "100px";
		promptPreviewEl.style.overflow = "auto";
		
		// Show preview of the selected prompt or custom prompt
		if (this.plugin.settings.selectedPromptId === 'custom') {
			promptPreviewEl.innerText = this.plugin.settings.customPrompt.substring(0, 100) +
				(this.plugin.settings.customPrompt.length > 100 ? '...' : '');
		} else {
			const selectedPrompt = prompts.find(p => p.id === this.plugin.settings.selectedPromptId);
			if (selectedPrompt) {
				promptPreviewEl.innerText = selectedPrompt.promptText.substring(0, 100) +
					(selectedPrompt.promptText.length > 100 ? '...' : '');
			}
		}
		
		// Custom prompt container (only visible when 'custom' is selected)
		const customPromptContainer = containerEl.createDiv();
		customPromptContainer.className = "custom-prompt-container";
		customPromptContainer.style.display = this.plugin.settings.selectedPromptId === 'custom' ? 'block' : 'none';
		
		new Setting(customPromptContainer)
			.setName('Custom Prompt')
			.setDesc('Enter your custom prompt for video summarization. The transcript will be appended after this prompt.')
			.setClass('custom-prompt-setting');
			
		const promptTextAreaContainer = customPromptContainer.createDiv();
		promptTextAreaContainer.style.marginBottom = "20px";
		
		const textArea = new TextAreaComponent(promptTextAreaContainer);
		textArea.setValue(this.plugin.settings.customPrompt);
		textArea.onChange(async (value) => {
			this.plugin.settings.customPrompt = value;
			await this.plugin.saveSettings();
			
			// Update preview if custom is selected
			if (this.plugin.settings.selectedPromptId === 'custom') {
				promptPreviewEl.innerText = value.substring(0, 100) + (value.length > 100 ? '...' : '');
			}
		});
		
		textArea.inputEl.style.width = '100%';
		textArea.inputEl.style.height = '150px';

		// LLM Provider Settings
		createSectionHeader("LLM Provider Settings", "Configure which AI model to use for summarization");
		
		new Setting(containerEl)
			.setName("LLM Provider")
			.setDesc("Choose which AI provider to use for video summarization")
			.addDropdown(dropdown => {
				LLM_PROVIDERS.forEach(provider => {
					dropdown.addOption(provider, provider.charAt(0).toUpperCase() + provider.slice(1));
				});
				dropdown.setValue(this.plugin.settings.llmProvider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.llmProvider = value as any;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide relevant settings
				});
			});

		// Gemini-specific settings
		if (this.plugin.settings.llmProvider === "gemini") {
			new Setting(containerEl)
				.setName("Gemini API Key")
				.setDesc("Your Gemini API key")
				.addText(text => text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.geminiApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName("Gemini Model")
				.setDesc("Choose which Gemini model to use")
				.addDropdown(dropdown => {
					GEMINI_MODELS.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.setValue(this.plugin.settings.modelName);
					dropdown.onChange(async (value) => {
						this.plugin.settings.modelName = value as GeminiModel;
						await this.plugin.saveSettings();
					});
				});
		}

		// Grok-specific settings
		if (this.plugin.settings.llmProvider === "grok") {
			new Setting(containerEl)
				.setName("Grok API Key")
				.setDesc("Your Grok API key")
				.addText(text => text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.grokApiKey || "")
					.onChange(async (value) => {
						this.plugin.settings.grokApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName("Grok Model")
				.setDesc("Choose which Grok model to use")
				.addDropdown(dropdown => {
					GROK_MODELS.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.setValue(this.plugin.settings.modelName);
					dropdown.onChange(async (value) => {
						this.plugin.settings.modelName = value as GrokModel;
						await this.plugin.saveSettings();
					});
				});
		}

		// Common LLM settings
		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("Controls randomness. Lower values are more deterministic, higher values more creative (0.0-1.0)")
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)
				.setValue(this.plugin.settings.temperatureVal)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperatureVal = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Max Output Tokens")
			.setDesc("Maximum number of tokens in the generated response")
			.addText(text => text
				.setPlaceholder("8192")
				.setValue(String(this.plugin.settings.maxOutputTokens))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.maxOutputTokens = numValue;
						await this.plugin.saveSettings();
					}
				}));

		// YouTube API Settings
		createSectionHeader("YouTube API Settings", "Optional: For enhanced metadata retrieval");
		
		new Setting(containerEl)
			.setName("YouTube API Key")
			.setDesc("Optional: Your YouTube Data API key for enhanced metadata retrieval")
			.addText(text => text
				.setPlaceholder("Enter your YouTube API key")
				.setValue(this.plugin.settings.youtubeApiKey || "")
				.onChange(async (value) => {
					this.plugin.settings.youtubeApiKey = value;
					await this.plugin.saveSettings();
				}));

		// File Organization Settings
		createSectionHeader("File Organization", "Configure how and where notes are created");
		
		new Setting(containerEl)
			.setName("Default Folder")
			.setDesc("The folder where video summary notes will be saved")
			.addText(text => text
				.setPlaceholder("Example: Videos/YouTube")
				.setValue(this.plugin.settings.folderPath)
				.onChange(async (value) => {
					this.plugin.settings.folderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Filename Template")
			.setDesc("Template for generated filenames. Use {{title}} for video title, {{videoId}} for video ID, {{date}} for current date")
			.addText(text => text
				.setPlaceholder("YT - {{title}}")
				.setValue(this.plugin.settings.fileNameTemplate)
				.onChange(async (value) => {
					this.plugin.settings.fileNameTemplate = value;
					await this.plugin.saveSettings();
				}));

		// Content Formatting Settings
		createSectionHeader("Content Formatting", "Configure what to include in the generated notes");
		
		new Setting(containerEl)
			.setName("Include Video Title")
			.setDesc("Add the video title to the note frontmatter")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeVideoTitle)
				.onChange(async (value) => {
					this.plugin.settings.includeVideoTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Include Thumbnail")
			.setDesc("Add the video thumbnail to the note")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeThumbnail)
				.onChange(async (value) => {
					this.plugin.settings.includeThumbnail = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Include Metadata")
			.setDesc("Add video metadata (channel, date, etc.) to the note")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeVideoMetaData)
				.onChange(async (value) => {
					this.plugin.settings.includeVideoMetaData = value;
					await this.plugin.saveSettings();
				}));

		// Media Player Settings
		createSectionHeader("Media Player Settings", "Configure the embedded media player behavior");
		
		new Setting(containerEl)
			.setName("Player Height")
			.setDesc("Height of the main embedded player in pixels")
			.addText(text => text
				.setPlaceholder("400")
				.setValue(String(this.plugin.settings.playerHeight))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.playerHeight = numValue;
						await this.plugin.saveSettings();
					}
				}));
                
		new Setting(containerEl)
			.setName("Player Width")
			.setDesc("Width of the main embedded player (in pixels or percentage)")
			.addText(text => text
				.setPlaceholder("100%")
				.setValue(String(this.plugin.settings.playerWidth))
				.onChange(async (value) => {
					// Convert to number if it's a numeric string, otherwise use the string value
					const numValue = parseInt(value);
					if (!isNaN(numValue) && !value.includes('%')) {
						this.plugin.settings.playerWidth = numValue;
					} else {
						// If your type definition requires playerWidth to be a number,
						// you'll need to update the type definition to allow string values
						(this.plugin.settings as any).playerWidth = value;
					}
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Seek Seconds")
			.setDesc("Number of seconds to seek forward/backward when using keyboard shortcuts")
			.addText(text => text
				.setPlaceholder("10")
				.setValue(String(this.plugin.settings.seekSeconds))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.seekSeconds = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName("Display Progress Bar")
			.setDesc("Show a progress bar at the bottom of the video player")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.displayProgressBar)
				.onChange(async (value) => {
					this.plugin.settings.displayProgressBar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Progress Bar Color")
			.setDesc("Color of the progress bar")
			.addText(text => text
				.setPlaceholder("#FF0000")
				.setValue(this.plugin.settings.progressBarColor)
				.onChange(async (value) => {
					this.plugin.settings.progressBarColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Display Timestamp")
			.setDesc("Show the current time and duration in the video player")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.displayTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.displayTimestamp = value;
					await this.plugin.saveSettings();
				}));

		// Timestamp insertion settings
		createSectionHeader("Timestamp Settings", "Configure how timestamps are inserted into notes");
		
		new Setting(containerEl)
			.setName("Timestamp Template")
			.setDesc("Template for inserted timestamps. Use {ts} for timestamp, {link} for timestamped URL, \\n for newline")
			.addText(text => text
				.setPlaceholder("[{ts}]({link})\\n")
				.setValue(this.plugin.settings.timestampTemplate)
				.onChange(async (value) => {
					this.plugin.settings.timestampTemplate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Timestamp Offset")
			.setDesc("Seconds to subtract from the current time when inserting a timestamp (useful to account for reaction time)")
			.addText(text => text
				.setPlaceholder("0")
				.setValue(String(this.plugin.settings.timestampOffsetSeconds))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue >= 0) {
						this.plugin.settings.timestampOffsetSeconds = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName("Pause on Timestamp Insert")
			.setDesc("Automatically pause the video when inserting a timestamp")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.pauseOnTimestampInsert)
				.onChange(async (value) => {
					this.plugin.settings.pauseOnTimestampInsert = value;
					await this.plugin.saveSettings();
				}));

		// Mini Player Settings
		createSectionHeader("Mini Player Settings", "Configure the detachable mini-player");
		
		new Setting(containerEl)
			.setName("Enable Mini Player")
			.setDesc("Allow videos to be detached into a mini player that stays visible while navigating between notes")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.miniPlayerEnabled)
				.onChange(async (value) => {
					this.plugin.settings.miniPlayerEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default Mini Player Width")
			.setDesc("Default width of the mini player in pixels")
			.addText(text => text
				.setPlaceholder("320")
				.setValue(String(this.plugin.settings.miniPlayerDefaultWidth || 320))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue >= 200) {
						this.plugin.settings.miniPlayerDefaultWidth = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName("Default Mini Player Height")
			.setDesc("Default height of the mini player in pixels")
			.addText(text => text
				.setPlaceholder("220")
				.setValue(String(this.plugin.settings.miniPlayerDefaultHeight || 220))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue >= 150) {
						this.plugin.settings.miniPlayerDefaultHeight = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName("Remember Mini Player Position")
			.setDesc("Save the position of the mini player between sessions")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.rememberMiniPlayerPosition)
				.onChange(async (value) => {
					this.plugin.settings.rememberMiniPlayerPosition = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Enable Keyboard Shortcuts")
			.setDesc("Enable keyboard shortcuts for controlling the media player (space for play/pause, arrow keys for seeking)")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableKeyboardShortcuts)
				.onChange(async (value) => {
					this.plugin.settings.enableKeyboardShortcuts = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-open Mini Player on Timestamp Click")
			.setDesc("Automatically open the mini player when clicking on a timestamp if no player is active in the current view")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenMiniPlayerOnTimestampClick)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenMiniPlayerOnTimestampClick = value;
					await this.plugin.saveSettings();
				}));

		// Reset settings
		containerEl.createEl('hr');
		
		new Setting(containerEl)
			.setName("Reset Settings")
			.setDesc("Reset all settings to default values")
			.addButton(button => button
				.setButtonText("Reset")
				.onClick(async () => {
					if (confirm("Are you sure you want to reset all settings to their default values?")) {
						await this.plugin.resetSettings();
						this.display();
					}
				}));
	}
}
