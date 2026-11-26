import type { OpenIDToken } from "@/server/plugin/AuthProvider";
import { sleep } from "@/timers";
import { isNonEmptyString, isObject } from "@/utils";

const GITLAB_GROUPS_TIMEOUT_MS = 300_000; // one deadline shared by the whole page walk
const GITLAB_GROUPS_PER_PAGE = 100;

/** Extra tries on 429/502. */
const PAGE_FETCH_RETRIES = 3;

/** Rejects a page whose body or page link cannot be trusted. */
const UNEXPECTED_RESPONSE = "GitLab groups request returned an unexpected response";

/** Read the page body; anything that is not an array of groups rejects the page. */
async function readGroupPaths(response: Response): Promise<string[]> {
  const entries: unknown = await response.json();

  if (!Array.isArray(entries)) {
    throw new Error(UNEXPECTED_RESPONSE);
  }

  return entries.map((entry) => {
    if (!isObject(entry) || typeof entry.full_path !== "string") {
      throw new Error(UNEXPECTED_RESPONSE);
    }

    return entry.full_path;
  });
}

/**
 * What the walker's `rel="next"` link says: `end` is a normal end, `bad`
 * is a link that is present but unusable, `page` carries the next page.
 */
type NextLink = { kind: "end" } | { kind: "bad" } | { kind: "page"; page: number };

/**
 * Fetch one group page, retrying 429/502 with an abortable 1s/2s/4s backoff.
 *
 * The walker only sends bodyless GETs, so every attempt is retryable.
 * Any other failure — or the last retry — throws after releasing the
 * failed body; the caller decides what a bad page means.
 *
 * @param url the page URL, rebuilt from the trusted template
 * @param accessToken the provider token
 * @param signal the walk deadline, checked before every attempt
 * @param customFetch the fetch to use, already bound to the proxy transport
 * @returns the first successful response
 */
async function fetchPage(
  url: URL,
  accessToken: string,
  signal: AbortSignal,
  customFetch: typeof fetch,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await customFetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "manual",
      signal,
    });

    if (response.ok) return response;

    await response.body?.cancel().catch(() => {});

    if ((response.status !== 429 && response.status !== 502) || attempt >= PAGE_FETCH_RETRIES) {
      throw new Error(`request failed with status ${String(response.status)}`);
    }

    await sleep(1_000 * 2 ** attempt, signal);
  }
}

/**
 * Parse the `rel="next"` link into a same-instance, same-path page number.
 *
 * Only the absence of a `rel="next"` entry is a normal end; a link that
 * is present but unusable (unparseable URL, another instance or path, no
 * page number) is reported so the caller can reject it instead of caching
 * a partial list.
 */
function parseNextLink(response: Response, base: URL): NextLink {
  // GitLab emits one bare `<url>; rel="name"` entry per relation
  // (prev/next/first/last, one quoted rel each). Only the absence of a
  // next entry is a normal end; a next entry whose target is empty or
  // unusable is reported so the caller rejects the walk instead of
  // caching a partial list. Anything else is not the next page.
  const match = /<([^<>]*)>\s*;\s*rel\s*=\s*(?:"([^"]*)"|([^;,\s]*))/i.exec(response.headers.get("link") ?? "");
  const target = match?.[1].trim();
  const rel = match?.[2] ?? match?.[3];

  if (rel?.toLowerCase() !== "next") return { kind: "end" };
  if (!isNonEmptyString(target)) return { kind: "bad" };

  let next: URL;

  try {
    next = new URL(target);
  } catch {
    return { kind: "bad" };
  }

  const rawPage = next.searchParams.get("page");
  const page = isNonEmptyString(rawPage) ? Number(rawPage) : Number.NaN;

  if (next.origin !== base.origin || next.pathname !== base.pathname || !Number.isSafeInteger(page)) {
    return { kind: "bad" };
  }

  return { kind: "page", page };
}

/**
 * Read the groups of the user from the GitLab API.
 *
 * Returns the full path of each group, not its name: a name is neither unique
 * nor reserved, so anyone who may create a group could name it like a group
 * they do not belong to and match `authorized-groups` with it. The full path
 * is unique across GitLab (`parent/child`, or just `group` at the top level).
 *
 * @param providerHost the GitLab instance; a trailing slash is ignored
 * @param token the provider token
 * @param customFetch the fetch to use, already bound to the proxy transport
 * @returns the full paths of the groups the user is in
 */
export async function getGitlabGroups(
  providerHost: string,
  token: OpenIDToken,
  customFetch: typeof fetch = fetch,
): Promise<string[]> {
  const accessToken = typeof token === "string" ? token : token.accessToken;
  const base = new URL(`${providerHost.replace(/\/+$/, "")}/api/v4/groups`);
  // One deadline for the whole walk instead of one per page.
  const signal = AbortSignal.timeout(GITLAB_GROUPS_TIMEOUT_MS);
  const groups: string[] = [];
  // The first request is the logical page 1; a next link must move forward.
  let page = 1;

  // GitLab defaults `all_available` to false for users but to true for
  // administrators, which would let an administrator token match every group
  // on the instance. Pass it so the list is always the groups the user is in.
  // https://docs.gitlab.com/api/groups/#list-groups
  for (;;) {
    const url = new URL(base.href);
    url.searchParams.set("all_available", "false");
    url.searchParams.set("per_page", String(GITLAB_GROUPS_PER_PAGE));
    url.searchParams.set("page", String(page));

    // A bad page body or page link rejects the whole result instead of caching
    // a partial group list.
    const response = await fetchPage(url, accessToken, signal, customFetch);
    groups.push(...(await readGroupPaths(response)));

    // A bad link rejects the whole result instead of caching a partial
    // group list; only a strictly increasing page number is followed, and
    // the request is rebuilt from the trusted template so a hostile link
    // cannot redirect the bearer token or drop the `all_available=false`
    // guard.
    const link = parseNextLink(response, base);

    if (link.kind === "end") return groups;
    if (link.kind === "bad" || link.page <= page) throw new Error(UNEXPECTED_RESPONSE);

    page = link.page;
  }
}
