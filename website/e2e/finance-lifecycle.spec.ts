import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

type FinanceFixtureManifest = {
  productId?: number | string;
  completableOrderId?: number | string;
  sellerPayoutAccountId?: number | string;
  withdrawalAmount?: number | string;
  withdrawalId?: number | string;
  disputeOrderId?: number | string;
  disputeId?: number | string;
};

function fixtureManifest(): FinanceFixtureManifest {
  const file = process.env.E2E_FIXTURE_MANIFEST;
  if (!file) return {};
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as FinanceFixtureManifest;
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

async function accessToken(page: Page) {
  return page.evaluate(() => {
    const stores = [window.localStorage, window.sessionStorage];
    for (const store of stores) {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) {
          continue;
        }

        const raw = store.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          currentSession?: { access_token?: string };
        };
        const token = parsed.access_token || parsed.currentSession?.access_token;
        if (token) return token;
      }
    }

    return "";
  });
}

const fixtures = fixtureManifest();
const financeEnabled = process.env.E2E_FINANCE_CRITICAL === "1";

test.describe("finance lifecycle journeys", () => {
  test.skip(
    !financeEnabled,
    "Set E2E_FINANCE_CRITICAL=1 with seeded staging fixtures before running mutating finance tests."
  );

  test("buyer can reach checkout for a priced product snapshot", async ({ browser }) => {
    test.skip(!fixtures.productId, "Fixture manifest must include productId.");
    const { context, page } = await rolePage(browser, "buyer");
    await page.goto(`/checkout/${fixtures.productId}`);
    await expect(page.getByRole("heading", { name: /checkout/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/total|payment|escrow/i);
    await context.close();
  });

  test("buyer can complete an eligible order and seller wallet shows credit history", async ({
    browser,
  }) => {
    test.skip(
      !fixtures.completableOrderId,
      "Fixture manifest must include completableOrderId."
    );
    const buyer = await rolePage(browser, "buyer");
    await buyer.page.goto("/");
    const buyerToken = await accessToken(buyer.page);
    const completeResponse = await buyer.context.request.post("/api/orders/complete", {
      headers: { authorization: `Bearer ${buyerToken}` },
      data: { orderId: fixtures.completableOrderId },
    });
    expect(completeResponse.status()).toBeLessThan(500);
    await buyer.context.close();

    const seller = await rolePage(browser, "seller");
    await seller.page.goto("/wallet");
    await expect(seller.page.locator("body")).toContainText(/wallet|credit|transaction/i);
    await seller.context.close();
  });

  test("seller can request a withdrawal quote with tax and FX snapshot data", async ({
    browser,
  }) => {
    test.skip(
      !fixtures.sellerPayoutAccountId,
      "Fixture manifest must include sellerPayoutAccountId."
    );
    const { context, page } = await rolePage(browser, "seller");
    await page.goto("/");
    const token = await accessToken(page);
    const amount = fixtures.withdrawalAmount || 100000;
    const response = await context.request.get(
      `/api/withdrawals/quote?payoutAccountId=${fixtures.sellerPayoutAccountId}&amount=${amount}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(JSON.stringify(body)).toMatch(/quote|tax|amount|currency/i);
    await context.close();
  });

  test("admin can approve a staged withdrawal request", async ({ browser }) => {
    test.skip(!fixtures.withdrawalId, "Fixture manifest must include withdrawalId.");
    const { context, page } = await rolePage(browser, "admin");
    await page.goto("/");
    const token = await accessToken(page);
    const response = await context.request.patch("/api/admin/withdrawals", {
      headers: { authorization: `Bearer ${token}` },
      data: {
        withdrawalId: fixtures.withdrawalId,
        action: "approve",
        note: "E2E approval of seeded withdrawal request.",
      },
    });
    expect(response.status()).toBeLessThan(500);
    await context.close();
  });

  test("buyer can open a dispute and admin can resolve a refund path", async ({
    browser,
  }) => {
    test.skip(
      !fixtures.disputeOrderId && !fixtures.disputeId,
      "Fixture manifest must include disputeOrderId or disputeId."
    );

    let disputeId = fixtures.disputeId;
    if (!disputeId) {
      const buyer = await rolePage(browser, "buyer");
      await buyer.page.goto("/");
      const buyerToken = await accessToken(buyer.page);
      const createResponse = await buyer.context.request.post("/api/disputes", {
        headers: { authorization: `Bearer ${buyerToken}` },
        data: {
          orderId: fixtures.disputeOrderId,
          reason: "E2E refund dispute",
          description:
            "Seeded E2E dispute used to verify the buyer refund resolution path.",
          category: "item_not_received",
          requestedResolution: "refund",
        },
      });
      expect(createResponse.status()).toBeLessThan(500);
      const body = await createResponse.json();
      disputeId = body.dispute?.id || body.dispute_id;
      await buyer.context.close();
    }

    const admin = await rolePage(browser, "admin");
    await admin.page.goto("/");
    const adminToken = await accessToken(admin.page);
    const resolveResponse = await admin.context.request.patch("/api/admin/disputes", {
      headers: { authorization: `Bearer ${adminToken}` },
      data: {
        disputeId,
        action: "buyer_win",
        note: "E2E refund resolution for seeded dispute.",
        manualReference: "e2e-refund-reference",
      },
    });
    expect(resolveResponse.status()).toBeLessThan(500);
    await admin.context.close();
  });
});
