import test from "node:test";
import assert from "node:assert/strict";
import { quoteWalletTopup, matchesWalletCharge, readWalletPayPalCapture, walletInvoice, walletIdFromInvoice, type WalletPayPalOrder } from "../lib/cpWallet";

const now = Date.parse("2026-09-17T00:00:00Z");
const base = { rates: { USD: { currency: "USD" as const, units_per_usd: 1, margin_percent: 0 }, IDR: { currency: "IDR" as const, units_per_usd: 17000, margin_percent: 0 }, SGD: { currency: "SGD" as const, units_per_usd: 1.3, margin_percent: 0 } }, asOf: "2026-09-16", now };
test("USD input is converted once and DOKU receives the exact IDR credit", () => {
  const q = quoteWalletTopup({ ...base, amount: "10.25", currency: "USD", provider: "doku" });
  assert.equal(q.amount_idr, 174250); assert.equal(q.charge_amount, q.amount_idr); assert.equal(q.charge_currency, "IDR");
});
test("SGD top-up locks a quote and rounds PayPal's USD charge to cents", () => {
  const q = quoteWalletTopup({ ...base, amount: "25.11", currency: "SGD", provider: "paypal" });
  assert.equal(q.amount_idr, 328361); assert.equal(q.charge_currency, "USD"); assert.equal(q.charge_amount, 19.32);
  assert.ok(q.charge_amount * 17000 >= q.amount_idr);
});
test("IDR with DOKU needs no FX service and does not multiply by USD", () => {
  const q = quoteWalletTopup({ amount: "100000", currency: "IDR", provider: "doku", rates: {}, asOf: null, now });
  assert.equal(q.amount_idr, 100000); assert.equal(q.idr_per_unit, 1);
});
test("financial quotes fail closed for stale or unavailable FX", () => {
  assert.throws(() => quoteWalletTopup({ ...base, amount: "10", currency: "USD", provider: "doku", asOf: "2026-08-01" }), /rate/);
  assert.throws(() => quoteWalletTopup({ ...base, amount: "10", currency: "USD", provider: "paypal", rates: {} }), /rate/);
});
test("top-up input rejects malformed, over-limit, fractional IDR and unsupported money", () => {
  for (const amount of ["0", "-1", "Infinity", "NaN", "1e5", "1,000", "0.001", "10000000.01", "10000001", "99"]) {
    assert.throws(() => quoteWalletTopup({ ...base, amount, currency: "IDR", provider: "doku" }));
  }
  assert.throws(() => quoteWalletTopup({ ...base, amount: "10", currency: "XYZ", provider: "paypal" }));
  assert.throws(() => quoteWalletTopup({ ...base, amount: "10000", currency: "IDR", provider: "fake" }));
  assert.throws(() => quoteWalletTopup({ ...base, amount: "10000", currency: "IDR", provider: "paypal" }), /minimum/);
});
test("payment comparison rejects a different currency, fraction or nondecimal value", () => {
  const expected = { charge_amount: 10000, charge_currency: "IDR" };
  assert.ok(matchesWalletCharge("10000.00", "IDR", expected));
  for (const value of ["10000.01", "1e4", "-10000", "10,000", "9999", "100000", "0"]) assert.equal(matchesWalletCharge(value, "IDR", expected), false);
  assert.equal(matchesWalletCharge("10000", "USD", expected), false);
});
const id = "00000000-0000-4000-8000-000000000001";
test("top-up references are distinct from marketplace invoices", () => {
  assert.equal(walletIdFromInvoice(walletInvoice(id)), id);
  assert.equal(walletIdFromInvoice("CP-123-456"), null);
  assert.equal(walletIdFromInvoice("CPW-../../admin"), null);
  assert.throws(() => walletInvoice("bad"));
});
const expected = { id, provider_order_id: "PAYPAL123", charge_amount: 10.50, charge_currency: "USD" };
const capture = (): WalletPayPalOrder => ({ id: "PAYPAL123", status: "COMPLETED", purchase_units: [{ custom_id: walletInvoice(id), payments: { captures: [{ id: "CAPTURE123", status: "COMPLETED", amount: { value: "10.50", currency_code: "USD" } }] } }] });
test("only one completed capture with the exact quoted amount credits a top-up", () => {
  assert.deepEqual(readWalletPayPalCapture(capture(), expected), { id: "CAPTURE123", amount: 10.5 });
  const pending = capture(); pending.purchase_units![0].payments!.captures![0].status = "PENDING";
  assert.throws(() => readWalletPayPalCapture(pending, expected));
  const currency = capture(); currency.purchase_units![0].payments!.captures![0].amount!.currency_code = "SGD";
  assert.throws(() => readWalletPayPalCapture(currency, expected));
  const mismatch = capture(); mismatch.purchase_units![0].payments!.captures![0].amount!.value = "10.49";
  assert.throws(() => readWalletPayPalCapture(mismatch, expected));
  const duplicate = capture(); duplicate.purchase_units![0].payments!.captures!.push(duplicate.purchase_units![0].payments!.captures![0]);
  assert.throws(() => readWalletPayPalCapture(duplicate, expected));
  const wrongOrder = capture(); wrongOrder.id = "OTHER";
  assert.throws(() => readWalletPayPalCapture(wrongOrder, expected));
  const owner = capture(); owner.purchase_units![0].custom_id = walletInvoice("00000000-0000-4000-8000-000000000002");
  assert.throws(() => readWalletPayPalCapture(owner, expected));
});
