import { parseQueryParams, stringifyQueryParams } from "@/query-params";

describe("parseQueryParams", () => {
  it("should return empty object for empty string", () => {
    expect(parseQueryParams("")).toEqual({});
  });

  it("should parse single key-value pair", () => {
    expect(parseQueryParams("foo=bar")).toEqual({ foo: "bar" });
  });

  it("should parse multiple key-value pairs", () => {
    expect(parseQueryParams("foo=bar&baz=qux")).toEqual({
      baz: "qux",
      foo: "bar",
    });
  });

  it("should handle question mark prefix", () => {
    expect(parseQueryParams("?foo=bar")).toEqual({ foo: "bar" });
  });

  it("should decode URI components", () => {
    expect(parseQueryParams("foo=hello%20world")).toEqual({
      foo: "hello world",
    });
  });
});

describe("stringifyQueryParams", () => {
  it("should return empty string for empty object", () => {
    expect(stringifyQueryParams({})).toBe("");
  });

  it("should stringify single key-value pair", () => {
    expect(stringifyQueryParams({ foo: "bar" })).toBe("foo=bar");
  });

  it("should stringify multiple key-value pairs", () => {
    expect(stringifyQueryParams({ baz: "qux", foo: "bar" })).toBe("foo=bar&baz=qux");
  });

  it("should encode URI components", () => {
    expect(stringifyQueryParams({ foo: "hello world" })).toBe("foo=hello%20world");
  });
});
