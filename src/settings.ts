import { Notice, PluginSettingTab, Setting, type App, type TextAreaComponent } from "obsidian";
import { restoreDefaultEditorState } from "./settings-state.ts";
import type VaultArchivePlugin from "./main.ts";

export class VaultArchiveSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: VaultArchivePlugin) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		if (!this.plugin.initialLoadFinished) {
			new Setting(this.containerEl).setName("正在加载归档设置…").setHeading();
			void this.plugin.initialLoad.finally(() => {
				if (this.containerEl.isConnected) this.display();
			});
			return;
		}

		const settings = this.plugin.getSettings();
		const editorState = {
			showPatternsText: settings.showCommandPatterns.join("\n"),
			archiveJson: JSON.stringify(settings.archive, null, 2),
		};
		let showPatternsInput: TextAreaComponent | undefined;
		let archiveInput: TextAreaComponent | undefined;

		new Setting(this.containerEl).setName("命令展示规则").setHeading();
		new Setting(this.containerEl)
			.setDesc("每行一个正则；任一规则匹配笔记路径时显示“归档”命令。")
			.addTextArea((text) => {
				showPatternsInput = text.setValue(editorState.showPatternsText).onChange((value) => {
					editorState.showPatternsText = value;
				});
				text.inputEl.rows = 6;
				text.inputEl.cols = 60;
			});

		new Setting(this.containerEl).setName("归档规则").setHeading();
		new Setting(this.containerEl)
			.setDesc("JSON 对象，包含 routes 和 properties 数组。")
			.addTextArea((text) => {
				archiveInput = text.setValue(editorState.archiveJson).onChange((value) => {
					editorState.archiveJson = value;
				});
				text.inputEl.rows = 20;
				text.inputEl.cols = 60;
			});

		new Setting(this.containerEl)
			.addButton((button) =>
				button.setButtonText("验证并保存").setCta().onClick(async () => {
					button.setDisabled(true);
					try {
						await this.plugin.saveEditor(editorState.showPatternsText, editorState.archiveJson);
						new Notice("归档规则已保存");
					} catch (error) {
						if (!(error instanceof Error && error.name === "ConfigurationPersistenceError")) new Notice(`保存失败：${errorMessage(error)}`);
					} finally {
						button.setDisabled(false);
					}
				}),
			)
			.addButton((button) =>
				button.setButtonText("恢复默认规则").onClick(async () => {
					button.setDisabled(true);
					try {
						await restoreDefaultEditorState(editorState, () => this.plugin.restoreDefaults());
						showPatternsInput?.setValue(editorState.showPatternsText);
						archiveInput?.setValue(editorState.archiveJson);
						new Notice("已恢复默认归档规则");
					} catch (error) {
						if (!(error instanceof Error && error.name === "ConfigurationPersistenceError")) new Notice(`恢复失败：${errorMessage(error)}`);
					} finally {
						button.setDisabled(false);
					}
				}),
			);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
