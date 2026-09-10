import { compileVisibilityPatterns } from "./visibility.ts";

export interface VaultArchiveSettings {
	showCommandPatterns: string[];
	archive: ArchiveRules;
}

export interface ArchiveRules {
	routes: ArchiveRoute[];
	properties: PropertyRule[];
}

export interface ArchiveRoute {
	pattern: string;
	destination: string;
}

export interface PropertyRule {
	key: string;
	action: "set" | "keep";
	value?: string;
	when?: PropertyCondition[];
}

export interface PropertyCondition {
	key: string;
	operator: "empty" | "notEmpty" | "equals";
	value?: string;
}

export interface CompiledArchiveRoute extends ArchiveRoute {
	regex: RegExp;
}

export interface CompiledSettings {
	settings: VaultArchiveSettings;
	visibilityPatterns: RegExp[];
	routes: CompiledArchiveRoute[];
}

export interface ArchivePlan {
	target: string;
	changes: Map<string, string>;
}

export type PathNormalizer = (path: string) => string;

export const DEFAULT_SETTINGS: VaultArchiveSettings = {
	showCommandPatterns: ["^00-收件箱/.+\\.md$", "^20-知识/.+\\.md$"],
	archive: {
		routes: [
			{ pattern: "^00-收件箱/(?:.*/)?([^/]+\\.md)$", destination: "90-归档/收藏/{{year}}/$1" },
			{ pattern: "^20-知识/([^/]+)/(?:.*/)?([^/]+\\.md)$", destination: "90-归档/$1/{{year}}/$2" },
		],
		properties: [
			{ key: "状态", action: "set", value: "已归档" },
			{ key: "归档日期", action: "set", value: "{{date}}" },
			{ key: "归档原因", action: "keep", when: [{ key: "归档原因", operator: "notEmpty" }] },
			{ key: "归档原因", action: "set", value: "被新版本替代", when: [{ key: "替代文档", operator: "notEmpty" }] },
			{ key: "归档原因", action: "set", value: "内容过期", when: [{ key: "状态", operator: "equals", value: "过期" }] },
			{ key: "归档原因", action: "set", value: "已提炼", when: [{ key: "沉淀去向", operator: "notEmpty" }] },
			{ key: "归档原因", action: "set", value: "已提炼", when: [{ key: "状态", operator: "equals", value: "已处理" }] },
			{ key: "归档原因", action: "set", value: "无后续价值" },
		],
	},
};

export function compileSettings(value: unknown): CompiledSettings {
	const settings = validateSettings(value);
	const compiledArchive = compileArchiveRules(settings.archive, "/archive");
	return {
		settings,
		visibilityPatterns: compileVisibilityPatterns(settings.showCommandPatterns),
		routes: compiledArchive.routes,
	};
}

export function compileArchiveRules(value: unknown, pointer = ""): { rules: ArchiveRules; routes: CompiledArchiveRoute[] } {
	const rules = validateArchiveRules(value, pointer);
	return { rules, routes: compileRoutes(rules.routes, pointer) };
}

export function compileEditedSettings(showCommandPatterns: unknown, archive: unknown): CompiledSettings {
	const patterns = stringArrayAt(showCommandPatterns, "/showCommandPatterns");
	const compiledArchive = compileArchiveRules(archive);
	return {
		settings: { showCommandPatterns: patterns, archive: compiledArchive.rules },
		visibilityPatterns: compileVisibilityPatterns(patterns),
		routes: compiledArchive.routes,
	};
}

export function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		const message = errorMessage(error);
		const match = /position (\d+)/u.exec(message);
		const position = match ? Number(match[1]) : text.length;
		const before = text.slice(0, position);
		const line = before.split("\n").length;
		const column = position - before.lastIndexOf("\n");
		throw new Error(`JSON 解析失败（第 ${line} 行，第 ${column} 列）：${message}`);
	}
}

