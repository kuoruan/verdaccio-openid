declare module "*/package.json" {
  export const name: string;
  export const version: string;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
