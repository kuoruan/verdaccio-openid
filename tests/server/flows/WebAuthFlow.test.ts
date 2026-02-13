import { randomState } from "openid-client";

import { SESSION_ID_LENGTH } from "@/server/flows/WebAuthFlow";

describe("WebAuthFlow", () => {
  it("Should generate right sessionId", () => {
    const sessionId = randomState();
    expect(sessionId.length).toBe(SESSION_ID_LENGTH);
  });
});
