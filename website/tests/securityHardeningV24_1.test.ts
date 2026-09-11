import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("marketplace browser analytics cannot write trusted conversion events", () => {
  const route = read("app/api/marketplace/events/route.ts");
  const client = read("lib/marketplace-events-client.ts");
  const sql = read("scripts/create-marketplace-events.sql").toLowerCase();

  assert.match(
    route,
    /const PUBLIC_EVENT_TYPES = new Set\(\[\s*"offer_view",\s*"product_view",\s*"checkout_start"/,
  );
  assert.equal(route.includes('"payment_success"'), false);
  assert.equal(route.includes('"order_complete"'), false);
  assert.equal(client.includes('| "payment_success"'), false);
  assert.equal(client.includes('| "order_complete"'), false);
  assert.match(
    sql,
    /revoke insert, update, delete on public\.marketplace_events/,
  );
  assert.equal(sql.includes("with check (true)"), false);
});

test("trusted conversion events are emitted from verified server flows", () => {
  const wallet = read("app/api/orders/pay-with-wallet/route.ts");
  const paypal = read("app/api/paypal/capture-checkout-order/route.ts");
  const complete = read("app/api/orders/complete/route.ts");
  const helper = read("lib/marketplaceEventsServer.ts");

  assert.match(wallet, /eventType: "payment_success"/);
  assert.match(paypal, /eventType: "payment_success"/);
  assert.match(complete, /eventType: "order_complete"/);
  assert.match(helper, /trusted: true/);
  assert.match(helper, /source: "server"/);
});

test("payment UI uses protected server routes instead of browser order updates", () => {
  const paymentPage = read("app/payment/[id]/page.tsx");
  const dokuNotification = read("app/api/doku/notification/route.ts");

  assert.match(paymentPage, /fetch\("\/api\/doku\/create-payment"/);
  assert.match(paymentPage, /isTrustedDokuPaymentUrl\(json\.paymentUrl\)/);
  assert.match(paymentPage, /paymentMethod: selectedPaymentMethod/);
  assert.match(paymentPage, /selectedPaymentMethod === "bank_transfer"/);
  assert.match(
    paymentPage,
    /selectedPaymentMethod === "qris"[\s\S]*choosePaymentMethod\("qris"\)[\s\S]*<strong>QRIS<\/strong>[\s\S]*Available/,
  );
  assert.match(paymentPage, /DOKU&apos;s[\s\S]*multi-bank Virtual Account/);
  assert.match(paymentPage, /View \{sourceBank\} transfer steps/);
  assert.match(paymentPage, /fetch\("\/api\/paypal\/create-checkout-order"/);
  assert.match(paymentPage, /isTrustedPayPalCheckoutUrl\(json\.approveUrl\)/);
  assert.match(paymentPage, /paymentDetailsRef\.current\?\.scrollIntoView\(/);
  assert.match(paymentPage, /behavior: reduceMotion \? "auto" : "smooth"/);
  assert.equal(paymentPage.includes('hostname.endsWith(".doku.com")'), false);
  assert.match(dokuNotification, /finalize_doku_order_payment/);
  assert.match(dokuNotification, /verifyDokuRequestSignature/);
  assert.equal(/\.from\("orders"\)[\s\S]*?\.update\(/.test(paymentPage), false);
  assert.equal(paymentPage.includes('event_type: "payment_success"'), false);
});

test("group creation and stream actions retain the original V24 API flow", () => {
  const migration = read(
    "supabase/migrations/20260705150000_comeplayers_security_hardening_v24_1.sql",
  );
  const groupsRoute = read("app/api/messages/groups/route.ts");
  const streamRoute = read("app/api/messages/rooms/[id]/stream/route.ts");

  assert.equal(migration.includes("cp_create_group_chat_v24_1"), false);
  assert.equal(migration.includes("cp_start_group_stream_v24_1"), false);
  assert.equal(migration.includes("cp_stop_group_stream_v24_1"), false);
  assert.match(groupsRoute, /\.from\("chat_rooms"\)[\s\S]*?\.insert\(/);
  assert.match(groupsRoute, /\.from\("chat_room_members"\)[\s\S]*?\.insert\(/);
  assert.match(streamRoute, /\.from\("chat_rooms"\)[\s\S]*?\.update\(/);
  assert.equal(groupsRoute.includes("cp_create_group_chat_v24_1"), false);
  assert.equal(streamRoute.includes("cp_start_group_stream_v24_1"), false);
  assert.equal(streamRoute.includes("cp_stop_group_stream_v24_1"), false);
});

test("chat participant payloads do not expose profile email addresses", () => {
  const roomDetail = read("app/api/messages/rooms/[id]/route.ts");
  const roomList = read("app/api/messages/rooms/route.ts");
  const memberRoute = read("app/api/messages/rooms/[id]/members/route.ts");

  assert.equal(roomDetail.includes("id,email,username"), false);
  assert.equal(roomList.includes("id,email,username"), false);
  assert.match(roomDetail, /toPublicChatProfile/);
  assert.match(
    memberRoute,
    /profile: toPublicChatProfile\(targetProfile \|\| null\)/,
  );
});

test("tax identifiers require a dedicated encryption key", () => {
  const cryptoModule = read("lib/taxResidencyCrypto.ts");

  assert.match(
    cryptoModule,
    /process\.env\.TAX_RESIDENCY_ENCRYPTION_KEY \|\| ""/,
  );
  assert.equal(cryptoModule.includes("PAYOUT_ENCRYPTION_KEY"), false);
  assert.equal(cryptoModule.includes("DELIVERY_ENCRYPTION_KEY"), false);
});

test("security headers stage HSTS and CSP monitoring before enforcement", () => {
  const config = read("next.config.ts");

  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /max-age=31536000; includeSubDomains/);
  assert.match(config, /Content-Security-Policy-Report-Only/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /frame-ancestors 'self'/);
});

test("V24.1 includes a database verification script", () => {
  const verification = read(
    "SECURITY_HARDENING_V24_1_VERIFY.sql",
  ).toLowerCase();

  assert.match(verification, /comeplayers_security_hardening_v24_1_verified/);
  assert.match(
    verification,
    /has_table_privilege\('anon', 'public\.marketplace_events', 'insert'\)/,
  );
  assert.equal(verification.includes("cp_create_group_chat_v24_1"), false);
  assert.equal(verification.includes("cp_start_group_stream_v24_1"), false);
  assert.equal(verification.includes("cp_stop_group_stream_v24_1"), false);
});
