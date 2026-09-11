# ComePlayers V16 — Seller Storefront Installation

## Requirements

Install after V15 Verified Reviews. Your project must already contain the V13 catalog fields and V8 seller service-level fields.

## 1. Backup

```powershell
git add .
git commit -m "backup before seller storefront v16"
```

## 2. Extract

Extract the V16 ZIP into the project root, for example:

```text
C:\Project\evo-gaming
```

Choose **Replace All** so the `app` and `scripts` folders merge with the existing project.

## 3. Run SQL

Open this file in VS Code:

```text
scripts/comeplayers_seller_storefront_v16.sql
```

Copy its complete contents into a new Supabase SQL Editor query and select **Run**.

Expected final status:

```text
comeplayers_seller_storefront_v16_ready
```

Do not paste the filename itself into SQL Editor.

## 4. Validate

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

No new environment variables are required.

## 5. Configure a storefront

Login as an approved seller and open:

```text
http://localhost:3000/seller/storefront
```

Configure:

- public store slug
- store name, tagline, and description
- banner and logo URLs
- accent color
- announcement
- up to eight featured products
- delivery, refund, and support policies
- vacation mode
- public/private publication status

Save, then open:

```text
http://localhost:3000/store/YOUR-STORE-SLUG
```

## 6. Verification

Run the read-only queries in:

```text
SELLER_STOREFRONT_V16_VERIFY.sql
```

## Notes

- Banner and logo fields accept only valid `http` or `https` URLs.
- Store slugs are unique, lowercase, and limited to 3–40 characters.
- Storefront updates and featured-product changes are committed atomically by a server-only database function.
- Vacation mode warns buyers; it does not automatically deactivate products or cancel existing orders.
