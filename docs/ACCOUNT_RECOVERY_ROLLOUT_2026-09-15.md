# Account-integrated E2EE recovery — rollout record

## Approved scope

On 15 September 2026 the owner explicitly approved resetting E2EE identities, encrypted key backups, E2EE device authorizations and old privately encrypted history. This is NOT approval to delete ComePlayers login accounts or business records. No further consent for the same narrow scope is needed; technical release checks are still required before destructive cutover.

Preserve Google/email authentication, passwords, profiles, balances, wallets, orders, products, transactions, payroll, Community/group rooms, friendships and pre-E2EE legacy messages. Do not enable SINGLE_DEVICE_SESSIONS_ENABLED or apply the unrelated single-device-session migration.

## Source and verified checkpoints

Work branch: `chatgpt/account-integrated-e2ee-recovery`, draft PR #1. Main baseline: `0b81bd4b28656bf86c946739deb1ae33f3816b1b`.

Source checkpoint `752f3bdff3592eebf561c52c824cec68c87aa877` passed GitHub Actions run `34967004571`: full web/mobile typechecks, 26 policy/passkey/storage/server tests, 32 private protocol/history/backup tests, the Next.js 16.2.6 build with dummy configuration, and an isolated PostgreSQL 17 generation-guard test. The earlier standalone 9-test checkpoint is superseded by these actual CI results.

The follow-up adds `website/tests/recoveryBrowser.test.mjs`. It uses real Chromium WebAuthn PRF and IndexedDB with a virtual authenticator, synthetic accounts and intercepted network requests. Its first trial passed six negative/isolation cases; the restore fixture initially omitted re-verification of the serialized epoch after a page reload. The fixture now verifies the epoch against the originally retained public trust anchors and founder, and explicitly asserts that using an unverified epoch is rejected. No production cryptographic guard was weakened. Consult the latest CI run for the fixed test result; do not call a virtual authenticator a physical-device synchronization test.

## Production preparation — APPLIED, no reset

The additive `account_recovery_policy` migration was applied to Supabase project `uyehruetoxedmookyfcd` via the connected migration tool on 15 September 2026. Supabase assigned version **20260915134209**. The repository file is aligned to that recorded version:

`website/supabase/migrations/20260915134209_account_recovery_policy.sql`

This replaces the prepared filename `20260915120000_account_recovery_policy.sql` without changing the SQL. Do not reapply the old filename or rewrite remote migration history. The migration creates a private control row, an enrollment wrapper and a generation guard, but deletes no data.

Post-application checks returned:

| Check | Observed |
| --- | --- |
| generation | 0 |
| reset_at | null |
| require_passkey | false |
| rollout_verified | false |
| Auth users | 67 |
| E2EE accounts / devices | 1 / 1 |
| Encrypted events / indexed blobs | 0 / 0 |
| Community group rooms | 6 |
| Anonymous control-table read | denied |
| Authenticated-user control-table update / direct enrollment RPC | denied / denied |
| Backend service-role enrollment RPC | allowed |

Counts are point-in-time observations and must be refreshed at cutover. No production account, identity, message or attachment was deleted. No Vercel deployment, Android/OTA publication, main merge or destructive reset has been performed in this follow-up.

## Android release access — identified blocker

The existing app is `com.comeplayers.app`, EAS project `a663aa70-99b7-4c8f-93ea-5f8637baa2df`, owner `comeplayers`, source version/runtime 0.13.0 and versionCode 15. Historical release evidence is recorded in `comeplayers-apps/ACCOUNT_RECOVERY_FOLLOWUP_2026-09-13.md`. Its original release certificate SHA256 is:

`0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`

Use the existing signing identity. A new signing key or debug-signed APK is not a valid update for installed users. Never send a keystore, keystore password, Expo token or user passkey through chat.

GitHub run `34976653563`, job `104406374537`, actually checked access prerequisites and stopped because **EXPO_TOKEN was not available to that Actions job**. This does not establish whether a separate PC has an Expo login. No EAS build was requested. No connector for Expo/EAS was available in the plugin search.

