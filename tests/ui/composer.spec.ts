import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression + layout-integrity checks for the ChatWorkspace prompt box.
 * Catches UI drift (spacing/shape changes) and structural regressions such as
 * the composer overlapping the transcript or its controls colliding.
 */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

async function openWorkspace(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(400);
}

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
