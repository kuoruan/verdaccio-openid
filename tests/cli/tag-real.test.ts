/**
 * 真实 tag 兼容夹具：新版 webLogin → 发布版 WebAuthFlow.login/done。
 *
 * login/done 的方法体来自 tag 源码（`git show <tag>:src/server/flows/WebAuthFlow.ts`，
 * 转译后直接 import，零改动）；只有依赖 seam 用测试替身：
 * `@/constants` 路径常量、`openid-client` 随机数、`@/server/plugin/utils` 的
 * `getBaseUrl`、logger/debug、页面构建。store 用 Map 替身（tag 的 InMemory 语义：
 * set/get/delete；v0.14.0 的 done 是 get+delete，v0.20.0 是 take 语义——这些都在
 * handler 方法体里，不在替身里）。
 *
 * - v0.14.0（协议引入版本）：缺失 → 403；pending → 202 `Retry-After: 3` +
 *   `{status:"pending",message:"token not ready yet"}`；就绪 → 200 `{token}`。
 * - v0.20.0（上一发布版本）：缺失 → 401；pending → 202 `Retry-After: 3` + `{}`；
 *   就绪 → 200 `{token}` 并消费；`sessionId` 须过 43 字符校验，否则 400。
 * - worktree：当前 `WebAuthFlow` 的 login/done 直接挂载。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

/** 取 tag 源码、替换依赖为 shim、tsc 转译，返回 WebAuthFlow 类。方法体零改动。 */
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

  // 让转译能解析 express/@verdaccio/core 等类型：链到仓库的 node_modules。
  try {
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    execFileSync("ln", ["-sfn", join(REPO, "node_modules", "express"), join(dir, "node_modules", "express")]);
    execFileSync("ln", ["-sfn", join(REPO, "node_modules", "@verdaccio"), join(dir, "node_modules", "@verdaccio")]);
    execFileSync("ln", ["-sfn", join(REPO, "node_modules", "@types"), join(dir, "node_modules", "@types")]);
  } catch {
    // 链接失败时如实让 tsc 报错，不降级。
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

    throw new Error(`tag ${tag} 转译失败（tag 缺失时如实失败，不降级）:\n${out}`);
  }

  for (const name of Object.keys(SHIMS)) {
    writeFileSync(join(dir, "dist", name), SHIMS[name]);
  }

  const mod = await import(join(dir, "dist", "entry.mjs"));

  if (!mod.WebAuthFlow) throw new Error(`tag ${tag} 没有导出 WebAuthFlow`);

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
      return data.has(k) ? data.get(k) : undefined;
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

  /**
   * 跑完一次“202 → 浏览器完成 → 200”，再对**同一事务**的 doneUrl 重读：
   * 必须失败（v0.14.0 是 403，v0.20.0 是 401）。
   */
  async function runAgainst(
    makeFlow: (store: any) => any,
    expected: { pendingBody: unknown; consumedStatus: number; pendingSessions: number },
  ) {
    const store = mapStore();
    const flow = makeFlow(store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      // webLogin 只负责 202→200；这里再手工走一遍同一事务，断言每一步形状。
      const start = await globalThis.fetch(`${base}/prefix/-/v1/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(start.status).toBe(200);
      const { loginUrl, doneUrl } = (await start.json()) as any;
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

      // “浏览器”完成登录：直接写入 ready token，等价于 authorize+callback 成功。
      store.data.set(sessionId, "npm-token-xyz");

      const done2 = await globalThis.fetch(done);
      expect(done2.status).toBe(200);
      expect(await done2.json()).toEqual({ token: "npm-token-xyz" });

      // 同一事务第二次领取必须失败：一句话证明一次性消费。
      const done3 = await globalThis.fetch(done);
      expect(done3.status).toBe(expected.consumedStatus);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("v0.14.0: 202 pending体 → 200 token → 同一事务再读 403", async () => {
    const store = mapStore();
    const flow = new Tag014({ urlPrefix: "/prefix" }, {}, {}, store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    // “浏览器”在第二次 poll 前完成登录：直接写入 ready token，等价于
    // authorize+callback 成功。计数留在服务端，webLogin 只走真实 fetch。
    let polls = 0;
    app.get("/prefix/-/v1/done", (req, _res, next) => {
      polls += 1;
      if (polls === 2) store.data.set(String(req.query.sessionId), "npm-token-xyz");
      next();
    });
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));
    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      // 新版 webLogin 全程真实 HTTP：202 等待 → 浏览器完成 → 200 拿到 token。
      const token = await webLogin(`${base}/prefix`, { timeoutMs: 15_000 });
      expect(token).toBe("npm-token-xyz");
      expect(polls).toBeGreaterThanOrEqual(2);

      // 手工断言同一事务的每一步形状（202 体、Retry-After、一次性消费）。
      await runAgainst((s) => new Tag014({ urlPrefix: "/prefix" }, {}, {}, s), {
        pendingBody: { status: "pending", message: "token not ready yet" },
        consumedStatus: 403,
        pendingSessions: 1,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it("v0.20.0: 202 {} → 200 token → 同一事务再读 401", async () => {
    // 新版 webLogin 全程真实 HTTP。
    const store = mapStore();
    const flow = new Tag020({ urlPrefix: "/prefix" }, {}, {}, store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    let polls020 = 0;
    app.get("/prefix/-/v1/done", (req, _res, next) => {
      polls020 += 1;
      if (polls020 === 2) store.data.set(String(req.query.sessionId), "npm-token-xyz");
      next();
    });
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));
    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const token = await webLogin(`${base}/prefix`, { timeoutMs: 15_000 });
      expect(token).toBe("npm-token-xyz");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await runAgainst((s) => new Tag020({ urlPrefix: "/prefix" }, {}, {}, s), {
      pendingBody: {},
      consumedStatus: 401,
      pendingSessions: 1,
    });
  }, 30_000);

  it("worktree: 202 {} → 200 token → 同一事务再读 401", async () => {
    const makeFlow = (store: any) =>
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

    const store = mapStore();
    const flow = makeFlow(store);
    const app = express();
    app.use(express.json());
    app.post("/prefix/-/v1/login", (req, res, next) => flow.login(req, res, next));
    let pollsWorktree = 0;
    app.get("/prefix/-/v1/done", (req, _res, next) => {
      pollsWorktree += 1;
      if (pollsWorktree === 2) store.data.set(String(req.query.sessionId), "npm-token-xyz");
      next();
    });
    app.get("/prefix/-/v1/done", (req, res, next) => flow.done(req, res, next));
    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const token = await webLogin(`${base}/prefix`, { timeoutMs: 15_000 });
      expect(token).toBe("npm-token-xyz");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await runAgainst(makeFlow, { pendingBody: {}, consumedStatus: 401, pendingSessions: 1 });
  }, 30_000);
});
