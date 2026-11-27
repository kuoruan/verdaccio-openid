/**
 * Tests for the static stylesheet injected into the Verdaccio UI.
 *
 * The stylesheet holds literal selectors, so this keeps a renamed class or
 * marker in `constants.ts` from silently leaving the styles behind.
 */
import { describe, expect, it } from "vitest";

import { dividerClass, hiddenMarker, hintClass, loginButtonClass } from "@/client/constants";
import styles from "@/client/styles.css?inline";

describe("injected stylesheet", () => {
  it.each([
    ["hint", `.${hintClass}`],
    ["hidden marker", `[${hiddenMarker}]`],
    ["divider", `.${dividerClass}`],
    ["login button", `.${loginButtonClass}`],
  ])("targets the %s used by the injected nodes", (_node, selector) => {
    expect(styles).toContain(selector);
  });

  it("keeps the login icon sized", () => {
    expect(styles).toContain(`button.${loginButtonClass} svg`);
  });
});
