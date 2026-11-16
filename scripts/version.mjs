import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesetDirectory = resolve(root, ".changeset");
const packagePath = resolve(root, "package.json");
const execFileAsync = promisify(execFile);

const CHANGESET_MARKER = "<!-- zh-CN -->";
/** Most severe first, the order `changesets` itself writes the sections in. */
const CHANGE_TYPES = ["major", "minor", "patch"];

/**
 * The changelogs a release writes, and how each one renders a release.
 *
 * The English heading has to be exactly `## <version>`: `changesets/action`
 * looks the entry up by matching the heading text against the version, and falls
 * back to the whole file when nothing matches.
 */
const CHANGELOGS = [
  {
    path: resolve(root, "CHANGELOG.md"),
    heading: (version) => `## ${version}`,
    releasedOn: (date) => `_Released ${date}_`,
    text: (entry) => entry.english,
  },
  {
    path: resolve(root, "CHANGELOG.zh-CN.md"),
    heading: (version) => `## v${version}`,
    releasedOn: (date) => `_发布于 ${date}_`,
    text: (entry) => entry.chinese,
  },
];

const entries = await readChangesets();
if (entries.length > 0) {
  await runChangesetVersion();

  const { version } = JSON.parse(await readFile(packagePath, "utf8"));
  await updateChangelogs(version, new Date().toISOString().slice(0, 10), entries);
}

async function readChangesets() {
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
  await Promise.all(
    CHANGELOGS.map(async (changelog) => {
      const content = await readFile(changelog.path, "utf8");

      await writeFile(changelog.path, upsertReleaseSection(content, changelog, version, date, entries));
    }),
  );
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

function formatReleaseSection({ heading, releasedOn, text }, version, date, entries) {
  const groups = CHANGE_TYPES.flatMap((type) => {
    const lines = entries
      .filter((entry) => entry.type === type)
      .map((entry) => `- ${text(entry).replace(/\n+/g, " ")}`);

    if (lines.length === 0) {
      return [];
    }

    const title = type[0].toUpperCase() + type.slice(1);

    return [`### ${title} Changes`, "", ...lines, ""];
  });

  return [heading(version), "", releasedOn(date), "", ...groups].join("\n").trim();
}

function upsertReleaseSection(content, changelog, version, date, entries) {
  const section = formatReleaseSection(changelog, version, date, entries);
  const heading = `${changelog.heading(version)}\n`;
  const start = content.indexOf(heading);

  if (start !== -1) {
    // `\n## ` skips the `### Patch Changes` blocks; `## ` alone would match them.
    const end = content.indexOf("\n## ", start + heading.length);

    return `${content.slice(0, start)}${section}${end === -1 ? "\n" : `\n${content.slice(end)}`}`;
  }

  // No entry yet: insert it right under the file's title.
  const titleEnd = content.indexOf("\n");

  return `${content.slice(0, titleEnd + 1)}\n${section}\n${content.slice(titleEnd + 1)}`;
}
