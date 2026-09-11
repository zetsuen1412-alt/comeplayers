export type CommerceOrder = {
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  total_price?: number | string | null;
  tax_amount?: number | string | null;
  seller_sales_tax_amount?: number | string | null;
  seller_gross_amount?: number | string | null;
  marketplace_fee_amount?: number | string | null;
  created_at?: string | null;
  paid_at?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  delivery_due_at?: string | null;
};

export type CommerceWithdrawal = {
  status?: string | null;
  amount?: number | string | null;
  tax_amount?: number | string | null;
  fee_amount?: number | string | null;
  net_amount?: number | string | null;
  paid_at?: string | null;
};

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value: unknown) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function calculateCommerceMetrics(
  orders: CommerceOrder[],
  withdrawals: CommerceWithdrawal[] = []
) {
  const paid = orders.filter((order) => {
    const payment = String(order.payment_status || "").toLowerCase();
    const status = String(order.status || "").toLowerCase();
    return payment === "paid" || ["paid", "delivered", "completed"].includes(status);
  });
  const completed = orders.filter((order) =>
    String(order.status || "").toLowerCase() === "completed"
  );
  const paidWithdrawals = withdrawals.filter(
    (withdrawal) => String(withdrawal.status || "").toLowerCase() === "paid"
  );
  const deliveryMinutes = orders.flatMap((order) => {
    const start = timestamp(order.paid_at);
    const end = timestamp(order.delivered_at);
    return start && end && end >= start ? [(end - start) / 60_000] : [];
  });
  const lateDeliveries = orders.filter((order) => {
    const due = timestamp(order.delivery_due_at);
    const delivered = timestamp(order.delivered_at);
    return Boolean(due && delivered && delivered > due);
  }).length;
  const sellerSalesTaxWithheld = completed.reduce(
    (sum, order) => sum + numeric(order.seller_sales_tax_amount),
    0
  );
  const withdrawalTaxWithheld = paidWithdrawals.reduce(
    (sum, withdrawal) => sum + numeric(withdrawal.tax_amount),
    0
  );

  return {
    createdOrders: orders.length,
    paidOrders: paid.length,
    completedOrders: completed.length,
    checkoutToPaidPercent: orders.length ? (paid.length / orders.length) * 100 : 0,
    paidToCompletedPercent: paid.length ? (completed.length / paid.length) * 100 : 0,
    grossVolume: paid.reduce(
      (sum, order) => sum + numeric(order.total_amount || order.total_price),
      0
    ),
    sellerGrossVolume: completed.reduce(
      (sum, order) => sum + numeric(order.seller_gross_amount),
      0
    ),
    sellerSalesTaxWithheld,
    withdrawalTaxWithheld,
    taxCollected: sellerSalesTaxWithheld + withdrawalTaxWithheld,
    marketplaceFees: completed.reduce(
      (sum, order) => sum + numeric(order.marketplace_fee_amount),
      0
    ),
    withdrawalGross: paidWithdrawals.reduce(
      (sum, withdrawal) => sum + numeric(withdrawal.amount),
      0
    ),
    withdrawalNet: paidWithdrawals.reduce(
      (sum, withdrawal) => sum + numeric(withdrawal.net_amount),
      0
    ),
    lateDeliveryPercent: orders.length ? (lateDeliveries / orders.length) * 100 : 0,
    deliveryP50Minutes: percentile(deliveryMinutes, 0.5),
    deliveryP95Minutes: percentile(deliveryMinutes, 0.95),
  };
}
