import { ERRORS } from "@/server/constants";

export function createDiscoveryError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: ${error.message}`, { cause: error });
  }

  return new Error(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: ${String(error)}`);
}

export function createDiscoveryCooldownError(error: Error, remainingMs: number): Error {
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return new Error(
    `${ERRORS.CONFIGURATION_DISCOVERY_RETRY_LATER}. Retry after ${remainingSeconds}s. Last error: ${error.message}`,
    { cause: error },
  );
}
