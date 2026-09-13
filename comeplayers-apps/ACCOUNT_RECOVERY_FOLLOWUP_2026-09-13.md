# Account recovery and single-device follow-up — 13 September 2026

## User request and security boundary

The user wants account-based recovery without copying a manual recovery key, restored encrypted history on a new device, and automatic logout of the previous device. Google/email login authenticates the account. A synced passkey with WebAuthn PRF and user verification unlocks E2EE keys locally; neither the login password nor a server token is used as an encryption key. Existing recovery keys remain valid. Do not copy or use the recovery key visible in the user's screenshot.

The user subsequently said “lanjut” twice. Automatic approval review explicitly rejected that as insufficiently specific for the broad production session migration. A new explicit approval question is pending. Do not retry that migration or bypass the rejection without a specific answer.

## Published login fix

- Vercel production deployment `dpl_4SnsuKLCx2XiPNFyr4t9o3X5As7E`, `https://evo-gaming-j17pwgfil-ilham-evogaming-s-projects.vercel.app`, confirmed READY with `www.comeplayers.com` alias.
- Public Auth relay reaches the configured Supabase Auth API. A password request with an empty body returned the expected Supabase validation error (400); no login or email was sent. Admin paths returned 404; anonymous secure-account requests returned 401; responses are not cached.
- Android login OTA group `a0a2824f-9e15-4431-b29b-3139881eb64f`, update `01a0989b-7870-7998-a337-304e63bf1d70`, runtime `0.12.0`, compatible with installed APK 0.12.1.
- Verified OTA bundle: 5,523,327 bytes, SHA256 `b6d786b817669dbbc0be34b05832b91b7c96df5ced68617cbbea85ee91ad4ecb`. Evidence: `C:\Comeplayers-new\tmp\expo-account-session-0.12.0-verification.json`.
- Network interruptions caused CLI errors; the actual deployment and Expo publication were checked separately. Do not submit duplicate releases merely because CLI polling fails.

## Single active session — prepared, NOT active

Migration: `C:\Comeplayers-new\website\supabase\migrations\20260912215632_account_single_device_sessions.sql`.

It adds a private active-session table, Auth-session creation-time comparison, MFA-before-takeover enforcement, global PostgREST request validation and restrictive RLS policies on public tables and Storage. Local PGlite testing passed owner isolation, newer-session takeover, stale-session rejection, MFA, revoked-session tombstones and anonymous catalog access. The browser guard also passed a synthetic replacement/logout test. Client checks are visible/foreground only, with network failures never treated as proof of revocation; local encrypted history is preserved.

Automatic approval review rejected application twice due to the broad production access impact. Production was checked and the table was absent. `SINGLE_DEVICE_SESSIONS_ENABLED` is absent in Vercel production; `/api/account/session` returns `{ "enabled": false }`. No session migration or global policy change was applied.

Evidence: `C:\Comeplayers-new\tmp\session-db-qa\result.json`, `C:\Comeplayers-new\tmp\account-session-ui-result.json`.

## Passkey implementation — published

- Vercel production deployment `dpl_E1tVvDpiaswFdmiqviY1MKkMmj75`, `https://evo-gaming-3io5dk6j4-ilham-evogaming-s-projects.vercel.app`, completed successfully and aliased to `https://www.comeplayers.com`.
- Final deployment build passed compilation, TypeScript and generation of 203 static pages. The single-device feature flag remains disabled.

- Website and Android enrollment offer a synced passkey as the primary option and retain a manual recovery-key alternative.
- Existing verified devices can enable recovery in Profile / Account Security without changing the account's root identity. New-device enrollment requires the existing passkey or recovery key; account login cannot invent a replacement encryption identity.
- The credential must provide a 32-byte PRF output, user presence/verification, the expected RP ID and backed-up credential flags. Unsupported providers fail closed and retain the manual recovery path.
- HKDF-SHA256 derives a recovery key bound to the RP, account, credential ID and random salt. Existing authenticated identity-backup encryption protects the root. The account root signs the passkey metadata and ciphertext. PRF outputs and private credentials never enter API payloads.
- The existing encrypted JSON backup gains an optional signed passkey envelope. This uses the existing account-backup storage and does not apply the blocked session migration. Account/device authorization is unchanged by enabling this recovery option. Legacy clients still use the original outer recovery backup.
- First enrollment requires the server to confirm the passkey envelope signature before local activation. Existing-account enrollment requires a current device proof plus root-signed backup, rejects replacement of an already registered passkey and uses an optimistic concurrency check.
- Android Drive/file backup settings can unlock their archive key using the account passkey. Older archives still require the original key used to create them.
- RP ID: `www.comeplayers.com`. Android association file: `website/public/.well-known/assetlinks.json`, matching the existing release signing certificate.
- Added pinned native library `react-native-passkey@3.6.2`. This needs a new native APK, not an OTA for runtime 0.12.0.

