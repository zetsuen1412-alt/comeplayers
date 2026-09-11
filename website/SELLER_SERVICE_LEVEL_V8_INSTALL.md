# ComePlayers V8 — Seller Service Levels & Delivery SLA

V8 adds public seller availability, delivery promises, order deadlines, late-order tracking, and performance levels.

## 1. Backup

```powershell
git add .
git commit -m "backup before seller service levels v8"
```

## 2. Copy the patch

Extract the patch into the project root and choose **Replace All** while preserving folders.

## 3. Run the migration

Open:

```text
scripts/comeplayers_seller_service_levels_v8.sql
```

Copy the entire SQL file into Supabase SQL Editor and click **Run**.

Expected final result:

```text
comeplayers_seller_service_levels_v8_ready
```

## 4. Validate locally

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## 5. Configure seller service settings

Open:

```text
/seller/service-level
```

Choose:

- Public presence: Online, Away, or Offline
- Default delivery SLA: 15 minutes through 24 hours

A seller can also set a product-specific ETA when creating or editing a listing. The product ETA overrides the seller default for newly paid orders.

## 6. Test the complete SLA flow

1. Set seller presence to **Online**.
2. Set the seller default SLA to **30 minutes**.
3. Create or edit a product and choose a product delivery ETA.
4. Complete a Sandbox payment.
5. Open `/seller/orders` and confirm the countdown appears.
6. Open `/orders/<order-id>` as seller and buyer.
7. Deliver before the deadline and confirm the order shows **Delivered On Time**.
8. For a late test, temporarily set `delivery_due_at` in Supabase to a past timestamp, then run the cron endpoint or wait for its schedule.
9. Confirm late indicators appear and the buyer payment remains in escrow.

## 7. Cron behavior

The patch adds:

```text
/api/cron/mark-late-orders
```

It is protected by `CRON_SECRET`, marks overdue paid orders as late, and creates buyer/seller notifications. The included `vercel.json` schedules it daily to remain conservative. Increase the cadence in your hosting configuration when your deployment plan supports it.

The UI calculates overdue status from `delivery_due_at` immediately, even before the cron writes the persisted late status.

## 8. Verify database results

Run:

```text
SELLER_SERVICE_LEVEL_V8_VERIFY.sql
```

## Important behavior

- The SLA is snapshotted when an order becomes paid.
- Changing the seller default later does not alter existing paid-order deadlines.
- The product-specific ETA takes priority over the seller default.
- Seller service levels are calculated from actual completed deliveries.
- Seller presence automatically appears offline after five minutes without a heartbeat.