export function resolveArchivePlan(
	sourcePath: string,
	frontmatter: Readonly<Record<string, unknown>>,
	rules: ArchiveRules,
	compiledRoutes: readonly CompiledArchiveRoute[],
	targetExists: (path: string) => boolean,
	normalize: PathNormalizer,
	now = new Date(),
): ArchivePlan {
	let match: RegExpExecArray | null = null;
	let destination = "";
	for (const route of compiledRoutes) {
		match = route.regex.exec(sourcePath);
		if (match) {
			destination = route.destination;
			break;
		}
	}
	if (!match) throw new Error("没有匹配的归档规则");

	const date = localDate(now);
	const values = { date, year: date.slice(0, 4) };
	const target = normalize(validateTarget(expandTemplate(destination, values, match), sourcePath));
	if (target === sourcePath) throw new Error("归档目标不能与源文件相同");
	if (targetExists(target)) throw new Error("目标位置已存在同名文件");

	const changes = new Map<string, string>();
	const resolved = new Set<string>();
	for (const rule of rules.properties) {
		if (resolved.has(rule.key) || !conditionsMatch(rule.when, frontmatter)) continue;
		resolved.add(rule.key);
		if (rule.action === "set") changes.set(rule.key, expandPropertyTemplate(rule.value!, values));
	}
	return { target, changes };
}

