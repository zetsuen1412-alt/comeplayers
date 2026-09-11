export type ReconciliationSeverity = "low" | "medium" | "high" | "critical";

export type ReconciliationEntityType =
  | "order"
  | "paypal_transaction"
  | "wallet_transaction"
  | "withdrawal";

export type FinancialOrderRecord = {
  id: number | string;
  buyer_id?: string | null;
  seller_id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
  escrow_status?: string | null;
  seller_payout_status?: string | null;
  total_amount?: number | string | null;
  total_price?: number | string | null;
  paypal_amount_usd?: number | string | null;
  paypal_capture_id?: string | null;
  seller_gross_amount?: number | string | null;
  marketplace_fee_amount?: number | string | null;
  seller_sales_tax_rate_percent?: number | string | null;
  seller_sales_tax_amount?: number | string | null;
  seller_earning_amount?: number | string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};

export type PayPalTransactionRecord = {
  id: number | string;
  order_id?: number | string | null;
  paypal_capture_id?: string | null;
  amount_usd?: number | string | null;
  status?: string | null;
  created_at?: string | null;
};

export type WalletTransactionRecord = {
  id: number | string;
  order_id?: number | string | null;
  type?: string | null;
  transaction_type?: string | null;
  amount?: number | string | null;
  balance_before?: number | string | null;
  balance_after?: number | string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type WithdrawalRecord = {
  id: number | string;
  amount?: number | string | null;
  fee_amount?: number | string | null;
  tax_amount?: number | string | null;
  net_amount?: number | string | null;
  tax_country_code?: string | null;
  tax_payout_method?: string | null;
  tax_rule_id?: number | string | null;
  status?: string | null;
  payout_reference?: string | null;
  provider_status?: string | null;
  updated_at?: string | null;
};

export type ReconciliationIssueDraft = {
  issueKey: string;
  issueType: string;
  severity: ReconciliationSeverity;
  entityType: ReconciliationEntityType;
  entityId: string;
  title: string;
  description: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
};

export type ReconciliationSummary = {
  scannedOrders: number;
  scannedPayPalTransactions: number;
  scannedWalletTransactions: number;
  scannedWithdrawals: number;
  issueCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

const EPSILON = 0.01;

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function id(value: unknown) {
  return String(value ?? "").trim();
}

function closeEnough(left: unknown, right: unknown) {
  return Math.abs(numeric(left) - numeric(right)) <= EPSILON;
}

function walletType(record: WalletTransactionRecord) {
  return normalize(record.type || record.transaction_type);
}

function withdrawalIdFromMetadata(record: WalletTransactionRecord) {
  const raw = record.metadata?.withdrawal_id;
  return raw === null || raw === undefined ? "" : id(raw);
}

function issue(input: Omit<ReconciliationIssueDraft, "issueKey"> & { discriminator?: string }) {
  const discriminator = input.discriminator ? `:${input.discriminator}` : "";
  return {
    ...input,
    issueKey: `${input.issueType}:${input.entityType}:${input.entityId}${discriminator}`,
  } satisfies ReconciliationIssueDraft;
}

export function analyzeFinancialRecords(input: {
  orders: FinancialOrderRecord[];
  paypalTransactions: PayPalTransactionRecord[];
  walletTransactions: WalletTransactionRecord[];
  withdrawals: WithdrawalRecord[];
}) {
  const issues: ReconciliationIssueDraft[] = [];
  const knownOrderIds = new Set(input.orders.map((order) => id(order.id)));
  const paypalByOrder = new Map<string, PayPalTransactionRecord[]>();
  const walletByOrder = new Map<string, WalletTransactionRecord[]>();
  const walletByWithdrawal = new Map<string, WalletTransactionRecord[]>();

  for (const transaction of input.paypalTransactions) {
    const orderId = id(transaction.order_id);
    if (!orderId || !knownOrderIds.has(orderId)) {
      issues.push(
        issue({
          issueType: "paypal_transaction_missing_order",
          severity: "critical",
          entityType: "paypal_transaction",
          entityId: id(transaction.id),
          title: "PayPal transaction is not linked to an existing order",
          description:
            "A provider transaction must reference a marketplace order that can be reconciled.",
          expected: { order_id: "existing marketplace order" },
          actual: { order_id: transaction.order_id || null },
        })
      );
      continue;
    }
    const rows = paypalByOrder.get(orderId) || [];
    rows.push(transaction);
    paypalByOrder.set(orderId, rows);
  }

  for (const transaction of input.walletTransactions) {
    const orderId = id(transaction.order_id);
    if (orderId) {
      const rows = walletByOrder.get(orderId) || [];
      rows.push(transaction);
      walletByOrder.set(orderId, rows);
    }

    const withdrawalId = withdrawalIdFromMetadata(transaction);
    if (withdrawalId) {
      const rows = walletByWithdrawal.get(withdrawalId) || [];
      rows.push(transaction);
      walletByWithdrawal.set(withdrawalId, rows);
    }

    const ledgerType = walletType(transaction);
    if (
      ["buyer_order_payment", "seller_order_payout", "order_refund"].includes(
        ledgerType
      ) &&
      (!orderId || !knownOrderIds.has(orderId))
    ) {
      issues.push(
        issue({
          issueType: "wallet_order_transaction_missing_order",
          severity: "critical",
          entityType: "wallet_transaction",
          entityId: id(transaction.id),
          title: "Order wallet transaction is not linked to an existing order",
          description:
            "Order payment, payout, and refund ledger entries must reference an existing marketplace order.",
          expected: { order_id: "existing marketplace order" },
          actual: { order_id: transaction.order_id || null, type: ledgerType },
        })
      );
    }

    const before = numeric(transaction.balance_before);
    const amount = numeric(transaction.amount);
    const after = numeric(transaction.balance_after);
    const hasBalanceValues =
      transaction.balance_before !== null &&
      transaction.balance_before !== undefined &&
      transaction.balance_after !== null &&
      transaction.balance_after !== undefined;

    if (
      hasBalanceValues &&
      normalize(transaction.status) === "completed" &&
      !closeEnough(before + amount, after)
    ) {
      issues.push(
        issue({
          issueType: "wallet_balance_math_mismatch",
          severity: "critical",
          entityType: "wallet_transaction",
          entityId: id(transaction.id),
          title: "Wallet balance arithmetic does not reconcile",
          description:
            "The recorded balance_after does not equal balance_before plus the transaction amount.",
          expected: { balance_after: before + amount },
          actual: { balance_before: before, amount, balance_after: after },
        })
      );
    }
  }

  for (const order of input.orders) {
    const orderId = id(order.id);
    const paymentStatus = normalize(order.payment_status);
    const paymentMethod = normalize(order.payment_method);
    const escrowStatus = normalize(order.escrow_status);
    const payoutStatus = normalize(order.seller_payout_status);
    const paypalRows = paypalByOrder.get(orderId) || [];
    const walletRows = walletByOrder.get(orderId) || [];

    if (paymentStatus === "paid" && !order.paid_at) {
      issues.push(
        issue({
          issueType: "paid_order_missing_paid_at",
          severity: "medium",
          entityType: "order",
          entityId: orderId,
          title: "Paid order has no payment timestamp",
          description: "A paid order must preserve the time payment was finalized.",
          expected: { paid_at: "non-null" },
          actual: { paid_at: order.paid_at || null, payment_status: paymentStatus },
        })
      );
    }

    if (
      paymentStatus === "paid" &&
      !["holding", "released", "disputed", "refunded"].includes(escrowStatus)
    ) {
      issues.push(
        issue({
          issueType: "paid_order_invalid_escrow_state",
          severity: "high",
          entityType: "order",
          entityId: orderId,
          title: "Paid order is outside the escrow lifecycle",
          description:
            "Paid orders must be held, released, disputed, or refunded in escrow.",
          expected: { escrow_status: ["holding", "released", "disputed", "refunded"] },
          actual: { escrow_status: order.escrow_status || null },
        })
      );
    }

    if (paymentStatus === "paid" && paymentMethod === "paypal") {
      if (paypalRows.length === 0) {
        issues.push(
          issue({
            issueType: "paypal_paid_order_missing_transaction",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "PayPal-paid order has no provider transaction",
            description:
              "The order is marked paid, but no PayPal transaction is linked to it.",
            expected: { paypal_transaction_count: 1 },
            actual: { paypal_transaction_count: 0 },
          })
        );
      }

      if (paypalRows.length > 1) {
        issues.push(
          issue({
            issueType: "paypal_duplicate_transactions",
            severity: "high",
            entityType: "order",
            entityId: orderId,
            title: "Multiple PayPal transactions are linked to one order",
            description:
              "One marketplace order should map to one canonical PayPal transaction.",
            expected: { paypal_transaction_count: 1 },
            actual: { paypal_transaction_count: paypalRows.length },
          })
        );
      }

      const transaction = paypalRows[0];
      if (transaction) {
        if (
          numeric(order.paypal_amount_usd) > 0 &&
          !closeEnough(order.paypal_amount_usd, transaction.amount_usd)
        ) {
          issues.push(
            issue({
              issueType: "paypal_amount_mismatch",
              severity: "critical",
              entityType: "order",
              entityId: orderId,
              title: "PayPal amount does not match the order",
              description:
                "The provider transaction amount differs from the USD amount stored on the order.",
              expected: { amount_usd: numeric(order.paypal_amount_usd) },
              actual: { amount_usd: numeric(transaction.amount_usd) },
            })
          );
        }

        if (
          order.paypal_capture_id &&
          transaction.paypal_capture_id &&
          order.paypal_capture_id !== transaction.paypal_capture_id
        ) {
          issues.push(
            issue({
              issueType: "paypal_capture_id_mismatch",
              severity: "critical",
              entityType: "order",
              entityId: orderId,
              title: "PayPal capture ID mismatch",
              description:
                "The order and provider transaction reference different capture IDs.",
              expected: { paypal_capture_id: order.paypal_capture_id },
              actual: { paypal_capture_id: transaction.paypal_capture_id },
            })
          );
        }
      }
    }

    if (paymentStatus === "paid" && paymentMethod === "wallet") {
      const buyerPayments = walletRows.filter(
        (transaction) => walletType(transaction) === "buyer_order_payment"
      );

      if (buyerPayments.length === 0) {
        issues.push(
          issue({
            issueType: "wallet_paid_order_missing_debit",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Wallet-paid order has no buyer debit",
            description:
              "The order is marked paid with wallet, but no buyer_order_payment ledger entry exists.",
            expected: { buyer_order_payment_count: 1 },
            actual: { buyer_order_payment_count: 0 },
          })
        );
      }

      if (buyerPayments.length > 1) {
        issues.push(
          issue({
            issueType: "wallet_duplicate_buyer_debits",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Wallet order has duplicate buyer debits",
            description:
              "One wallet-funded marketplace order must create exactly one buyer_order_payment entry.",
            expected: { buyer_order_payment_count: 1 },
            actual: { buyer_order_payment_count: buyerPayments.length },
          })
        );
      }

      const buyerPayment = buyerPayments[0];
      const orderTotal = numeric(order.total_amount || order.total_price);
      if (
        buyerPayment &&
        orderTotal > 0 &&
        !closeEnough(buyerPayment.amount, -orderTotal)
      ) {
        issues.push(
          issue({
            issueType: "wallet_buyer_debit_amount_mismatch",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Wallet buyer debit does not match the order total",
            description:
              "The buyer_order_payment amount must be the negative of the marketplace order total.",
            expected: { amount: -orderTotal },
            actual: { amount: numeric(buyerPayment.amount) },
          })
        );
      }
    }

    if (paymentStatus === "refunded" && payoutStatus === "released") {
      issues.push(
        issue({
          issueType: "refunded_order_has_released_payout",
          severity: "critical",
          entityType: "order",
          entityId: orderId,
          title: "Refunded order still has a released seller payout",
          description:
            "A refunded order cannot retain a released seller payout without a recovery record.",
          expected: { seller_payout_status: ["cancelled", "recovered", "review"] },
          actual: { seller_payout_status: order.seller_payout_status || null },
        })
      );
    }

    const sellerGross = numeric(order.seller_gross_amount);
    const sellerTaxRate = numeric(order.seller_sales_tax_rate_percent);
    const sellerTax = numeric(order.seller_sales_tax_amount);
    const marketplaceFee = numeric(order.marketplace_fee_amount);
    const sellerEarning = numeric(order.seller_earning_amount);
    const hasSellerTaxSnapshot =
      sellerGross > 0 || sellerTax > 0 || sellerTaxRate > 0;

    if (hasSellerTaxSnapshot) {
      const expectedSellerTax = Math.round(
        sellerGross * sellerTaxRate
      ) / 100;
      const expectedSellerEarning = Math.max(
        0,
        Math.round((sellerGross - marketplaceFee - sellerTax) * 100) / 100
      );

      if (!closeEnough(expectedSellerTax, sellerTax)) {
        issues.push(
          issue({
            issueType: "seller_sales_tax_amount_mismatch",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Seller sales tax does not match the snapshotted rate",
            description:
              "Seller sales tax must equal seller gross proceeds multiplied by the snapshotted rate.",
            expected: { seller_sales_tax_amount: expectedSellerTax },
            actual: {
              seller_gross_amount: sellerGross,
              seller_sales_tax_rate_percent: sellerTaxRate,
              seller_sales_tax_amount: sellerTax,
            },
          })
        );
      }

      if (!closeEnough(expectedSellerEarning, sellerEarning)) {
        issues.push(
          issue({
            issueType: "seller_net_settlement_mismatch",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Seller net settlement ignores fee or withholding",
            description:
              "Seller wallet credit must equal gross proceeds minus marketplace fee and seller sales tax.",
            expected: { seller_earning_amount: expectedSellerEarning },
            actual: {
              seller_gross_amount: sellerGross,
              marketplace_fee_amount: marketplaceFee,
              seller_sales_tax_amount: sellerTax,
              seller_earning_amount: sellerEarning,
            },
          })
        );
      }
    }

    if (escrowStatus === "released" || payoutStatus === "released") {
      const sellerPayouts = walletRows.filter(
        (transaction) => walletType(transaction) === "seller_order_payout"
      );

      if (sellerPayouts.length === 0) {
        issues.push(
          issue({
            issueType: "released_order_missing_seller_credit",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Released escrow has no seller wallet credit",
            description:
              "Escrow is released, but the seller_order_payout ledger entry is missing.",
            expected: { seller_order_payout_count: 1 },
            actual: { seller_order_payout_count: 0 },
          })
        );
      }

      const payout = sellerPayouts[0];
      if (
        payout &&
        numeric(order.seller_earning_amount) > 0 &&
        !closeEnough(order.seller_earning_amount, payout.amount)
      ) {
        issues.push(
          issue({
            issueType: "seller_payout_amount_mismatch",
            severity: "critical",
            entityType: "order",
            entityId: orderId,
            title: "Seller payout amount does not match the order",
            description:
              "The wallet credit differs from seller_earning_amount stored on the order.",
            expected: { amount: numeric(order.seller_earning_amount) },
            actual: { amount: numeric(payout.amount) },
          })
        );
      }
    }
  }

  for (const withdrawal of input.withdrawals) {
    const withdrawalId = id(withdrawal.id);
    const status = normalize(withdrawal.status);
    const transactions = walletByWithdrawal.get(withdrawalId) || [];
    const requestRows = transactions.filter((transaction) =>
      ["withdraw_request", "withdraw_approved", "withdraw_paid"].includes(
        walletType(transaction)
      )
    );

    if (requestRows.length === 0) {
      issues.push(
        issue({
          issueType: "withdrawal_missing_wallet_debit",
          severity: "critical",
          entityType: "withdrawal",
          entityId: withdrawalId,
          title: "Withdrawal has no wallet debit",
          description:
            "Every withdrawal request must be backed by one withdraw_request ledger entry.",
          expected: { withdraw_request_count: 1 },
          actual: { withdraw_request_count: 0 },
        })
      );
    }

    const hasTaxSnapshot = Boolean(
      withdrawal.tax_rule_id ||
      String(withdrawal.tax_country_code || "").trim() ||
      String(withdrawal.tax_payout_method || "").trim()
    );
    const expectedNet = Math.max(
      numeric(withdrawal.amount) - numeric(withdrawal.tax_amount) - numeric(withdrawal.fee_amount),
      0
    );
    if (
      hasTaxSnapshot &&
      ["pending", "approved", "processing", "paid"].includes(status) &&
      !closeEnough(expectedNet, withdrawal.net_amount)
    ) {
      issues.push(
        issue({
          issueType: "withdrawal_net_amount_mismatch",
          severity: "high",
          entityType: "withdrawal",
          entityId: withdrawalId,
          title: "Withdrawal net amount does not match tax and fee deductions",
          description:
            "Net payout must equal gross withdrawal minus the snapshotted withdrawal tax and provider fee.",
          expected: { net_amount: expectedNet },
          actual: {
            amount: numeric(withdrawal.amount),
            tax_amount: numeric(withdrawal.tax_amount),
            fee_amount: numeric(withdrawal.fee_amount),
            net_amount: numeric(withdrawal.net_amount),
          },
        })
      );
    }

    if (
      status === "paid" &&
      hasTaxSnapshot &&
      (!String(withdrawal.tax_country_code || "").trim() ||
        !String(withdrawal.tax_payout_method || "").trim())
    ) {
      issues.push(
        issue({
          issueType: "paid_withdrawal_missing_tax_snapshot",
          severity: "high",
          entityType: "withdrawal",
          entityId: withdrawalId,
          title: "Paid withdrawal has no country/method tax snapshot",
          description:
            "A paid seller withdrawal must retain the country and payout method used for tax withholding.",
          expected: { tax_country_code: "configured", tax_payout_method: "configured" },
          actual: {
            tax_country_code: withdrawal.tax_country_code || null,
            tax_payout_method: withdrawal.tax_payout_method || null,
          },
        })
      );
    }

    if (status === "paid" && !String(withdrawal.payout_reference || "").trim()) {
      issues.push(
        issue({
          issueType: "paid_withdrawal_missing_reference",
          severity: "high",
          entityType: "withdrawal",
          entityId: withdrawalId,
          title: "Paid withdrawal has no payout reference",
          description:
            "A provider or bank reference is required before a withdrawal can be marked paid.",
          expected: { payout_reference: "non-empty" },
          actual: { payout_reference: withdrawal.payout_reference || null },
        })
      );
    }

    if (["rejected", "failed", "cancelled"].includes(status)) {
      const refundTypes = new Set([
        "withdraw_rejected_refund",
        "withdraw_failed_refund",
        "withdraw_cancelled_refund",
      ]);
      const refundRows = transactions.filter((transaction) =>
        refundTypes.has(walletType(transaction))
      );

      if (refundRows.length === 0) {
        issues.push(
          issue({
            issueType: "closed_withdrawal_missing_refund",
            severity: "critical",
            entityType: "withdrawal",
            entityId: withdrawalId,
            title: "Closed withdrawal has no wallet refund",
            description:
              "Rejected, failed, or cancelled withdrawals must return the reserved balance.",
            expected: { refund_transaction_count: 1 },
            actual: { refund_transaction_count: 0, status },
          })
        );
      }
    }
  }

  const counts = issues.reduce(
    (result, current) => {
      result[current.severity] += 1;
      return result;
    },
    { low: 0, medium: 0, high: 0, critical: 0 }
  );

  const summary: ReconciliationSummary = {
    scannedOrders: input.orders.length,
    scannedPayPalTransactions: input.paypalTransactions.length,
    scannedWalletTransactions: input.walletTransactions.length,
    scannedWithdrawals: input.withdrawals.length,
    issueCount: issues.length,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
  };

  return { issues, summary };
}
