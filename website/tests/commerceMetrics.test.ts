import assert from "node:assert/strict";
import test from "node:test";
import { calculateCommerceMetrics } from "@/lib/commerceMetrics";

test("commerce metrics separate seller sales tax and withdrawal tax", () => {
  const metrics = calculateCommerceMetrics(
    [
      {
        status: "completed",
        payment_status: "paid",
        total_amount: 105,
        seller_gross_amount: 100,
        seller_sales_tax_amount: 5,
        marketplace_fee_amount: 5,
        paid_at: "2026-01-01T00:00:00.000Z",
        delivered_at: "2026-01-01T01:00:00.000Z",
        delivery_due_at: "2026-01-01T02:00:00.000Z",
      },
      { status: "pending_payment", payment_status: "unpaid", total_amount: 50 },
    ],
    [
      {
        status: "paid",
        amount: 80,
        tax_amount: 2,
        net_amount: 78,
      },
    ]
  );
  assert.equal(metrics.createdOrders, 2);
  assert.equal(metrics.paidOrders, 1);
  assert.equal(metrics.completedOrders, 1);
  assert.equal(metrics.checkoutToPaidPercent, 50);
  assert.equal(metrics.grossVolume, 105);
  assert.equal(metrics.sellerGrossVolume, 100);
  assert.equal(metrics.sellerSalesTaxWithheld, 5);
  assert.equal(metrics.withdrawalTaxWithheld, 2);
  assert.equal(metrics.taxCollected, 7);
  assert.equal(metrics.deliveryP95Minutes, 60);
});
