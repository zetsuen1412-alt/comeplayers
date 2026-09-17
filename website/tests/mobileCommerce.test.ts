import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { buyerOrderFilter, orderBucket, ORDER_BUCKETS, parseOrderPage } from "../lib/accountCommerce";
import { idrTotal, money, orderStage, parseCommerceLink, trustedPaymentUrl } from "../../comeplayers-apps/apps/mobile/src/commercePolicy";

const userId = "00000000-0000-4000-8000-000000000001";
test("mobile and web order stages agree on all supported persisted statuses", () => {
  for (const [bucket, values] of Object.entries(ORDER_BUCKETS)) for (const status of values) {
    assert.equal(orderBucket(status), bucket);
    assert.equal(orderStage(status), bucket);
  }
  assert.equal(orderStage("unknown"), "other");
});
test("buyer email fallback cannot select orders assigned to another account", () => {
  assert.equal(buyerOrderFilter({ id: userId, email: "buyer@example.test" }), `buyer_id.eq.${userId},and(buyer_id.is.null,buyer.eq."buyer@example.test")`);
  assert.equal(buyerOrderFilter({ id: userId }), `buyer_id.eq.${userId}`);
  assert.throws(() => buyerOrderFilter({ id: "------------------------------------" }));
  assert.ok(buyerOrderFilter({ id: userId, email: 'buyer"@example.test' }).includes('buyer\\\"@example.test'));
});
test("order cursors are bounded and reject prototype filters", () => {
  assert.deepEqual(parseOrderPage(new URLSearchParams("limit=20&before=81&bucket=delivered")), { limit: 20, before: 81, bucket: "delivered" });
  for (const query of ["limit=2.5", "limit=201", "limit=-1", "before=Infinity", "before=0", "before=9007199254740992", "bucket=__proto__", "bucket=toString"]) assert.throws(() => parseOrderPage(new URLSearchParams(query)));
});
test("deep links contain a reference, never proof of successful payment", () => {
  assert.deepEqual(parseCommerceLink("comeplayers://commerce?order=80&paid=true"), { kind: "order", id: "80" });
  assert.deepEqual(parseCommerceLink("comeplayers://commerce?topup=" + userId), { kind: "topup", id: userId });
  for (const value of ["https://commerce?order=80", "comeplayers://commerce?order=-1", "comeplayers://commerce?order=9007199254740992", "comeplayers://evil@commerce?order=1", "comeplayers://commerce/evil?order=1", "comeplayers://commerce?topup=not-a-uuid"]) assert.equal(parseCommerceLink(value), null);
});
test("only HTTPS provider destinations can open a payment", () => {
  assert.equal(trustedPaymentUrl("https://checkout.doku.com/a", "doku"), true);
  assert.equal(trustedPaymentUrl("https://www.paypal.com/checkoutnow?token=REF", "paypal"), true);
  for (const url of ["https://doku.com.evil.test", "https://doku.com@evil.test", "https://user:pass@checkout.doku.com", "http://checkout.doku.com", "javascript:alert(1)"]) assert.equal(trustedPaymentUrl(url, "doku"), false);
  assert.equal(trustedPaymentUrl("https://www.paypal.com.evil.test", "paypal"), false);
});
test("IDR order amounts are never multiplied by the display exchange rate", () => {
  assert.equal(idrTotal({ total_amount: "349310", total_price: 349310 }), 349310);
  assert.equal(idrTotal({ total_amount: null, total_price: 349310 }), 349310);
  assert.equal(idrTotal({ total_amount: "NaN" }), 0);
  assert.match(money(349310,"IDR"), /349,310/);
});

