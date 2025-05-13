import { generators } from "openid-client";

import { SESSION_ID_BYTES, SESSION_ID_LENGTH } from "@/server/flows/WebAuthFlow";

describe("WebAuthFlow", () => {
  it("Should generate right sessionId", () => {
    const sessionId = generators.random(SESSION_ID_BYTES);
    expect(sessionId.length).toBe(SESSION_ID_LENGTH);
  });
});
