import type { App, TFile } from "obsidian";
import { resolveArchivePlan, type ArchiveRules, type CompiledArchiveRoute, type PathNormalizer } from "./archive-rules.ts";

type ArchiveApp = Pick<App, "vault" | "fileManager">;

export async function executeArchive(
	app: ArchiveApp,
	file: TFile,
	rules: ArchiveRules,
	compiledRoutes: readonly CompiledArchiveRoute[],
	normalize: PathNormalizer,
	now = new Date(),
): Promise<string> {
	let target: string | undefined;
	let previous: Map<string, { exists: boolean; value: unknown }> | undefined;

	await app.fileManager.processFrontMatter(file, (frontmatter: unknown) => {
		const record = frontmatterRecord(frontmatter);
		const plan = resolveArchivePlan(
			file.path,
			record,
			rules,
			compiledRoutes,
			(path) => app.vault.getAbstractFileByPath(path) !== null,
			normalize,
			now,
		);
		target = plan.target;
		previous = new Map();
		for (const [key, value] of plan.changes) {
			previous.set(key, { exists: Object.prototype.hasOwnProperty.call(record, key), value: record[key] });
			defineFrontmatterProperty(record, key, value);
		}
	});

	if (!target || !previous) throw new Error("无法生成归档计划");
	try {
		const separator = target.lastIndexOf("/");
		if (separator > 0) await ensureFolder(app, target.slice(0, separator));
		await app.fileManager.renameFile(file, target);
		return target;
	} catch (error) {
		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: unknown) => restore(frontmatterRecord(frontmatter), previous!));
		} catch (rollbackError) {
			console.error("Vault Archive rollback failed", rollbackError);
			throw new Error(`${errorMessage(error)}；属性回滚失败：${errorMessage(rollbackError)}`);
		}
		throw error;
	}
}

async function ensureFolder(app: ArchiveApp, path: string): Promise<void> {
	let current = "";
	for (const part of path.split("/")) {
		current = current ? `${current}/${part}` : part;
		const entry = app.vault.getAbstractFileByPath(current);
		if (!entry) await app.vault.createFolder(current);
		else if (!("children" in entry)) throw new Error(`归档目录路径被文件占用：${current}`);
	}
}

function restore(frontmatter: Record<string, unknown>, previous: Map<string, { exists: boolean; value: unknown }>): void {
	for (const [key, snapshot] of previous) {
		if (snapshot.exists) defineFrontmatterProperty(frontmatter, key, snapshot.value);
		else delete frontmatter[key];
	}
}

function defineFrontmatterProperty(frontmatter: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(frontmatter, key, { value, enumerable: true, writable: true, configurable: true });
}

function frontmatterRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Frontmatter 必须是对象");
	return value as Record<string, unknown>;
}

export async function runExclusiveArchive<T extends object, R>(
	inFlight: WeakSet<T>,
	file: T,
	run: () => Promise<R>,
): Promise<{ started: false } | { started: true; value: R }> {
	if (inFlight.has(file)) return { started: false };
	inFlight.add(file);
	try {
		return { started: true, value: await run() };
	} finally {
		inFlight.delete(file);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
