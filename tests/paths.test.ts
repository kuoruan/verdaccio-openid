import { getAuthorizePath, getCallbackPath } from "@/paths";

describe("getAuthorizePath", () => {
  it("should return base authorize path when no id is provided", () => {
    expect(getAuthorizePath()).toBe("/-/oauth/authorize");
  });

  it("should append id to authorize path", () => {
    expect(getAuthorizePath("cli")).toBe("/-/oauth/authorize/cli");
  });

  it("should append custom id to authorize path", () => {
    expect(getAuthorizePath("authn")).toBe("/-/oauth/authorize/authn");
  });

  it("should treat empty string id as no id (falsy)", () => {
    expect(getAuthorizePath("")).toBe("/-/oauth/authorize");
  });
});

describe("getCallbackPath", () => {
  it("should return base callback path when no id is provided", () => {
    expect(getCallbackPath()).toBe("/-/oauth/callback");
  });

  it("should append id to callback path", () => {
    expect(getCallbackPath("cli")).toBe("/-/oauth/callback/cli");
  });

  it("should append custom id to callback path", () => {
    expect(getCallbackPath("authn")).toBe("/-/oauth/callback/authn");
  });

  it("should treat empty string id as no id (falsy)", () => {
    expect(getCallbackPath("")).toBe("/-/oauth/callback");
  });
});
