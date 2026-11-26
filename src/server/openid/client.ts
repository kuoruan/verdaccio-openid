import type * as OpenIDClient from "openid-client";

let openidClientPromise: Promise<typeof OpenIDClient> | null = null;

/**
 * Get the OpenID Client module.
 * This function ensures that the openid-client module is only imported once
 * and can be shared across multiple instances.
 *
 * @returns The OpenID Client module
 */
export async function getOpenIDClient(): Promise<typeof OpenIDClient> {
  return (openidClientPromise ??= import("openid-client"));
}

export type { OpenIDClient };
