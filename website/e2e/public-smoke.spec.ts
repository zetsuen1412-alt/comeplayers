import { expect, test } from "@playwright/test";

test.describe("public production smoke", () => {
  test("home page renders marketplace navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/comeplayers|gaming|marketplace/i);
    await expect(page.locator("body")).toContainText(/game|marketplace|product/i);
  });

  test("liveness and readiness endpoints respond with JSON", async ({ request }) => {
    const live = await request.get("/api/health/live");
    expect(live.status()).toBe(200);
    expect(live.headers()["content-type"] || "").toContain("application/json");

    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBeLessThan(600);
    expect(ready.headers()["content-type"] || "").toContain("application/json");
  });

  test("search page and public search API are reachable", async ({ page, request }) => {
    await page.goto("/search?q=mobile");
    await expect(page.locator("body")).toContainText(/search|result|product/i);

    const response = await request.get("/api/marketplace/search?q=mobile&limit=5");
    expect(response.status()).toBeLessThan(500);
  });

  test("admin operations API rejects anonymous access", async ({ request }) => {
    const response = await request.get("/api/admin/operations");
    expect([401, 403]).toContain(response.status());
  });
});
