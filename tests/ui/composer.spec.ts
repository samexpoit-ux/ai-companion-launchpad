import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression + layout-integrity checks for the ChatWorkspace prompt box.
 * Catches UI drift (spacing/shape changes) and structural regressions such as
 * the composer overlapping the transcript or its controls colliding.
 */
import { installMockBackend, openWorkspace } from "./fixtures/mock-backend";

// UI test mode: the workspace renders against a fully mocked backend, so these
// checks run on every commit without signing into the self-hosted database.
test.beforeEach(async ({ page }) => {
  await installMockBackend(page);
});

function composer(page: Page) {
  return page.getByTestId("composer");
}

async function box(page: Page, selector: ReturnType<typeof composer>) {
  const b = await selector.boundingBox();
  expect(b, "element should be laid out").not.toBeNull();
  return b!;
}

test.describe("ChatWorkspace prompt box", () => {
  test("matches the composer baseline (idle)", async ({ page }) => {
    await openWorkspace(page);
    await expect(composer(page)).toBeVisible();
    await expect(composer(page)).toHaveScreenshot("composer-idle.png");
  });

  test("matches the composer baseline (focused with text)", async ({ page }) => {
    await openWorkspace(page);
    const ta = page.locator("textarea").first();
    await ta.click();
    await ta.fill("Build a pricing page with three tiers");
    await expect(composer(page)).toHaveScreenshot("composer-focused.png");
  });

  test("grows with multiline input without clipping controls", async ({ page }) => {
    await openWorkspace(page);
    const ta = page.locator("textarea").first();
    const before = await box(page, composer(page));

    await ta.click();
    await ta.fill(Array.from({ length: 8 }, (_, i) => `line ${i + 1} of a long prompt`).join("\n"));
    await page.waitForTimeout(200);

    const after = await box(page, composer(page));
    expect(after.height).toBeGreaterThan(before.height);

    // Send button must stay fully inside the composer card.
    const send = await box(page, page.getByRole("button", { name: /^send message$/i }));
    expect(send.y + send.height).toBeLessThanOrEqual(after.y + after.height + 1);
    expect(send.x + send.width).toBeLessThanOrEqual(after.x + after.width + 1);

    await expect(composer(page)).toHaveScreenshot("composer-multiline.png");
  });

  test("does not overlap the transcript or leave the viewport", async ({ page }) => {
    await openWorkspace(page);
    const c = await box(page, composer(page));
    const viewport = page.viewportSize()!;

    // Fully on-screen, no horizontal overflow.
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(c.y + c.height).toBeLessThanOrEqual(viewport.height + 1);

    // Empty-state block sits above the composer, never behind it.
    const empty = await box(page, page.getByTestId("workspace-empty-state"));
    expect(empty.y).toBeLessThan(c.y);
  });

  test("empty state pills stay aligned in a balanced grid", async ({ page }) => {
    await openWorkspace(page);
    const pills = page.getByTestId("starter-pill");
    await expect(pills).toHaveCount(4);

    const boxes = await pills.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );

    // Uniform pill height and no overlap between neighbours.
    const heights = boxes.map((b) => b.h);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1]!;
      const cur = boxes[i]!;
      const overlaps =
        cur.x < prev.x + prev.w - 1 && cur.x + cur.w > prev.x + 1 && cur.y < prev.y + prev.h - 1;
      expect(overlaps, `pill ${i} overlaps pill ${i - 1}`).toBe(false);
    }

    await expect(page.getByTestId("workspace-empty-state")).toHaveScreenshot("empty-state.png");
  });
});

test.describe("ChatWorkspace prompt box on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("controls never clip or overlap at 390px", async ({ page }) => {
    await openWorkspace(page);
    const c = await box(page, composer(page));
    const viewport = page.viewportSize()!;

    // Card fully inside the viewport with symmetric gutters.
    expect(c.x).toBeGreaterThanOrEqual(4);
    expect(c.x + c.width).toBeLessThanOrEqual(viewport.width - 3);
    expect(c.y + c.height).toBeLessThanOrEqual(viewport.height + 1);

    // Every visible control sits inside the composer bounds.
    const controls = ["Add attachment", "Response mode", "Send message"];
    for (const name of controls) {
      const el = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") });
      if (!(await el.isVisible())) continue;
      const b = await box(page, el);
      expect(b.x, `${name} starts inside the card`).toBeGreaterThanOrEqual(c.x - 1);
      expect(b.x + b.width, `${name} ends inside the card`).toBeLessThanOrEqual(c.x + c.width + 1);
      expect(b.y + b.height, `${name} bottom inside the card`).toBeLessThanOrEqual(c.y + c.height + 1);
    }

    // Mode dropdown and send button must not collide.
    const mode = await box(page, page.getByRole("button", { name: /^response mode$/i }));
    const send = await box(page, page.getByRole("button", { name: /^send message$/i }));
    expect(mode.x + mode.width).toBeLessThanOrEqual(send.x + 1);

    await expect(composer(page)).toHaveScreenshot("composer-mobile.png");
  });

  test("multiline growth keeps the send button visible on mobile", async ({ page }) => {
    await openWorkspace(page);
    const ta = page.locator("textarea").first();
    await ta.click();
    await ta.fill(Array.from({ length: 10 }, (_, i) => `mobile line ${i + 1}`).join("\n"));
    await page.waitForTimeout(200);

    const c = await box(page, composer(page));
    const send = await box(page, page.getByRole("button", { name: /^send message$/i }));
    expect(send.y + send.height).toBeLessThanOrEqual(c.y + c.height + 1);
    expect(c.y).toBeGreaterThanOrEqual(0);
  });
});
