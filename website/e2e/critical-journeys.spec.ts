import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";

type FixtureManifest = {
  productId?: number | string;
  sellerOrderId?: number | string;
  buyerOrderId?: number | string;
  disputeId?: number | string;
};

function fixtureManifest(): FixtureManifest {
  const file = process.env.E2E_FIXTURE_MANIFEST;
  if (!file) return {};
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as FixtureManifest;
}

function authState(role: "buyer" | "seller" | "admin") {
  const envName = `E2E_${role.toUpperCase()}_STORAGE_STATE`;
  const file = process.env[envName];
  return file ? path.resolve(file) : null;
}

async function rolePage(browser: Browser, role: "buyer" | "seller" | "admin") {
  const storageState = authState(role);
  if (!storageState || !fs.existsSync(storageState)) {
    throw new Error(`Missing ${role} storage state.`);
  }
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  return { context, page };
}

const fixtures = fixtureManifest();
const criticalEnabled = process.env.E2E_CRITICAL === "1";

test.describe("critical marketplace journeys", () => {
  test.skip(!criticalEnabled, "Set E2E_CRITICAL=1 with seeded fixtures and role storage states.");

  test("buyer can reach checkout for a deterministic product", async ({ browser }) => {
    test.skip(!fixtures.productId, "Fixture manifest must include productId.");
    const { context, page } = await rolePage(browser, "buyer");
    await page.goto(`/checkout/${fixtures.productId}`);
    await expect(page.getByRole("heading", { name: /checkout/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/please login|authentication required/i);
    await context.close();
  });

  test("seller can open the fulfillment order", async ({ browser }) => {
    test.skip(!fixtures.sellerOrderId, "Fixture manifest must include sellerOrderId.");
    const { context, page } = await rolePage(browser, "seller");
    await page.goto(`/orders/${fixtures.sellerOrderId}`);
    await expect(page.locator("body")).toContainText(new RegExp(String(fixtures.sellerOrderId)));
    await expect(page.locator("body")).toContainText(/order|delivery|seller/i);
    await context.close();
  });

  test("buyer can reach dispute and refund controls", async ({ browser }) => {
    const { context, page } = await rolePage(browser, "buyer");
    await page.goto(fixtures.disputeId ? `/resolution-center/${fixtures.disputeId}` : "/resolution-center");
    await expect(page.locator("body")).toContainText(/resolution|dispute|refund/i);
    await context.close();
  });

  test("seller can open bulk listing import", async ({ browser }) => {
    const { context, page } = await rolePage(browser, "seller");
    await page.goto("/seller/products/import");
    await expect(page.getByRole("heading", { name: /bulk listing import/i })).toBeVisible();
    await context.close();
  });

  test("admin can review production launch readiness", async ({ browser }) => {
    const { context, page } = await rolePage(browser, "admin");
    await page.goto("/admin/operations");
    await expect(page.getByRole("heading", { name: /production operations/i })).toBeVisible();
    await context.close();
  });
});
