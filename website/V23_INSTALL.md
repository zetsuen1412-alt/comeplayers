# ComePlayers V23 Installation

V23 adds immutable per-order marketplace-fee and seller-tax snapshots, versioned rate histories with two-person approval, seller tax residency, monthly tax statements, accounting close, FX snapshots, and PayPal provider payout execution.

## Prerequisites

1. Apply and verify every migration through V22.
2. Back up the production database.
3. Confirm no migration is currently running.
4. Keep PayPal in Sandbox until payout execution has passed staging evidence.

## Database

Run the complete file in Supabase SQL Editor:

```text
scripts/comeplayers_finance_governance_v23.sql
```

The final row must be:

```text
comeplayers_finance_governance_v23_ready
```

Then run:

```text
FINANCE_GOVERNANCE_V23_VERIFY.sql
```

All `to_regclass` and `to_regprocedure` values must be non-null. `unpaid_orders_without_v23_snapshot` should be zero unless a deliberately invalid unpaid order was skipped with a migration notice.

## Environment

```env
TAX_RESIDENCY_ENCRYPTION_KEY=<dedicated-long-random-secret>
PAYPAL_PAYOUT_TIMEOUT_MS=12000
```

Continue to configure the existing PayPal server credentials. V23 treats `MARKETPLACE_FEE_RATE` as a legacy fallback only; active V23 marketplace fees are stored in `public.marketplace_fee_settings`.

## First production configuration

1. Open `/admin/compliance`.
2. Review the migrated active marketplace fee and seller sales-tax rate.
3. Submit any rate change as a proposal. The requester cannot approve it, and two different admins are required.
4. Add current FX rates for every wallet-currency → payout-currency pair.
5. Ask sellers to submit `/seller/tax-profile`, then verify evidence in admin compliance.
6. Open an accounting month and generate seller statements.
7. Test PayPal provider payout in Sandbox using a verified seller residency and PayPal payout account.

## Safe rollout

- Existing paid orders keep their historical settlement values.
- Existing unpaid orders receive a V23 snapshot during migration when their data is valid.
- New orders snapshot both rates at order creation.
- Later rate changes affect only orders created after the new effective time.
- Withdrawal tax and FX are snapshotted when the withdrawal request is created.
- Provider fees discovered after PayPal submission are recorded as platform expense and do not silently reduce the seller amount already quoted.
