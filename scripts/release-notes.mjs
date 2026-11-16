/**
 * Put the Chinese half of a release next to the English one on GitHub.
 *
 * `changesets/action` renders both the version pull request body and the GitHub
 * release notes from the English-only `CHANGELOG.md`, and it reads that file by a
 * hard-coded name, so the Chinese section of `CHANGELOG.zh-CN.md` is added here:
 * appended to the pull request body, and composed into the release notes.
 *
 * Usage:
 *   node scripts/release-notes.mjs pr <number>
 *   node scripts/release-notes.mjs release [tag]
 *   node scripts/release-notes.mjs notes [version]
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ENGLISH_CHANGELOG = "CHANGELOG.md";
const CHINESE_CHANGELOG = "CHANGELOG.zh-CN.md";
/** Delimit the block appended to a pull request body, so a re-run replaces it. */
const BLOCK_START = "<!-- release-notes:zh:start -->";
const BLOCK_END = "<!-- release-notes:zh:end -->";

/**
 * Read the section a heading introduces, up to the next section of the same level.
 *
 * @param changelog the content of a changelog
 * @param heading the heading to read, without the leading `#`
 * @returns the section body, or an empty string when the changelog has no such heading
 */
export function sectionUnder(changelog, heading) {
  const start = changelog.indexOf(`${heading}\n`);

  if (start === -1) {
    return "";
  }

  const bodyStart = start + heading.length + 1;

  // `\n## ` skips the `### Changes` blocks; `## ` alone would match them.
  const end = changelog.indexOf("\n## ", bodyStart);

  return (end === -1 ? changelog.slice(bodyStart) : changelog.slice(bodyStart, end)).trim();
}

/**
 * Read the English section of a release.
 *
 * @param changelog the content of `CHANGELOG.md`
 * @param version the version to read
 * @returns the section body, or an empty string when it is missing
 */
export function englishSection(changelog, version) {
  return sectionUnder(changelog, `## ${version}`);
}

/**
 * Read the Chinese section of a release, whose heading carries a `v` prefix.
 *
 * @param changelog the content of `CHANGELOG.zh-CN.md`
 * @param version the version to read
 * @returns the section body, or an empty string when it is missing
 */
export function chineseSection(changelog, version) {
  return sectionUnder(changelog, `## v${version}`);
}

/**
 * Fail loudly when a changelog has no section for the version being released,
 * rather than publish a release with one language silently missing.
 *
 * @param version the version being released
 * @param english the English section, possibly empty
 * @param chinese the Chinese section, possibly empty
 * @returns both sections
 */
export function requireSections(version, english, chinese) {
  const missing = [!english && ENGLISH_CHANGELOG, !chinese && CHINESE_CHANGELOG].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`No section for ${version} in ${missing.join(" and ")}`);
  }

  return { english, chinese };
}

/**
 * Wrap the Chinese section in markers a re-run can find again.
 *
 * @param chinese the Chinese section
 * @returns the block to append to a pull request body
 */
export function chineseBlock(chinese) {
  return `${BLOCK_START}\n## 中文\n\n${chinese}\n${BLOCK_END}`;
}

/**
 * Replace the block an earlier run appended, or append it for the first time.
 *
 * Everything outside the block is kept, so whatever `changesets/action` wrote —
 * or a maintainer added — survives.
 *
 * @param body the pull request body
 * @param block the block to insert
 * @returns the body to write back
 */
export function withChineseBlock(body, block) {
  const start = body.indexOf(BLOCK_START);
  const end = body.indexOf(BLOCK_END, start);

  if (start !== -1 && end !== -1) {
    return `${body.slice(0, start)}${block}${body.slice(end + BLOCK_END.length)}`;
  }

  const existing = body.trimEnd();

  return existing ? `${existing}\n\n${block}` : block;
}

/**
 * Compose the notes a release is created with.
 *
 * @param english the English section
 * @param chinese the Chinese section
 * @returns the release notes
 */
export function releaseNotes(english, chinese) {
  return `${english}\n\n---\n\n## 中文\n\n${chinese}\n`;
}

/** Run `gh` with the arguments given, never through a shell. */
function gh(args) {
  return execFileAsync("gh", args);
}

/**
 * Run a command and report whether it succeeded, without hiding a real failure.
 *
 * @param args the `gh` arguments that look something up
 * @returns whether the lookup found anything
 */
async function exists(args) {
  try {
    await gh(args);

    return true;
  } catch (error) {
    if (/release not found|HTTP 404|no releases found/i.test(error.stderr ?? "")) {
      return false;
    }

    throw error;
  }
}

/**
 * Add the Chinese section to a pull request body.
 *
 * @param number the pull request number
 * @param block the block to insert
 */
async function updatePullRequest(number, block) {
  const { stdout } = await gh(["pr", "view", number, "--json", "body", "--jq", ".body"]);
  const body = withChineseBlock(stdout, block);

  if (body === stdout) {
    return;
  }

  await gh(["pr", "edit", number, "--body", body]);
}

/**
 * Create the release with bilingual notes, unless it is already there.
 *
 * Safe to re-run: an existing release is left untouched, and a version whose tag
 * was never pushed is skipped instead of failing the job.
 *
 * @param tag the release tag
 * @param notes the release notes
 */
async function createRelease(tag, notes) {
  if (await exists(["release", "view", tag, "--json", "tagName"])) {
    console.log(`Release ${tag} already exists, leaving it alone.`);

    return;
  }

  const { stdout } = await execFileAsync("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]);

  if (!stdout.trim()) {
    console.log(`Tag ${tag} is not on the remote, nothing to release.`);

    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "verdaccio-openid-release-"));
  const notesFile = join(directory, "notes.md");

  await writeFile(notesFile, notes);

  try {
    await gh(["release", "create", tag, "--title", tag, "--verify-tag", "--notes-file", notesFile]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Read both changelogs and run the requested action.
 *
 * @param argv the command line arguments, `[subject, target?]`
 */
export async function main(argv) {
  const [subject, target] = argv;
  const { version: current } = JSON.parse(await readFile("package.json", "utf8"));
  const version = subject === "notes" && target ? target : current;
  const { english, chinese } = requireSections(
    version,
    englishSection(await readFile(ENGLISH_CHANGELOG, "utf8"), version),
    chineseSection(await readFile(CHINESE_CHANGELOG, "utf8"), version),
  );

  if (subject === "pr" && target) {
    await updatePullRequest(target, chineseBlock(chinese));
  } else if (subject === "release") {
    await createRelease(target ?? `v${version}`, releaseNotes(english, chinese));
  } else if (subject === "notes") {
    process.stdout.write(releaseNotes(english, chinese));
  } else {
    throw new Error("usage: release-notes.mjs pr <number> | release [tag] | notes [version]");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
