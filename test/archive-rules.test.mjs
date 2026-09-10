import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_SETTINGS,
	compileEditedSettings,
	compileSettings,
	resolveArchivePlan,
} from "../src/archive-rules.ts";
import { compileVisibilityPatterns, shouldShowArchiveCommand } from "../src/visibility.ts";

const identity = (path) => path;
const now = new Date(2026, 8, 10);

test("展示规则按 OR 匹配并报告正则行号", () => {
	const patterns = compileVisibilityPatterns(["^00-", "^20-"]);
	assert.equal(shouldShowArchiveCommand("20-知识/示例.md", patterns), true);
	assert.equal(shouldShowArchiveCommand("30-项目/示例.md", patterns), false);
	assert.throws(() => compileVisibilityPatterns(["ok", "["]), /第 2 行/u);
});

test("默认规则展开捕获组和本地日期并遵守属性优先级", () => {
	const compiled = compileSettings(DEFAULT_SETTINGS);
	const plan = resolveArchivePlan(
		"20-知识/新闻/WSJ/通胀制造的幽灵收益该减税吗.md",
		{ 状态: "过期", 替代文档: "[[新版]]" },
		compiled.settings.archive,
		compiled.routes,
		() => false,
		identity,
		now,
	);
	assert.equal(plan.target, "90-归档/新闻/2026/通胀制造的幽灵收益该减税吗.md");
	assert.deepEqual(plan.changes, new Map([["状态", "已归档"], ["归档日期", "2026-09-10"], ["归档原因", "被新版本替代"]]));

	const kept = resolveArchivePlan(
		"00-收件箱/示例.md",
		{ 归档原因: "人工判断" },
		compiled.settings.archive,
		compiled.routes,
		() => false,
		identity,
		now,
	);
	assert.equal(kept.changes.has("归档原因"), false);
});

test("规划拒绝无路由、重名、非法模板和未知 schema 字段", () => {
	const noRoute = compileEditedSettings(["^20-知识/"], { routes: [], properties: [] });
	assert.equal(shouldShowArchiveCommand("20-知识/示例.md", noRoute.visibilityPatterns), true);
	assert.throws(
		() => resolveArchivePlan("20-知识/示例.md", {}, noRoute.settings.archive, noRoute.routes, () => false, identity, now),
		/没有匹配的归档规则/u,
	);
	const compiled = compileSettings(DEFAULT_SETTINGS);
	assert.throws(
		() => resolveArchivePlan("00-收件箱/示例.md", {}, compiled.settings.archive, compiled.routes, () => true, identity, now),
		/已存在同名文件/u,
	);
	assert.throws(
		() => compileEditedSettings([], { routes: [{ pattern: "x", destination: "$10.md" }], properties: [] }),
		/\/routes\/0\/destination/u,
	);
	assert.throws(
		() => compileEditedSettings([], { routes: [], properties: [], extra: true }),
		/\/extra: 未知字段/u,
	);
});
