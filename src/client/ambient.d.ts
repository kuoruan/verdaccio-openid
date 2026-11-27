import type { TemplateUIOptions } from "@verdaccio/types";

interface OpenIDOptions {
  keepPasswdLogin: boolean;
  loginButtonText: string;
}

declare global {
  interface Window {
    __VERDACCIO_BASENAME_UI_OPTIONS?: TemplateUIOptions;
    __VERDACCIO_OPENID_OPTIONS?: OpenIDOptions;
  }
}
