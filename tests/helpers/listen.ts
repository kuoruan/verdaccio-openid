import { once } from "node:events";
import type { AddressInfo } from "node:net";

import type { Express } from "express";

/** Serve an app on an ephemeral `127.0.0.1` port, resolving once it accepts. */
export async function listen(app: Express) {
  const server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const { port } = server.address() as AddressInfo;

  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
