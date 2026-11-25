import { SESSION_ID_LENGTH } from "@/constants";
import { LOGIN_COOKIE_NAMES } from "@/server/constants";
import { isValidSessionId, WebAuthFlow } from "@/server/flows/WebAuthFlow";

import { cookiesOf, fakeResponse } from "../../helpers/express";
import { getOpenIDClient } from "@/server/openid/client";
import logger from "@/server/logger";

describe("WebAuthFlow", () => {
  it("Should generate right sessionId", async () => {
    const openidClient = await getOpenIDClient();
    const sessionId = openidClient.randomState();
    expect(sessionId.length).toBe(SESSION_ID_LENGTH);
    expect(isValidSessionId(sessionId)).toBe(true);
  });

  it("should reject sessionId with invalid length", () => {
    expect(isValidSessionId("short-session-id")).toBe(false);
    expect(isValidSessionId("a".repeat(SESSION_ID_LENGTH + 1))).toBe(false);
  });

  it("should reject sessionId with invalid characters", () => {
    const validPrefix = "a".repeat(SESSION_ID_LENGTH - 1);

    expect(isValidSessionId(`${validPrefix}=`)).toBe(false);
    expect(isValidSessionId(`${validPrefix}/`)).toBe(false);
  });

  it("should reject callback when session is missing", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = {
      getToken: vi.fn(),
    };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue(undefined),
      deleteWebAuthnSession: vi.fn(),
      setWebAuthnSession: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn(),
      authenticate: vi.fn(),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { state: sessionId }, headers: { cookie: `${LOGIN_COOKIE_NAMES.npm}=${sessionId}` } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
    } as any;

    await flow.callback(req, res, () => {
      // callback
    });

    expect(store.getWebAuthnSession).toHaveBeenCalledWith(sessionId);
    expect(provider.getToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should reject callback when session is not pending", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = {
      getToken: vi.fn(),
    };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue({ status: "ready", token: "issued-token" }),
      deleteWebAuthnSession: vi.fn(),
      setWebAuthnSession: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn(),
      authenticate: vi.fn(),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { state: sessionId }, headers: { cookie: `${LOGIN_COOKIE_NAMES.npm}=${sessionId}` } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
    } as any;

    await flow.callback(req, res, () => {
      // callback
    });

    expect(store.getWebAuthnSession).toHaveBeenCalledWith(sessionId);
    expect(provider.getToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should not finish a login this browser did not start", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = { getToken: vi.fn() };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue({ status: "pending" }),
      deleteWebAuthnSession: vi.fn(),
      setWebAuthnSession: vi.fn(),
    };
    const core = { issueNpmToken: vi.fn() };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    for (const headers of [{}, { cookie: `${LOGIN_COOKIE_NAMES.npm}=${"b".repeat(SESSION_ID_LENGTH)}` }]) {
      const req = { query: { state: sessionId }, headers } as any;
      const res = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any;

      await flow.callback(req, res, () => {
        // callback
      });

      expect(res.status).toHaveBeenCalledWith(400);
    }

    expect(store.getWebAuthnSession).not.toHaveBeenCalled();
    expect(provider.getToken).not.toHaveBeenCalled();
  });

  it("should bind the login to the browser that starts it", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = {
      getLoginUrl: vi.fn().mockResolvedValue("https://idp.example.com/authorize"),
    };
    const store = { deleteWebAuthnSession: vi.fn() };
    const core = {};

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { sessionId }, headers: { host: "registry.example.com" }, protocol: "https" } as any;
    const res = fakeResponse();

    await flow.authorize(req, res as any, () => {
      // callback
    });

    expect(provider.getLoginUrl).toHaveBeenCalledWith(expect.any(String), sessionId);
    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.npm].value).toBe(sessionId);
  });

  it("keeps the cookie of a UI login started in the same browser", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = {
      getLoginUrl: vi.fn().mockResolvedValue("https://idp.example.com/authorize"),
    };
    const flow = new WebAuthFlow(
      { urlPrefix: "" } as any,
      {} as any,
      provider as any,
      { deleteWebAuthnSession: vi.fn() } as any,
    );

    const req = {
      query: { sessionId },
      headers: { host: "registry.example.com", cookie: `${LOGIN_COOKIE_NAMES.ui}=ui-state` },
      protocol: "https",
    } as any;
    const res = fakeResponse();

    await flow.authorize(req, res as any, () => {
      // callback
    });

    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.npm].value).toBe(sessionId);
    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.ui]).toBeUndefined();
  });

  it("should not delete session when done handler throws", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const error = new Error("store temporary failure");

    const provider = {
      getToken: vi.fn(),
    };
    const store = {
      getWebAuthnSession: vi.fn().mockRejectedValue(error),
      takeWebAuthnSession: vi.fn().mockRejectedValue(error),
      deleteWebAuthnSession: vi.fn(),
      setWebAuthnSession: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn(),
      authenticate: vi.fn(),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { sessionId } } as any;
    const res = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    await flow.done(req, res, next);

    expect(store.takeWebAuthnSession).toHaveBeenCalledWith(sessionId);
    expect(store.deleteWebAuthnSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps the 500 response when dropping a failed session rejects", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const report = vi.spyOn(logger, "error").mockImplementation(() => {});

    const provider = { getLoginUrl: vi.fn().mockRejectedValue(new Error("idp down")) };
    const store = { deleteWebAuthnSession: vi.fn().mockRejectedValue(new Error("delete failed")) };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, {} as any, provider as any, store as any);

    const req = { query: { sessionId }, headers: { host: "registry.example.com" }, protocol: "https" } as any;
    const res = fakeResponse();

    await flow.authorize(req, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(500);
    expect(store.deleteWebAuthnSession).toHaveBeenCalledWith(sessionId);
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith({ message: "delete failed" }, "failed to drop the login session: @{message}"),
    );

    report.mockRestore();
  });

  it("keeps the 401 response when dropping a rejected session throws synchronously", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const report = vi.spyOn(logger, "error").mockImplementation(() => {});

    const provider = {
      getToken: vi.fn().mockResolvedValue("provider-token"),
      getUserinfo: vi.fn().mockResolvedValue({ name: "dave", groups: [] }),
    };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue({ status: "pending" }),
      deleteWebAuthnSession: vi.fn(() => {
        throw new Error("sync delete failure");
      }),
    };
    const core = {
      getUserGroups: vi.fn().mockReturnValue(undefined),
      authenticate: vi.fn().mockReturnValue(false),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { state: sessionId }, headers: { cookie: `${LOGIN_COOKIE_NAMES.npm}=${sessionId}` } } as any;
    const res = fakeResponse();

    await flow.callback(req, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(401);
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        { message: "sync delete failure" },
        "failed to drop the login session: @{message}",
      ),
    );

    report.mockRestore();
  });

  it("keeps the 500 response when a callback drops the session and the delete rejects", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const report = vi.spyOn(logger, "error").mockImplementation(() => {});

    const provider = { getToken: vi.fn().mockRejectedValue(new Error("provider failed")) };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue({ status: "pending" }),
      deleteWebAuthnSession: vi.fn().mockRejectedValue(new Error("delete failed")),
    };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, {} as any, provider as any, store as any);

    const req = { query: { state: sessionId }, headers: { cookie: `${LOGIN_COOKIE_NAMES.npm}=${sessionId}` } } as any;
    const res = fakeResponse();

    await flow.callback(req, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(500);
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith({ message: "delete failed" }, "failed to drop the login session: @{message}"),
    );

    report.mockRestore();
  });

  it("answers the login request with same-origin transaction URLs and stores a pending session", async () => {
    const store = {
      setWebAuthnSession: vi.fn(),
      getWebAuthnSession: vi.fn(),
      deleteWebAuthnSession: vi.fn(),
      takeWebAuthnSession: vi.fn(),
    };
    const flow = new WebAuthFlow({ urlPrefix: "/prefix" } as any, {} as any, {} as any, store as any);
    const req = { query: {}, headers: { host: "registry.example.com" }, protocol: "https" } as any;
    const res = fakeResponse();

    await flow.login(req, res as any, () => {
      // callback
    });

    const body = res.jsonBody as { loginUrl: string; doneUrl: string };

    expect(body.loginUrl).toMatch(/^https:\/\/registry\.example\.com\/prefix\/-\/oauth\/authorize\/authn\?sessionId=/);
    expect(body.doneUrl).toMatch(/^https:\/\/registry\.example\.com\/prefix\/-\/v1\/done\?sessionId=/);
    expect(store.setWebAuthnSession).toHaveBeenCalledWith(expect.any(String), { status: "pending" });
  });

  it("keeps a pending session pending and asks the client to poll again", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const store = { takeWebAuthnSession: vi.fn().mockResolvedValue({ status: "pending" }) };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, {} as any, {} as any, store as any);
    const res = fakeResponse();

    await flow.done({ query: { sessionId } } as any, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(202);
    expect(res.headers["retry-after"]).toBe("3");
  });

  it("returns the npm token of a ready session", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const store = { takeWebAuthnSession: vi.fn().mockResolvedValue({ status: "ready", token: "npm-token" }) };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, {} as any, {} as any, store as any);
    const res = fakeResponse();

    await flow.done({ query: { sessionId } } as any, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ token: "npm-token" });
  });

  it("issues the npm token on a successful callback and clears the binding cookie", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const provider = {
      getToken: vi.fn().mockResolvedValue("provider-token"),
      getUserinfo: vi.fn().mockResolvedValue({ name: "dave", groups: ["dev"] }),
    };
    const store = {
      getWebAuthnSession: vi.fn().mockResolvedValue({ status: "pending" }),
      setWebAuthnSession: vi.fn(),
      deleteWebAuthnSession: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn().mockReturnValue(undefined),
      authenticate: vi.fn().mockReturnValue(true),
      filterRealGroups: vi.fn().mockReturnValue(["dev"]),
      issueNpmToken: vi.fn().mockResolvedValue("npm-token"),
    };
    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);
    const req = { query: { state: sessionId }, headers: { cookie: `${LOGIN_COOKIE_NAMES.npm}=${sessionId}` } } as any;
    const res = fakeResponse();

    await flow.callback(req, res as any, () => {
      // callback
    });

    expect(res.statusCode).toBe(200);
    expect(store.setWebAuthnSession).toHaveBeenCalledWith(sessionId, { status: "ready", token: "npm-token" });
    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.npm].expires).toEqual(new Date(0));
  });
});
