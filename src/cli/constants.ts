/**
 * Constants the CLI uses on its own.
 */

/** How long the CLI waits for the browser to report back before it gives up. */
export const CLI_TIMEOUT_MS = 60_000;

/** The longest the CLI lingers on transport cleanup after the login settles. */
export const CLI_CLOSE_TIMEOUT_MS = 2_000;

/** How long the CLI lets the launcher take to start the browser before falling back to the URL. */
export const CLI_OPEN_BROWSER_TIMEOUT_MS = 5_000;

/** How long the CLI waits between web-login polls when the server says nothing. */
export const CLI_WEB_LOGIN_POLL_INTERVAL_MS = 2_000;

/** The longest gap the CLI leaves between web-login polls, whatever the server asks for. */
export const CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS = 5_000;

export const messageNpmConfigUpdated = "All done. We've updated your npm configuration.";
