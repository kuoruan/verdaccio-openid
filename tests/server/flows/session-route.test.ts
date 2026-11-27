/**
 * The `POST /-/oauth/session` route on a real express app: the cookie a
 * browser carries decides whether the code behind it can be collected.
 */
import express from "express";

import { LOGIN_COOKIE_NAMES } from "@/server/constants";
import type { LoginResult } from "@/server/store/Store";
import { WebFlow } from "@/server/flows/WebFlow";

import { listen } from "@root/tests/helpers/listen";

const CODE = "code-1";

/** No global parser: the route has to parse its own body. */
function buildApp() {
  const loginResults = new Map<string, LoginResult>();
  const app = express();

  const flow = new WebFlow(
    { urlPrefix: "" } as any,
    {
      getUserGroups: () => undefined,
      authenticate: () => true,
      filterRealGroups: (_name: string, groups: string[]) => groups,
      issueUiToken: async () => "UI_TOKEN",
      issueNpmToken: async () => "NPM_TOKEN",
    } as any,
    {
      getId: () => "openid",
      getLoginUrl: vi.fn(async (redirectUrl: string, state?: string) => `https://idp/auth?state=${state}`),
      getToken: vi.fn(async () => ({ accessToken: "at", subject: "sub" })),
      getUserinfo: vi.fn(async () => ({ name: "dave", groups: ["developers"], subject: "sub" })),
    },
    {
      setLoginResult: async (key: string, value: LoginResult) => void loginResults.set(key, value),
      takeLoginResult: async (key: string) => {
        const value = loginResults.get(key);

        loginResults.delete(key);

        return value;
      },
    },
  );

  flow.register_middlewares(app);

  return { app, flow };
}

/** Run the full browser round trip against the app: authorize, callback, session. */
async function login(port: number, { cookie }: { cookie?: string } = {}) {
  const base = `http://127.0.0.1:${port}`;
  const headers: Record<string, string> = cookie ? { cookie: `${LOGIN_COOKIE_NAMES.ui}=${cookie}` } : {};
  // The authorize step generates the state, so read the cookie it sets.
  const authorize = await fetch(`${base}/-/oauth/authorize`, { headers, redirect: "manual" });
  const idpUrl = new URL(authorize.headers.get("location")!, base);
  const setCookie = authorize.headers.getSetCookie()[0] ?? "";
  const state = idpUrl.searchParams.get("state")!;

  const callback = await fetch(`${base}/-/oauth/callback?state=${state}&code=c`, {
    headers: { cookie: `${LOGIN_COOKIE_NAMES.ui}=${state}` },
    redirect: "manual",
  });

  return {
    setCookie,
    uiUrl: callback.headers.get("location") ?? "",
    state,
  };
}

describe("POST /-/oauth/session", () => {
  it("hands the credentials to the browser that carries the cookie, and only once", async () => {
    const { app } = buildApp();
    const { port, close } = await listen(app);

    try {
      const { setCookie, uiUrl } = await login(port, { cookie: CODE });
      const code = new URL(uiUrl, `http://127.0.0.1:${port}`).searchParams.get("code");

      // Max-Age is the only lifetime the cookie carries; the store decides the rest.
      expect(setCookie).toContain("Max-Age=300");

      const session = (cookie?: string) =>
        fetch(`http://127.0.0.1:${port}/-/oauth/session`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
          body: JSON.stringify({ code }),
        }).then(async (response) => ({
          status: response.status,
          setCookie: response.headers.getSetCookie()[0] ?? "",
          body: await response.json(),
        }));

      // A code without its cookie is refused.
      await expect(session()).resolves.toMatchObject({ status: 401 });

      const collected = await session(setCookie.split(";")[0]);

      expect(collected).toMatchObject({
        status: 200,
        body: { username: "dave", uiToken: "UI_TOKEN", npmToken: "NPM_TOKEN" },
      });
      expect(collected.setCookie).not.toMatch(/max-age/i);

      // The code is spent.
      await expect(session(setCookie.split(";")[0])).resolves.toMatchObject({ status: 401 });
    } finally {
      await close();
    }
  }, 15_000);

  it("refuses a body that is not JSON", async () => {
    const { app } = buildApp();
    const { port, close } = await listen(app);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/-/oauth/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"code":',
      });

      expect(response.status).toBe(400);
      await expect(response.text()).resolves.not.toContain("missing code");
    } finally {
      await close();
    }
  });
});
