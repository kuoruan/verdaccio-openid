/**
 * Unwrap the default export of a CommonJS module, or pass an ES module through.
 *
 * @param m the module, or a promise for it
 * @returns the value the module exports as default, or the module itself
 */
import { isObject } from "@/utils";

export async function interopDefault<T>(m: PromiseLike<T> | T): Promise<T extends { default: infer U } ? U : T> {
  const resolved = await m;

  if (isObject(resolved) && "default" in resolved) {
    return (resolved as unknown as { default: any }).default;
  }

  return resolved as any;
}

/**
 * Import an optional peer dependency.
 *
 * @param modulePromise the dynamic import to attempt
 * @param errorMessage the message to throw when the module is not installed
 * @throws {Error} when the module cannot be found, with `errorMessage` and the original error as cause
 */
export async function importOptional<T>(modulePromise: Promise<T>, errorMessage: string): Promise<T> {
  try {
    return await modulePromise;
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      ((e as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
        e.message?.includes("Cannot find module") ||
        e.message?.includes("Cannot find package"))
    ) {
      throw new Error(errorMessage, { cause: e });
    }
    throw e;
  }
}
