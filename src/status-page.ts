import ErrorIcon from "@/assets/icon-error.svg?raw";
import SuccessIcon from "@/assets/icon-success.svg?raw";
import WarningIcon from "@/assets/icon-warning.svg?raw";
import Logo from "@/assets/logo.svg";
import { plugin } from "@/constants";
import { messageGroupRequired } from "@/server/constants";
import styles from "@/status-page.css?inline";
import { escapeHtml, safeUrl } from "@/utils";

const themeScript = `
<script>
(function() {
  var dark;
  try {
    var v = localStorage.getItem("darkMode");
    if (v !== null) {
      dark = v === "true";
    } else {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
  } catch (_) {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  if (dark) {
    document.documentElement.classList.add("dark");
  }
})();
</script>`;

/** Whether to show a back link, and where it goes. A string is used as the link target. */
export type BackOptions = boolean | Record<"backUrl", string>;

const defaultBackUrl = "/";

/**
 * Wrap a card body in the standalone page the plugin serves outside the UI.
 *
 * @param body the card content, already built from HTML
 * @param withBack whether to offer a back link, and where it points
 * @returns the complete HTML document
 */
export function buildStatusPage(body: string, withBack: BackOptions = false): string {
  let backUrl;
  if (typeof withBack === "object") {
    backUrl = safeUrl(withBack.backUrl || defaultBackUrl, defaultBackUrl);
  } else if (withBack) {
    backUrl = defaultBackUrl;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${plugin.name}</title>
    <style>${styles}</style>
    ${themeScript}
  </head>
  <body>
    <img src="${Logo}" class="logo" alt="" />
    <div class="card">
      ${body}
      ${backUrl ? `<a class="btn" href="${backUrl}">Go back</a>` : ""}
    </div>
  </body>
</html>`;
}

/**
 * Build the page shown when the login flow failed.
 *
 * @param error the error thrown by the flow; its message is shown as HTML-escaped text
 * @param withBack whether to offer a back link, and where it points
 */
export function buildErrorPage(error: any, withBack: BackOptions = false) {
  const message = error?.message ?? error ?? "An unknown error occurred";
  return buildStatusPage(
    `<div class="icon error">${ErrorIcon}</div>
    <h1 class="error">Login failed</h1>
    <p class="message">${escapeHtml(String(message))}</p>`,
    withBack,
  );
}

/**
 * Build the page shown when the flow finished and the user can close the window.
 *
 * @param message the message to show, escaped before insertion
 * @param withBack whether to offer a back link, and where it points
 */
export function buildSuccessPage(message: string, withBack: BackOptions = false) {
  return buildStatusPage(
    `<div class="icon success">${SuccessIcon}</div>
    <h1 class="success">Success</h1>
    <p class="message">${escapeHtml(message)}</p>`,
    withBack,
  );
}

/**
 * Build the page shown when the user is authenticated but belongs to no group
 * that `authorized-groups` accepts.
 *
 * @param withBack whether to offer a back link, and where it points
 */
export function buildAccessDeniedPage(withBack: BackOptions = false) {
  return buildStatusPage(
    `<div class="icon warning">${WarningIcon}</div>
    <h1 class="warning">Access denied</h1>
    <p class="message">${messageGroupRequired}</p>`,
    withBack,
  );
}
