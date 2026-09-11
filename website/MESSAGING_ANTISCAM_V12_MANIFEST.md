# ComePlayers V12 Patch Manifest

## Database

- `scripts/comeplayers_messaging_antiscam_v12.sql`
  - kompatibilitas tabel chat lama;
  - metadata moderation dan risk flags;
  - private attachment metadata;
  - user reports dan moderation events;
  - chat suspension controls;
  - private Supabase Storage bucket;
  - participant-only RLS reads;
  - server-only writes;
  - atomic get-or-create room RPC.

## Server libraries

- `lib/chatSafety.ts`
  - contact/link/payment-bypass/credential detection;
  - risk scoring dan redaction.
- `lib/chatServer.ts`
  - participant/admin room authorization;
  - chat suspension enforcement;
  - notification helper dan error mapping.

## User APIs

- `app/api/messages/rooms/route.ts`
- `app/api/messages/rooms/[id]/route.ts`
- `app/api/messages/rooms/[id]/messages/route.ts`
- `app/api/messages/rooms/[id]/read/route.ts`
- `app/api/messages/attachments/route.ts`
- `app/api/messages/attachments/[id]/route.ts`
- `app/api/messages/reports/route.ts`
- `app/api/messages/unread/route.ts`

## Admin API and UI

- `app/api/admin/chat-moderation/route.ts`
- `app/admin/chat-moderation/page.tsx`
- `app/admin/page.tsx`

## User UI

- `app/messages/page.tsx`
- `app/orders/[id]/page.tsx`
- `app/components/MainHeader.tsx`

## Documentation

- `MESSAGING_ANTISCAM_V12_INSTALL.md`
- `MESSAGING_ANTISCAM_V12_MANIFEST.md`
- `MESSAGING_ANTISCAM_V12_VERIFY.sql`

## Validation performed

- `npm ci`: passed.
- `npm run typecheck`: passed with 0 errors.
- ESLint on V12 files: 0 errors; warnings only originate from the pre-existing MainHeader file.
- Full project ESLint: 0 errors, 119 warnings.
- `next build`: compilation passed; the environment timed out during Next.js' separate TypeScript stage. Standalone `tsc --noEmit` passed.
- Basic chat safety test cases: passed for normal text, phone/contact, external payment, credential, and ComePlayers internal link.
