# ComePlayers V22 Manifest — Seller-Borne Tax & Withdrawal Withholding

## Buyer checkout

- Buyer sales tax disabled for new orders.
- Buyer total excludes seller sales tax.
- Buyer payment fee remains separate and never enters seller proceeds.
- New/unpaid orders receive a V22 seller-tax snapshot and updated invoice.

## Seller order settlement

- Fixed global seller sales tax: 5% of seller gross proceeds.
- Marketplace fee calculated separately from the same seller gross base.
- Seller wallet credit excludes both deductions.
- Manual completion, auto-completion, and admin completion use the same V22 release function.
- Seller order pages and seller-only invoice statements show gross, marketplace fee, 5% tax, and net credit.
- Tax ledger records recognized seller tax when escrow is released.

## Withdrawal withholding

- Effective-dated rules by country, payout method, and currency.
- Percentage plus optional fixed withholding.
- Exact active rule required before a withdrawal can be created.
- Tax parameters are snapshotted on the withdrawal request.
- Provider fee remains separate.
- Tax ledger records withdrawal tax only after payout is marked paid.
- Rejected or failed payouts refund the full reserved gross amount.

## Seller payout accounts

- Country and currency are required for new or updated accounts.
- Bank, PayPal, and Wise methods supported by the existing payout center.
- Existing security cooldown and encrypted payout destination storage remain active.

## Admin and operations

- `/admin/compliance` manages withdrawal-tax rules and displays separated tax metrics.
- `/admin/operations` verifies the fixed 5% setting and current active withdrawal rules.
- Admin withdrawal processing shows gross, tax, provider fee, and net payout.
- Reconciliation validates seller settlement and withdrawal formulas.
- Privacy export includes seller tax ledger history.

## Database objects

- `seller_tax_settings`
- `seller_sales_tax_snapshots`
- `withdrawal_tax_rates`
- `seller_tax_ledger`
- seller settlement columns on `orders` and `order_invoices`
- withdrawal tax snapshot columns on `withdrawal_requests`
- `cp_apply_seller_tax_v22`
- `complete_order_and_release_escrow_v22`
- `cp_quote_withdrawal_tax_v22`
- `cp_create_withdrawal_request_v22`
- `cp_admin_process_withdrawal_v22`

## Compatibility controls

- Active V21 buyer-tax rates are deactivated, not deleted.
- Paid pre-V22 orders are not retroactively taxed.
- Additive column defaults are normalized so legacy orders do not appear to have paid V22 seller tax.
- Unpaid orders are recalculated during migration.
- Historical invoices remain auditable.
