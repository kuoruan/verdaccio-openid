import { SESSION_ID_LENGTH } from "@/server/flows/WebAuthFlow";
import { getOpenIDClient } from "@/server/openid/client";

describe("WebAuthFlow", () => {
  it("Should generate right sessionId", async () => {
    const openidClient = await getOpenIDClient();
    const sessionId = openidClient.randomState();
    expect(sessionId.length).toBe(SESSION_ID_LENGTH);
  });
});
