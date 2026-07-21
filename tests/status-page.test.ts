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
    const html = buildStatusPage("<p>Test</p>", { backUrl: "https://example.com" });
    expect(html).toContain("Go back");
    expect(html).toContain('href="https://example.com"');
  });

  it("should use default backUrl when withBack object has empty backUrl", () => {
    const html = buildStatusPage("<p>Test</p>", { backUrl: "" });
    expect(html).toContain('href="javascript:history.back()"');
  });

  it("should include CSS styles", () => {
    const html = buildStatusPage("<p>Test</p>");
    expect(html).toContain("<style>");
    expect(html).toContain("background-color: #e0e0e0");
  });
});

describe("buildErrorPage", () => {
  it("should render error message from Error object", () => {
    const html = buildErrorPage(new Error("Something went wrong"));
    expect(html).toContain("Sorry :(");
    expect(html).toContain("Something went wrong");
    expect(html).toContain('class="error"');
  });

  it("should render error message from string", () => {
    const html = buildErrorPage("Plain error");
    expect(html).toContain("Plain error");
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
    expect(html).toContain("Success!");
    expect(html).toContain("Login successful!");
    expect(html).toContain('class="success"');
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
    expect(html).toContain("Access Denied.");
    expect(html).toContain('class="warning"');
  });

  it("should pass withBack option through", () => {
    const html = buildAccessDeniedPage(true);
    expect(html).toContain("Go back");
  });
});
