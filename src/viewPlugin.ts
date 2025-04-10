import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

class ClickHandlerPlugin {
	view: EditorView;
	handleTimestampClick: (ts: string) => boolean | undefined;

	constructor(view: EditorView) {
		this.view = view;
		this.view.dom.addEventListener("click", this.handleClick);
	}

	handleClick = (event: MouseEvent) => {
		const element = event.target as HTMLElement;
		
		// Handle links in editing mode (CodeMirror spans)
		if (element.matches("span.cm-link, span.cm-link *")) {
			const textContent = element.textContent;
			const timestampRegex = /^(\d+:)?[0-5]?\d:[0-5]\d$/;
			if (!textContent) return;
			if (timestampRegex.test(textContent)) {
				const isHandled = this.handleTimestampClick(textContent);
				if (isHandled) {
					event.preventDefault();
					event.stopPropagation();
				}
			}
		}
		
		// Also handle links in case they're actual <a> elements
		// This can happen when clicking on rendered markdown
		let linkElement = element.closest('a');
		if (linkElement) {
			const textContent = linkElement.textContent;
			const timestampRegex = /^(\d+:)?[0-5]?\d:[0-5]\d$/;
			if (textContent && timestampRegex.test(textContent)) {
				const isHandled = this.handleTimestampClick(textContent);
				if (isHandled) {
					event.preventDefault();
					event.stopPropagation();
				}
			}
		}
	};

	update(update: ViewUpdate) {
		// No need to add the event listener again
		// It's already added in the constructor and never removed until destroy
	}

	destroy() {
		// This method is called when the plugin is no longer needed
		this.view.dom.removeEventListener("click", this.handleClick);
	}
}

export const clickHandlerPlugin = ViewPlugin.fromClass(ClickHandlerPlugin);

export function createClickHandlerPlugin(
	handleTimestampClick: (ts: string) => boolean | undefined
) {
	return ViewPlugin.fromClass(
		class extends ClickHandlerPlugin {
			constructor(view: EditorView) {
				super(view);
				this.handleTimestampClick = handleTimestampClick;
			}
		}
	);
}
