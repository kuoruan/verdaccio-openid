import { describe, expect, it } from "vitest";

import { getAuthorizePath, getCallbackPath } from "@/paths";

describe.each([
  { name: "authorize", getPath: getAuthorizePath, base: "/-/oauth/authorize" },
  { name: "callback", getPath: getCallbackPath, base: "/-/oauth/callback" },
])("$name path", ({ getPath, base }) => {
  it.each([
    [undefined, base],
    ["", base],
    ["cli", `${base}/cli`],
    ["authn", `${base}/authn`],
  ])("builds the path for %s", (id, expected) => {
    expect(getPath(id)).toBe(expected);
  });
});
