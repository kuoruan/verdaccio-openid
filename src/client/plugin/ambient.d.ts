import type { TemplateUIOptions } from "@verdaccio/types";

export {};

interface OpenIDOptions {
  keepPasswdLogin: boolean;
  loginButtonText: string;
}

declare global {
  interface MouseEvent {
    /**
     * IE and Edge have a `path` property instead of `composedPath()`.
     * https://caniuse.com/#feat=mdn-api_event_composedpath
     */
    path?: Element[];
  }

  interface Window {
    __VERDACCIO_BASENAME_UI_OPTIONS?: TemplateUIOptions;
    __VERDACCIO_OPENID_OPTIONS?: OpenIDOptions;
    VERDACCIO_API_URL?: string;
  }
}