`comeplayers-apps/scripts/recovery-release-preflight.mjs` performs a static configuration check or an explicitly read-only EAS build-list check using pinned EAS CLI 24.5.0. It does not build, initialize a project, provision signing credentials, publish an update, change a channel or reset data. The workflow scopes EXPO_TOKEN to the preflight step and does not pass it to dependency installation.

To enable this existing workflow, the owner should create an Expo personal access token for an account with access to the existing ComePlayers EAS project and store it directly in GitHub repository Settings > Secrets and variables > Actions > New repository secret, named `EXPO_TOKEN`. Do not commit the token. After that, rerun the failed preflight job. A successful read-access check still does not prove the remote signing certificate matches; verify the resulting APK before release.

## User experience and security boundary

Normal flow: sign into ComePlayers, then confirm the synced account passkey using device security when necessary. Already verified devices reopen their local vault after an account/policy check. Enrollment and Android archive actions no longer ask for a manual 64-character code.

This is NOT Google/email login alone decrypting messages. The credential must provide PRF, user presence/verification and the required backup flags. The root key, device secrets and PRF output stay client-side. Cancellation or an unsupported provider never falls back to server-readable private keys or plaintext messages.

The protocol remains account-root/HPKE/conversation epochs, not Signal Double Ratchet. Existing lower-level archive/recovery-key formats remain for compatibility; removing their input fields is not a redesign of those algorithms. After an identity reset, old-identity backups must not be imported into the new identity.

## Remaining rollout order

1. Finish the latest CI review, browser integration tests and UI scenarios: cancelled/unsupported passkeys, concurrent enrollment, interrupted cache cleanup, account switching, replacement at the eight-device limit, stale client rejection and offline/reconnect behavior. Automated checks do not establish real Google Password Manager synchronization.
2. Database preparation is already applied at generation zero. Deploy and verify the new web source without advancing reset generation. Ensure the Android preview uses the compatible new API; do not confuse a successful CI build with a Vercel deployment.
3. Build an Android update with the existing signing identity, verify its package/versionCode/runtime/certificate and install it over the currently distributed APK without uninstalling or clearing user data. Use the existing EAS or trusted local signing environment. Do not publish to native runtime 0.12.0. Verify Windows WebView passkey/PRF behavior or complete a reviewed desktop-compatible path.
4. Test actual encrypted-history restoration on two physical devices using the same synced password manager. Test cancellation and the ability to use non-Messages app features. Record exact web commit/deployment and Android artifact SHA256 in `verified_release`; set `physicalPasskeyRestore` and `desktopPasskeyRestore` true only after real verification. Set `rollout_verified` true only after those release requirements pass.
5. Refresh inventory, inspect dependencies and run `website/scripts/operations/reset-private-e2ee.sql` as a dry run. It intentionally ends in ROLLBACK and rejects missing release evidence, repeated reset, encrypted group data or indexed R2 blobs. If objects exist, stop and implement exact-key verified R2 removal before deleting their database index. Never bulk-delete a bucket.
6. Only at verified cutover execute the reviewed transaction with COMMIT instead of its final ROLLBACK. Verify generation 1, passkey requirement, removed old E2EE rows, retained login/business/Community data, fresh enrollment, cross-device recovery and stale-device rejection. Store aggregate audit counts, not message bodies or keys.

## Limits and rollback

The reset does not delete personal exports, Google Drive files, old passkeys from password managers or arbitrary offline-device copies. Recognized local cache cleanup runs only when a supported updated client next connects. Do not claim remote physical erasure of every copy.

The new bootstrap needs a successful server policy check before exposing an old local vault; offline starts keep Messages locked rather than silently ignoring a potential reset. Other app areas remain available on mobile. Test this tradeoff explicitly.

Before destructive cutover, old clients remain compatible with generation zero. After cutover, a source-code rollback cannot recover deleted identities/history, and the database guard intentionally blocks old enrollment. Never move generation backwards, disable the guard or mix old snapshots with new identities as an improvised rollback.
