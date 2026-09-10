export function compileVisibilityPatterns(patterns: readonly string[]): RegExp[] {
	return patterns.map((pattern, index) => {
		try {
			return new RegExp(pattern, "u");
		} catch (error) {
			throw new Error(`命令展示规则第 ${index + 1} 行：无效正则：${errorMessage(error)}`);
		}
	});
}

export function shouldShowArchiveCommand(path: string, patterns: readonly RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(path));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
