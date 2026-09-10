import assert from "node:assert/strict";
import test from "node:test";
import { executeArchive, runExclusiveArchive } from "../src/archive.ts";
import { DEFAULT_SETTINGS, compileEditedSettings, compileSettings } from "../src/archive-rules.ts";
import { restoreDefaultEditorState } from "../src/settings-state.ts";

const compiled = compileSettings(DEFAULT_SETTINGS);
const identity = (path) => path;

function createApp(file, failRename = false) {
	const entries = new Map([[file.path, file]]);
	const created = [];
	return {
		entries,
		created,
		app: {
			vault: {
				getAbstractFileByPath: (path) => entries.get(path) ?? null,
				createFolder: async (path) => {
					created.push(path);
					entries.set(path, { path, children: [] });
				},
			},
			fileManager: {
				processFrontMatter: async (target, update) => update(target.frontmatter),
				renameFile: async (target, path) => {
					if (failRename) throw new Error("模拟移动失败");
					entries.delete(target.path);
					target.path = path;
					entries.set(path, target);
				},
			},
		},
	};
}

test("归档递归创建目录并通过 renameFile 移动", async () => {
	const file = { path: "00-收件箱/示例.md", frontmatter: { 状态: "待读", 其他: "保留" } };
	const mock = createApp(file);
	const target = await executeArchive(mock.app, file, compiled.settings.archive, compiled.routes, identity, new Date(2026, 8, 10));
	assert.equal(target, "90-归档/收藏/2026/示例.md");
	assert.deepEqual(mock.created, ["90-归档", "90-归档/收藏", "90-归档/收藏/2026"]);
	assert.deepEqual(file.frontmatter, { 状态: "已归档", 其他: "保留", 归档日期: "2026-09-10", 归档原因: "无后续价值" });
});

test("移动失败恢复 set 字段及字段原本不存在的状态", async () => {
	const file = { path: "00-收件箱/回滚.md", frontmatter: { 状态: "待读", 其他: "保留" } };
	const mock = createApp(file, true);
	await assert.rejects(
		executeArchive(mock.app, file, compiled.settings.archive, compiled.routes, identity, new Date(2026, 8, 10)),
		/模拟移动失败/u,
	);
	assert.deepEqual(file.frontmatter, { 状态: "待读", 其他: "保留" });
});

test("同一文件的归档事务拒绝重入并在结束后释放锁", async () => {
	const inFlight = new WeakSet();
	const file = {};
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const first = runExclusiveArchive(inFlight, file, async () => {
		await gate;
		return "完成";
	});
	assert.deepEqual(await runExclusiveArchive(inFlight, file, async () => "不应执行"), { started: false });
	release();
	assert.deepEqual(await first, { started: true, value: "完成" });
	assert.deepEqual(await runExclusiveArchive(inFlight, file, async () => "再次执行"), { started: true, value: "再次执行" });
});

test("特殊 Frontmatter key 作为自有数据属性写入且条件不读取原型", async () => {
	const special = compileEditedSettings([], {
		routes: [{ pattern: "^00-收件箱/(.+\\.md)$", destination: "90-归档/$1" }],
		properties: [
			{ key: "__proto__", action: "set", value: "安全" },
			{ key: "constructor", action: "set", value: "构造值" },
			{ key: "原型为空", action: "set", value: "是", when: [{ key: "constructor", operator: "empty" }] },
		],
	});
	const file = { path: "00-收件箱/特殊.md", frontmatter: {} };
	const prototype = Object.getPrototypeOf(file.frontmatter);
	await executeArchive(createApp(file).app, file, special.settings.archive, special.routes, identity, new Date(2026, 8, 10));
	assert.equal(Object.getPrototypeOf(file.frontmatter), prototype);
	assert.equal(Object.prototype.hasOwnProperty.call(file.frontmatter, "__proto__"), true);
	assert.equal(file.frontmatter["__proto__"], "安全");
	assert.equal(file.frontmatter.constructor, "构造值");
	assert.equal(file.frontmatter.原型为空, "是");
	assert.equal(Object.getOwnPropertyDescriptor(file.frontmatter, "__proto__").enumerable, true);
});

test("恢复默认持久化失败时保留编辑原文", async () => {
	const state = { showPatternsText: "原展示规则", archiveJson: "原归档规则" };
	await assert.rejects(
		restoreDefaultEditorState(state, async () => {
			throw new Error("模拟 saveData 失败");
		}),
		/模拟 saveData 失败/u,
	);
	assert.deepEqual(state, { showPatternsText: "原展示规则", archiveJson: "原归档规则" });
});
