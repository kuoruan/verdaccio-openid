import { afterEach, describe, expect, it, vi } from "vitest";

import { resetLanguage, supportedLanguages, t } from "@/client/i18n";
import { isUndefined } from "@/utils";

/** What the stubbed browser exposes: a stored language and the configured one. */
interface Environment {
  /** Raw `localStorage.language` value, `null` when the UI never wrote it. */
  stored?: string | null;
  /** `window.__VERDACCIO_BASENAME_UI_OPTIONS.language` */
  uiLanguage?: string;
}

const english = {
  hint: "Sign in with OpenID Connect to get an auth token.",
  alternative: "Or sign in with OpenID Connect to get an auth token.",
};

/** Stub the two language sources the plugin reads, as the UI would leave them. */
function stubEnvironment({ stored, uiLanguage }: Environment): void {
  // the UI resets the cache once per render pass, tests start a new pass each time
  resetLanguage();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => (isUndefined(stored) ? null : stored)),
  });
  vi.stubGlobal("window", uiLanguage ? { __VERDACCIO_BASENAME_UI_OPTIONS: { language: uiLanguage } } : {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetLanguage();
});

describe("supportedLanguages", () => {
  it("covers the languages the Verdaccio UI lets you pick", () => {
    expect(supportedLanguages.toSorted()).toEqual([
      "cs-CZ",
      "de-DE",
      "en-US",
      "es-ES",
      "fr-FR",
      "ga-IE",
      "gl-ES",
      "it-IT",
      "ko-KR",
      "pl-PL",
      "pt-BR",
      "ru-RU",
      "tr-TR",
      "zh-CN",
      "zh-TW",
    ]);
  });

  it.each([
    [undefined, "or"],
    ["de-DE", "oder"],
    ["es-ES", "o"],
    ["fr-FR", "ou"],
    ["ko-KR", "또는"],
    ["zh-CN", "或"],
    ["zh-TW", "或"],
  ])("translates the login dialog divider for %s", (language, divider) => {
    stubEnvironment({ stored: JSON.stringify(language) });
    expect(t("loginDialogDivider")).toBe(divider);
  });

  it.each(supportedLanguages.filter((code) => code !== "en-US"))("translates the login hint for %s", (language) => {
    stubEnvironment({ stored: JSON.stringify(language) });

    expect(t("usageLoginHint")).not.toBe(english.hint);
    expect(t("usageLoginHint")).toContain("OpenID Connect");
  });
});

describe("t", () => {
  it("falls back to English without any language source", () => {
    stubEnvironment({});

    expect(t("usageLoginHint")).toBe(english.hint);
    expect(t("usageLoginHintAlternative")).toBe(english.alternative);
  });

  it("ignores the browser language, the UI does not follow it either", () => {
    stubEnvironment({});
    vi.stubGlobal("navigator", { language: "zh-CN" });

    expect(t("usageLoginHint")).toBe(english.hint);
  });

  it("follows the language configured for the UI", () => {
    stubEnvironment({ uiLanguage: "de-DE" });

    expect(t("usageLoginHint")).toBe(
      "Melden Sie sich mit OpenID Connect an, um ein Authentifizierungs-Token zu erhalten.",
    );
  });

  it("prefers the language picked in the UI over the configured one", () => {
    stubEnvironment({ stored: JSON.stringify("zh-TW"), uiLanguage: "de-DE" });

    expect(t("usageLoginHint")).toBe("使用 OpenID Connect 登入後即可取得認證 token。");
  });

  it("matches the stored code regardless of case", () => {
    stubEnvironment({ stored: JSON.stringify("zh-cn") });

    expect(t("usageLoginHint")).toBe("使用 OpenID Connect 登录后可获取认证 token。");
  });

  it("matches a base code without a region", () => {
    stubEnvironment({ stored: JSON.stringify("zh") });

    expect(t("usageLoginHint")).toBe("使用 OpenID Connect 登录后可获取认证 token。");
  });

  it("falls back to English for a language it has no translation for", () => {
    stubEnvironment({ stored: JSON.stringify("ja-JP"), uiLanguage: "ja-JP" });

    expect(t("usageLoginHint")).toBe(english.hint);
  });

  it.each(["123", "{}", "null", "true"])("ignores a stored value that is not a string: %s", (value) => {
    stubEnvironment({ stored: value });

    expect(t("usageLoginHint")).toBe(english.hint);
  });

  it("resolves the language once per render pass", () => {
    stubEnvironment({ stored: JSON.stringify("zh-CN") });
    expect(t("usageLoginHint")).toBe("使用 OpenID Connect 登录后可获取认证 token。");

    // a language switch is picked up when the UI starts a new render pass
    localStorage.getItem = vi.fn(() => JSON.stringify("de-DE"));
    expect(t("usageLoginHint")).toBe("使用 OpenID Connect 登录后可获取认证 token。");

    resetLanguage();
    expect(t("usageLoginHint")).toBe(
      "Melden Sie sich mit OpenID Connect an, um ein Authentifizierungs-Token zu erhalten.",
    );
  });

  it("ignores a broken stored value", () => {
    stubEnvironment({ stored: "{not json" });

    expect(t("usageLoginHint")).toBe(english.hint);
  });
});
