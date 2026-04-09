import { isValidSessionId, SESSION_ID_LENGTH, WebAuthFlow } from "@/server/flows/WebAuthFlow";
import { getOpenIDClient } from "@/server/openid/client";

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
      getWebAuthnToken: vi.fn().mockResolvedValue(null),
      deleteWebAuthnToken: vi.fn(),
      setWebAuthnToken: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn(),
      authenticate: vi.fn(),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { state: sessionId } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;

    await flow.callback(req, res, () => {
      // callback
    });

    expect(store.getWebAuthnToken).toHaveBeenCalledWith(sessionId);
    expect(provider.getToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should reject callback when session is not pending", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);

    const provider = {
      getToken: vi.fn(),
    };
    const store = {
      getWebAuthnToken: vi.fn().mockResolvedValue("issued-token"),
      deleteWebAuthnToken: vi.fn(),
      setWebAuthnToken: vi.fn(),
    };
    const core = {
      getUserGroups: vi.fn(),
      authenticate: vi.fn(),
      filterRealGroups: vi.fn(),
      issueNpmToken: vi.fn(),
    };

    const flow = new WebAuthFlow({ urlPrefix: "" } as any, core as any, provider as any, store as any);

    const req = { query: { state: sessionId } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;

    await flow.callback(req, res, () => {
      // callback
    });

    expect(store.getWebAuthnToken).toHaveBeenCalledWith(sessionId);
    expect(provider.getToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("should not delete session when done handler throws", async () => {
    const sessionId = "a".repeat(SESSION_ID_LENGTH);
    const error = new Error("store temporary failure");

    const provider = {
      getToken: vi.fn(),
    };
    const store = {
      getWebAuthnToken: vi.fn().mockRejectedValue(error),
      takeWebAuthnToken: vi.fn().mockRejectedValue(error),
      deleteWebAuthnToken: vi.fn(),
      setWebAuthnToken: vi.fn(),
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

    expect(store.takeWebAuthnToken).toHaveBeenCalledWith(sessionId, "__pending__");
    expect(store.deleteWebAuthnToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
