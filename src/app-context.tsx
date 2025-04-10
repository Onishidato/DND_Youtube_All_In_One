import * as React from "react";
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { MediaNotesPluginSettings } from "./types";
import { EventEmitter } from "events";

interface AppContextType {
	settings: MediaNotesPluginSettings;
	showTimestamp: boolean;
	showPlay: boolean;
	showPause: boolean;
	showSeekForward: boolean;
	showSeekBackwards: boolean;
	showSpeed: boolean;
	currentSpeed: number;
}

interface AppContextProviderProps {
	children: React.ReactNode;
	settingsParam: MediaNotesPluginSettings;
	eventEmitter: EventEmitter;
}

// Create a stable context object
const AppContext = createContext<AppContextType | undefined>(undefined);

// Map to store timeouts for cleanup
const timeoutMap: Record<string, NodeJS.Timeout> = {};

// Helper to manage timeouts with cleanup
const manageTimeout = (key: string, callback: () => void, delay: number) => {
	// Clear existing timeout if there is one
	if (timeoutMap[key]) {
		clearTimeout(timeoutMap[key]);
	}
	
	// Set new timeout and store reference
	timeoutMap[key] = setTimeout(() => {
		callback();
		delete timeoutMap[key]; // Remove reference after execution
	}, delay);
};

export const AppProvider: React.FC<AppContextProviderProps> = ({
	children,
	settingsParam,
	eventEmitter,
}) => {
	// Use useRef for mutable values that shouldn't trigger re-renders
	const [settings, setSettings] = useState<MediaNotesPluginSettings>(settingsParam);
	const [showTimestamp, setShowTimestamp] = useState(false);
	const [showPlay, setShowPlay] = useState(false);
	const [showPause, setShowPause] = useState(false);
	const [showSeekForward, setShowSeekForward] = useState(false);
	const [showSeekBackwards, setShowSeekBackwards] = useState(false);
	const [showSpeed, setShowSpeed] = useState(false);
	const [currentSpeed, setCurrentSpeed] = useState(1);

	// Create memoized callback handlers to optimize event handling
	const handleSettingsUpdated = useCallback((newSettings: MediaNotesPluginSettings) => {
		setSettings(prevSettings => {
			// Only update if something actually changed
			if (JSON.stringify(prevSettings) !== JSON.stringify(newSettings)) {
				return newSettings;
			}
			return prevSettings;
		});
	}, []);

	// Create a memoized action handler that won't change on re-renders
	const handleAction = useCallback((action: any) => {
		switch (action.type) {
			case "timestampClick":
				setShowTimestamp(true);
				manageTimeout('timestamp', () => setShowTimestamp(false), 1000);
				break;
			case "play":
				setShowPlay(true);
				manageTimeout('play', () => setShowPlay(false), 500);
				break;
			case "pause":
				setShowPause(true);
				manageTimeout('pause', () => setShowPause(false), 500);
				break;
			case "seekForward":
				setShowSeekForward(true);
				manageTimeout('seekForward', () => setShowSeekForward(false), 200);
				break;
			case "seekBackwards":
				setShowSeekBackwards(true);
				manageTimeout('seekBackwards', () => setShowSeekBackwards(false), 200);
				break;
			case "setSpeed":
				// Batch the state updates to avoid multiple re-renders
				setCurrentSpeed(action.speed);
				setShowSpeed(true);
				manageTimeout('speed', () => setShowSpeed(false), 1000);
				break;
			default:
				break;
		}
	}, []);

	// Set up event listeners with memoized callbacks
	useEffect(() => {
		eventEmitter.on("handleAction", handleAction);
		eventEmitter.on("settingsUpdated", handleSettingsUpdated);

		// Clean up all timeouts and event listeners on unmount
		return () => {
			eventEmitter.off("handleAction", handleAction);
			eventEmitter.off("settingsUpdated", handleSettingsUpdated);
			
			// Clear any remaining timeouts
			Object.keys(timeoutMap).forEach(key => {
				clearTimeout(timeoutMap[key]);
				delete timeoutMap[key];
			});
		};
	}, [eventEmitter, handleAction, handleSettingsUpdated]);

	// Memoize the context value to prevent unnecessary re-renders of consumers
	const contextValue = useMemo(() => ({
		settings,
		showTimestamp,
		showPlay,
		showPause,
		showSeekForward,
		showSeekBackwards,
		showSpeed,
		currentSpeed,
	}), [
		settings,
		showTimestamp,
		showPlay,
		showPause,
		showSeekForward,
		showSeekBackwards,
		showSpeed,
		currentSpeed,
	]);

	return (
		<AppContext.Provider value={contextValue}>
			{children}
		</AppContext.Provider>
	);
};

// Memoize the hook to ensure consistent reference
export const useAppContext = () => {
	const context = useContext(AppContext);
	if (context === undefined) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return context;
};