## APK 0.13.0

- Local APK: `C:\Comeplayers-new\comeplayers-apps\release\android\0.13.0\ComePlayers_0.13.0_android.apk`.
- Package `com.comeplayers.app`, versionCode 15, versionName/runtime 0.13.0; native architectures arm64-v8a, armeabi-v7a, x86_64.
- Native build passed (934 tasks; 13m 38s). Passkey module is registered in generated PackageList.
- 107,716,792 bytes; SHA256 `d4dba4b9863239d50d3221dd4ecb8b134efce45a604176077c72f100c1193133`.
- Signing certificate SHA256 `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`, same as APK 0.12.1.
- Installed successfully as an update on the isolated `cp011qa` emulator (`emulator-5554`). The login screen rendered, the process remained running and startup logs contained no AndroidRuntime or ReactNativeJS errors. App data was not cleared. Evidence: `C:\Comeplayers-new\tmp\android-013-smoke-result.json`; screenshot `C:\Comeplayers-new\tmp\cp013-startup.png`.
- R2 upload completed for `app-releases/android/0.13.0/ComePlayers_0.13.0_android.apk`, with the same size and SHA256. Published website manifest and both homepage download links now target 0.13.0.
- Public download: `https://www.comeplayers.com/api/downloads/android/ComePlayers_0.13.0_android.apk`. Downloaded all 107,716,792 bytes from the public route and verified the exact local SHA256. Evidence: `C:\Comeplayers-new\tmp\account-recovery-production-result.json`.

## Validation

- Web and mobile typechecks passed. Targeted web ESLint passed, including the final lazy-import settings component and passkey API. The final Vercel production build passed with 203 static pages.
- 29 selected web/auth/protocol/passkey tests plus 25 mobile recovery/backup/Drive tests passed (54 total in these runs).
- Actual Chromium WebAuthn PRF with an isolated virtual authenticator passed creation, recovery after a complete page-runtime reset and rejection without user verification. `C:\Comeplayers-new\tmp\browser-passkey-result.json`.
- The full Messages UI test passed: it created a passkey, sent encrypted history, removed only its synthetic local vault, and restored the message with that passkey. It confirmed ciphertext-only backend payloads and made no production data changes. The harness filters only expected aborted Next.js navigation prefetches. Evidence: `C:\Comeplayers-new\tmp\passkey-ui-result.json`; script `tmp/verify-passkey-ui.ts`; screenshots `tmp/passkey-enrollment-ui.png`, `tmp/passkey-recovery-ui.png`, `tmp/web-passkey-restored-history.png`.
- No real user's passkey, Google account or production history was used in tests. Actual Google Password Manager synchronization across physical devices and real Drive transfers remain untested.
- The existing E2EE protocol is still HPKE/account-root/conversation epochs, not Signal Double Ratchet. These checks are not an independent security audit.
- Production verification passed: Android association JSON returned 200 without a redirect and matched the APK certificate; anonymous passkey enrollment returned 401; the Auth relay reached upstream validation without sending a login; the homepage links to 0.13.0; the entire public APK matched its release hash. `/api/account/session` still returns `enabled: false`.
- Local QA Next.js server and `cp011qa` emulator were stopped after verification. No app data, encrypted vaults belonging to users, or production history was deleted.

## References

- https://w3c.github.io/webauthn/#prf-extension
- https://github.com/f-23/react-native-passkey
- https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/

## Next actions

Keep the single-device flag off until specific production migration approval is received. After approval, apply and verify the migration before enabling that flag. Real passkey provider synchronization between physical devices still requires a user-controlled device test; no user credentials should be requested or logged for that test. Existing encrypted accounts should enable passkey recovery from a verified device that still has the root key, or restore that key once using their existing recovery key. Login alone cannot recover a previously lost encryption key.
