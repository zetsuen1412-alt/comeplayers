# ComePlayers V9 — Dispute Evidence & Resolution Center

## Prerequisites

Install and test these stages first:

1. Transaction Core V2.1
2. Foundation V3
3. Security Boundary V4
4. Security Boundary V5
5. Security Boundary V6
6. Stock Reservation V7
7. Seller Service Levels V8

## Installation

### 1. Back up the project

```powershell
git add .
git commit -m "backup before dispute resolution v9"
```

### 2. Extract the patch

Extract the V9 ZIP into the project root and choose **Replace All** while preserving folders.

### 3. Run the migration

Open this file in VS Code:

```text
scripts/comeplayers_dispute_resolution_v9.sql
```

Copy the SQL contents—not the file path—into Supabase SQL Editor and click **Run**.

Expected result:

```text
comeplayers_dispute_resolution_v9_ready
```

### 4. Validate locally

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

No new environment variable is required for V9. The patch uses the existing:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 5. Verify the database

Run:

```text
DISPUTE_RESOLUTION_V9_VERIFY.sql
```

in Supabase SQL Editor.

## Test flow

1. Create and pay a Sandbox order.
2. Log in as buyer or seller and open `/orders/<order-id>`.
3. Click **Open a Dispute**.
4. Enter category, requested resolution, reason, and description.
5. Open the created case in `/resolution-center/<dispute-id>`.
6. Post messages as both buyer and seller.
7. Upload a JPG, PNG, WEBP, PDF, or TXT file under 10 MB.
8. Confirm the evidence opens through a temporary signed URL.
9. Log in as admin and resolve from the full case file or `/admin/disputes`.
10. Confirm the case timeline, notifications, refund/release result, and read-only final state.

## Security behavior

- Browser clients cannot directly insert/update/delete dispute records.
- All case writes pass through authenticated server routes.
- Evidence is stored in a private Supabase Storage bucket.
- Evidence downloads use two-minute signed URLs.
- Only buyer, seller, and admin can read the case.
- Internal admin notes are hidden from buyer and seller.
- Resolved cases are read-only.
- Admin financial decisions continue to use the protected V5 refund and escrow functions.
