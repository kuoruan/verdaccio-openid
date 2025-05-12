import Logo from "@/assets/images/logo.svg";
import { messageGroupRequired, plugin } from "@/constants";

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
  width: 114px;
  height: 98px;
}
`;

export type BackOptions = boolean | Record<"backUrl", string>;

export function buildStatusPage(body: string, withBack: BackOptions = false): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${plugin.name} - ${plugin.version}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="wrap">
      <img src="${Logo}" class="img" alt="logo" />
      ${body}
      ${withBack ? `<p><a href="${typeof withBack === "object" ? withBack.backUrl : "javascript:history.back()"}">Go back</a></p>` : ""}
    </div>
  </body>
</html>`;
}

export function buildErrorPage(error: any, withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1>Sorry :(</h1>
    <p>${error?.message ?? error}</p>`,
    withBack,
  );
}

export function buildSuccessPage(success: string, withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1>Success!</h1>
    <p>${success}</p>`,
    withBack,
  );
}

export function buildAccessDeniedPage(withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1>Access Denied</h1>
    <p>${messageGroupRequired}</p>`,
    withBack,
  );
}
