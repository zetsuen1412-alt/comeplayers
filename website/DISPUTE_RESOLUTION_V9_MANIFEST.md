# ComePlayers V9 Patch Manifest

## New files

- `scripts/comeplayers_dispute_resolution_v9.sql`
- `lib/disputeServer.ts`
- `app/api/disputes/route.ts`
- `app/api/disputes/[id]/route.ts`
- `app/api/disputes/[id]/messages/route.ts`
- `app/api/disputes/[id]/evidence/route.ts`
- `app/api/disputes/[id]/evidence/[evidenceId]/route.ts`
- `app/resolution-center/page.tsx`
- `app/resolution-center/[id]/page.tsx`
- `DISPUTE_RESOLUTION_V9_INSTALL.md`
- `DISPUTE_RESOLUTION_V9_VERIFY.sql`
- `DISPUTE_RESOLUTION_V9_MANIFEST.md`

## Updated files

- `app/api/admin/disputes/route.ts`
- `app/api/orders/[id]/route.ts`
- `app/admin/disputes/page.tsx`
- `app/orders/[id]/page.tsx`
- `app/components/MainHeader.tsx`

## Functional scope

- Buyer/seller dispute creation
- Automatic escrow pause
- Case conversation thread
- Internal admin notes
- Private evidence storage
- Short-lived evidence access links
- Case activity timeline
- Participant notifications
- Admin investigation, refund, seller release, and close actions
- Resolution Center navigation and order integration
