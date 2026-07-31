import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end accessibility checks for the mobile drawers.
 *
 * Two layers:
 *  1. Always-on axe scans of the public screens (these run in CI on every push).
 *  2. Drawer-specific focus-trap / keyboard / screen-reader-label assertions for
 *     the authenticated dashboard + workspace. These need a signed-in session;
 *     set A11Y_TEST_EMAIL / A11Y_TEST_PASSWORD (repository secrets in CI) to
 *     enable them — without credentials they are skipped instead of failing.
 */

const EMAIL = process.env["A11Y_TEST_EMAIL"];
const PASSWORD = process.env["A11Y_TEST_PASSWORD"];
const CREDENTIALS = Boolean(EMAIL && PASSWORD);

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(violations, `axe violations on ${name}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

async function signIn(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL!);
  await page.getByLabel(/password/i).first().fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/dashboard|workspace/, { timeout: 30_000 });
}

test.describe("Public screens — axe", () => {
  test("landing page has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await scan(page, "/");
  });

  test("auth page has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await scan(page, "/auth");
  });
});

test.describe("Mobile drawers — focus trap, keyboard, labels", () => {
  test.skip(!CREDENTIALS, "set A11Y_TEST_EMAIL / A11Y_TEST_PASSWORD to run authenticated a11y checks");
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("dashboard drawer is labelled, traps focus and closes on Escape", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const opener = page.getByRole("button", { name: /open sidebar/i });
    await expect(opener).toBeVisible();
    await opener.click();

    // Screen-reader semantics: a labelled modal dialog.
    const drawer = page.getByRole("dialog", { name: /workspace navigation/i });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // Focus moved into the drawer on open.
    const inside = await drawer.evaluate((node) => node.contains(document.activeElement));
    expect(inside).toBe(true);

    // Tab cycles and never escapes the drawer.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const stillInside = await drawer.evaluate((node) => node.contains(document.activeElement));
      expect(stillInside, `focus left the drawer after ${i + 1} tabs`).toBe(true);
    }
    // Shift+Tab wraps backwards inside the drawer too.
    await page.keyboard.press("Shift+Tab");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);

    await scan(page, "/dashboard (drawer open)");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("workspace chat-history drawer is labelled, traps focus and closes on Escape", async ({ page }) => {
    await signIn(page);
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });

    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    const drawer = page.getByRole("dialog", { name: /chat history and account/i });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await drawer.evaluate((node) => node.contains(document.activeElement)),
        `focus left the chat drawer after ${i + 1} tabs`,
      ).toBe(true);
    }

    // Every icon-only control inside the drawer exposes an accessible name.
    const unnamed = await drawer.evaluate((node) =>
      Array.from(node.querySelectorAll("button")).filter(
        (b) =>
          !(b.textContent ?? "").trim() &&
          !b.getAttribute("aria-label") &&
          !b.getAttribute("aria-labelledby") &&
          !b.getAttribute("title"),
      ).length,
    );
    expect(unnamed, "icon-only drawer buttons without an accessible name").toBe(0);

    await scan(page, "/workspace (drawer open)");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
