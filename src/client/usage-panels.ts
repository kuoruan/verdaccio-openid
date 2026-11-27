/**
 * Rendering of the usage info injected into the Verdaccio UI.
 *
 * The host renders this markup itself, so the module works with what is there:
 * command rows are cloned to keep their styling, hints are plain paragraphs.
 */
import openIDStyles from "@/client/styles.css?inline";
import {
  commandRowClass,
  helpLoginCommandSelector,
  helpLoginYarnPluginSelector,
  hiddenMarker,
  hintClass,
  openIDStyleId,
  usageRowSelector,
  usageTabsSelector,
} from "@/client/constants";

import { isLoggedIn, isOpenIDLoggedIn } from "./credentials";
import { resetLanguage } from "./i18n";
import { isPasswordAuthCommand, loginHint, tokenCommand, usageVariant, type UsageVariant } from "./usage-info";

/**
 * Copy text to the clipboard.
 *
 * @param text the text to copy to the clipboard
 * @returns resolves when the text was copied, rejects when the browser refused
 */
function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/**
 * Read the session and the plugin options once per render pass.
 *
 * @returns what the usage info should show for the current session
 */
function currentVariant(): UsageVariant {
  return usageVariant({
    isOpenIDLoggedIn: isOpenIDLoggedIn(),
    isLoggedIn: isLoggedIn(),
    // Same default as `init()`: without the option the password login is replaced.
    keepPasswdLogin: window.__VERDACCIO_OPENID_OPTIONS?.keepPasswdLogin ?? false,
  });
}

/**
 * The text node of a command row: the guide wraps it in `code`, the panels do not.
 *
 * @param row the command row to read from
 * @returns the element holding the command text, if the row has one
 */
function rowTextTarget(row: HTMLElement): Element | null {
  return row.querySelector("code") ?? row.querySelector("span");
}

/**
 * Replace the command text of a row, leaving its copy button and live region alone.
 *
 * @param row the command row to update
 * @param text the command to show
 */
function setRowText(row: HTMLElement, text: string): void {
  const target = rowTextTarget(row);

  if (target) target.textContent = text;
}

/**
 * Clone a rendered command row so the copy keeps the host styling, and take
 * over its copy button: a clone has no React handler behind it.
 *
 * The host hooks (`data-testid`, `id`) are dropped so the clone cannot be
 * mistaken for the row it came from.
 *
 * @param template the row to clone
 * @param text the command the clone should show
 * @returns the row to insert
 */
function createCommandRow(template: HTMLElement, text: string): HTMLElement {
  const row = template.cloneNode(true) as HTMLElement;

  row.hidden = false;
  // The template may have been a hidden host row; the marker must go with it.
  row.removeAttribute(hiddenMarker);
  row.classList.add(commandRowClass);
  setRowText(row, text);

  for (const node of [row, ...row.querySelectorAll("[data-testid], [id]")]) {
    node.removeAttribute("data-testid");
    node.removeAttribute("id");
  }

  const copyEl = row.querySelector("button");

  copyEl?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    void copyToClipboard(text).catch((e) => console.warn(e));
  });

  return row;
}

/**
 * Build the paragraph that invites the reader to log in with OpenID Connect.
 *
 * @param text the hint, already translated
 * @returns the paragraph to insert
 */
function createHint(text: string): HTMLElement {
  const hint = document.createElement("p");

  hint.className = hintClass;
  hint.textContent = text;

  return hint;
}

interface HintExtra {
  kind: "hint";
  text: string;
}

/** A command to show, cloned from the row the host rendered. */
interface CommandExtra {
  kind: "command";
  text: string;
  template: HTMLElement;
}

type UsageExtra = HintExtra | CommandExtra;

/**
 * Render an extra as the node that gets inserted after the anchor.
 *
 * @param extra the hint or command to render
 * @returns the rendered node
 */
function createExtra(extra: UsageExtra): HTMLElement {
  return extra.kind === "hint" ? createHint(extra.text) : createCommandRow(extra.template, extra.text);
}

/**
 * Keep at most one hint or command row right after `anchor`.
 *
 * Compares the rendered text instead of flagging nodes as done, so a language
 * change or a React re-render is picked up on the next sync. Only the command
 * text is compared: the row also holds the host's copy feedback, which changes
 * on its own.
 *
 * @param anchor the row the extra belongs after
 * @param extra the extra to show, or null to remove it
 */
