# Vault Archive

Vault Archive is an Obsidian plugin that archives Markdown notes with configurable visibility, destination, and frontmatter rules. Visibility and archive routing are independent: a command can be visible even when no route matches, in which case the file is left unchanged and an error is shown.

Requires Obsidian 1.4.4 or newer.

## Configuration

### Command visibility patterns

Enter one JavaScript regular expression per line. A Markdown file shows the **归档** menu item when any expression matches its Vault-relative path. Expressions use the Unicode flag and are case-sensitive.

### Archive rules

Archive rules are a JSON object with ordered `routes` and `properties` arrays:

```json
{
  "routes": [
    {
      "pattern": "^20-知识/([^/]+)/(?:.*/)?([^/]+\\.md)$",
      "destination": "90-归档/$1/{{year}}/$2"
    }
  ],
  "properties": [
    { "key": "状态", "action": "set", "value": "已归档" },
    { "key": "归档日期", "action": "set", "value": "{{date}}" }
  ]
}
```

The first matching route wins. Destination templates support `$1` through `$9`, `$$`, `{{date}}`, and `{{year}}`. Property rules are evaluated against the original top-level frontmatter snapshot; the first matching rule for each key wins. Conditions use `empty`, `notEmpty`, or string-only `equals`. A `keep` action marks a key as resolved without changing it.

Use **验证并保存** to validate and persist both editors atomically, or **恢复默认规则** to restore the built-in configuration. Invalid settings never replace the active rules.

## Development

Node.js 22.6 or newer is required.

```sh
npm ci
npm run lint
npm test
npm run build
```

The production build is the single `main.js` file.

## Manual installation

Build the plugin, then copy `main.js` and `manifest.json` into:

```text
<Vault>/.obsidian/plugins/vault-archive/
```

Alternatively, set the Vault path and run the dependency-free installer:

```sh
OBSIDIAN_VAULT_PATH="/path/to/vault" npm run install:local
```

Enable **Vault Archive** in Obsidian's community plugin settings.

## Release

Set the package version with `npm version`, commit `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, then push a tag exactly equal to the version (for example, `1.1.0`, without a `v` prefix). The release workflow builds and creates a draft GitHub release containing `main.js` and `manifest.json`.
