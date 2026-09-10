import { DEFAULT_SETTINGS } from "./archive-rules.ts";

export interface SettingsEditorState {
	showPatternsText: string;
	archiveJson: string;
}

export async function restoreDefaultEditorState(state: SettingsEditorState, saveDefaults: () => Promise<void>): Promise<void> {
	await saveDefaults();
	state.showPatternsText = DEFAULT_SETTINGS.showCommandPatterns.join("\n");
	state.archiveJson = JSON.stringify(DEFAULT_SETTINGS.archive, null, 2);
}
