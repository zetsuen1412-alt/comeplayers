# ComePlayers Security Boundary V6

V6 secures buyer/seller order reads, wallet/top-up access, PayPal records, and digital delivery credentials.

## What changes

- Buyer and seller order lists now load through authenticated server APIs.
- Payment pages load orders through server APIs and manual payment selection is server-side.
- Wallet top-up rows are read and created through authenticated server APIs.
- Core financial tables receive strict owner/admin RLS.
- Digital delivery messages and credentials are encrypted with AES-256-GCM.
- Encrypted delivery access is recorded in an audit table.
- Legacy `/[id]` product route redirects to `/product/[id]` instead of creating a dummy order.

## 1. Backup

```powershell
git add .
git commit -m "backup before Security Boundary V6"
```

## 2. Extract patch

Extract `comeplayers_security_boundary_v6_patch.zip` into the project root and choose **Replace All**.

## 3. Generate the encryption key

Run once in the project terminal:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output into `.env.local`:

```env
DELIVERY_ENCRYPTION_KEY=PASTE_THE_GENERATED_VALUE
```

Add the exact same value to Vercel Environment Variables for Preview and Production.

**Important:** Keep a secure backup of this key. Changing or losing it makes previously encrypted delivery data unreadable.

## 4. Run the SQL migration

Open:

```text
scripts/comeplayers_security_boundary_v6.sql
```

Copy the entire file to Supabase SQL Editor and click **Run**.

Expected result:

```text
comeplayers_security_boundary_v6_ready
```

## 5. Migrate legacy plaintext delivery rows

First preview:

```powershell
npm run migrate:delivery-vault -- --dry-run
```

Then migrate:

```powershell
npm run migrate:delivery-vault
```

The script writes encrypted data first, then clears the old plaintext columns.

## 6. Validate

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## 7. Test flow

1. Buyer opens `/my-orders`.
2. Seller opens `/seller/orders`.
3. Buyer opens payment page and selects PayPal, wallet, QRIS, or bank.
4. Seller delivers a test account/key from `/orders/[id]`.
5. Confirm that `orders.delivery_credentials` remains `NULL`.
6. Confirm that `order_delivery_vaults` contains ciphertext.
7. Buyer opens the order and can reveal the delivery.
8. Confirm that `order_delivery_access_logs` receives a `reveal` event.
9. Buyer confirms receipt and escrow releases normally.

## Rollback note

Do not delete `order_delivery_vaults` after sellers have delivered encrypted data. Code rollback is possible, but encrypted data must be preserved until it is deliberately decrypted or migrated.
