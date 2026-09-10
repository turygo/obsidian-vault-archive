import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	{
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.mts", "manifest.json", "scripts/install-local.mjs", "test/*.mjs"] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["scripts/**/*.mjs", "test/**/*.mjs"],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			"no-console": "off",
			"obsidianmd/hardcoded-config-path": "off",
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/platform": "off",
			"obsidianmd/rule-custom-message": "off",
		},
	},
	{
		files: ["src/settings.ts"],
		rules: {
			"@typescript-eslint/no-deprecated": "off",
			"obsidianmd/settings-tab/no-deprecated-display": "off",
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"obsidianmd/settings-tab/prefer-update-over-display": "off",
		},
	},
);
