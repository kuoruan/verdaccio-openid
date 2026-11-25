import { LOGIN_COOKIE_NAMES } from "@/server/constants";
import type { LoginResult } from "@/server/store/Store";
import InMemoryStore from "@/server/store/InMemory";
import { WebFlow } from "@/server/flows/WebFlow";

import { cookiesOf, fakeResponse } from "../../helpers/express";

const STATE = "state-123";

function fakeReq({ query = {}, body = {}, cookie }: { query?: any; body?: any; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: "registry.example.com" };

  if (cookie !== undefined) headers.cookie = `${LOGIN_COOKIE_NAMES.ui}=${cookie}`;

  return { query, body, headers, protocol: "https", url: "/-/oauth/callback" } as any;
}

function buildFlow({ store }: { store?: any } = {}) {
  const provider = {
    getId: () => "openid",
    getLoginUrl: vi.fn(async (redirectUrl: string, state?: string) => `https://idp/auth?state=${state}`),
    getToken: vi.fn(async () => ({ accessToken: "at", subject: "sub" })),
    getUserinfo: vi.fn(async () => ({ name: "dave", groups: ["developers"], subject: "sub" })),
  };
  const core = {
    getUserGroups: () => undefined,
    authenticate: () => true,
    filterRealGroups: (_name: string, groups: string[]) => groups,
    issueUiToken: async () => "UI_TOKEN",
    issueNpmToken: async () => "NPM_TOKEN",
  };

  const loginResults = new Map<string, LoginResult>();
  const defaultStore = {
    setLoginResult: vi.fn(async (key: string, value: LoginResult) => void loginResults.set(key, value)),
    takeLoginResult: vi.fn(async (key: string) => {
      const value = loginResults.get(key);

      loginResults.delete(key);

      return value;
    }),
  };

  const flow = new WebFlow({ urlPrefix: "" } as any, core as any, provider as any, (store ?? defaultStore) as any);

  return { flow, provider, core, store: store ?? defaultStore, loginResults };
}

