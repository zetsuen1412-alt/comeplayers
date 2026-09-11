# ComePlayers V22 Installation — Seller Tax & Withdrawal Withholding

V22 changes the marketplace tax model requested by the owner:

- buyers are no longer charged sales tax at checkout;
- every new seller sale is subject to a fixed **5% seller sales tax**;
- marketplace fees remain separate from the 5% seller sales tax;
- withdrawal tax is calculated only when the seller requests a payout;
- withdrawal tax is selected by the payout account's **country + payout method + currency**.

## 1. Apply the database migration

Run this file in Supabase SQL Editor after every migration through V21:

```text
scripts/comeplayers_seller_tax_withholding_v22.sql
```

A successful run ends with:

```text
comeplayers_seller_tax_withholding_v22_ready
```

Then run:

```text
SELLER_TAX_WITHHOLDING_V22_VERIFY.sql
```

The migration is additive and idempotent. It disables active V21 buyer-tax rules for new checkout calculations, but retains historical tax and invoice rows for audit.

## 2. Understand the settlement formula

For a sale with no discount:

```text
Product price                         Rp100,000
Buyer checkout tax                            0
Buyer payment fee (example: wallet)           0
Buyer pays                            Rp100,000

Seller gross proceeds                 Rp100,000
Marketplace fee 5%                    -Rp5,000
Seller sales tax 5%                   -Rp5,000
Seller wallet credit                   Rp90,000
```

`MARKETPLACE_FEE_RATE` remains independently configurable. Changing it does not change the fixed seller sales tax rate.

For PayPal checkout, the buyer-facing PayPal payment fee may still be added according to `PAYPAL_CHECKOUT_FEE_RATE`. That payment fee is not part of seller gross proceeds and is never credited to the seller wallet.

## 3. Configure withdrawal tax rules

No country withdrawal-tax rates are seeded automatically. This is intentional: rates must be reviewed before activation.

Open:

```text
/admin/compliance
```

Create one rule for every supported combination:

```text
country_code + payout_method + currency
```

Examples:

```text
ID + bank_transfer + IDR
ID + paypal + USD
US + paypal + USD
```

A rule supports:

- percentage withholding;
- fixed withholding amount;
- effective start and end dates;
- draft, active, or inactive status;
- source/legal reference.

Seller withdrawals remain blocked when no exact active rule exists for the selected payout account.

Example withdrawal:

```text
Gross withdrawal                     Rp1,000,000
Withdrawal tax 2%                     -Rp20,000
Fixed withholding                      -Rp5,000
Provider fee                                  0
Net payout                            Rp975,000
```

Provider payout fees remain separate and are recorded by the admin payout workflow.

## 4. Review existing payout accounts

Existing payout accounts may contain the old default country/currency (`ID` / `IDR`). Ask sellers to review and update each payout account before requesting a withdrawal.

The seller payout form now requires:

- two-letter country code;
- three-letter currency code;
- payout method (`bank_transfer`, `paypal`, or `wise`).

Any payout-account change triggers the existing security cooldown.

## 5. Historical order behavior

V22 is not retroactive for paid orders:

- paid orders without a V22 seller-tax snapshot keep their historical tax treatment;
- they are not charged the new 5% seller tax retroactively;
- unpaid orders are recalculated into the V22 model during migration;
- new orders receive a V22 seller-tax snapshot before payment;
- historical invoice records remain available and are clearly identified as legacy.

## 6. Operational verification

After deploying V22:

1. Create an unpaid wallet order and confirm buyer tax is `0`.
2. Confirm seller gross equals subtotal minus discount.
3. Complete the order and confirm seller wallet credit equals:

   ```text
   seller gross - marketplace fee - 5% seller sales tax
   ```

4. Confirm a `sales_tax` row exists in `seller_tax_ledger`.
5. Create or update a payout account with the correct country and currency.
6. Confirm withdrawal is rejected when no exact active rule exists.
7. Activate a reviewed rule and create a withdrawal.
8. Confirm the request snapshots country, method, currency, rate, fixed amount, and tax amount.
9. Mark the payout paid and confirm a `withdrawal_tax` ledger row is created.
10. Confirm rejected/failed withdrawals return the full reserved gross amount to the seller wallet.
11. Confirm `/admin/operations` keeps the withdrawal-tax launch gate blocked until at least one current active rule exists.

## 7. Quality commands

```bash
npm ci
npm run typecheck:v22
npm run typecheck:e2e
npm run lint
npm run test
npm run build
```

Run the full build in the deployment environment with production-equivalent environment variables.

## Legal and accounting notice

The fixed 5% seller sales tax is an owner-defined marketplace accounting rule. Country-specific withdrawal taxes are configuration data, not legal advice. Have a qualified tax/accounting professional review the legal basis, tax naming, invoice wording, withholding evidence, reporting, and remittance obligations for every supported country before production use.
