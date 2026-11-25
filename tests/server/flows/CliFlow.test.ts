import { messageCliUpgrade } from "@/server/constants";
import { CliFlow } from "@/server/flows/CliFlow";

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function fakeReq(query: Record<string, unknown>) {
  return { query, headers: { host: "registry.example.com" }, protocol: "https" } as any;
}

describe("CliFlow", () => {
  const flow = new CliFlow();

  it("answers the old authorize route with the versions it needs", async () => {
    const res = fakeRes();

    await flow.upgrade(fakeReq({ port: "18239", state: "abc" }), res as any, (() => {}) as any);

    expect(res.statusCode).toBe(400);
    expect(String(res.body)).toContain(messageCliUpgrade);
  });

  it("answers the old callback route with the versions it needs", async () => {
    const res = fakeRes();

    await flow.upgrade(fakeReq({ state: "P-abc~18239", code: "c" }), res as any, (() => {}) as any);

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
