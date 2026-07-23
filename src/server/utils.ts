/**
 * Unwrap the default export of a CJS module (or pass through if ESM).
 */
export async function interopDefault<T>(m: PromiseLike<T> | T): Promise<T extends { default: infer U } ? U : T> {
  const resolved = await m;

  if (!!resolved && typeof resolved === "object" && "default" in resolved) {
    return (resolved as { default: any }).default;
  }

  return resolved as any;
}

/**
 * Import an optional peer dependency, throwing a friendly error
 * if the module is not found (ERR_MODULE_NOT_FOUND).
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
