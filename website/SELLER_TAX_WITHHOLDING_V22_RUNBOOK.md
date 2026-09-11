# ComePlayers V22 Seller Tax & Withdrawal Runbook

## Daily controls

1. Open `/admin/operations` and confirm the fixed 5% seller-tax gate passes.
2. Confirm at least one non-expired active withdrawal rule exists for every live payout combination.
3. Open `/admin/compliance` and review seller sales tax, withdrawal tax, marketplace fee, and gross-volume totals separately.
4. Review failed reconciliation findings for seller settlement or withdrawal arithmetic.
5. Review recently paid withdrawals and confirm their rule snapshots match the payout account country, method, and currency.

## Sale settlement formula

For every V22 order:

```text
buyer total = seller gross + buyer payment fee
seller sales tax = seller gross × 5%
marketplace fee = seller gross × MARKETPLACE_FEE_RATE
seller wallet credit = seller gross - seller sales tax - marketplace fee
```

Discounts reduce seller gross before both the marketplace fee and seller sales tax are calculated.

Never calculate the seller payout from `order.total_amount`, because that value may include a buyer payment fee.

## Withdrawal formula

```text
withdrawal tax = min(gross amount, gross amount × rule rate + fixed withholding)
net payout = gross amount - withdrawal tax - provider fee
```

The selected rule must exactly match:

```text
payout account country + payout method + payout currency
```

## Incorrect seller settlement

1. Pause escrow auto-release if multiple orders may be affected.
2. Use financial reconciliation to identify the affected order IDs.
3. Do not edit completed wallet transactions in place.
4. Record a compensating wallet transaction with an admin audit trail.
5. Correct the code/configuration, test in staging, then resume release.
6. Keep historical order and tax snapshots unchanged.

## Incorrect withdrawal tax rule

1. Do not rewrite already-created withdrawal snapshots.
2. Set the incorrect rule to inactive or give it an effective `valid_to`.
3. Create a new reviewed effective-dated rule.
4. For pending withdrawals, cancel/reject and return the full gross reservation, then ask the seller to create a new request.
5. For paid withdrawals, handle correction through an auditable accounting adjustment.

## Missing rule

A missing exact rule intentionally blocks the withdrawal. Confirm:

- seller payout country is correct;
- payout method matches the database value;
- payout currency is correct;
- rule status is `active`;
- `valid_from <= now()`;
- `valid_to` is null or in the future.

Do not add a zero-rate production rule merely to bypass the blocker unless that zero rate has been reviewed and documented.

## Rejected or failed payout

The full gross withdrawal reservation must return to the seller wallet. No withdrawal-tax ledger entry should be recognized unless the payout reaches `paid`.

Check:

- wallet refund transaction exists exactly once;
- withdrawal status is terminal;
- wallet balance arithmetic reconciles;
- no `withdrawal_tax` ledger row is marked withheld for an unpaid request.

## Historical orders

Paid pre-V22 orders do not receive the 5% seller sales tax retroactively. Their original invoice and buyer-tax treatment remain part of the audit trail. New/unpaid orders use V22.

## Emergency response

Use the V20 checkout kill switch when a settlement defect can affect new purchases. Disable or pause payout processing separately when the defect is limited to withdrawals. Preserve all snapshots, logs, reconciliation evidence, and admin audit records.
