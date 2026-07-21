import { buildCliState, parseCliPort } from "@/cli-state";

describe("buildCliState / parseCliPort", () => {
  it("round-trips the CLI callback port through the state", () => {
    const state = buildCliState("18239");

    expect(state).toMatch(/~18239$/);
    expect(parseCliPort(state)).toBe("18239");
  });

  it("generates a fresh random prefix per call", () => {
    expect(buildCliState("8239")).not.toBe(buildCliState("8239"));
  });

  it("returns undefined when there is no state", () => {
    expect(parseCliPort(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string state", () => {
    expect(parseCliPort("")).toBeUndefined();
  });

  it("returns undefined when the state has no port suffix", () => {
    expect(parseCliPort("just-a-random-state")).toBeUndefined();
  });

  it("returns undefined when the suffix is not a port number", () => {
    expect(parseCliPort("abc~xyz")).toBeUndefined();
  });

  it("reads only the last separator's suffix", () => {
    expect(parseCliPort("a~b~9000")).toBe("9000");
  });
});
