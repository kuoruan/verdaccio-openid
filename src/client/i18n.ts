/**
 * Translations for the text this plugin adds to the Verdaccio UI.
 *
 * The UI resolves its language from `localStorage.language` (written when
 * someone picks a language in "Configuration → Translations"), then from
 * `window.__VERDACCIO_BASENAME_UI_OPTIONS.language` (`i18n.web`), then English.
 * We read the same two sources so the injected text matches the surrounding UI,
 * without bundling an i18n runtime.
 *
 * The codes below are the ones the UI lets you pick from; they are the
 * intersection of its language menu and its `supportedLngs`. Adding a language
 * means adding an entry here. The translations are not proofread by native
 * speakers.
 */
import { safeJsonParse } from "@/utils";
import { fallbackLanguage, languageStorageKey } from "@/client/constants";

export type MessageKey = "loginDialogDivider" | "usageLoginHint" | "usageLoginHintAlternative";

/** Every message in every language. */
type MessageTable = Record<string, Record<MessageKey, string>>;

const MESSAGES = {
  "en-US": {
    loginDialogDivider: "or",
    usageLoginHint: "Sign in with OpenID Connect to get an auth token.",
    usageLoginHintAlternative: "Or sign in with OpenID Connect to get an auth token.",
  },
  "cs-CZ": {
    loginDialogDivider: "nebo",
    usageLoginHint: "Přihlaste se přes OpenID Connect a získejte ověřovací token.",
    usageLoginHintAlternative: "Nebo se přihlaste přes OpenID Connect a získejte ověřovací token.",
  },
  "de-DE": {
    loginDialogDivider: "oder",
    usageLoginHint: "Melden Sie sich mit OpenID Connect an, um ein Authentifizierungs-Token zu erhalten.",
    usageLoginHintAlternative:
      "Oder melden Sie sich mit OpenID Connect an, um ein Authentifizierungs-Token zu erhalten.",
  },
  "es-ES": {
    loginDialogDivider: "o",
    usageLoginHint: "Inicia sesión con OpenID Connect para obtener un token de autenticación.",
    usageLoginHintAlternative: "O inicia sesión con OpenID Connect para obtener un token de autenticación.",
  },
  "fr-FR": {
    loginDialogDivider: "ou",
    usageLoginHint: "Connectez-vous avec OpenID Connect pour obtenir un jeton d'authentification.",
    usageLoginHintAlternative: "Ou connectez-vous avec OpenID Connect pour obtenir un jeton d'authentification.",
  },
  "ga-IE": {
    loginDialogDivider: "nó",
    usageLoginHint: "Sínigh isteach le OpenID Connect chun comhartha fíordheimhniúcháin a fháil.",
    usageLoginHintAlternative: "Nó sínigh isteach le OpenID Connect chun comhartha fíordheimhniúcháin a fháil.",
  },
  "gl-ES": {
    loginDialogDivider: "ou",
    usageLoginHint: "Inicia sesión con OpenID Connect para obter un token de autenticación.",
    usageLoginHintAlternative: "Ou inicia sesión con OpenID Connect para obter un token de autenticación.",
  },
  "it-IT": {
    loginDialogDivider: "oppure",
    usageLoginHint: "Accedi con OpenID Connect per ottenere un token di autenticazione.",
    usageLoginHintAlternative: "Oppure accedi con OpenID Connect per ottenere un token di autenticazione.",
  },
  "ko-KR": {
    loginDialogDivider: "또는",
    usageLoginHint: "OpenID Connect로 로그인하여 인증 토큰을 받으세요.",
    usageLoginHintAlternative: "또는 OpenID Connect로 로그인하여 인증 토큰을 받으세요.",
  },
  "pl-PL": {
    loginDialogDivider: "lub",
    usageLoginHint: "Zaloguj się przez OpenID Connect, aby pobrać token uwierzytelniający.",
    usageLoginHintAlternative: "Albo zaloguj się przez OpenID Connect i pobierz token uwierzytelniający.",
  },
  "pt-BR": {
    loginDialogDivider: "ou",
    usageLoginHint: "Entre com OpenID Connect para obter um token de autenticação.",
    usageLoginHintAlternative: "Ou entre com OpenID Connect para obter um token de autenticação.",
  },
  "ru-RU": {
    loginDialogDivider: "или",
    usageLoginHint: "Войдите через OpenID Connect, чтобы получить токен аутентификации.",
    usageLoginHintAlternative: "Или войдите через OpenID Connect, чтобы получить токен аутентификации.",
  },
  "tr-TR": {
    loginDialogDivider: "veya",
    usageLoginHint: "Kimlik doğrulama belirteci almak için OpenID Connect ile oturum açın.",
    usageLoginHintAlternative: "Veya kimlik doğrulama belirteci almak için OpenID Connect ile oturum açın.",
  },
  "zh-CN": {
    loginDialogDivider: "或",
    usageLoginHint: "使用 OpenID Connect 登录后可获取认证 token。",
    usageLoginHintAlternative: "也可以使用 OpenID Connect 登录以获取认证 token。",
  },
  "zh-TW": {
    loginDialogDivider: "或",
    usageLoginHint: "使用 OpenID Connect 登入後即可取得認證 token。",
    usageLoginHintAlternative: "也可以使用 OpenID Connect 登入以取得認證 token。",
  },
} satisfies MessageTable;

type Language = keyof typeof MESSAGES;

/** Language codes the injected text is translated into. */
export const supportedLanguages = Object.keys(MESSAGES) as Language[];

/**
 * Read the language picked in the UI.
 *
 * @returns the stored language code, or "" when there is none or it is unusable
 */
function storedLanguage(): string {
  try {
    const stored = localStorage.getItem(languageStorageKey);

    if (!stored) return "";

    const parsed = safeJsonParse(stored);

    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

/**
 * Reduce a language code to its base, e.g. "zh-TW" → "zh".
 *
 * @param languageCode the language code to reduce
 * @returns the lowercased base code
 */
function baseCode(languageCode: string): string {
  return languageCode.toLowerCase().split("-")[0];
}

/**
 * Pick the language to translate into: the one picked in the UI, then the one
 * the UI is configured with, then `fallbackLanguage`.
 *
 * @returns a supported language code
 */
function resolveLanguage(): Language {
  const requested = storedLanguage() || window.__VERDACCIO_BASENAME_UI_OPTIONS?.language || "";

  if (!requested) return fallbackLanguage;

  const exact = supportedLanguages.find((language) => language.toLowerCase() === requested.toLowerCase());

  if (exact) return exact;

  // Fall back to the first variant of the same base language, e.g. `zh` → `zh-CN`.
  const sameBase = supportedLanguages.find((language) => baseCode(language) === baseCode(requested));

  return sameBase ?? fallbackLanguage;
}

/** Language resolved during the current render pass. */
let cachedLanguage: Language | null = null;

/**
 * Drop the cached language.
 *
 * Called once per render pass: reading storage is the expensive part, and the
 * text is rendered as a burst of translations, so resolving once per pass
 * follows a language switch without a reload while keeping `t` cheap.
 */
export function resetLanguage(): void {
  cachedLanguage = null;
}

/**
 * Translate a message into the language the UI is currently in.
 *
 * @param key the message to translate
 * @returns the message in the current UI language
 */
export function t(key: MessageKey): string {
  cachedLanguage ??= resolveLanguage();

  return MESSAGES[cachedLanguage][key];
}
