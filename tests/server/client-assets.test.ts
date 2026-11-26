import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clientEntryName } from "@/server/constants";
import { loadClientEntry } from "@/server/client-assets";

describe("loadClientEntry", () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "openid-manifest-"));
    manifestPath = join(dir, "manifest.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeManifest(content: string): void {
    writeFileSync(manifestPath, content);
  }

  it("resolves the hashed file of the entry", () => {
    writeManifest(JSON.stringify({ [clientEntryName]: "verdaccio-openid.COYaLTdK.js" }));

    expect(loadClientEntry(manifestPath)).toBe("verdaccio-openid.COYaLTdK.js");
  });

  it("fails with the manifest path when the file is missing", () => {
    expect(() => loadClientEntry(manifestPath)).toThrow(/Cannot read/);
    expect(() => loadClientEntry(manifestPath)).toThrow(manifestPath);
  });

  it.each([
    ["invalid JSON", "{not json", /Cannot read/],
    ["a non-object", "[]", /does not name a hashed file/],
    ["no entry for the client", JSON.stringify({ "other.js": "other.abc.js" }), /does not name a hashed file/],
    ["an unhashed file name", JSON.stringify({ [clientEntryName]: "x.js" }), /does not name a hashed file/],
    [
      "a versioned file name",
      JSON.stringify({ [clientEntryName]: "verdaccio-openid-0.20.0.js" }),
      /does not name a hashed file/,
    ],
    ["a path", JSON.stringify({ [clientEntryName]: "client/x.abc.js" }), /does not name a hashed file/],
    ["a parent segment", JSON.stringify({ [clientEntryName]: "../x.abc.js" }), /does not name a hashed file/],
  ])("fails on %s", (_label, content, pattern) => {
    writeManifest(content);

    expect(() => loadClientEntry(manifestPath)).toThrow(pattern);
  });
});
