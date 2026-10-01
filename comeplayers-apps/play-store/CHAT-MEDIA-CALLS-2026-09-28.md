# Chat, media, and calls — 28 September 2026

## Published

- Website: production deployment `dpl_12dN6d12XC24XP4GeFk5c7We6cp2` on `www.comeplayers.com` and `comeplayers.com`. Vercel Functions run in `sin1` (Singapore), colocated with the Supabase project's `ap-southeast-1` region. The production `/api/health/ready` check returned HTTP 200, `database: ready`, and `X-Vercel-Id: sin1::sin1`.
- Android: EAS Update `01a0e80d-e8c7-70fc-9aab-53e28a6aebec`, group `2ad4071c-c231-4dab-a6a3-b2452b7775ac`, published to the `production` channel for Android runtime `0.16.0`. No percentage rollout flag was used. The existing Google Play internal-test AAB is version `0.16.0` (versionCode 24); this change is an OTA update, not a new Play binary.
- Database: migration `20260928121649_secure_media_8mb` applied to the production Supabase project; encrypted private-message blobs are limited to 8 MiB.

## User-visible changes

- Fewer full chat reloads: new messages appear optimistically, Realtime invalidations are coalesced, and initial room reads avoid duplicate loads. Community unread counts use count queries instead of downloading thousands of messages.
- Images appear inline and video can be played inside conversations. Larger community/group attachments use direct signed R2 upload, avoiding a server relay. Private encrypted attachments remain limited to 8 MiB.
- Account-based private voice calls use LiveKit. Call reconnection and ended-call cleanup were improved. The voice transport is protected by LiveKit but must not be described as end-to-end encrypted.

## Verification and limits

- Website `npm run check` passed, including 734 tests; `npm run build` passed. Mobile TypeScript, 52 relevant tests, and Android Expo export passed.
- Preview deployment `dpl_8r2FWV2w5gfEveThQthdhZJhGVDa` and production deployment both reported function region `sin1`; preview `/api/health/live` and production `/api/health/ready` returned HTTP 200.
- Android OTA manifest was retrieved for package runtime `0.16.0`, channel `production`, and matched the update ID above. To apply it, open the Play internal-test version online, wait for **Pembaruan siap**, tap **Terapkan**, then reopen the app.
- A real two-account call and image/video transfer on two physical networks have not yet been verified in this release. Incoming Android calls are handled while the app is open; native incoming-call notification while closed is not included.
