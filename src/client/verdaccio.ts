import { init } from "./plugin";

// `init` handles its own errors; anything that still escapes is a bug worth seeing.
init().catch((error) => console.error(error));
