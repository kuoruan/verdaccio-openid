/**
 * Tests for the script that shows the Chinese release section on GitHub.
 *
 * `changesets/action` renders the version pull request body and the release notes
 * from the English-only `CHANGELOG.md`, so the script appends the Chinese section
 * itself. These tests pin how a section is read and how a body is left intact.
 */
import { describe, expect, it } from "vitest";

import {
  chineseBlock,
  chineseSection,
  englishSection,
  releaseNotes,
  requireSections,
  sectionUnder,
  withChineseBlock,
} from "../../scripts/release-notes.mjs";

const ENGLISH_CHANGELOG = `# verdaccio-openid

## 0.19.1

_Released 2026-11-16_

### Patch Changes

- English one.

## 0.19.0 (2026-09-15)

### Minor Changes

- Older English.
`;

const CHINESE_CHANGELOG = `# verdaccio-openid

## v0.19.1

_发布于 2026-11-16_

### Patch Changes

- 中文一。

## v0.19.0 (2026-09-15)

### Minor Changes

- 旧的中文。
`;

describe("changelog sections", () => {
  it("reads only the requested version from the English changelog", () => {
    const section = englishSection(ENGLISH_CHANGELOG, "0.19.1");

    expect(section).toContain("English one.");
    expect(section).not.toContain("Older English");
  });

  it("reads only the requested version from the Chinese changelog", () => {
    const section = chineseSection(CHINESE_CHANGELOG, "0.19.1");

    expect(section).toContain("中文一。");
    expect(section).not.toContain("旧的中文");
  });

  it("keeps the two changelogs apart", () => {
    expect(englishSection(ENGLISH_CHANGELOG, "0.19.1")).not.toMatch(/[\u4e00-\u9fa5]/);
    expect(chineseSection(CHINESE_CHANGELOG, "0.19.1")).not.toContain("English");
  });

  it("matches the whole heading, so a longer version is not read", () => {
    const changelog = `# verdaccio-openid\n\n## 0.19.10\n\n- Newer minor.\n`;

    expect(sectionUnder(changelog, "## 0.19.1")).toBe("");
    expect(sectionUnder(changelog, "## 0.19.10")).toBe("- Newer minor.");
  });

  it("returns an empty section when the version is missing", () => {
    expect(englishSection(ENGLISH_CHANGELOG, "0.20.0")).toBe("");
    expect(chineseSection(CHINESE_CHANGELOG, "0.20.0")).toBe("");
  });

  it("reads the last section of a changelog without a following heading", () => {
    expect(sectionUnder("# verdaccio-openid\n\n## 0.1.0\n\n- Only entry.\n", "## 0.1.0")).toBe("- Only entry.");
  });
});

describe("requireSections", () => {
  it("names the changelog that has no section for the version", () => {
    expect(() => requireSections("0.19.1", "English one.", "")).toThrow(/CHANGELOG\.zh-CN\.md/);
    expect(() => requireSections("0.19.1", "", "中文一。")).toThrow(/CHANGELOG\.md/);
    expect(() => requireSections("0.19.1", "", "")).toThrow(/CHANGELOG\.md and CHANGELOG\.zh-CN\.md/);
  });

  it("passes both sections through when they are there", () => {
    expect(requireSections("0.19.1", "English one.", "中文一。")).toEqual({
      english: "English one.",
      chinese: "中文一。",
    });
  });
});

describe("withChineseBlock", () => {
  const block = chineseBlock("_发布于 2026-11-16_\n\n### Patch Changes\n\n- 中文一。");

  it("wraps the Chinese section in the markers a re-run looks for", () => {
    expect(block.startsWith("<!-- release-notes:zh:start -->")).toBe(true);
    expect(block.endsWith("<!-- release-notes:zh:end -->")).toBe(true);
  });

  it("appends the block to the body and keeps what is already there", () => {
    const body = "This PR was opened by the Changesets release action.\n\n# Releases\n";

    expect(withChineseBlock(body, block)).toBe(`${body.trimEnd()}\n\n${block}`);
  });

  it("replaces its own block on a second run instead of appending again", () => {
    const once = withChineseBlock("Header.\n", block);
    const twice = withChineseBlock(once, chineseBlock("- 中文二。"));

    expect(twice.split("<!-- release-notes:zh:start -->")).toHaveLength(2);
    expect(twice).toContain("中文二。");
    expect(twice).not.toContain("中文一。");
    expect(twice.startsWith("Header.")).toBe(true);
  });

  it("keeps whatever is written after the block", () => {
    const body = `Header.\n\n${block}\n\nTrailing note added by hand.`;
    const updated = withChineseBlock(body, chineseBlock("- 中文二。"));

    expect(updated).toContain("Trailing note added by hand.");
    expect(updated).toContain("中文二。");
    expect(updated).not.toContain("中文一。");
  });

  it("does not touch a body that has no block yet beyond appending one", () => {
    const body = "Header.";

    expect(withChineseBlock(body, block).endsWith(block)).toBe(true);
  });
});

describe("releaseNotes", () => {
  it("puts the Chinese section under the English one", () => {
    const notes = releaseNotes("_Released 2026-11-16_", "_发布于 2026-11-16_");

    expect(notes).toBe("_Released 2026-11-16_\n\n---\n\n## 中文\n\n_发布于 2026-11-16_\n");
  });
});
