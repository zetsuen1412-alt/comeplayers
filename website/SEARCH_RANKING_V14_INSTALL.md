# ComePlayers V14 — Search, Filters, Offer Ranking & Comparison

V14 upgrades the game-offer marketplace into a comparison-oriented buyer experience. It must be installed after V13 Catalog Variants.

## 1. Back up the project

```powershell
git add .
git commit -m "backup before search ranking v14"
```

## 2. Extract the patch

Extract `comeplayers_search_ranking_v14_patch.zip` into the project root and choose **Replace All**.

Expected project root example:

```text
C:\Project\evo-gaming
```

## 3. Run the database migration

Open this file in VS Code:

```text
scripts/comeplayers_search_ranking_v14.sql
```

Copy its entire SQL content into Supabase SQL Editor and run it. Do not paste the filename itself.

Expected final result:

```text
comeplayers_search_ranking_v14_ready
```

The migration adds:

- `products.offer_region`
- `products.offer_platform`
- `products.offer_server`
- `products.offer_tags`
- `products.search_document`
- Search/filter/ranking indexes

Existing listings are assigned `Global` and `Any` defaults so they remain visible.

## 4. Validate locally

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

No new environment variables are required.

## 5. Enrich seller listings

Open an existing product or create a new one. The product editor now includes:

- Region
- Platform
- Server / Realm
- Search Tags

Example:

```text
Region: Southeast Asia
Platform: PC
Server: SEA-1
Tags: instant, ranked, premium
```

## 6. Test marketplace filters

Open:

```text
http://localhost:3000/games/GAME-SLUG/offers
```

Test:

1. Product search
2. Category filter
3. Minimum and maximum price
4. Region and platform
5. Seller service level
6. Minimum rating
7. Maximum delivery time
8. Online sellers only
9. In-stock only
10. Sorting by recommended, price, delivery, rating, completed orders, newest, and stock

## 7. Test offer comparison

1. Select **Compare** on two to four offers.
2. Click **Compare Now**.
3. Verify the table compares price, seller, rating, completed orders, delivery time, on-time rate, service level, stock, region, and platform.
4. Open an offer from the comparison table.

## 8. Verify the database

Run:

```text
SEARCH_RANKING_V14_VERIFY.sql
```

This checks offer metadata, seller ranking inputs, and V14 indexes.

## Ranking notes

The recommended ranking is deterministic and uses public marketplace signals:

- Search relevance
- Effective SKU price compared with the game median
- Seller rating and review confidence
- Completed deliveries
- On-time delivery percentage
- Seller service level
- Seller presence
- Delivery ETA
- Available stock
- Seller approval status
- Listing recency

The ranking does not use payment data, private messages, or sensitive buyer information.
