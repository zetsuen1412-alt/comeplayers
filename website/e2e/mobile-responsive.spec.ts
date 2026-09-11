import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/marketplace",
  "/games",
  "/tournaments",
  "/help-center",
  "/legal",
  "/support",
  "/cpcommunity",
  "/account",
  "/wallet",
  "/orders",
  "/my-orders",
  "/seller",
  "/seller/apply",
  "/notifications",
  "/resolution-center",
  "/wishlist",
  "/following",
  "/flash-sales",
  "/announcements",
  "/search?q=mobile",
  "/privacy",
  "/terms",
  "/admin",
];

for (const route of publicRoutes) {
  test(`${route} fits the mobile viewport`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status() || 200).toBeLessThan(500);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /width=device-width/
    );

    await page.waitForTimeout(400);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
  });
}
