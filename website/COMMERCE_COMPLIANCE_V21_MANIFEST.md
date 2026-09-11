# ComePlayers V21 Manifest

## Customer surfaces

- `/account/billing` — billing and tax profile
- `/account/privacy` — JSON export, deletion request, and cancellation
- `/orders/[id]/invoice` — access-controlled printable invoice

## Seller enforcement

- Real-time policy screening for create/update listing APIs
- Bulk CSV policy validation and review queue integration
- Policy state returned in seller catalog data
- Stale pending reviews superseded after compliant edits
- Follower/wishlist notifications restricted to publishable listings

## Admin and operations

- `/admin/compliance` — tax rules, policy queue, privacy requests, settlement reports, risk feedback, and commerce metrics
- `/admin/operations` — V21 readiness blockers
- Failed privacy deletion retry with audit trail
- Daily `/api/cron/commerce-compliance` job

## Data and services

- Tax rules, order tax snapshots, and invoices
- User billing profiles
- Product policy rules, review queue, and seller strikes
- Privacy requests/events and profile anonymization state
- Provider settlement reports/lines
- Risk feedback events
- Daily commerce metrics

## Security and correctness controls

- Paid orders cannot be tax-recalculated
- Invoice API excludes internal buyer/seller snapshots
- Deletion claims are atomic against cancellation races
- Auth soft-delete must succeed before completion
- Payout destinations and chat PII are scrubbed
- Provider evidence is deduplicated per capture
- Empty settlement evidence cannot pass readiness
