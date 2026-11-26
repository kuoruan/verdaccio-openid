import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import open from "open";

import { CLI_TIMEOUT_MS, CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS, CLI_WEB_LOGIN_POLL_INTERVAL_MS } from "@/cli/constants";
import { webLogin } from "@/cli/web-login";
import mockLogger from "@/cli/logger";

vi.mock("open", () => ({ default: vi.fn() }));

vi.mock("@/cli/logger", () => ({
  default: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Keep real HTTP tests fast while allowing the browser deadline to be adjusted.
const { openBrowserBound } = vi.hoisted(() => ({ openBrowserBound: { ms: 20 } }));

vi.mock("@/cli/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/cli/constants")>();

  return {
    ...actual,
    CLI_WEB_LOGIN_POLL_INTERVAL_MS: 10,
    CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS: 40,
    get CLI_OPEN_BROWSER_TIMEOUT_MS() {
      return openBrowserBound.ms;
    },
  };
});

const registry = "https://registry.example.com/prefix";
const loginPath = "https://registry.example.com/prefix/-/v1/login";
const donePath = "https://registry.example.com/prefix/-/v1/done";
const authorizeUrl = "https://registry.example.com/prefix/-/oauth/authorize/authn?sessionId=abc";

/** The two transaction URLs the login request hands back. */
function transactionUrls() {
  return { loginUrl: authorizeUrl, doneUrl: `${donePath}?sessionId=abc` };
}

/**
 * A 200 whose body starts but never finishes.
 *
 * The declared Content-Length is what makes an aborted read a clean error:
 * without it undici treats the truncated body as complete and trips an
 * internal assert on the already-aborted request (verified separately).
 */
const HANGING_BODY = '{"token":"never-arrives"}';

function hangingBody(request: Request) {
  const bytes = new TextEncoder().encode(HANGING_BODY);

  return new HttpResponse(
    new ReadableStream({
      start(controller) {
        // A real prefix, so the read has a body in progress.
        controller.enqueue(bytes.subarray(0, 8));
        request.signal.addEventListener(
          "abort",
          () => {
            try {
              controller.error(new DOMException("Aborted", "AbortError"));
            } catch {
              // Already closed by the client.
            }
          },
          { once: true },
        );
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", "content-length": String(bytes.byteLength) },
    },
  );
}

/** A request that never answers, so only the login's deadline can end it. */
function neverAnswers() {
  return new Promise<never>(() => {});
}

const server = setupServer();

beforeAll(() => {
  // A request without a handler must fail the test, not reach the network.
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
  openBrowserBound.ms = 20;
});

afterAll(() => {
  server.close();
});

describe("webLogin", () => {
  const openMock = vi.mocked(open);

  const login = (overrides: Parameters<typeof webLogin>[1] = {}) => webLogin(registry, overrides);

  beforeEach(() => {
    const logger = vi.mocked(mockLogger);
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    openMock.mockReset();
    openMock.mockResolvedValue(undefined as any);
  });

  it("completes through the npm web protocol and returns the token", async () => {
    let polls = 0;
    server.use(
      http.post(loginPath, async ({ request }) => {
        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toContain("application/json");
        expect(await request.text()).toBe("{}");
        return HttpResponse.json(transactionUrls());
      }),
      http.get(donePath, ({ request }) => {
        expect(new URL(request.url).searchParams.get("sessionId")).toBe("abc");
        polls += 1;
        if (polls === 1) return new HttpResponse(null, { status: 202, headers: { "retry-after": "1" } });
        return HttpResponse.json({ token: "npm-token" });
      }),
    );

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");
    expect(polls).toBe(2);
    // The URL handed to the browser is the normalized authorize URL.
    expect(openMock).toHaveBeenCalledWith(authorizeUrl);
  }, 15_000);

  it("polls the normalized done URL rather than the raw one", async () => {
    const polled: string[] = [];
    const openMock = vi.mocked(open);
    server.use(
      // Dot segments normalize away: both the opened and the polled URL must
      // be the normalized form, never the raw string the server returned.
      http.post(loginPath, () =>
        HttpResponse.json({
          loginUrl: "https://registry.example.com/prefix/./-/oauth/authorize/authn?sessionId=abc",
          doneUrl: "https://registry.example.com/prefix/./-/v1/done?sessionId=abc",
        }),
      ),
      http.get(donePath, ({ request }) => {
        polled.push(request.url);
        return HttpResponse.json({ token: "npm-token" });
      }),
    );

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");
    expect(openMock).toHaveBeenCalledWith(authorizeUrl);
    expect(polled).toEqual(["https://registry.example.com/prefix/-/v1/done?sessionId=abc"]);
  }, 15_000);

  it("does not follow a redirect given by the start request", async () => {
    let redirectTargetHit = false;
    server.use(
      http.post(
        loginPath,
        () => new HttpResponse(null, { status: 302, headers: { location: "https://evil.example.com/login" } }),
      ),
      http.get("https://evil.example.com/login", () => {
        redirectTargetHit = true;
        return HttpResponse.json(transactionUrls());
      }),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/login request failed with status 302/);
    expect(redirectTargetHit).toBe(false);
  });

  it("refuses a loginUrl on another origin", async () => {
    server.use(
      http.post(loginPath, () =>
        HttpResponse.json({ loginUrl: "https://evil.example.com/-/web/login", doneUrl: transactionUrls().doneUrl }),
      ),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/another origin/);
    expect(openMock).not.toHaveBeenCalled();
  });

  it("refuses a doneUrl on another origin", async () => {
    server.use(
      http.post(loginPath, () =>
        HttpResponse.json({ loginUrl: authorizeUrl, doneUrl: "https://evil.example.com/-/v1/done?sessionId=abc" }),
      ),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/another origin/);
    expect(openMock).not.toHaveBeenCalled();
  });

  it("refuses a transaction URL outside the registry prefix", async () => {
    server.use(
      http.post(loginPath, () =>
        HttpResponse.json({
          loginUrl: "https://registry.example.com/other/-/web/login",
          doneUrl: transactionUrls().doneUrl,
        }),
      ),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/outside the registry/);
  });

  it("refuses a transaction URL that only shares the prefix's characters", async () => {
    server.use(
      http.post(loginPath, () =>
        HttpResponse.json({
          loginUrl: authorizeUrl,
          doneUrl: "https://registry.example.com/prefix-evil/-/v1/done",
        }),
      ),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/outside the registry/);
  });

  it.each([
    ["clamps an excessive Retry-After", "99999", CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS],
    ["uses the default for an unusable Retry-After", "0", CLI_WEB_LOGIN_POLL_INTERVAL_MS],
  ])("%s", async (_label, retryAfter, interval) => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(transactionUrls()))
      .mockResolvedValueOnce(new Response(null, { status: 202, headers: { "retry-after": retryAfter } }))
      .mockResolvedValueOnce(Response.json({ token: "npm-token" }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const pending = login({ timeoutMs: 60_000 });
      const result = expect(pending).resolves.toBe("npm-token");

      await vi.advanceTimersByTimeAsync(CLI_WEB_LOGIN_POLL_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(interval - 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await result;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it.each([
    ["https://user:pass@registry.example.com/prefix/-/web/login", /credentials/],
    ["ftp://registry.example.com/prefix/-/web/login", /protocol/],
  ])("refuses the transaction URL %s", async (loginUrl, expected) => {
    server.use(http.post(loginPath, () => HttpResponse.json({ loginUrl, doneUrl: transactionUrls().doneUrl })));

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(expected);
  });

  it("treats 401 while polling as a rejected login", async () => {
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => new HttpResponse(null, { status: 401 })),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/rejected/);
  });

  it.each([302, 500])("fails on unexpected poll status %i", async (status) => {
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => new HttpResponse(null, { status })),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/polling failed/);
  });

  it.each([{}, { token: "" }, { token: "bad token!" }])("fails on an unusable 200 payload %j", async (body) => {
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => HttpResponse.json(body)),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/unexpected response/);
  });

  it("fails when the start request is not a 200 with two URLs", async () => {
    server.use(http.post(loginPath, () => new HttpResponse(null, { status: 404 })));

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/login request failed/);

    server.resetHandlers();
    server.use(http.post(loginPath, () => HttpResponse.json({ loginUrl: authorizeUrl })));

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/unexpected response/);
  });

  it("does not follow a redirect given by the poll", async () => {
    let redirectTargetHit = false;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () =>
        HttpResponse.json({ token: "x" }, { status: 302, headers: { location: "https://evil.example.com/t" } }),
      ),
      http.get("https://evil.example.com/t", () => {
        redirectTargetHit = true;
        return HttpResponse.json({ token: "evil" });
      }),
    );

    await expect(login({ timeoutMs: 60_000 })).rejects.toThrow(/polling failed with status 302/);
    expect(redirectTargetHit).toBe(false);
  });

  it("prints the login URL before it asks the browser to open", async () => {
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => HttpResponse.json({ token: "npm-token" })),
    );

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");

    const logger = vi.mocked(mockLogger);
    expect(logger.info).toHaveBeenCalledWith(authorizeUrl);
    expect(logger.info.mock.invocationCallOrder[0]).toBeLessThan(openMock.mock.invocationCallOrder[0]);
  }, 15_000);

  it("falls back to the URL and keeps polling when the launcher hangs past its own bound", async () => {
    let polls = 0;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => {
        polls += 1;
        if (polls === 1) return new HttpResponse(null, { status: 202 });
        return HttpResponse.json({ token: "npm-token" });
      }),
    );
    openMock.mockReturnValue(new Promise(() => {}) as any);

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");
    expect(polls).toBe(2);

    const logger = vi.mocked(mockLogger);
    expect(logger.error).toHaveBeenCalledWith("Failed to open browser window.");
    expect(logger.info).toHaveBeenCalledWith(authorizeUrl);
  });

  it("falls back to a manual URL when opening the browser fails, then keeps polling", async () => {
    let polls = 0;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => {
        polls += 1;
        if (polls === 1) return new HttpResponse(null, { status: 202 });
        return HttpResponse.json({ token: "npm-token" });
      }),
    );
    openMock.mockRejectedValueOnce(new Error("no browser"));

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");

    const logger = vi.mocked(mockLogger);
    expect(logger.error).toHaveBeenCalledWith("Failed to open browser window.");
    expect(logger.warn).toHaveBeenCalledWith("Please visit the following URL manually:");
    expect(logger.info).toHaveBeenCalledWith(authorizeUrl);
  }, 15_000);

  it("treats an AbortError from the browser as a manual fallback while the deadline is still open", async () => {
    let polls = 0;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, () => {
        polls += 1;
        if (polls === 1) return new HttpResponse(null, { status: 202 });
        return HttpResponse.json({ token: "npm-token" });
      }),
    );
    openMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    await expect(login({ timeoutMs: 60_000 })).resolves.toBe("npm-token");

    const logger = vi.mocked(mockLogger);
    expect(logger.error).toHaveBeenCalledWith("Failed to open browser window.");
    expect(logger.warn).toHaveBeenCalledWith("Please visit the following URL manually:");
    expect(logger.info).toHaveBeenCalledWith(authorizeUrl);
  }, 15_000);

  it("times out when opening the browser hangs", async () => {
    server.use(http.post(loginPath, () => HttpResponse.json(transactionUrls())));
    openMock.mockReturnValue(new Promise(() => {}) as any);
    // The launcher outlives the whole login, so it is the deadline that ends it.
    openBrowserBound.ms = 60_000;

    // No poll can start: opening the browser itself exceeded the deadline.
    await expect(login({ timeoutMs: 1_000 })).rejects.toThrow(/timed out/);
  }, 15_000);

  it("times out when the start request hangs", async () => {
    let postAborted = false;
    server.use(
      http.post(loginPath, ({ request }) => {
        request.signal.addEventListener("abort", () => (postAborted = true), { once: true });
        return neverAnswers();
      }),
    );

    await expect(login({ timeoutMs: 1_000 })).rejects.toThrow(/timed out/);
    // The deadline reaches the outstanding request, not just the caller.
    expect(postAborted).toBe(true);
  }, 15_000);

  it("times out while a poll response body hangs", async () => {
    let pollAborted = false;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, ({ request }) => {
        // Headers arrive at once, the body starts and then stalls: the read is
        // in progress when the deadline aborts it.
        request.signal.addEventListener("abort", () => (pollAborted = true), { once: true });
        return hangingBody(request);
      }),
    );

    // Call through the real parser: the first json() is the start response,
    // the second is the poll body, which must still be reading when aborted.
    const originalJson = Response.prototype.json;
    let jsonCalls = 0;
    let pollJsonReadStarted = false;
    const jsonSpy = vi.spyOn(Response.prototype, "json").mockImplementation(function (this: Response) {
      jsonCalls += 1;
      if (jsonCalls === 2) pollJsonReadStarted = true;
      return originalJson.call(this);
    });

    try {
      await expect(login({ timeoutMs: 3_000 })).rejects.toThrow(/timed out/);
      expect(pollAborted).toBe(true);
      // The poll answered 200 and its body was being read, not just awaited.
      expect(jsonCalls).toBe(2);
      expect(pollJsonReadStarted).toBe(true);
    } finally {
      jsonSpy.mockRestore();
    }
  }, 15_000);

  it("uses CLI_TIMEOUT_MS when the caller passes no timeout", async () => {
    let pollStarted = false;
    let pollAborted = false;
    server.use(
      http.post(loginPath, () => HttpResponse.json(transactionUrls())),
      http.get(donePath, ({ request }) => {
        pollStarted = true;
        request.signal.addEventListener("abort", () => (pollAborted = true), { once: true });
        return hangingBody(request);
      }),
    );

    // Only the login's own timers are faked: MSW and the fetch internals keep
    // their real scheduling, and the boundary of the default deadline is exact.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      let settled = false;
      const pending = login();
      // Register the rejection handler before advancing, so a late rejection
      // is never unhandled.
      const assertion = expect(pending).rejects.toThrow(/timed out/);
      void pending.then(
        () => (settled = true),
        () => (settled = true),
      );

      // Drive the first wait so the poll is actually in flight, counting
      // every millisecond of fake time that has elapsed.
      let elapsed = 0;
      for (let i = 0; i < 100 && !pollStarted; i += 1) {
        await vi.advanceTimersByTimeAsync(50);
        elapsed += 50;
      }
      expect(pollStarted).toBe(true);
      expect(elapsed).toBeLessThan(CLI_TIMEOUT_MS);

      // Stop one millisecond short of the default deadline.
      const beforeDeadline = CLI_TIMEOUT_MS - 1 - elapsed;
      await vi.advanceTimersByTimeAsync(beforeDeadline);
      elapsed += beforeDeadline;
      expect(elapsed).toBe(CLI_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      expect(pollAborted).toBe(false);

      // The last millisecond crosses the deadline: only now may it end.
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(settled).toBe(true);
      expect(pollAborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);
});
