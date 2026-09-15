import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesetDirectory = resolve(root, ".changeset");
const packagePath = resolve(root, "package.json");
const englishChangelogPath = resolve(root, "CHANGELOG.md");
const chineseChangelogPath = resolve(root, "CHANGELOG.zh-CN.md");
const execFileAsync = promisify(execFile);

const entries = await readChineseEntries();
if (entries.length > 0) {
  await runChangesetVersion();

  const { version } = JSON.parse(await readFile(packagePath, "utf8"));
  await updateChangelogs(version, new Date().toISOString().slice(0, 10), entries);
}

async function readChineseEntries() {
  const files = (await readdir(changesetDirectory))
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(resolve(changesetDirectory, file), "utf8");
      const marker = content.match(/(?:^|\n)<!--\s*zh-CN\s*-->\s*\n([\s\S]*)$/);

      if (!marker) {
        throw new Error(`${file} must contain a <!-- zh-CN --> section`);
      }

      return marker[1].trim();
    }),
  );
}

async function updateChangelogs(version, date, entries) {
  const [english, chinese] = await Promise.all([
    readFile(englishChangelogPath, "utf8"),
    readFile(chineseChangelogPath, "utf8"),
  ]);

  const englishHeading = `## ${version}`;
  if (english.includes(`${englishHeading}\n`)) {
    await writeFile(englishChangelogPath, english.replace(`${englishHeading}\n`, `${englishHeading} (${date})\n`));
  }

  if (chinese.includes(`## v${version} (`)) {
    return;
  }

  const section = `## v${version} (${date})\n\n${entries
    .map((entry) => `- ${entry.replaceAll("\n", "\n  ")}`)
    .join("\n")}\n\n`;
  const headingEnd = chinese.indexOf("\n");
  const updated = `${chinese.slice(0, headingEnd + 1)}\n${section}${chinese.slice(headingEnd + 1)}`;

  await writeFile(chineseChangelogPath, updated);
}

function runChangesetVersion() {
  return execFileAsync("pnpm", ["changeset", "version"], { cwd: root, stdio: "inherit" });
}
