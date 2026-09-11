# ComePlayers V23.4 Install

Purpose: fixes checkout order creation when no coupon is supplied by preventing
`create_marketplace_order_v13` from reading an unassigned `v_coupon` record.

Run after V23.3:

```sql
\i scripts/comeplayers_checkout_coupon_record_fix_v23_4.sql
```

Expected final status:

```text
comeplayers_checkout_coupon_record_fix_v23_4_ready
```
