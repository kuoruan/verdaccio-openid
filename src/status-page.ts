import Logo from "@/assets/logo.svg";
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
.img {
  filter: drop-shadow(0 0.5rem 0.5rem #24292F80);
  width: 114px;
  height: 98px;
}
h1 {
  margin: 20px 0 16px 0;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
}
h1.success {
  color: #27ae60;
}
h1.error {
  color: #e74c3c;
}
h1.warning {
  color: #f39c12;
}
p {
  font-size: 16px;
  line-height: 1.5;
}
.message {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 20px;
  border-left: 4px solid transparent;
}
.message.success {
  border-left-color: #27ae60;
  background: rgba(39, 174, 96, 0.1);
}
.message.error {
  border-left-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}
.message.warning {
  border-left-color: #f39c12;
  background: rgba(243, 156, 18, 0.1);
}
.buttons {
  margin-top: 30px;
}
.back {
  color: #3498db;
  text-decoration: none;
  font-weight: 500;
  padding: 10px 16px;
  background: rgba(52, 152, 219, 0.1);
  border-radius: 6px;
  display: inline-block;
  transition: all 0.3s ease;
  border: 1px solid rgba(52, 152, 219, 0.2);
}
.back:hover {
  background: rgba(52, 152, 219, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(52, 152, 219, 0.3);
}
`;

export type BackOptions = boolean | Record<"backUrl", string>;

const defaultBackUrl = "javascript:history.back()";

export function buildStatusPage(body: string, withBack: BackOptions = false): string {
  let backUrl;
  if (typeof withBack === "object") {
    backUrl = withBack.backUrl || defaultBackUrl;
  } else if (withBack) {
    backUrl = defaultBackUrl;
  }

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
      ${
        backUrl
          ? `<div class="buttons">
              <a class="back" href="${backUrl}">Go back</a>
            </div>`
          : ""
      }
    </div>
  </body>
</html>`;
}

export function buildErrorPage(error: any, withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1 class="error">Sorry :(</h1>
    <p class="message error">${error?.message ?? error}</p>`,
    withBack,
  );
}

export function buildSuccessPage(message: string, withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1 class="success">Success!</h1>
    <p class="message success">${message}</p>`,
    withBack,
  );
}

export function buildAccessDeniedPage(withBack: BackOptions = false) {
  return buildStatusPage(
    `<h1 class="warning">Access Denied.</h1>
    <p class="message warning">${messageGroupRequired}</p>`,
    withBack,
  );
}
