import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { executeArchive, runExclusiveArchive } from "./archive.ts";
import {
	DEFAULT_SETTINGS,
	compileEditedSettings,
	compileSettings,
	parseJson,
	type CompiledSettings,
	type VaultArchiveSettings,
} from "./archive-rules.ts";
import { VaultArchiveSettingTab } from "./settings.ts";
import { shouldShowArchiveCommand } from "./visibility.ts";

export class ConfigurationPersistenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigurationPersistenceError";
	}
}

export default class VaultArchivePlugin extends Plugin {
	private active: CompiledSettings = compileSettings(DEFAULT_SETTINGS);
	private revision = 0;
	private saveQueue: Promise<void> = Promise.resolve();
	private configurationNoticeShown = false;
	private readonly archivingFiles = new WeakSet<TFile>();
	initialLoadFinished = false;
	initialLoad: Promise<void> = Promise.resolve();

	onload(): void {
		const revision = this.revision;
		this.initialLoad = this.loadInitialSettings(revision).finally(() => {
			this.initialLoadFinished = true;
		});
		this.addSettingTab(new VaultArchiveSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;
				if (!shouldShowArchiveCommand(file.path, this.active.visibilityPatterns)) return;
				menu.addItem((item) =>
					item
						.setTitle("归档")
						.setIcon("archive")
						.onClick(() => {
							void this.archive(file);
						}),
				);
			}),
		);
	}

	getSettings(): VaultArchiveSettings {
		return this.active.settings;
	}

	async saveEditor(showPatternsText: string, archiveJson: string): Promise<void> {
		await this.initialLoad;
		const patterns = showPatternsText === "" ? [] : showPatternsText.split(/\r?\n/u);
		for (const [index, pattern] of patterns.entries()) {
			if (pattern.length === 0 || pattern.trim() !== pattern) {
				throw new Error(`命令展示规则第 ${index + 1} 行：必须是非空且首尾无空白的字符串`);
			}
		}
		const next = compileEditedSettings(patterns, parseJson(archiveJson));
		await this.persist(next);
	}

	async restoreDefaults(): Promise<void> {
		await this.initialLoad;
		await this.persist(compileSettings(DEFAULT_SETTINGS));
	}

	private async loadInitialSettings(revision: number): Promise<void> {
		try {
			const saved: unknown = await this.loadData();
			if (saved !== null && saved !== undefined) {
				const compiled = compileSettings(saved);
				if (this.revision === revision) this.active = compiled;
			}
		} catch (error) {
			this.reportConfigurationError("设置加载失败，已使用当前有效规则", error);
		}
	}

	private async persist(next: CompiledSettings): Promise<void> {
		const operation = this.saveQueue.catch(() => undefined).then(async () => {
			try {
				await this.saveData(next.settings);
			} catch (error) {
				this.reportConfigurationError("设置保存失败，已保留当前有效规则", error);
				throw new ConfigurationPersistenceError(errorMessage(error));
			}
			this.active = next;
			this.revision += 1;
		});
		this.saveQueue = operation;
		await operation;
	}

	private async archive(file: TFile): Promise<void> {
		try {
			const result = await runExclusiveArchive(this.archivingFiles, file, () =>
				executeArchive(this.app, file, this.active.settings.archive, this.active.routes, normalizePath),
			);
			if (!result.started) {
				new Notice("该笔记正在归档");
				return;
			}
			new Notice(`已归档至 ${result.value}`);
		} catch (error) {
			console.error("Vault Archive failed", error);
			new Notice(`归档失败：${errorMessage(error)}`);
		}
	}

	private reportConfigurationError(message: string, error: unknown): void {
		console.error("Vault Archive configuration failed", error);
		if (!this.configurationNoticeShown) {
			this.configurationNoticeShown = true;
			new Notice(`${message}：${errorMessage(error)}`);
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
