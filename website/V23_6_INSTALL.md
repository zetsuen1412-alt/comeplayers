# ComePlayers V23.6 Install

Purpose: updates the legacy `wallet_transactions_type_check` constraint so
wallet payment, seller payout, refund, and withdrawal transaction types used by
V2 through V23 are accepted consistently.

Run after V23.5:

```sql
\i scripts/comeplayers_wallet_transaction_types_v23_6.sql
```

Expected final status:

```text
comeplayers_wallet_transaction_types_v23_6_ready
```
