import { messageCliUpgrade } from "@/server/constants";
import { CliFlow } from "@/server/flows/CliFlow";

import { fakeResponse } from "@root/tests/helpers/express";

function fakeReq(query: Record<string, unknown>) {
  return { query, headers: { host: "registry.example.com" }, protocol: "https" } as any;
}

describe("CliFlow", () => {
  const flow = new CliFlow();

  it.each(["8239", "18239"])("sends the browser back to port %s, where that CLI waits", async (port) => {
    const res = fakeResponse();

    await flow.upgrade(fakeReq({ port, state: "abc" }), res as any, (() => {}) as any);

    const target = new URL(res.redirectedTo!);

    expect(res.statusCode).toBe(302);
    expect(target.origin).toBe(`http://localhost:${port}`);
    expect(target.searchParams.get("status")).toBe("error");
    expect(target.searchParams.get("message")).toBe(messageCliUpgrade);
    // The old flow redirected a token here; this one carries nothing beyond the notice.
    expect([...target.searchParams.keys()].sort()).toEqual(["message", "status"]);
    expect(res.body).toBeUndefined();
  });

  it("sends a CLI from before 0.18.0, which never reports a port, to the default one", async () => {
    const res = fakeResponse();

    await flow.upgrade(fakeReq({}), res as any, (() => {}) as any);

    expect(res.statusCode).toBe(302);
    expect(new URL(res.redirectedTo!).origin).toBe("http://localhost:8239");
  });

  it("ignores a state that carries a port, falling back to the default", async () => {
    const res = fakeResponse();

    await flow.upgrade(fakeReq({ state: "P-abc~18239", code: "c" }), res as any, (() => {}) as any);

    expect(res.statusCode).toBe(302);
    expect(new URL(res.redirectedTo!).origin).toBe("http://localhost:8239");
  });

  it.each([
    ["an empty port", ""],
    ["a look-alike port", "8239x"],
    ["another port", "8080"],
    ["a repeated parameter", ["8239", "18239"]],
    ["a nested object", { port: "8239" }],
    ["null", null],
  ])("keeps the page for %s, which no CLI listened on", async (_label, port) => {
    const res = fakeResponse();

    await flow.upgrade(fakeReq({ port }), res as any, (() => {}) as any);

    expect(res.redirectedTo).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect(String(res.body)).toContain(messageCliUpgrade);
  });

  it("registers both old routes", () => {
    const get = vi.fn();
    flow.register_middlewares({ get } as any);

    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([expect.stringContaining("/authorize/cli"), expect.stringContaining("/callback/cli")]),
    );
  });
});
