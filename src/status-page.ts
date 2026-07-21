import ErrorIcon from "@/assets/icon-error.svg?raw";
import SuccessIcon from "@/assets/icon-success.svg?raw";
import WarningIcon from "@/assets/icon-warning.svg?raw";
import Logo from "@/assets/logo.svg";
import { messageGroupRequired, plugin } from "@/constants";

const escapeHtml = (str: string): string =>
  str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const styles = `
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  height: 100%;
}

body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg);
  color: var(--fg);
}

/* Light theme (default) */
:root {
  --bg: #f5f5f5;
  --card-bg: #ffffff;
  --fg: #1a1a2e;
  --fg-muted: #64748b;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06);
  --success: #2e7d32;
  --success-bg: rgba(46, 125, 50, 0.08);
  --error: #c62828;
  --error-bg: rgba(198, 40, 40, 0.08);
  --warning: #e65100;
  --warning-bg: rgba(230, 81, 0, 0.08);
  --btn-bg: #4b5e80;
  --btn-hover-bg: #3d4f6b;
  --btn-fg: #ffffff;
  --card-border: #e8e8e8;
}

/* Dark theme */
:root.dark {
  --bg: #121212;
  --card-bg: #1e1e1e;
  --fg: #e0e0e0;
  --fg-muted: #9e9e9e;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.2);
  --success: #66bb6a;
  --success-bg: rgba(102, 187, 106, 0.18);
  --error: #ef5350;
  --error-bg: rgba(239, 83, 80, 0.18);
  --warning: #ff9800;
  --warning-bg: rgba(255, 152, 0, 0.18);
  --btn-bg: rgba(255, 255, 255, 0.12);
  --btn-hover-bg: rgba(255, 255, 255, 0.2);
  --btn-fg: #e0e0e0;
  --card-border: #3a3a3a;
}

.card {
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--card-border);
  padding: 48px 48px 40px 48px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  animation: card-in 200ms ease-out both;
}

@media (max-width: 480px) {
  .card {
    padding: 32px 24px;
  }
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card {
    animation: none;
  }
}

.logo {
  display: block;
  width: 72px;
  height: 62px;
  margin: 0 auto 32px auto;
  opacity: 0.9;
}

:root.dark .logo {
  filter: brightness(1.3);
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin-bottom: 20px;
}

.icon.success {
  background: var(--success-bg);
  color: var(--success);
}

.icon.error {
  background: var(--error-bg);
  color: var(--error);
}

.icon.warning {
  background: var(--warning-bg);
  color: var(--warning);
}

.icon svg {
  width: 32px;
  height: 32px;
  display: block;
}

h1 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 8px;
}

h1.success { color: var(--success); }
h1.error   { color: var(--error); }
h1.warning { color: var(--warning); }

.message {
  font-size: 14px;
  line-height: 1.6;
  color: var(--fg-muted);
  margin-bottom: 24px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--btn-fg);
  background: var(--btn-bg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s ease, transform 0.2s ease;
  font-family: inherit;
}

.btn:hover {
  background: var(--btn-hover-bg);
  transform: translateY(-1px);
}

.btn:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}
`;

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

export type BackOptions = boolean | Record<"backUrl", string>;

const defaultBackUrl = "javascript:history.back()";

export function buildStatusPage(body: string, withBack: BackOptions = false): string {
  let backUrl;
  if (typeof withBack === "object") {
    backUrl = withBack.backUrl || defaultBackUrl;
  } else if (withBack) {
    backUrl = defaultBackUrl;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${plugin.name} - ${plugin.version}</title>
    <style>${styles}</style>
    ${themeScript}
  </head>
  <body>
      <img src="${Logo}" class="logo" alt="logo" />
      <div class="card">
        ${body}
        ${backUrl ? `<a class="btn" href="${backUrl}">Go back</a>` : ""}
      </div>
    </body>
</html>`;
}

export function buildErrorPage(error: any, withBack: BackOptions = false) {
  const message = error?.message ?? error ?? "An unknown error occurred";
  return buildStatusPage(
    `<div class="icon error">${ErrorIcon}</div>
    <h1 class="error">Sorry :(</h1>
    <p class="message">${escapeHtml(String(message))}</p>`,
    withBack,
  );
}

export function buildSuccessPage(message: string, withBack: BackOptions = false) {
  return buildStatusPage(
    `<div class="icon success">${SuccessIcon}</div>
    <h1 class="success">Success ^_^</h1>
    <p class="message">${escapeHtml(message)}</p>`,
    withBack,
  );
}

export function buildAccessDeniedPage(withBack: BackOptions = false) {
  return buildStatusPage(
    `<div class="icon warning">${WarningIcon}</div>
    <h1 class="warning">Access Denied -_-</h1>
    <p class="message">${messageGroupRequired}</p>`,
    withBack,
  );
}
