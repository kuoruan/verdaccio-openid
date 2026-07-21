import Logo from "@/assets/logo.svg";
import { buildAccessDeniedPage, buildErrorPage, buildStatusPage, buildSuccessPage } from "@/status-page";

describe("buildStatusPage", () => {
  it("should return HTML with body content", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<p>Test</p>");
  });

  it("should include the plugin name and version in the title", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain("<title>verdaccio-openid");
  });

  it("should include the logo image", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain(`<img src="${Logo}"`);
  });

  it("should not include back button by default", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).not.toContain("Go back");
  });

  it("should include back button when withBack is true", () => {
    const html = buildStatusPage("<p>Test</p>", true);
    expect(html).toContain("Go back");
    expect(html).toContain('href="javascript:history.back()"');
  });

  it("should include back button with custom URL when withBack is an object", () => {
    const html = buildStatusPage("<p>Test</p>", {
      backUrl: "https://example.com",
    });
    expect(html).toContain("Go back");
    expect(html).toContain('class="btn"');
    expect(html).toContain('href="https://example.com"');
  });

  it("should use default backUrl when withBack object has empty backUrl", () => {
    const html = buildStatusPage("<p>Test</p>", { backUrl: "" });
    expect(html).toContain('href="javascript:history.back()"');
  });

  it("should include CSS styles with theme variables", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain("<style>");
    expect(html).toContain("--bg:");
    expect(html).toContain("--card-bg:");
    expect(html).toContain(":root.dark");
  });

  it("should include dark mode detection script", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain('localStorage.getItem("darkMode")');
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("should include viewport meta tag", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain('<meta name="viewport"');
  });

  it("should include reduced-motion support in CSS", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain("prefers-reduced-motion: reduce");
  });
});

describe("buildErrorPage", () => {
  it("should render error message from Error object", () => {
    const html = buildErrorPage(new Error("Something went wrong"));
    expect(html).toContain("Sorry :(");
    expect(html).toContain("Something went wrong");
    expect(html).toContain('class="icon error"');
    expect(html).toContain("<svg");
  });

  it("should render an error icon", () => {
    const html = buildErrorPage(new Error("test"));
    expect(html).toContain('<circle cx="12" cy="12" r="10"/>');
  });

  it("should render error message from string", () => {
    const html = buildErrorPage("Plain error");
    expect(html).toContain("Plain error");
  });

  it("should escape HTML in error message", () => {
    const html = buildErrorPage(new Error("<script>alert('xss')</script>"));
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("should render fallback for error without message", () => {
    const html = buildErrorPage(undefined);
    expect(html).toContain("Sorry :(");
  });

  it("should pass withBack option through", () => {
    const html = buildErrorPage(new Error("test"), true);
    expect(html).toContain("Go back");
  });
});

describe("buildSuccessPage", () => {
  it("should render success message", () => {
    const html = buildSuccessPage("Login successful!");
    expect(html).toContain("Success ^_^");
    expect(html).toContain("Login successful!");
    expect(html).toContain('class="icon success"');
    expect(html).toContain("<svg");
  });

  it("should escape HTML in success message", () => {
    const html = buildSuccessPage("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("should pass withBack option through", () => {
    const html = buildSuccessPage("test", { backUrl: "/home" });
    expect(html).toContain("Go back");
    expect(html).toContain('href="/home"');
  });
});

describe("buildAccessDeniedPage", () => {
  it("should render access denied message", () => {
    const html = buildAccessDeniedPage();
    expect(html).toContain("Access Denied");
    expect(html).toContain('class="icon warning"');
    expect(html).toContain("<svg");
  });

  it("should pass withBack option through", () => {
    const html = buildAccessDeniedPage(true);
    expect(html).toContain("Go back");
  });
});
