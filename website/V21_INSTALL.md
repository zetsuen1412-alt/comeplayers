# ComePlayers V21 Installation

V21 adds tax and invoice snapshots, prohibited-product enforcement, privacy export/deletion operations, PayPal settlement reports, dispute-driven risk feedback, and post-launch commerce metrics.

## 1. Apply the database migration

Run the following file in Supabase SQL Editor after every migration through V20:

```text
scripts/comeplayers_commerce_compliance_v21.sql
```

Then run:

```text
COMMERCE_COMPLIANCE_V21_VERIFY.sql
```

The migration is additive and does not activate a tax rate automatically. Checkout keeps working with a zero-tax snapshot until an administrator creates and activates a reviewed rule.

## 2. Configure environment variables

```text
PRIVACY_DELETE_GRACE_DAYS=30
PRODUCT_POLICY_SCAN_LIMIT=250
SETTLEMENT_AUTO_REPORT=true
```

Keep all V1–V20 variables configured. `CRON_SECRET`, Supabase service-role access, PayPal credentials, encryption keys, and operational alert routing remain required.

## 3. Deploy the scheduled job

`vercel.json` adds:

```text
/api/cron/commerce-compliance — 04:30 UTC daily
```

The job processes due deletion requests, rescans recent listings, creates a daily provider settlement report, and persists daily commerce metrics.

## 4. Configure tax rules

Open `/admin/compliance`, add a reviewed tax rule, and activate it only after confirming the applicable jurisdiction, product classification, inclusive/exclusive treatment, effective dates, and source reference.

Tax rules are configuration data, not legal advice. Obtain qualified tax guidance for every launch region.

Buyers can maintain their billing and tax country at `/account/billing`. The active rule is snapshotted when an order is created and cannot be recalculated after payment.

## 5. Verify operational flows

- Create an allowed listing and confirm it can publish.
- Create a review-triggering listing and confirm it stays inactive.
- Create a prohibited listing and confirm it is rejected.
- Approve and reject policy reviews from `/admin/compliance`.
- Create an unpaid order and verify tax snapshot plus invoice records.
- Open `/orders/{id}/invoice` as buyer, seller, and admin; verify unauthorized access is denied.
- Download a privacy export from `/account/privacy`.
- Schedule and cancel deletion during the grace period.
- In staging, allow one deletion to execute and verify auth soft-delete and PII scrubbing.
- Generate a provider settlement report and verify duplicate capture evidence is not double-counted.
- Resolve a dispute and verify an idempotent risk-feedback event.
- Confirm `/admin/operations` blocks launch for missing tax configuration, high/critical policy reviews, failed/overdue privacy deletion, or unmatched settlement evidence.

## 6. Quality commands

```bash
npm ci
npm run typecheck:v21
npm run typecheck:e2e
npm run lint
npm run test
npm run build
```

Run the full build in the deployment environment with production-equivalent variables and external services.
