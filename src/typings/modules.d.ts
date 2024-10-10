declare module "*/package.json" {
  export const name: string;
  export const version: string;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
