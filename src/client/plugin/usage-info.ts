/**
 * Text and commands shown in the Verdaccio usage info: the package manager
 * panels in "Configuration → Package Managers" and the empty-registry guide.
 */
import { getNPMToken } from "./credentials";
import { getBaseUrl } from "./lib";
import { t } from "./i18n";

/**
 * Commands that authenticate against the htpasswd backend.
 *
 * They are matched on the rendered text because the panels carry no selectors of
 * their own, which ties this to Verdaccio's wording; anchoring on the command
 * keeps a registry URL containing `adduser` from being treated as one.
 */
const PASSWORD_COMMAND_PATTERN = /^\s*(npm|pnpm)\s+(adduser|(profile\s+)?set\s+password)\b/i;

/**
 * Tell whether a rendered command logs in against the htpasswd backend.
 *
 * @param command the command text as the host rendered it
 * @returns whether the command needs password login
 */
export function isPasswordAuthCommand(command: string): boolean {
  return PASSWORD_COMMAND_PATTERN.test(command);
}

/**
 * What the usage info should show for the current session.
 *
 * - `keep`: password login is in use, the rendered commands already fit
 * - `alternative`: OpenID Connect is an option next to working password commands
 * - `hint`: only OpenID Connect can log you in
 * - `token`: signed in with OpenID Connect, show the token command
 */
export type UsageVariant = "keep" | "hint" | "alternative" | "token";

/** The session state the variant is derived from. */
export interface UsageVariantContext {
  isOpenIDLoggedIn: boolean;
  isLoggedIn: boolean;
  keepPasswdLogin: boolean;
}

/**
 * Pick the variant for a session.
 *
 * @param context the session state to derive it from
 * @returns what the usage info should show
 */
export function usageVariant({ isOpenIDLoggedIn, isLoggedIn, keepPasswdLogin }: UsageVariantContext): UsageVariant {
  if (isOpenIDLoggedIn) return "token";

  if (isLoggedIn) return "keep";

  return keepPasswdLogin ? "alternative" : "hint";
}

/**
 * Build the hint that invites the reader to log in with OpenID Connect.
 *
 * @param alternative whether to frame it against working password commands
 * @returns the hint in the current UI language
 */
export function loginHint(alternative: boolean): string {
  return alternative ? t("usageLoginHintAlternative") : t("usageLoginHint");
}

/**
 * Build the command that writes the current npm token into `~/.npmrc`.
 *
 * The command is `npm config set` in every package-manager panel on purpose:
 * npm, pnpm and yarn classic all read the token from `~/.npmrc`, while
 * `yarn config set` writes `.yarnrc` and does not authenticate anything.
 *
 * @returns the command to show in the usage info
 */
export function tokenCommand(): string {
  // npm keys the token by `//host/path/`; the path keeps a registry served under
  // a url_prefix working, and npm walks up from it to the host.
  const baseUrl = getBaseUrl(true).replace(/^https?:/, "");
  const configBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  // Single quotes keep a crafted token from being expanded by the shell; the
  // escape below is the POSIX way to include a literal quote inside them.
  const token = String(getNPMToken()).replaceAll("'", String.raw`'\''`);

  return `npm config set ${configBase}:_authToken '${token}'`;
}
