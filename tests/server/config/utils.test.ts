import { getEnvironmentValue, getStoreFilePath, getTTLValue } from "@/server/config/utils";
import path from "node:path";

describe("getEnvironmentValue", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("should return undefined when env var is undefined", () => {
    expect(getEnvironmentValue("NON_EXISTENT")).toBeUndefined();
  });

  it("should return null when env var is null", () => {
    process.env.TEST_NULL = null as any;
    expect(getEnvironmentValue("TEST_NULL")).toBeNull();
  });

  it('should return true for string "true"', () => {
    process.env.TEST_BOOL = "true";
    expect(getEnvironmentValue("TEST_BOOL")).toBe(true);
  });

  it('should return false for string "false"', () => {
    process.env.TEST_BOOL = "false";
    expect(getEnvironmentValue("TEST_BOOL")).toBe(false);
  });

  it("should return parsed object for valid JSON object string", () => {
    process.env.TEST_JSON = '{"key": "value"}';
    expect(getEnvironmentValue("TEST_JSON")).toEqual({ key: "value" });
  });

  it("should return original string for invalid JSON", () => {
    process.env.TEST_INVALID_JSON = "{invalid json}";
    expect(getEnvironmentValue("TEST_INVALID_JSON")).toBe("{invalid json}");
  });

  it("should return original string for JSON non-object values", () => {
    process.env.TEST_JSON_STRING = '"test"';
    expect(getEnvironmentValue("TEST_JSON_STRING")).toBe('"test"');
  });

  it("should return original string for regular string value", () => {
    process.env.TEST_STRING = "hello";
    expect(getEnvironmentValue("TEST_STRING")).toBe("hello");
  });
});

describe("getStoreFilePath", () => {
  it("should return absolute path unchanged", () => {
    const absolutePath = path.resolve("/absolute/path/to/store");
    expect(getStoreFilePath("/config/path", absolutePath)).toBe(absolutePath);
  });

  it("should resolve relative path relative to config path", () => {
    const configPath = "/path/to/config/file.yaml";
    const relativePath = "../../store";
    const expected = path.normalize("/path/store");

    expect(getStoreFilePath(configPath, relativePath)).toBe(expected);
  });

  it("should normalize path separators", () => {
    const configPath = "/path/to/config/file.yaml";
    const relativePath = String.raw`store\subdir`;
    const expected = path.normalize(String.raw`/path/to/config/store\subdir`);

    expect(getStoreFilePath(configPath, relativePath)).toBe(expected);
  });
});

describe("getTTLValue", () => {
  it("should return undefined when input is undefined", () => {
    expect(getTTLValue()).toBeUndefined();
  });

  it("should return same number when input is number", () => {
    expect(getTTLValue(1000)).toBe(1000);
  });

  it("should parse string values using ms", () => {
    expect(getTTLValue("1s")).toBe(1000);
    expect(getTTLValue("1m")).toBe(60_000);
    expect(getTTLValue("1h")).toBe(3_600_000);
  });

  it("should return undefined when input is invalid string", () => {
    expect(getTTLValue("invalid")).toBeUndefined();
  });
});
