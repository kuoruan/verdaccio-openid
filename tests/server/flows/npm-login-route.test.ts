import express from "express";

import { npmLoginPath } from "@/constants";
import { WebAuthFlow } from "@/server/flows/WebAuthFlow";
import type { WebAuthnSession } from "@/server/store/Store";

import { listen } from "@root/tests/helpers/listen";

/** No global parser: the route has to parse its own body. */
function buildApp() {
  const sessions = new Map<string, WebAuthnSession>();
  const app = express();

  const flow = new WebAuthFlow({ urlPrefix: "" } as any, {} as any, {} as any, {
    setWebAuthnSession: async (key: string, value: WebAuthnSession) => void sessions.set(key, value),
    getWebAuthnSession: async (key: string) => sessions.get(key),
    takeWebAuthnSession: async (key: string) => {
      const session = sessions.get(key);

      // Only a ready session is handed out and consumed.
      if (session?.status !== "ready") return session;

      sessions.delete(key);

      return session;
    },
    deleteWebAuthnSession: async (key: string) => void sessions.delete(key),
  });

  flow.register_middlewares(app);

  return { app, sessions };
}

describe(`POST ${npmLoginPath}`, () => {
  it("answers with the browser authorize URL as loginUrl and the done URL npm polls, and stores a pending session", async () => {
    const { app, sessions } = buildApp();
    const { port, close } = await listen(app);

    try {
      const response = await fetch(`http://127.0.0.1:${port}${npmLoginPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // What `npm login --auth-type=web` sends.
        body: JSON.stringify({ create: true }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as { loginUrl: string; doneUrl: string };

      expect(body.loginUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/-\/oauth\/authorize\/authn\?sessionId=/);
      expect(body.doneUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/-\/v1\/done\?sessionId=/);

      const sessionId = new URL(body.loginUrl).searchParams.get("sessionId")!;

      expect(new URL(body.doneUrl).searchParams.get("sessionId")).toBe(sessionId);
      expect(sessions.get(sessionId)).toEqual({ status: "pending" });
    } finally {
      await close();
    }
  }, 15_000);

  it("refuses a body that is not JSON", async () => {
    const { app, sessions } = buildApp();
    const { port, close } = await listen(app);

    try {
      const response = await fetch(`http://127.0.0.1:${port}${npmLoginPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"create":',
      });

      expect(response.status).toBe(400);
      expect(sessions.size).toBe(0);
    } finally {
      await close();
    }
  });
});
