import Logo from "@/assets/images/logo.svg";

import { pluginKey } from "./constants";

const styles = `
html,
body {
  padding: 0;
  margin: 0;
  height: 100%;
  background-color: #e0e0e0;
  color: #24292F;
  font-family: Helvetica, sans-serif;
  position: relative;
  text-align: center;
}
.wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
a {
  color: #3f51b5;
}
.img {
  filter: drop-shadow(0 0.5rem 0.5rem #24292F80);
  width: 100px;
  height: 100px;
}
`
  .trim()
  .replace(/\s+/g, " ");

export function buildStatusPage(body: string, withBackButton: boolean) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${pluginKey}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="wrap">
      <img src="${Logo}" class="img" alt="logo" />
      ${body}
      ${withBackButton ? `<p><button onclick="history.back()">Go back</button></p>` : ""}
    </div>
  </body>
</html>`;
}

export function buildErrorPage(error: any, withBackButton: boolean) {
  return buildStatusPage(
    `<h1>Sorry :(</h1>
    <p>${error?.message || error}</p>`,
    withBackButton
  );
}

export function buildAccessDeniedPage(withBackButton: boolean) {
  return buildStatusPage(
    `<h1>Access Denied</h1>
    <p>You are not a member of the required access group.</p>`,
    withBackButton
  );
}
