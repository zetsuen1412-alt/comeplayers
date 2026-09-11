# ComePlayers V23 Change Manifest

## Milestone

V23 — Immutable Finance Governance, Seller Tax Statements, FX Snapshots, and Provider Payout Execution

## Database and accounting

- Versioned marketplace-fee history
- Versioned seller sales-tax history
- Dual-approved rate-change requests
- Immutable order pricing snapshots
- Verified seller tax residency records with encrypted identifiers
- FX rates and per-withdrawal FX snapshots
- Monthly accounting periods
- Seller tax statements and statement lines
- PayPal payout execution-attempt evidence
- V23 order completion, withdrawal quote, withdrawal processing, rate approval, statement generation, and accounting-close functions

## Application surfaces

- `/seller/tax-profile`
- `/seller/tax-statements`
- `/seller/payouts` server-authoritative FX/withholding quote
- `/admin/compliance` rate governance, FX, residency, and accounting close
- `/admin/withdrawals` PayPal payout submission and synchronization
- `/admin/operations` V23 readiness checks
- seller/admin invoice settlement view with immutable marketplace-fee and seller-tax rates

## Transaction behavior

- New orders snapshot the effective marketplace fee and seller sales-tax rate at creation.
- Existing snapshots are never recalculated after a later rate change.
- Active rate changes require two distinct approving admins, excluding the requester.
- Withdrawal requests snapshot source amount/currency, payout amount/currency, FX rate, withholding rule, and seller net amount.
- Provider payout fees are recorded separately as platform expense.
- Paid withdrawals create withholding-ledger evidence; failed or rejected withdrawals restore the full source wallet amount.

## Validation completed in workspace

- Full TypeScript: passing
- V23 targeted TypeScript: 30 files passing
- TypeScript/TSX changed-file ESLint: 0 errors, 0 warnings
- Automated unit tests: 54 passing
- E2E TypeScript: passing
- Migration SQL: 90 statements parsed successfully
- Verification SQL: 10 statements parsed successfully
- Production dependency audit: 0 critical, 0 high, 2 moderate, 0 low

The full Next.js production build was intentionally not repeated after a prior parallel build worker exhausted and reset the temporary workspace. A production-equivalent deployment build remains mandatory.
