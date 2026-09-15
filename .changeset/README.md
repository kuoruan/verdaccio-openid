# Changesets

This directory contains release notes for `verdaccio-openid`. A changeset
describes a user-facing change, the required semantic version bump, and the
text that will be added to the changelogs during the release process.

## Create a Changeset

Run:

```bash
pnpm changeset
```

Select `verdaccio-openid`, choose the appropriate bump type, and write a clear
summary. A changeset file can also be created or edited manually.

## File Format

Each changeset is a Markdown file with YAML frontmatter:

```md
---
"verdaccio-openid": patch
---

English description of the change.

<!-- zh-CN -->

中文描述。
```

The English summary is written to `CHANGELOG.md`. The text after
`<!-- zh-CN -->` is written to `CHANGELOG.zh-CN.md`. The Chinese section is
required for every release changeset in this repository.

## Choose a Bump

- `patch`: backward-compatible bug fixes, dependency updates, and small
  improvements.
- `minor`: backward-compatible features or new configuration options.
- `major`: breaking changes to the public API, configuration, behavior, or
  supported runtime requirements.

Do not write a version number in the changeset. The release workflow calculates
the next version.

## Write a Good Summary

Describe:

- what changed;
- why it changed;
- how users should update their configuration or usage, when applicable.

Use Markdown when it improves readability. Include migration instructions for
breaking changes and mention affected configuration keys, commands, or peer
dependencies.

Do not include internal implementation details unless they affect users.

## What Needs a Changeset?

Add one for changes that affect package consumers, including features, bug
fixes, breaking changes, dependency or peer dependency changes, and supported
Node.js versions.

Documentation-only, test-only, formatting-only, and internal CI changes
usually do not need a release. Use an empty changeset when a pull request must
be recorded but should not publish a new version:

```bash
pnpm changeset --empty
```

## Release Flow

1. Commit the changeset with the pull request that introduces the change.
2. After the pull request is merged into `main`, the release workflow creates
   or updates a Changesets Release PR.
3. That PR runs `pnpm run version`, which consumes the changesets and updates
   both changelog files.
4. Merging the Release PR publishes the calculated package version.

Changeset files are consumed and removed by `changeset version`. Keep permanent
documentation outside this directory, except for this README and the generated
`config.json`.
