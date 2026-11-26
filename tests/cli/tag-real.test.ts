/**
 * Exercise the current webLogin against released WebAuthFlow login/done handlers.
 *
 * The handlers come from `git show <tag>:src/server/flows/WebAuthFlow.ts` and
 * are transpiled without changing their bodies. Imports are replaced by shims
 * for paths, OpenID randomness, URL construction, logging and status pages.
 * The Map-backed store exposes the operations used by both released versions.
 *
 * - v0.14.0: missing returns 403; pending returns 202 with `Retry-After: 3`
 *   and `{status:"pending",message:"token not ready yet"}`; ready returns a token.
 * - v0.20.0: missing returns 401; pending returns 202 with the same header and
 *   `{}`; ready returns and consumes a token. Session IDs must have 43 characters.
 * - worktree: the current login/done handlers are mounted directly.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

import { webLogin } from "@/cli/web-login";
import { WebAuthFlow as WorktreeFlow } from "@/server/flows/WebAuthFlow";
import { isUndefined } from "@/utils";

vi.mock("open", () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const REPO = process.cwd();

const SHIMS: Record<string, string> = {
  "shim-constants.mjs": `export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const npmLoginPath = "/-/v1/login";
export const npmDonePath = "/-/v1/done";
export const webAuthnProviderId = "authn";
export const LOGIN_COOKIE = "verdaccio-openid-login";
export const messageLoggedAndCloseWindow = "ok";
`,
  "shim-status.mjs": `export function buildAccessDeniedPage() { return "denied"; }
export function buildErrorPage(e) { return String(e?.message ?? e); }
export function buildSuccessPage(m) { return String(m); }
`,
  "shim-misc.mjs": `export function debug() {}
const logger = { error() {}, warn() {}, info() {}, debug() {} };
export default logger;
export function getBaseUrl(prefix, req, absolute) {
  const host = req.get("host") ?? "localhost";
  const proto = req.protocol ?? "http";
  return absolute ? \`\${proto}://\${host}\${prefix ?? ""}\` : (prefix ?? "");
}
export function getCookie() { return undefined; }
export function setLoginCookie() {}
export function clearLoginCookie() {}
export class AuthCore {}
`,
  "shim-types.mjs": `export class AuthCore {}
`,
  "shim-redirect.mjs": `export function getAuthorizePath(id) { return \`/-/oauth/authorize\${id ? \`/\${id}\` : ""}\`; }
export function getCallbackPath(id) { return \`/-/oauth/callback\${id ? \`/\${id}\` : ""}\`; }
`,
  "shim-paths.mjs": `export function getAuthorizePath(id) { return \`/-/oauth/authorize\${id ? \`/\${id}\` : ""}\`; }
export function getCallbackPath(id) { return \`/-/oauth/callback\${id ? \`/\${id}\` : ""}\`; }
`,
  "shim-openid-v014.mjs": `let n = 0;
export const generators = { random: () => \`test-session-\${String((n += 1)).padStart(4, "0")}\` };
`,
  "shim-openid-v020.mjs": `export async function getOpenIDClient() {
  return { randomState: () => "a".repeat(43) };
}
`,
};

const tmpDirs: string[] = [];

/** Transpile the tagged flow with shimmed imports, leaving its handlers intact. */
async function loadTagFlow(tag: string): Promise<any> {
  const raw: string = execFileSync("git", ["show", `${tag}:src/server/flows/WebAuthFlow.ts`], {
    cwd: REPO,
    encoding: "utf8",
  });

  const dir = mkdtempSync(join(tmpdir(), `tagflow-${tag.replaceAll(".", "-")}-`));
  tmpDirs.push(dir);
  const is014 = tag.startsWith("v0.14");

  const entry = raw
    .replace('from "@/constants"', 'from "./shim-constants.mjs"')
    .replace('from "@/redirect"', 'from "./shim-redirect.mjs"')
    .replace('from "@/paths"', 'from "./shim-paths.mjs"')
    .replace('from "@/server/config/Config"', 'from "./shim-types.mjs"')
    .replace('from "@/server/debugger"', 'from "./shim-misc.mjs"')
    .replace('from "@/server/logger"', 'from "./shim-misc.mjs"')
    .replace('from "@/server/plugin/AuthCore"', 'from "./shim-misc.mjs"')
    .replace('from "@/server/plugin/AuthProvider"', 'from "./shim-types.mjs"')
    .replace('from "@/server/plugin/Plugin"', 'from "./shim-types.mjs"')
    .replace('from "@/server/plugin/utils"', 'from "./shim-misc.mjs"')
    .replace('from "@/server/store/Store"', 'from "./shim-types.mjs"')
    .replace('from "@/status-page"', 'from "./shim-status.mjs"')
    .replace('from "openid-client"', `from "./${is014 ? "shim-openid-v014.mjs" : "shim-openid-v020.mjs"}"`)
    .replace('from "@/server/openid/client"', `from "./${is014 ? "shim-openid-v014.mjs" : "shim-openid-v020.mjs"}"`);

  for (const [name, content] of Object.entries(SHIMS)) {
    writeFileSync(join(dir, name), content);
  }

  writeFileSync(join(dir, "entry.mts"), entry);

  // Resolve the tagged flow's external types from the project's dependencies.
  mkdirSync(join(dir, "node_modules"));
  for (const name of ["express", "@verdaccio", "@types"]) {
    symlinkSync(join(REPO, "node_modules", name), join(dir, "node_modules", name), "dir");
  }

  try {
    execFileSync(
      join(REPO, "node_modules/typescript/bin/tsc"),
      [
        "entry.mts",
        "--outDir",
        "dist",
        "--module",
        "nodenext",
        "--target",
        "es2022",
        "--moduleResolution",
        "nodenext",
        "--rewriteRelativeImportExtensions",
        "--strict",
        "false",
        "--skipLibCheck",
      ],
      { cwd: dir, stdio: "pipe" },
    );
  } catch (error: any) {
    const out = [error.stdout, error.stderr].filter(Boolean).join("\n");
    const index = tmpDirs.indexOf(dir);
    if (index >= 0) tmpDirs.splice(index, 1);
    rmSync(dir, { recursive: true, force: true });

    throw new Error(`Failed to transpile tag ${tag}:\n${out}`);
  }

  for (const name of Object.keys(SHIMS)) {
    writeFileSync(join(dir, "dist", name), SHIMS[name]);
  }

  const mod = await import(join(dir, "dist", "entry.mjs"));

  if (!mod.WebAuthFlow) throw new Error(`Tag ${tag} does not export WebAuthFlow`);

  return mod.WebAuthFlow;
}

