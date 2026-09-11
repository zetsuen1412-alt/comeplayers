import fs from "node:fs";
import path from "node:path";
import { expect, request, test, type APIResponse } from "@playwright/test";

type FixtureManifest = {
  categoryId?: number | string;
  categoryName?: string;
  gameId?: number | string;
  gameName?: string;
};

type JsonObject = Record<string, unknown>;

function fixtureManifest(): FixtureManifest {
  const file = process.env.E2E_FIXTURE_MANIFEST;
  if (!file) return {};
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as FixtureManifest;
}

function storageState(role: "buyer" | "seller") {
  const file = process.env[`E2E_${role.toUpperCase()}_STORAGE_STATE`];
  if (!file) throw new Error(`Missing ${role} storage state.`);
  return path.resolve(file);
}

function accessTokenFromStorage(file: string) {
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };

  for (const origin of state.origins || []) {
    for (const item of origin.localStorage || []) {
      if (!item.name.startsWith("sb-") || !item.name.endsWith("-auth-token")) {
        continue;
      }

      const session = JSON.parse(item.value) as {
        access_token?: string;
        currentSession?: { access_token?: string };
      };
      const token = session.access_token || session.currentSession?.access_token;
      if (token) return token;
    }
  }

  throw new Error(`No Supabase access token found in ${file}.`);
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function jsonResponse(response: APIResponse): Promise<JsonObject> {
  const text = await response.text();
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { raw: text };
  }
}

const salePurchaseEnabled = process.env.E2E_SALE_PURCHASE === "1";

test.describe("sale to purchase lifecycle", () => {
  test.skip(
    !salePurchaseEnabled,
    "Set E2E_SALE_PURCHASE=1 with patched staging fixtures before running mutating sale-purchase tests."
  );

  test("seller listing can be bought, delivered, completed, and credited", async ({ baseURL }) => {
    const fixtures = fixtureManifest();
    test.skip(
      !fixtures.categoryId || !fixtures.categoryName || !fixtures.gameId || !fixtures.gameName,
      "Fixture manifest must include category and game data."
    );

    const sellerToken = accessTokenFromStorage(storageState("seller"));
    const buyerToken = accessTokenFromStorage(storageState("buyer"));
    const timestamp = Date.now();
    const title = `E2E Wallet Delivery Listing ${timestamp}`;
    const slug = `e2e-wallet-delivery-${timestamp}`;

    const sellerApi = await request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${sellerToken}` },
    });
    const buyerApi = await request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${buyerToken}` },
    });

    const sellerWalletBeforeResponse = await sellerApi.get("/api/wallet/overview");
    expect(sellerWalletBeforeResponse.status()).toBeLessThan(500);
    const sellerWalletBefore = asRecord(await sellerWalletBeforeResponse.json());
    const sellerBalanceBefore = Number(asRecord(sellerWalletBefore.wallet).balance || 0);

    const createProductResponse = await sellerApi.post("/api/seller/catalog", {
      data: {
        title,
        description:
          "Controlled staging listing used to validate ComePlayers wallet checkout and encrypted delivery.",
        price: 125000,
        stock: 2,
        deliveryEtaMinutes: 30,
        category: fixtures.categoryName,
        categoryId: fixtures.categoryId,
        gameName: fixtures.gameName,
        gameId: fixtures.gameId,
        imageUrl: "",
        offerRegion: "Global",
        offerPlatform: "Any",
        offerServer: "E2E",
        offerTags: ["e2e", "wallet", "delivery"],
        slug,
      },
    });
    const productBody = await jsonResponse(createProductResponse);
    expect(createProductResponse.status(), JSON.stringify(productBody)).toBe(201);
    const productId = Number(asRecord(productBody.product).id);
    expect(productId).toBeGreaterThan(0);

    const createVariantResponse = await sellerApi.post("/api/seller/variants", {
      data: {
        productId,
        name: "Wallet Delivery SKU",
        sku: `E2E-${timestamp}`,
        price: 125000,
        stock: 2,
        status: "active",
        sortOrder: 0,
        attributes: { delivery: "encrypted", run: String(timestamp) },
      },
    });
    const variantBody = await jsonResponse(createVariantResponse);
    expect(createVariantResponse.status(), JSON.stringify(variantBody)).toBe(201);
    const variantId = Number(asRecord(variantBody.variant).id);
    expect(variantId).toBeGreaterThan(0);

    const checkoutResponse = await buyerApi.post("/api/checkout/create-order", {
      data: {
        productId,
        variantId,
        quantity: 1,
        paymentMethod: "wallet",
        couponCode: null,
      },
    });
    const checkoutBody = await jsonResponse(checkoutResponse);
    expect(checkoutResponse.status(), JSON.stringify(checkoutBody)).toBe(200);
    const orderId = Number(asRecord(checkoutBody.order).id);
    expect(orderId).toBeGreaterThan(0);

    const payResponse = await buyerApi.post("/api/orders/pay-with-wallet", {
      data: { orderId },
    });
    const payBody = await jsonResponse(payResponse);
    expect(payResponse.status(), JSON.stringify(payBody)).toBe(200);
    expect(payBody.ok).toBe(true);

    const deliverResponse = await sellerApi.post("/api/orders/deliver", {
      data: {
        orderId,
        deliveryMessage: "E2E delivery completed inside ComePlayers.",
        deliveryCredentials: `delivery-reference-${timestamp}`,
      },
    });
    const deliverBody = await jsonResponse(deliverResponse);
    expect(deliverResponse.status(), JSON.stringify(deliverBody)).toBe(200);
    expect(deliverBody.deliveryEncrypted).toBe(true);

    const completeResponse = await buyerApi.post("/api/orders/complete", {
      data: { orderId },
    });
    const completeBody = await jsonResponse(completeResponse);
    expect(completeResponse.status(), JSON.stringify(completeBody)).toBe(200);
    expect(completeBody.ok).toBe(true);
    const sellerEarning = Number(asRecord(completeBody.result).seller_earning || 0);
    expect(sellerEarning).toBeGreaterThan(0);

    const sellerWalletAfterResponse = await sellerApi.get("/api/wallet/overview");
    expect(sellerWalletAfterResponse.status()).toBeLessThan(500);
    const sellerWalletAfter = asRecord(await sellerWalletAfterResponse.json());
    const sellerBalanceAfter = Number(asRecord(sellerWalletAfter.wallet).balance || 0);
    expect(sellerBalanceAfter).toBeGreaterThanOrEqual(sellerBalanceBefore + sellerEarning);
    expect(
      asArray(sellerWalletAfter.transactions).some((entry) => {
        const transaction = asRecord(entry);
        return (
          Number(transaction.order_id) === orderId && Number(transaction.amount || 0) > 0
        );
      })
    ).toBe(true);

    await sellerApi.dispose();
    await buyerApi.dispose();
  });
});
