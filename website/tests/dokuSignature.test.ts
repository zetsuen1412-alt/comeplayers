import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildDokuAttemptInvoice,
  buildDokuInvoice,
  buildDokuRequestSignatureComponent,
  buildDokuSnapSignatureComponent,
  createDokuDigest,
  createDokuRequestSignature,
  createDokuResponseSignature,
  createDokuSnapSignature,
  sanitizeDokuText,
  verifyDokuRequestSignature,
  verifyDokuResponseSignature,
  verifyDokuSnapSignature,
} from "../lib/dokuSignature";
import {
  describeDokuWalletResponse,
  extractDokuWalletPaymentUrl,
  isTrustedDokuPaymentUrl,
} from "../lib/dokuPaymentResponse";

const rawBody =
  '{"order":{"amount":150000,"invoice_number":"CP20260000000050","currency":"IDR"}}';
const clientId = "MCH-0001-10791114622547";
const requestId = "cc682442-6c22-493e-8121-b9ef6b3fa728";
const requestTimestamp = "2026-08-16T05:45:42.000Z";
const responseTimestamp = "2026-08-16T05:45:43.000Z";
const requestTarget = "/checkout/v1/payment";
const secretKey = "doku-test-secret";

test("DOKU payment attempts receive distinct provider-safe invoice numbers", () => {
  const first = buildDokuAttemptInvoice(61, "QR");
  const second = buildDokuAttemptInvoice(61, "QR");

  assert.match(first, /^CPQR\d{4}\d{10}[A-F0-9]{8}$/);
  assert.ok(first.length <= 30);
  assert.notEqual(first, second);
});