describe("WebFlow", () => {
  describe("authorize", () => {
    it("binds the login to the browser with a cookie and a random state", async () => {
      const { flow, provider } = buildFlow();
      const res = fakeResponse();

      await flow.authorize(fakeReq(), res as any, (() => {}) as any);

      const state = new URL(res.redirectedTo!).searchParams.get("state")!;

      expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect(provider.getLoginUrl).toHaveBeenCalledWith(expect.any(String), state);
      expect(res.cookies).toHaveLength(1);
      const cookie = cookiesOf(res)[LOGIN_COOKIE_NAMES.ui];

      expect(cookie.value).toBe(state);
      // The binding cookie is kept for five minutes.
      expect(cookie.maxAge).toBe(300);
      expect(cookie.path).toBe("/");
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(true);
      expect(cookie.sameSite).toBe("lax");
    });
  });

  describe("callback", () => {
    it("refuses a callback this browser did not start", async () => {
      const { flow, provider } = buildFlow();
      const res = fakeResponse();

      await flow.callback(fakeReq({ query: { state: STATE, code: "c" } }), res as any, (() => {}) as any);

      expect(res.statusCode).toBe(400);
      expect(provider.getToken).not.toHaveBeenCalled();
    });

    it("refuses a callback whose cookie belongs to another state", async () => {
      const { flow, provider } = buildFlow();
      const res = fakeResponse();

      await flow.callback(
        fakeReq({ query: { state: STATE, code: "c" }, cookie: "another-state" }),
        res as any,
        (() => {}) as any,
      );

      expect(res.statusCode).toBe(400);
      expect(provider.getToken).not.toHaveBeenCalled();
    });

    it("stores the credentials and hands the browser a one-time code", async () => {
      const { flow, loginResults } = buildFlow();
      const res = fakeResponse();

      await flow.callback(
        fakeReq({ query: { state: STATE, code: "c" }, cookie: STATE }),
        res as any,
        (() => {}) as any,
      );

      expect(res.statusCode).toBe(302);
      expect(new URL(res.redirectedTo!).searchParams.get("code")).toBe(STATE);
      expect(res.redirectedTo).not.toContain("NPM_TOKEN");
      expect(res.redirectedTo).not.toContain("UI_TOKEN");
      expect(loginResults.get(STATE)).toEqual({
        username: "dave",
        uiToken: "UI_TOKEN",
        npmToken: "NPM_TOKEN",
      });
    });

    it("finishes a UI login while the browser also carries the npm WebAuth cookie", async () => {
      const { flow, loginResults } = buildFlow();
      const res = fakeResponse();
      const req = fakeReq({ query: { state: STATE, code: "c" }, cookie: STATE });

      req.headers.cookie += `; ${LOGIN_COOKIE_NAMES.npm}=${"b".repeat(43)}`;

      await flow.callback(req, res as any, (() => {}) as any);

      expect(res.statusCode).toBe(302);
      expect(loginResults.get(STATE)).toBeDefined();
    });

    it("does not store anything for a user the groups do not accept", async () => {
      const { flow, loginResults } = buildFlow();
      (flow as any).core.authenticate = () => false;

      const res = fakeResponse();

      await flow.callback(
        fakeReq({ query: { state: STATE, code: "c" }, cookie: STATE }),
        res as any,
        (() => {}) as any,
      );

      expect(res.statusCode).toBe(401);
      expect(loginResults.size).toBe(0);
    });
  });

  describe("session", () => {
    async function completeLogin() {
      const context = buildFlow();
      const callbackRes = fakeResponse();

      await context.flow.callback(
        fakeReq({ query: { state: STATE, code: "c" }, cookie: STATE }),
        callbackRes as any,
        (() => {}) as any,
      );

      return context;
    }

    it("requires the code", async () => {
      const { flow } = await completeLogin();
      const res = fakeResponse();

      await flow.session(fakeReq({ body: {} }), res as any, (() => {}) as any);

      expect(res.statusCode).toBe(400);
    });

    it("hands the credentials to the browser that carries the cookie", async () => {
      const { flow } = await completeLogin();
      const res = fakeResponse();

      await flow.session(fakeReq({ body: { code: STATE }, cookie: STATE }), res as any, (() => {}) as any);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toEqual({ username: "dave", uiToken: "UI_TOKEN", npmToken: "NPM_TOKEN" });
      expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.ui]?.expires).toEqual(new Date(0));
    });

    it("hands the credentials out once, even to requests that arrive together", async () => {
      // A real store, so the "read and consume" step is exercised, not mocked.
      const { flow } = buildFlow({ store: new InMemoryStore() });
      const callbackRes = fakeResponse();

      await flow.callback(
        fakeReq({ query: { state: STATE, code: "c" }, cookie: STATE }),
        callbackRes as any,
        (() => {}) as any,
      );

      const responses = await Promise.all(
        [fakeResponse(), fakeResponse()].map(async (res) => {
          await flow.session(fakeReq({ body: { code: STATE }, cookie: STATE }), res as any, (() => {}) as any);

          return res;
        }),
      );

      const accepted = responses.filter((res) => res.statusCode === 200);

      expect(accepted).toHaveLength(1);
      expect(responses.filter((res) => res.statusCode === 401)).toHaveLength(1);
    });

    it("refuses a code planted in another browser", async () => {
      const { flow } = await completeLogin();

      const withoutCookie = fakeResponse();
      await flow.session(fakeReq({ body: { code: STATE } }), withoutCookie as any, (() => {}) as any);

      expect(withoutCookie.statusCode).toBe(401);
      expect(withoutCookie.jsonBody).toEqual({ error: "login does not belong to this browser" });

      const otherCookie = fakeResponse();
      await flow.session(
        fakeReq({ body: { code: STATE }, cookie: "another-state" }),
        otherCookie as any,
        (() => {}) as any,
      );

      expect(otherCookie.statusCode).toBe(401);
    });

    it("hands the credentials out once", async () => {
      const { flow } = await completeLogin();

      const first = fakeResponse();
      await flow.session(fakeReq({ body: { code: STATE }, cookie: STATE }), first as any, (() => {}) as any);
      expect(first.statusCode).toBe(200);

      const second = fakeResponse();
      await flow.session(fakeReq({ body: { code: STATE }, cookie: STATE }), second as any, (() => {}) as any);
      expect(second.statusCode).toBe(401);
      expect(second.jsonBody).toEqual({ error: "login expired" });
    });
  });
});
