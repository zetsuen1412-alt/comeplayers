import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFinancialRecords } from "../lib/reconciliation";

test("clean PayPal order and seller payout reconcile without findings", () => {
  const result = analyzeFinancialRecords({
    orders: [
      {
        id: 101,
        payment_method: "paypal",
        payment_status: "paid",
        escrow_status: "released",
        seller_payout_status: "released",
        paypal_amount_usd: 10,
        paypal_capture_id: "CAPTURE-1",
        seller_earning_amount: 142_500,
        paid_at: "2026-06-30T00:00:00.000Z",
      },
    ],
    paypalTransactions: [
      {
        id: 1,
        order_id: 101,
        amount_usd: 10,
        paypal_capture_id: "CAPTURE-1",
        status: "completed",
      },
    ],
    walletTransactions: [
      {
        id: 2,
        order_id: 101,
        type: "seller_order_payout",
        amount: 142_500,
        balance_before: 100_000,
        balance_after: 242_500,
        status: "completed",
      },
    ],
    withdrawals: [],
  });

  assert.equal(result.summary.issueCount, 0);
  assert.deepEqual(result.issues, []);
});

test("detects missing PayPal transaction and invalid escrow state", () => {
  const result = analyzeFinancialRecords({
    orders: [
      {
        id: 202,
        payment_method: "paypal",
        payment_status: "paid",
        escrow_status: "pending",
        paid_at: null,
      },
    ],
    paypalTransactions: [],
    walletTransactions: [],
    withdrawals: [],
  });

  const types = new Set(result.issues.map((item) => item.issueType));
  assert.equal(types.has("paypal_paid_order_missing_transaction"), true);
  assert.equal(types.has("paid_order_invalid_escrow_state"), true);
  assert.equal(types.has("paid_order_missing_paid_at"), true);
  assert.equal(result.summary.criticalCount, 1);
});

test("detects wallet ledger arithmetic mismatch", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 7,
        type: "deposit",
        amount: 50,
        balance_before: 100,
        balance_after: 120,
        status: "completed",
      },
    ],
    withdrawals: [],
  });

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.issueType, "wallet_balance_math_mismatch");
  assert.equal(result.issues[0]?.severity, "critical");
});

test("detects a closed withdrawal without refund ledger entry", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 9,
        type: "withdraw_request",
        amount: -100_000,
        balance_before: 200_000,
        balance_after: 100_000,
        status: "rejected",
        metadata: { withdrawal_id: 88 },
      },
    ],
    withdrawals: [
      {
        id: 88,
        amount: 100_000,
        status: "rejected",
      },
    ],
  });

  assert.equal(
    result.issues.some((item) => item.issueType === "closed_withdrawal_missing_refund"),
    true
  );
});

test("accepts a rejected withdrawal when the wallet refund exists", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 10,
        type: "withdraw_request",
        amount: -100_000,
        balance_before: 200_000,
        balance_after: 100_000,
        status: "rejected",
        metadata: { withdrawal_id: 89 },
      },
      {
        id: 11,
        type: "withdraw_rejected_refund",
        amount: 100_000,
        balance_before: 100_000,
        balance_after: 200_000,
        status: "completed",
        metadata: { withdrawal_id: 89 },
      },
    ],
    withdrawals: [{ id: 89, amount: 100_000, status: "rejected" }],
  });

  assert.equal(result.summary.issueCount, 0);
});

test("detects a wallet buyer debit that differs from the order total", () => {
  const result = analyzeFinancialRecords({
    orders: [
      {
        id: 303,
        payment_method: "wallet",
        payment_status: "paid",
        escrow_status: "holding",
        total_amount: 75_000,
        paid_at: "2026-06-30T00:00:00.000Z",
      },
    ],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 20,
        order_id: 303,
        type: "buyer_order_payment",
        amount: -70_000,
        balance_before: 100_000,
        balance_after: 30_000,
        status: "completed",
      },
    ],
    withdrawals: [],
  });

  assert.equal(
    result.issues.some(
      (item) => item.issueType === "wallet_buyer_debit_amount_mismatch"
    ),
    true
  );
});

test("paid withdrawal accepts the renamed withdraw_paid ledger entry", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 21,
        type: "withdraw_paid",
        amount: -100_000,
        balance_before: 200_000,
        balance_after: 100_000,
        status: "completed",
        metadata: { withdrawal_id: 90 },
      },
    ],
    withdrawals: [
      {
        id: 90,
        amount: 100_000,
        status: "paid",
        payout_reference: "BANK-REF-90",
      },
    ],
  });

  assert.equal(result.summary.issueCount, 0);
});

test("detects an orphan PayPal transaction", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [
      {
        id: 50,
        order_id: 9999,
        paypal_capture_id: "ORPHAN-CAPTURE",
        amount_usd: 12,
        status: "completed",
      },
    ],
    walletTransactions: [],
    withdrawals: [],
  });

  assert.equal(result.issues[0]?.issueType, "paypal_transaction_missing_order");
  assert.equal(result.issues[0]?.severity, "critical");
});

test("detects an orphan seller payout ledger entry", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 51,
        order_id: 7777,
        type: "seller_order_payout",
        amount: 50_000,
        balance_before: 100_000,
        balance_after: 150_000,
        status: "completed",
      },
    ],
    withdrawals: [],
  });

  assert.equal(
    result.issues.some(
      (item) => item.issueType === "wallet_order_transaction_missing_order"
    ),
    true
  );
});

test("detects withdrawal net amounts that ignore withholding tax", () => {
  const result = analyzeFinancialRecords({
    orders: [],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 910,
        type: "withdraw_paid",
        amount: -100_000,
        metadata: { withdrawal_id: 91 },
      },
    ],
    withdrawals: [
      {
        id: 91,
        amount: 100_000,
        tax_amount: 5_000,
        fee_amount: 2_000,
        net_amount: 100_000,
        tax_country_code: "ID",
        tax_payout_method: "bank_transfer",
        status: "paid",
        payout_reference: "BANK-91",
      },
    ],
  });

  assert.equal(
    result.issues.some((item) => item.issueType === "withdrawal_net_amount_mismatch"),
    true
  );
});


test("detects seller settlement that does not deduct the five percent sales tax", () => {
  const result = analyzeFinancialRecords({
    orders: [
      {
        id: 910,
        payment_status: "paid",
        status: "completed",
        escrow_status: "released",
        seller_payout_status: "released",
        seller_gross_amount: 100_000,
        marketplace_fee_amount: 5_000,
        seller_sales_tax_rate_percent: 5,
        seller_sales_tax_amount: 5_000,
        seller_earning_amount: 95_000,
      },
    ],
    paypalTransactions: [],
    walletTransactions: [
      {
        id: 911,
        order_id: 910,
        type: "seller_order_payout",
        amount: 95_000,
        status: "completed",
      },
    ],
    withdrawals: [],
  });

  assert.ok(
    result.issues.some((item) => item.issueType === "seller_net_settlement_mismatch")
  );
});
