import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesetDirectory = resolve(root, ".changeset");
const packagePath = resolve(root, "package.json");
const chineseChangelogPath = resolve(root, "CHANGELOG.zh-CN.md");

const files = (await readdir(changesetDirectory)).filter((file) => file.endsWith(".md") && file !== "README.md").sort();

const entries = await Promise.all(
  files.map(async (file) => {
    const content = await readFile(resolve(changesetDirectory, file), "utf8");
    const marker = content.match(/(?:^|\n)<!--\s*zh-CN\s*-->\s*\n([\s\S]*)$/);

    if (!marker) {
      throw new Error(`${file} must contain a <!-- zh-CN --> section`);
    }

    return marker[1].trim();
  }),
);

if (entries.length === 0) {
  process.exit(0);
}

await runChangesetVersion();

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const date = new Date().toISOString().slice(0, 10);
const existing = await readFile(chineseChangelogPath, "utf8");

if (existing.includes(`## v${packageJson.version} (`)) {
  process.exit(0);
}

const section = `## v${packageJson.version} (${date})\n\n${entries
  .map((entry) => `- ${entry.replaceAll("\n", "\n  ")}`)
  .join("\n")}\n\n`;
const headingEnd = existing.indexOf("\n");
const updated = `${existing.slice(0, headingEnd + 1)}\n${section}${existing.slice(headingEnd + 1)}`;

await writeFile(chineseChangelogPath, updated);

function runChangesetVersion() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["changeset", "version"], {
      cwd: root,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`changeset version exited with code ${code}`));
      }
    });
  });
}
