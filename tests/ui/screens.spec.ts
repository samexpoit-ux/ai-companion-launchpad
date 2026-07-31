import { test, expect, type Page } from "@playwright/test";

/**
 * Snapshot-based UI regression tests for the primary screens.
 * Animations are frozen and time-dependent text is masked so the
 * baselines stay stable between runs.
 */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

async function prepare(page: Page, path: string) {
  await page.addInitScript(() => {
    // Deterministic first-run state for every snapshot.
    window.localStorage.clear();
  });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(400);
}

test.describe("Chat workspace", () => {
  test("renders the empty-state hero", async ({ page }) => {
    await prepare(page, "/");
    await expect(page.getByRole("button", { name: /new workspace/i })).toBeVisible();
    await expect(page).toHaveScreenshot("workspace-empty.png", { fullPage: false });
  });

  test("composer accepts input and enables send", async ({ page }) => {
    await prepare(page, "/");
    const composer = page.locator("textarea").first();
    await composer.click();
    await composer.fill("Build me a pricing page");
    await expect(page.getByRole("button", { name: /^send$/i })).toBeEnabled();
    await expect(page).toHaveScreenshot("workspace-composer-filled.png");
  });

  test("sidebar create + rename controls are available", async ({ page, isMobile }) => {
    // Sidebar behaviour differs on the mobile drawer; covered by the desktop project.
    test.skip(isMobile, "desktop-only sidebar assertion");
    await prepare(page, "/");
    const newWorkspace = page.getByRole("button", { name: /new workspace/i });
    // The drawer is open on first load for both viewports.
    await expect(newWorkspace).toBeVisible();
    await newWorkspace.click();
    await page.waitForTimeout(300);
    // Creating a session closes the drawer on mobile — reopen before asserting.
    if (isMobile) await page.getByRole("button", { name: /toggle sidebar/i }).click();
    await page.waitForTimeout(400);
    await expect(page.getByRole("button", { name: /rename/i }).first()).toBeAttached();
  });
});

test.describe("Image studio", () => {
  test("renders the studio shell", async ({ page }) => {
    await prepare(page, "/image");
    await expect(page).toHaveScreenshot("image-studio.png");
  });
});

test.describe("API error contract", () => {
  test("chat rejects an empty payload with the unified envelope", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { messages: [] } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({
      code: "missing_input",
      source: "chat",
    });
    expect(Array.isArray(body.error.steps)).toBe(true);
    expect(typeof body.error.hint).toBe("string");
  });

  test("autofix rejects a payload without errors with the unified envelope", async ({ request }) => {
    const res = await request.post("/api/autofix", { data: { code: "x", errors: [] } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "missing_input", source: "autofix" });
    expect(body.error.steps.length).toBeGreaterThan(0);
  });
});