test("DOKU digest and request signature use the exact raw JSON body", () => {
  assert.equal(
    createDokuDigest(rawBody),
    "LxkkiisHOvP+bz2huP/z9lr9cBEW9SKR95fVZRda5FE=",
  );

  assert.equal(
    buildDokuRequestSignatureComponent({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      rawBody,
    }),
    [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${requestTimestamp}`,
      `Request-Target:${requestTarget}`,
      "Digest:LxkkiisHOvP+bz2huP/z9lr9cBEW9SKR95fVZRda5FE=",
    ].join("\n"),
  );

  const signature = createDokuRequestSignature({
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    rawBody,
    secretKey,
  });

  assert.equal(
    signature,
    "HMACSHA256=aQANmnkQD/M38RPctuOA4S2F9EBJNpg5ohUsRMayMe8=",
  );
  assert.equal(
    verifyDokuRequestSignature({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      rawBody,
      secretKey,
      signature,
    }),
    true,
  );
  assert.equal(
    verifyDokuRequestSignature({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      rawBody: `${rawBody} `,
      secretKey,
      signature,
    }),
    false,
  );
});

test("DOKU response signatures are verified independently", () => {
  const signature = createDokuResponseSignature({
    clientId,
    requestId,
    responseTimestamp,
    requestTarget,
    rawBody,
    secretKey,
  });

  assert.equal(
    signature,
    "HMACSHA256=mLuqccHCcf1Iq8dZPAcpHZHCnLjTTjU3Hu26cyyxLsA=",
  );
  assert.equal(
    verifyDokuResponseSignature({
      clientId,
      requestId,
      responseTimestamp,
      requestTarget,
      rawBody,
      secretKey,
      signature,
    }),
    true,
  );
});

test("DOKU SNAP notifications use the documented HMAC-SHA512 signature", () => {
  const snapBody = JSON.stringify({
    originalPartnerReferenceNo: "CPQR20260000000064ABC12345",
    latestTransactionStatus: "00",
    amount: { value: "10000.00", currency: "IDR" },
  });
  const input = {
    httpMethod: "POST",
    requestTarget: "/api/doku/notification",
    accessToken: "Bearer test-access-token",
    requestTimestamp: "2026-08-29T07:15:00+07:00",
    rawBody: snapBody,
    secretKey,
  };

  assert.equal(
    buildDokuSnapSignatureComponent(input),
    "POST:/api/doku/notification:test-access-token:82eb33868a94f289c43bc4b0634ec00a42f31f1cdb586f5842750a057dff679e:2026-08-29T07:15:00+07:00",
  );
  assert.equal(
    createDokuSnapSignature(input),
    "FiQH13U9L0Pbb0dgzLoh/em5jfDewZPTIaM8X5MJJkFuVg8m1xQoU1eJHIpGjd/kXMcDiSQIg0N51mZ5zV87Fw==",
  );
  assert.equal(
    verifyDokuSnapSignature({
      ...input,
      signature: createDokuSnapSignature(input),
    }),
    true,
  );
});

test("DOKU invoices contain only alphanumeric characters and fit the gateway limit", () => {
  assert.equal(buildDokuInvoice(50, "CP-2026-0000000050"), "CP20260000000050");

  const generated = buildDokuInvoice(987654321, null);
  assert.match(generated, /^[A-Za-z0-9]+$/);
  assert.ok(generated.length <= 30);
});

test("DOKU text removes unsupported Unicode while preserving allowed checkout characters", () => {
  assert.equal(
    sanitizeDokuText(
      "⭐3 Hours Package⭐ Piloting All Activities ➡️with STREAM+VPN+24/7",
      "ComePlayers Digital Product",
      255,
    ),
    "3 Hours Package Piloting All Activities with STREAM+VPN+24/7",
  );
  assert.equal(sanitizeDokuText("🎮", "Digital Product", 255), "Digital Product");
});

test("DOKU notification uses raw-body verification and a server-only finalizer", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/notification/route.ts"),
    "utf8",
  );

  assert.match(route, /const rawBody = await request\.text\(\)/);
  assert.match(route, /verifyDokuRequestSignature/);
  assert.match(route, /verifyDokuSnapSignature/);
  assert.match(route, /originalPartnerReferenceNo/);
  assert.match(route, /latestTransactionStatus/);
  assert.match(route, /responseCode: "2005600"/);
  assert.match(route, /finalize_doku_order_payment/);
  assert.match(route, /transactionStatus !== "SUCCESS"/);
  assert.equal(/request\.json\(\)/.test(route), false);
});

test("DOKU Checkout keeps its provider-compatible basic payload", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/create-payment/route.ts"),
    "utf8",
  );

  assert.match(route, /override_notification_url:\s*notificationUrl/);
  assert.match(route, /payment_due_date:\s*dueMinutes/);
  assert.equal(/doku_wallet_notify_url/.test(route), false);
  assert.equal(/line_items:\s*\[/.test(route), false);
});

test("Visa and Mastercard use DOKU's dedicated card payment page", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/create-payment/route.ts"),
    "utf8",
  );
  const server = readFileSync(
    path.join(process.cwd(), "lib/dokuServer.ts"),
    "utf8",
  );
  const paymentPage = readFileSync(
    path.join(process.cwd(), "app/payment/[id]/page.tsx"),
    "utf8",
  );

  assert.match(route, /paymentMethod === "card"/);
  assert.match(route, /createDokuCardPaymentPage\(\{/);
  assert.match(route, /paymentMode: "card_payment_page"/);
  assert.match(route, /type: "SALE"/);
  assert.match(route, /override_configuration/);
  assert.match(route, /button_background_color: "0EA5E9"/);
  assert.match(server, /\/credit-card\/v1\/payment-page/);
  assert.match(server, /credit_card_payment_page\?\.url/);
  assert.match(paymentPage, /cardPaymentUrl/);
  assert.match(paymentPage, /cardPaymentFrame/);
  assert.match(paymentPage, /Secured by DOKU/);
  assert.match(paymentPage, /Your card details stay with DOKU/);
  assert.match(paymentPage, /<iframe/);
  assert.match(
    paymentPage,
    /referrerPolicy="strict-origin-when-cross-origin"/,
  );
  assert.match(route, /paymentMethod === "card"[\s\S]*?\? "card"/);
});

test("DOKU confirmation keeps polling while the payment mini-game is open", () => {
  const paymentPage = readFileSync(
    path.join(process.cwd(), "app/payment/[id]/page.tsx"),
    "utf8",
  );
  const waitGame = readFileSync(
    path.join(process.cwd(), "app/payment/[id]/PaymentWaitGame.tsx"),
    "utf8",
  );

  assert.match(
    paymentPage,
    /waitingForConfirmation && returningFromDokuCard/,
  );
  assert.match(paymentPage, /<PaymentWaitGame/);
  assert.match(waitGame, /DOKU confirmation continues automatically/);
  assert.match(waitGame, /Successful payment redirects instantly/);
  assert.match(waitGame, /Continue waiting in background/);
  assert.match(waitGame, /aria-label="Catch payment pulse"/);
});

test("QRIS creates a dynamic amount-locked DOKU payment and reuses active attempts", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/create-payment/route.ts"),
    "utf8",
  );
  const mcpServer = readFileSync(
    path.join(process.cwd(), "lib/dokuMcpServer.ts"),
    "utf8",
  );
  const snapServer = readFileSync(
    path.join(process.cwd(), "lib/dokuSnapQrisServer.ts"),
    "utf8",
  );
  const paymentPage = readFileSync(
    path.join(process.cwd(), "app/payment/[id]/page.tsx"),
    "utf8",
  );

  assert.match(route, /type PaymentMethod = [^;]*\| "qris"/);
  assert.match(route, /paymentMethod === "qris"/);
  assert.match(route, /buildDokuAttemptInvoice\(order\.id, "QR"\)/);
  assert.match(route, /createDokuSnapQrisPayment\(\{/);
  assert.match(route, /createDokuQrisPayment\(\{/);
  assert.equal(/payment_method_types:\s*\["QRIS"\]/.test(route), false);
  assert.equal(/using hosted QRIS checkout/.test(route), false);
  assert.match(route, /isActiveQris\(existingAttempt\)/);
  assert.match(route, /qr_content:\s*qris\.qrContent/);
  assert.match(route, /qr_image_url:\s*storedImageUrl/);
  assert.match(route, /paymentMode:\s*"qris"/);
  assert.equal(/doku-qris-merchant\.png/.test(route), false);
  assert.equal(/staticMerchant/.test(route), false);
  assert.match(mcpServer, /generate_payment_qris/);
  assert.match(mcpServer, /value:\s*input\.amount\.toFixed\(2\)/);
  assert.match(mcpServer, /responseCode !== "2004700"/);
  assert.match(snapServer, /\/snap-adapter\/b2b\/v1\.0\/qr\/qr-mpm-generate/);
  assert.match(snapServer, /value:\s*input\.amount\.toFixed\(2\)/);
  assert.match(snapServer, /merchantId:\s*config\.merchantId/);
  assert.match(snapServer, /terminalId:\s*config\.terminalId/);
  assert.match(snapServer, /postalCode:\s*config\.postalCode/);
  assert.match(snapServer, /feeType:\s*config\.feeType/);
  assert.match(snapServer, /createSign\("RSA-SHA256"\)/);
  assert.match(snapServer, /createDokuSnapSignature\(\{/);
  assert.match(snapServer, /QRCode\.toDataURL\(qrContent/);
  assert.match(paymentPage, /choosePaymentMethod\("qris"\)/);
  assert.match(paymentPage, /Continue with QRIS/);
  assert.match(paymentPage, /Generating QRIS/);
  assert.match(paymentPage, /Exact amount embedded/);
  assert.match(paymentPage, /no amount entry required/);
  assert.equal(/staticMerchant/.test(paymentPage), false);
  assert.equal(/enter the exact amount/i.test(paymentPage), false);
});

test("DOKU direct bank transfer creates and reuses a protected virtual account", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/create-payment/route.ts"),
    "utf8",
  );
  const server = readFileSync(
    path.join(process.cwd(), "lib/dokuServer.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260816051300_doku_direct_payment_attempts.sql",
    ),
    "utf8",
  );

  assert.match(route, /paymentMethod \|\| "bank_transfer"/);
  assert.match(route, /createDokuVirtualAccount/);
  assert.match(route, /billing_type: "FIX_BILL"/);
  assert.match(route, /paymentMode: "virtual_account"/);
  assert.match(route, /networkName: "DOKU Virtual Account"/);
  assert.match(route, /transferType: "multi_bank"/);
  assert.match(route, /\.from\("doku_payment_attempts"\)/);
  assert.match(server, /\/doku-virtual-account\/v2\/payment-code/);
  assert.match(server, /\^\\d\{8,28\}\$/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all[\s\S]*anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*service_role/i);
});

test("DOKU Checkout falls back to the active DOKU Wallet service on provider errors", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/doku/create-payment/route.ts"),
    "utf8",
  );
  const server = readFileSync(
    path.join(process.cwd(), "lib/dokuServer.ts"),
    "utf8",
  );

  assert.match(route, /error instanceof DokuProviderError/);
  assert.match(route, /createDokuWalletPayment/);
  assert.match(route, /paymentMode = "doku_wallet"/);
  assert.match(server, /\/dokuwallet-emoney\/v1\/payment/);
  assert.match(server, /extractDokuWalletPaymentUrl/);
});

test("DOKU Wallet payment URLs are extracted from documented and wrapped responses", () => {
  assert.equal(
    extractDokuWalletPaymentUrl({
      doku_wallet_payment_page: {
        url: "https://staging.doku.com/wallauth/session",
      },
    }),
    "https://staging.doku.com/wallauth/session",
  );
  assert.equal(
    extractDokuWalletPaymentUrl({
      data: {
        doku_wallet_payment_page: {
          url: "https://pay.doku.com/wallet/session",
        },
      },
    }),
    "https://pay.doku.com/wallet/session",
  );
  assert.equal(
    extractDokuWalletPaymentUrl({
      response: { payment: { url: "https://pay.doku.com/session" } },
    }),
    "https://pay.doku.com/session",
  );
});

test("DOKU Wallet diagnostics reveal structure without response values", () => {
  const diagnostics = describeDokuWalletResponse({
    response_code: "SERVICE_NOT_AVAILABLE",
    message: "sensitive provider text",
    data: { reason: "sensitive reason" },
  });

  assert.equal(
    diagnostics,
    "code=SERVICE_NOT_AVAILABLE rootKeys=data,message,response_code dataKeys=reason responseKeys=none",
  );
  assert.equal(diagnostics.includes("sensitive"), false);
});

test("DOKU payment redirects allow the signed production wallet host only", () => {
  assert.equal(
    isTrustedDokuPaymentUrl(
      "https://my.dokuwallet.com/wallauth/jokultransaction?sessionId=test",
    ),
    true,
  );
  assert.equal(
    isTrustedDokuPaymentUrl("https://sandbox.doku.com/checkout-link-v2/test"),
    true,
  );
  assert.equal(
    isTrustedDokuPaymentUrl("https://attacker.my.dokuwallet.com/session"),
    false,
  );
  assert.equal(
    isTrustedDokuPaymentUrl("http://my.dokuwallet.com/session"),
    false,
  );
});