function mapStore() {
  const data = new Map<string, string>();

  return {
    data,
    async setWebAuthnToken(k: string, v: string) {
      data.set(k, v);
    },
    async getWebAuthnToken(k: string) {
      return data.get(k);
    },
    async takeWebAuthnToken(k: string, pending: string) {
      if (!data.has(k)) return undefined;
      const v = data.get(k)!;
      if (v !== pending) data.delete(k);
      return v;
    },
    async deleteWebAuthnToken(k: string) {
      data.delete(k);
    },
  };
}

describe("compat: webLogin against released login/done", () => {
  let Tag014: any;
  let Tag020: any;

  beforeAll(async () => {
    Tag014 = await loadTagFlow("v0.14.0");
    Tag020 = await loadTagFlow("v0.20.0");
  }, 60_000);

  afterAll(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function runWebLogin(makeFlow: (store: ReturnType<typeof mapStore>) => Pick<WorktreeFlow, "login" | "done">) {
    const store = mapStore();
    const flow = makeFlow(store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    let polls = 0;
    app.get("/prefix/-/v1/done", (req, _res, next) => {
      polls += 1;
      if (polls === 2) store.data.set(String(req.query.sessionId), "npm-token-xyz");
      next();
    });
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const token = await webLogin(`${base}/prefix`, { timeoutMs: 15_000 });
      expect(token).toBe("npm-token-xyz");
      expect(polls).toBeGreaterThanOrEqual(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  /**
   * Check pending, completion and one-time consumption of the same transaction.
   */
  async function runAgainst(
    makeFlow: (store: ReturnType<typeof mapStore>) => Pick<WorktreeFlow, "login" | "done">,
    expected: { pendingBody: unknown; consumedStatus: number; pendingSessions: number },
  ) {
    const store = mapStore();
    const flow = makeFlow(store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));

    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      // Inspect every response in a separate transaction.
      const start = await globalThis.fetch(`${base}/prefix/-/v1/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(start.status).toBe(200);
      const { loginUrl, doneUrl } = await start.json();
      expect(typeof loginUrl).toBe("string");
      expect(typeof doneUrl).toBe("string");

      const done = new URL(doneUrl, base);
      expect(done.pathname).toBe("/prefix/-/v1/done");
      expect(done.searchParams.get("sessionId")).toBeTruthy();

      const pending = await globalThis.fetch(done);
      expect(pending.status).toBe(202);
      expect(pending.headers.get("retry-after")).toBe("3");
      expect(await pending.json()).toEqual(expected.pendingBody);

      const sessionId = done.searchParams.get("sessionId")!;
      expect(store.data.get(sessionId)).toBe("__pending__");
      expect(store.data.size).toBe(expected.pendingSessions);

      // Simulate a successful browser authorization and callback.
      store.data.set(sessionId, "npm-token-xyz");

      const done2 = await globalThis.fetch(done);
      expect(done2.status).toBe(200);
      expect(await done2.json()).toEqual({ token: "npm-token-xyz" });

      // The token must not be handed out twice.
      const done3 = await globalThis.fetch(done);
      expect(done3.status).toBe(expected.consumedStatus);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("v0.14.0: pending, token, then 403 for the consumed transaction", async () => {
    const makeFlow = (store: ReturnType<typeof mapStore>) => new Tag014({ urlPrefix: "/prefix" }, {}, {}, store);
    await runWebLogin(makeFlow);
    await runAgainst(makeFlow, {
      pendingBody: { status: "pending", message: "token not ready yet" },
      consumedStatus: 403,
      pendingSessions: 1,
    });
  }, 30_000);

  it("v0.20.0: pending, token, then 401 for the consumed transaction", async () => {
    const makeFlow = (store: ReturnType<typeof mapStore>) => new Tag020({ urlPrefix: "/prefix" }, {}, {}, store);
    await runWebLogin(makeFlow);
    await runAgainst(makeFlow, {
      pendingBody: {},
      consumedStatus: 401,
      pendingSessions: 1,
    });
  }, 30_000);

  it("worktree: pending, token, then 401 for the consumed transaction", async () => {
    const makeFlow = (store: ReturnType<typeof mapStore>) =>
      new WorktreeFlow(
        { urlPrefix: "/prefix" } as any,
        {} as any,
        {} as any,
        {
          setWebAuthnSession: async (k: string, s: any) =>
            store.data.set(k, s.status === "pending" ? "__pending__" : s.token),
          getWebAuthnSession: async (k: string) => {
            const v = store.data.get(k);
            if (isUndefined(v)) return undefined;
            return v === "__pending__" ? { status: "pending" } : { status: "ready", token: v };
          },
          takeWebAuthnSession: async (k: string) => {
            const v = store.data.get(k);
            if (isUndefined(v)) return undefined;
            if (v === "__pending__") return { status: "pending" };
            store.data.delete(k);
            return { status: "ready", token: v };
          },
          deleteWebAuthnSession: async (k: string) => {
            store.data.delete(k);
          },
        } as any,
      );

    await runWebLogin(makeFlow);
    await runAgainst(makeFlow, { pendingBody: {}, consumedStatus: 401, pendingSessions: 1 });
  }, 30_000);
});
