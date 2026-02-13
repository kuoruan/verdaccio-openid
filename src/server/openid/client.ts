import type * as OpenIDClient from "openid-client";

let openidClient: typeof OpenIDClient | null = null;
let openidClientPromise: Promise<typeof OpenIDClient> | null = null;

/**
 * Get the OpenID Client module.
 * This function ensures that the openid-client module is only imported once
 * and can be shared across multiple instances.
 *
 * @returns The OpenID Client module
 */
export async function getOpenIDClient(): Promise<typeof OpenIDClient> {
  if (openidClient) {
    return openidClient;
  }

  openidClientPromise ??= import("openid-client").then((module) => {
    openidClient = module;
    return module;
  });

  return openidClientPromise;
}

export type * as OpenIDClient from "openid-client";
