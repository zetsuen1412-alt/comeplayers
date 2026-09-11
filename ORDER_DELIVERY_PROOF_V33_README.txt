COMEPLAYERS ORDER DELIVERY PROOF V33
====================================

Purpose
-------
Seller order completion now requires BOTH:
1. At least one screenshot proof
2. At least one video proof

There is NO attachment-count limit. Sellers can add as many screenshots and videos as needed.

Implemented behavior
--------------------
- Multiple screenshot selection/upload.
- Multiple video selection/upload.
- No maximum number of files.
- Mandatory screenshot + video validation in both UI and server API.
- Deliver Product button remains locked until the minimum proof requirement is met.
- Proof files upload directly from the browser to Cloudflare R2 using signed PUT URLs, so large videos do not pass through the Vercel request body.
- Screenshot formats: JPG, PNG, WEBP, GIF (max 25 MB per file).
- Video formats: MP4, WEBM, MOV, MKV (max 2 GB per file).
- Draft proof can be removed before delivery.
- Previously submitted proof cannot be removed from the order UI, preserving delivery evidence.
- Buyer can view submitted screenshots and play submitted videos in Delivery Details.
- Delivery proof metadata is encrypted together with the existing delivery message/credentials.
- Existing old encrypted deliveries remain backward compatible.
- No Supabase schema change or SQL migration is required.

Requirements
------------
The existing Cloudflare R2 environment variables used by ComePlayers must remain configured:
- R2_ACCOUNT_ID or R2_ENDPOINT
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME

The R2 bucket must allow browser CORS PUT requests from https://www.comeplayers.com (the existing chat attachment presigned-upload setup normally already requires this).

Install
-------
Extract this ZIP into:
C:\Comeplayers-new

Choose Replace All when Windows asks.

Before deploy:
cd C:\Comeplayers-new\website
npm run typecheck
npm run build

Then deploy:
npx vercel@latest --prod --force

Validation performed when this package was created
---------------------------------------------------
- TypeScript: npm run typecheck = PASS
- ESLint for all modified/new source files = PASS (0 errors, 0 warnings)
- Full next build could not be executed in the packaging sandbox because Next.js attempted to download the Linux SWC binary from npm, while outbound package downloads are disabled in that sandbox. Run npm run build locally before production deployment.
