declare module "*.json" {
  const name: string;
  const version: string;
  const bin: Record<string, string>;

  export default {
    name,
    version,
    bin,
  };
}
