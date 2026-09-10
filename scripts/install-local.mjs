import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
if (!vaultPath) throw new Error("请设置 OBSIDIAN_VAULT_PATH");

const destination = join(vaultPath, ".obsidian", "plugins", "vault-archive");
await mkdir(destination, { recursive: true });
for (const file of ["main.js", "manifest.json", ...(existsSync("styles.css") ? ["styles.css"] : [])]) {
	await copyFile(file, join(destination, file));
}
console.log(`Vault Archive installed to ${destination}`);