export function localDate(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validateSettings(value: unknown): VaultArchiveSettings {
	const root = objectAt(value, "");
	exactKeys(root, ["showCommandPatterns", "archive"], "");
	const showCommandPatterns = stringArrayAt(root.showCommandPatterns, "/showCommandPatterns");
	const archive = validateArchiveRules(root.archive, "/archive");
	return { showCommandPatterns, archive };
}

export function validateArchiveRules(value: unknown, pointer = ""): ArchiveRules {
	const root = objectAt(value, pointer);
	exactKeys(root, ["routes", "properties"], pointer);
	if (!Array.isArray(root.routes)) fail(`${pointer}/routes`, "必须是数组");
	if (!Array.isArray(root.properties)) fail(`${pointer}/properties`, "必须是数组");
	const routes = root.routes.map((entry, index) => validateRoute(entry, `${pointer}/routes/${index}`));
	const properties = root.properties.map((entry, index) => validateProperty(entry, `${pointer}/properties/${index}`));
	return { routes, properties };
}

function validateRoute(value: unknown, pointer: string): ArchiveRoute {
	const route = objectAt(value, pointer);
	exactKeys(route, ["pattern", "destination"], pointer);
	const pattern = trimmedStringAt(route.pattern, `${pointer}/pattern`);
	const destination = trimmedStringAt(route.destination, `${pointer}/destination`);
	validateTemplate(destination, `${pointer}/destination`, true);
	return { pattern, destination };
}

function validateProperty(value: unknown, pointer: string): PropertyRule {
	const rule = objectAt(value, pointer);
	exactKeys(rule, ["key", "action", "value", "when"], pointer, true);
	const key = trimmedStringAt(rule.key, `${pointer}/key`);
	if (rule.action !== "set" && rule.action !== "keep") fail(`${pointer}/action`, '必须是 "set" 或 "keep"');
	if (rule.action === "set") {
		if (typeof rule.value !== "string") fail(`${pointer}/value`, "set 必须提供字符串 value");
		validatePropertyTemplate(rule.value, `${pointer}/value`);
	} else if ("value" in rule) {
		fail(`${pointer}/value`, "keep 必须省略 value");
	}
	let when: PropertyCondition[] | undefined;
	if ("when" in rule) {
		if (!Array.isArray(rule.when) || rule.when.length === 0) fail(`${pointer}/when`, "必须是非空数组");
		when = rule.when.map((entry, index) => validateCondition(entry, `${pointer}/when/${index}`));
	}
	return rule.action === "set" ? { key, action: "set", value: rule.value as string, ...(when ? { when } : {}) } : { key, action: "keep", ...(when ? { when } : {}) };
}

function validateCondition(value: unknown, pointer: string): PropertyCondition {
	const condition = objectAt(value, pointer);
	exactKeys(condition, ["key", "operator", "value"], pointer, true);
	const key = trimmedStringAt(condition.key, `${pointer}/key`);
	if (condition.operator !== "empty" && condition.operator !== "notEmpty" && condition.operator !== "equals") {
		fail(`${pointer}/operator`, '必须是 "empty"、"notEmpty" 或 "equals"');
	}
	if (condition.operator === "equals") {
		if (typeof condition.value !== "string") fail(`${pointer}/value`, "equals 必须提供字符串 value");
		return { key, operator: "equals", value: condition.value };
	}
	if ("value" in condition) fail(`${pointer}/value`, `${condition.operator} 必须省略 value`);
	return { key, operator: condition.operator };
}

function compileRoutes(routes: readonly ArchiveRoute[], pointer: string): CompiledArchiveRoute[] {
	return routes.map((route, index) => {
		try {
			return { ...route, regex: new RegExp(route.pattern, "u") };
		} catch (error) {
			throw new Error(`${pointer}/routes/${index}/pattern: 无效正则：${errorMessage(error)}`);
		}
	});
}

function validateTemplate(template: string, pointer: string, captures: boolean): void {
	const token = captures ? /\{\{(?:date|year)\}\}|\$\$|\$[1-9](?!\d)/uy : /\{\{(?:date|year)\}\}/uy;
	const specialPattern = captures ? /\{\{|\$/u : /\{\{/u;
	let index = 0;
	while (index < template.length) {
		const special = template.slice(index).search(specialPattern);
		if (special < 0) return;
		index += special;
		token.lastIndex = index;
		const match = token.exec(template);
		if (!match) fail(pointer, `不支持的模板标记（位置 ${index + 1}）`);
		index = token.lastIndex;
	}
}

function validatePropertyTemplate(template: string, pointer: string): void {
	validateTemplate(template, pointer, false);
}

function expandTemplate(template: string, values: { date: string; year: string }, match?: RegExpExecArray): string {
	return template.replace(/\{\{date\}\}|\{\{year\}\}|\$\$|\$[1-9]/gu, (token) => {
		if (token === "{{date}}") return values.date;
		if (token === "{{year}}") return values.year;
		if (token === "$$") return "$";
		return match?.[Number(token[1])] ?? "";
	});
}

function expandPropertyTemplate(template: string, values: { date: string; year: string }): string {
	return template.replace(/\{\{date\}\}|\{\{year\}\}/gu, (token) => token === "{{date}}" ? values.date : values.year);
}

function validateTarget(target: string, sourcePath: string): string {
	if (!target) throw new Error("归档目标路径不能为空");
	if (/^[A-Za-z]:/u.test(target) || target.startsWith("/") || target.includes("\\") || hasControlCharacter(target)) {
		throw new Error("归档目标必须是 Vault 内相对路径");
	}
	const parts = target.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error("归档目标包含无效路径段");
	if (target === sourcePath) throw new Error("归档目标不能与源文件相同");
	return target;
}

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}

function conditionsMatch(conditions: readonly PropertyCondition[] | undefined, frontmatter: Readonly<Record<string, unknown>>): boolean {
	return conditions?.every((condition) => {
		const exists = Object.prototype.hasOwnProperty.call(frontmatter, condition.key);
		const value = exists ? frontmatter[condition.key] : undefined;
		if (condition.operator === "equals") return typeof value === "string" && value === condition.value;
		const empty = !exists || value === null || (typeof value === "string" && value.trim() === "");
		return condition.operator === "empty" ? empty : !empty;
	}) ?? true;
}

function objectAt(value: unknown, pointer: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail(pointer || "/", "必须是对象");
	return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, allowed: readonly string[], pointer: string, optional = false): void {
	for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${pointer}/${key}`, "未知字段");
	if (!optional) for (const key of allowed) if (!(key in object)) fail(`${pointer}/${key}`, "缺少字段");
}

function stringArrayAt(value: unknown, pointer: string): string[] {
	if (!Array.isArray(value)) fail(pointer, "必须是数组");
	return value.map((entry, index) => trimmedStringAt(entry, `${pointer}/${index}`));
}

function trimmedStringAt(value: unknown, pointer: string): string {
	if (typeof value !== "string" || value.length === 0 || value.trim() !== value) fail(pointer, "必须是非空且首尾无空白的字符串");
	return value;
}

function fail(pointer: string, message: string): never {
	throw new Error(`${pointer || "/"}: ${message}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
