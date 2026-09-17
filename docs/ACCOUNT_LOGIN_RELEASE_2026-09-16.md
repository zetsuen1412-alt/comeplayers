# ComePlayers account messaging — release evidence
## Product model
The owner explicitly approved ordinary Google/email login and server-readable messages, replacing passkey-only E2EE. The app discloses that messages are not end-to-end encrypted.

## Verified implementation
- Main implementation: 37db9e6672ca5cdf328c36190b9f11bbcb7679fc.
- Call-history integration / SQL fixture correction: 7cf7b5138b68d08d58aa12e7372a2d0db7f9a217.
- GitHub run 35098944467: web/mobile typechecks, web build, both PostgreSQL fixtures and 113 tests passed.
- Browser/preflight run 35098944537: 7 browser tests and 15 preflight tests passed. The separate eas-read-access job remains blocked by missing GitHub Actions EXPO_TOKEN. Expo's existing browser session successfully built Android 19.
- Browser tests cover retained recovery primitives, not proof of a real signed-in account chat on two devices.
- Local Windows tsx could not start (uv_os_get_passwd); CI ran those tests successfully.

## Website
Account messaging promoted at deployment dpl_EJobd3kaxqEWed3wgNsiPBrmTtkD, source 7cf7b51. Nine unauthenticated public checks passed at 2026-09-16T13:52:03.799Z: live/ready, Messages/security pages, protected chat routes rejecting anonymous requests, original Android app link signer.
The Android 19 download pointer is staged separately and requires the subsequent normal website deployment.

## Android 19
- Build: 09b3612f-d7c8-4eb4-92c8-690876b70ebb.
- Source: 7cf7b5138b68d08d58aa12e7372a2d0db7f9a217.
- Expo project: a663aa70-99b7-4c8f-93ea-5f8637baa2df (unchanged).
- Package com.comeplayers.app, version 0.13.0, versionCode 19.
- Size 138750410 bytes.
- SHA-256 b9f1a31f63a51d0d95512c5668fd7a2492a9c85dd94ff5af30208b3fa066fb9d.
- Full apksigner verification passed, v2, one signer.
- Original certificate SHA-256 0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2.
- Bundle contains the account-storage disclosure and omits Protect your Messages, Protect with account passkey, and 64-character recovery key.
- R2 upload and full byte-hash verification succeeded at 2026-09-16T13:54:17Z via deployment dpl_6WvAEXWiUJ9vbWaqq8WbDmxASC27.
- Physical update installation and real cross-device/media behavior remain unverified. Install over the existing app without uninstalling or clearing data.

## Database
- Preparation migration 20260915134209 was not repeated.
- Additive account_messaging_mode applied as 20260916134702. The CLI originally generated 20260916123452; the repository filename was aligned to the actual applied version, without reapplying it.
- Mode account activated 2026-09-16T13:48:44.208688Z after confirming zero encrypted identities/events.
- Counts retained: 67 Auth accounts, 67 profiles, 13 rooms, 42 messages. Zero secure identities/events.
- No reset or deletion in this release. Historical reset remains generation 1, rollout_verified false.
- Security advisor categories/counts unchanged: 65 informational deny-by-default RLS tables; existing function/search-path/extension/password-protection warnings remain outside this change. No new grant or public function was introduced.