function renderUsageExtra(anchor: HTMLElement, extra: UsageExtra | null): void {
  const rendered = [...(anchor.parentElement?.querySelectorAll<HTMLElement>(usageRowSelector) ?? [])];

  if (!extra) {
    for (const node of rendered) node.remove();

    return;
  }

  const className = extra.kind === "hint" ? hintClass : commandRowClass;
  const [current] = rendered;

  if (
    rendered.length === 1 &&
    current.classList.contains(className) &&
    (rowTextTarget(current) ?? current).textContent === extra.text
  ) {
    if (current.previousElementSibling !== anchor) anchor.after(current);

    return;
  }

  for (const node of rendered) node.remove();

  anchor.after(createExtra(extra));
}

/**
 * Pick the extra a variant calls for.
 *
 * @param variant the variant for the current session
 * @param template the row to clone when a command is shown
 * @param alternative whether the hint is framed as an alternative
 * @returns the extra to render
 */
function usageExtraFor(variant: UsageVariant, template: HTMLElement, alternative: boolean): UsageExtra {
  return variant === "token"
    ? { kind: "command", text: tokenCommand(), template }
    : { kind: "hint", text: loginHint(alternative) };
}

/**
 * Rewrite the package-manager panels: drop password commands that cannot work
 * in this session, then show the login hint or the token command.
 *
 * Panels whose first row is not a command are left alone: the yarn berry, bun
 * and `min-release-age` panels start with a `#` config-file line. Yarn classic
 * is a command panel and gets the same treatment as npm and pnpm.
 *
 * @param variant what the usage info should show for the current session
 */
function updateUsagePanels(variant: UsageVariant): void {
  if (variant === "keep") return;

  const dropPasswordCommands = variant !== "alternative";

  for (const tab of document.querySelectorAll<HTMLElement>(usageTabsSelector)) {
    const commands = [...tab.querySelectorAll("button")]
      .map((node) => node.parentElement!)
      .filter((node) => !node.classList.contains(commandRowClass) && /^(npm|pnpm|yarn)/.test(node.textContent || ""));

    if (commands.length === 0) continue;

    const hasPasswordCommands = commands.some((node) => isPasswordAuthCommand(node.textContent || ""));

    if (dropPasswordCommands) {
      for (const node of commands) {
        if (isPasswordAuthCommand(node.textContent || "")) node.remove();
      }
    }

    const anchor = commands.findLast((node) => node.isConnected);

    if (!anchor) continue;

    renderUsageExtra(anchor, usageExtraFor(variant, commands[0], variant === "alternative" && hasPasswordCommands));
  }
}

/**
 * The empty-registry guide points at password login (`npm adduser`, and the
 * yarn alternative below it), which does not work once password login is gone.
 * Hide those rows and show the login hint, or the token command after an OpenID
 * Connect login.
 *
 * The UI renders the same guide twice, on the empty home page and in
 * "Configuration → Publishing", so every copy is updated.
 *
 * @param variant what the usage info should show for the current session
 */
function updateEmptyStateGuide(variant: UsageVariant): void {
  if (variant === "keep") return;

  const passwordLoginWorks = variant === "alternative";

  for (const command of document.querySelectorAll<HTMLElement>(helpLoginCommandSelector)) {
    const row = command.parentElement;

    if (!row) continue;

    row.hidden = !passwordLoginWorks;
    row.toggleAttribute(hiddenMarker, !passwordLoginWorks);
    // The yarn alternative is a neighbouring block, not part of the command row.
    const yarnBlock = row.closest("li")?.querySelector<HTMLElement>(helpLoginYarnPluginSelector);

    if (yarnBlock) {
      yarnBlock.hidden = !passwordLoginWorks;
      yarnBlock.toggleAttribute(hiddenMarker, !passwordLoginWorks);
    }

    renderUsageExtra(row, passwordLoginWorks ? null : usageExtraFor(variant, row, false));
  }
}

/** Add the stylesheet the injected nodes rely on, once per page. */
export function injectOpenIDStyles(): void {
  if (document.getElementById(openIDStyleId)) return;

  const style = document.createElement("style");

  style.id = openIDStyleId;
  style.textContent = openIDStyles;
  document.head.append(style);
}

/**
 * Bring every injected usage info in line with the current session and language.
 *
 * Idempotent: repeated calls only touch the DOM when the rendered text differs.
 */
export function syncUsage(): void {
  resetLanguage();
  injectOpenIDStyles();

  const variant = currentVariant();

  updateUsagePanels(variant);
  updateEmptyStateGuide(variant);
}