function moduleWithMocks(file: string, mocks: Record<string, unknown>) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(code, { exports, require: (name: string) => { if (!(name in mocks)) throw new Error("Unmocked dependency: " + name); return mocks[name]; }, console: { ...console, error() {} }, URL, URLSearchParams, Request, Response, Date, Map, Set, Buffer, process }, { filename: file });
  return exports;
}
const response = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
function walletRoute(options: { owner?: boolean; status?: string; provider?: string; unapproved?: boolean; captureError?: Error } = {}) {
  let captures = 0;
  const intent = { id: userId, user_id: userId, provider: options.provider || "paypal", status: options.status || "pending", provider_order_id: "SAVEDREF" };
  const route = moduleWithMocks("app/api/wallet/payments/route.ts", {
    "next/server": response,
    "@/lib/serverSupabase": { requireAuthenticatedUser: async () => ({ id: userId }), createSupabaseAdmin: () => ({}), authErrorStatus: () => 500 },
    "@/lib/runtimeControls": { requireCheckoutAccess: async () => {}, runtimeControlErrorStatus: (e: { status?: number }) => e.status || 0 },
    "@/lib/frankfurter": { fetchFrankfurterRates: () => { throw Error("Unexpected FX call"); } },
    "@/lib/cpWallet": { quoteWalletTopup: () => {}, walletInvoice: () => {} },
    "@/lib/cpWalletServer": {
      getWalletIntent: async (_db: unknown, _id: string, owner: string) => { assert.equal(owner, userId); if (options.owner === false) throw Object.assign(Error("Not found"), { status: 404 }); return intent; },
      publicWalletIntent: (value: unknown) => value,
      captureWalletPayPal: async (_db: unknown, _intent: unknown, token: string) => { captures++; assert.equal(token, "SAVEDREF"); if (options.captureError) throw options.captureError; if (options.unapproved) throw Object.assign(Error("Approve first"), { status: 409, code: "PAYPAL_APPROVAL_REQUIRED" }); return { ...intent, status: "credited" }; },
    },
  });
  return { route, captures: () => captures };
}
const reconcile = (route: Record<string, any>) => route.POST(new Request("https://example.test/api/wallet/payments", { method: "POST", body: JSON.stringify({ action: "reconcile", id: userId, token: "UNTRUSTED", paid: true }) }));
test("mobile reconciliation uses the saved provider reference and verified capture result", async () => {
  const { route, captures } = walletRoute(); const result = await reconcile(route);
  assert.equal(result.status, 200); assert.equal((await result.json()).intent.status, "credited"); assert.equal(captures(), 1);
});
test("unapproved PayPal remains pending and does not become a fake success", async () => {
  const { route } = walletRoute({ unapproved: true }); const result = await reconcile(route);
  assert.equal(result.status, 200); assert.equal((await result.json()).intent.status, "pending");
});
test("wrong owner and mismatched charge cannot become a credited balance", async () => {
  const other = walletRoute({ owner: false }); assert.equal((await reconcile(other.route)).status, 404); assert.equal(other.captures(), 0);
  const mismatch = walletRoute({ captureError: Error("Charge mismatch") }); assert.equal((await reconcile(mismatch.route)).status, 500);
});
test("DOKU and already credited intents do not trigger PayPal capture", async () => {
  for (const options of [{ provider: "doku" }, { status: "credited" }]) {
    const { route, captures } = walletRoute(options); assert.equal((await reconcile(route)).status, 200); assert.equal(captures(), 0);
  }
});
test("opening a saved top-up is a read and never attempts capture", async () => {
  const { route, captures } = walletRoute(); const result = await route.GET(new Request("https://example.test/api/wallet/payments?id=" + userId));
  assert.equal(result.status, 200); assert.equal(captures(), 0);
});

test("message acknowledgement does not wait for push delivery", async () => {
  const after: Array<() => Promise<void>> = [];
  let notifications = 0, inserted = 0, accessChecked = false;
  const message = { id: userId, created_at: new Date().toISOString(), message: "hello" };
  const db = { from(table: string) {
    const query: any = {
      select: () => query, eq: () => query, gte: () => query, update: () => query,
      insert: () => { assert.ok(accessChecked); inserted++; return query; },
      single: async () => ({ data: message, error: null }),
      maybeSingle: async () => ({ data: { username: "test" }, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
    }; return query;
  } };
  const handler = moduleWithMocks("app/api/messages/rooms/[id]/messages/route.ts", {
    "next/server": { ...response, after: (task: () => Promise<void>) => after.push(task) },
    "@/lib/chatContacts": { assertContactAllowed: async () => {} },
    "@/lib/apiErrors": { safeApiErrorMessage: () => "Failed" },
    "@/lib/backgroundJobs": { dispatchChatPushNotifications: async () => { notifications++; throw Error("Provider down"); } },
    "@/lib/communityServer": { requireCommunityChannel: async () => {} },
    "@/lib/upstashRedis": { isUpstashRedisConfigured: () => false, invalidateUnreadCache: async () => {}, consumeRedisRateLimit: async () => {} },
    "@/lib/chatSafety": { analyzeChatMessage: () => ({ allowed: true, score: 0, level: "low", flags: [] }), chatMessagePreview: (value: string) => value },
    "@/lib/chatServer": { assertChatUserCanSend: async () => {}, assertLegacyDirectMessagingAllowed: async () => {}, requireChatRoomAccess: async () => { accessChecked = true; return { room: { id: userId, buyer_id: userId, seller_id: "seller", status: "active" } }; }, isGroupRoom: () => false, createChatNotification: async () => {}, safeProfileLabel: () => "Test", chatErrorStatus: () => 500 },
    "@/lib/serverSupabase": { requireAuthenticatedUser: async () => ({ id: userId }), createSupabaseAdmin: () => db },
  });
  const result = await handler.POST(new Request("https://example.test/message", { method: "POST", body: JSON.stringify({ message: "hello" }) }), { params: Promise.resolve({ id: userId }) });
  assert.equal(result.status, 200); assert.equal((await result.json()).message.id, userId); assert.equal(inserted, 1); assert.equal(notifications, 0); assert.equal(after.length, 1);
  await after[0](); assert.equal(notifications, 1); assert.equal(inserted, 1);
});
