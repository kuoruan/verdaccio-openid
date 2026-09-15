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

const CHANGESET_MARKER = "<!-- zh-CN -->";
const CHANGE_TYPES = ["minor", "patch", "major"];

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
      return parseChangeset(content, file);
    }),
  );
}

async function updateChangelogs(version, date, entries) {
  const [english, chinese] = await Promise.all([
    readFile(englishChangelogPath, "utf8"),
    readFile(chineseChangelogPath, "utf8"),
  ]);

  const englishSection = formatReleaseSection(version, date, entries, "english");
  await writeFile(englishChangelogPath, replaceReleaseSection(english, version, englishSection));

  if (chinese.includes(`## v${version} (`)) {
    return;
  }

  const chineseSection = formatReleaseSection(version, date, entries, "chinese");
  const headingEnd = chinese.indexOf("\n");
  const updated = `${chinese.slice(0, headingEnd + 1)}\n${chineseSection}\n\n${chinese.slice(headingEnd + 1)}`;
  await writeFile(chineseChangelogPath, updated);
}

function runChangesetVersion() {
  return execFileAsync("pnpm", ["changeset", "version"], { cwd: root, stdio: "inherit" });
}

function parseChangeset(content, fileName) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const frontmatterEnd = lines.indexOf("---", 1);
  const markerIndex = lines.findIndex((line, index) => index > frontmatterEnd && line.trim() === CHANGESET_MARKER);
  const packageLine = lines
    .slice(1, frontmatterEnd)
    .map((line) => line.trim())
    .find((line) => line.startsWith('"verdaccio-openid":') || line.startsWith("verdaccio-openid:"));
  const type = packageLine?.slice(packageLine.indexOf(":") + 1).trim();

  if (frontmatterEnd === -1 || markerIndex === -1 || !CHANGE_TYPES.includes(type)) {
    throw new Error(`${fileName} must contain a valid changeset with a ${CHANGESET_MARKER} section`);
  }

  return {
    type,
    english: lines
      .slice(frontmatterEnd + 1, markerIndex)
      .join("\n")
      .trim(),
    chinese: lines
      .slice(markerIndex + 1)
      .join("\n")
      .trim(),
  };
}

function formatReleaseSection(version, date, entries, language) {
  const groups = CHANGE_TYPES.flatMap((type) => {
    const changes = entries.filter((entry) => entry.type === type);
    if (changes.length === 0) {
      return [];
    }

    const heading = type[0].toUpperCase() + type.slice(1);
    const lines = changes.map(({ english, chinese }) => {
      const text = language === "chinese" ? chinese : english;
      return `- ${text.replace(/\n+/g, " ")}`;
    });

    return [`### ${heading} Changes`, "", ...lines, ""];
  });

  return [`## ${language === "chinese" ? "v" : ""}${version} (${date})`, "", ...groups].join("\n").trim();
}

function replaceReleaseSection(changelog, version, section) {
  const heading = `## ${version}`;
  const start = changelog.indexOf(heading);
  if (start === -1) {
    return changelog;
  }

  const end = changelog.indexOf("\n## ", start + heading.length);
  return `${changelog.slice(0, start)}${section}${end === -1 ? "\n" : `\n${changelog.slice(end)}`}`;
}
