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

## Codex continuation — 16 September 2026

The current branch was checked at `ec004c0e9c1e9c8c0c937b378c21cb6225518999`; no newer head was overwritten. No checkout was present in the Codex workspace, searched Documents/Desktop locations, or the historical `C:\Comeplayers-new` path. Git HTTPS authentication was unavailable. An authorized GitHub connector provided a partial source snapshot for review and targeted local tests; this snapshot is not a complete Git checkout. Changes are submitted against the existing branch through the connector, preserving its parent history.

### Code changes

- Native backup/export now validates the server policy against the locally recorded generation, the signed roster against the trusted root, and this device's current authorization. Restore repeats those checks inside its transaction before commit; reset, account switch, revocation, or a failed final request rolls back imported records. Export repeats the check before returning its temporary file and deletes that file on failure.
- Closing/changing the backup context aborts its transfer. An interrupted restore reopens Messages through its policy check instead of resuming a potentially stale messenger directly.
- Read-only release preflight now supports `local-access`, which attempts an existing Expo session without imposing the Actions token prerequisite on a local PC. Actions still require `EXPO_TOKEN`. It runs a separately installed, pinned EAS CLI directly with Node, without a command shell or dependency download while carrying the Expo token. Raw CLI output remains suppressed. Host-profile failures have a separate diagnostic.
- Static preflight checks owner, minimum native runtime, and source versionCode, and explicitly leaves artifact/signature/remote-version verification false. These configuration checks cannot certify an APK. The existing local signing plugin still has a debug fallback; do not distribute its output without verifying the actual original certificate. No signed build was possible in this environment.

### Observed validation and environment

- New local tests: 14 backup transaction/authorization cases and 15 release-preflight cases passed. Eight existing storage-isolation cases also passed. They use synthetic storage/CLI adapters; none establishes physical-device passkey synchronization or real native SQLite behavior.
- Both locked dependency installations completed (`npm ci`, website and application workspaces). The standard `tsx` protocol commands failed before running tests because this Windows runtime's `os.userInfo()` returns `uv_os_get_passwd` / `ENOMEM`. Full-source typechecks, protocol tests and build must be checked on the resulting GitHub Actions commit; do not count these local attempts as passed.
- Fresh CI evidence on the incoming handoff commit: source and SQL run `35025183065` succeeded; browser/configuration job `104570392093` in run `35025183077` succeeded; EAS job `104570392452` failed at the missing Actions secret prerequisite.
- No `EXPO_TOKEN` or named Android signing/SDK environment variables were present. Standard `.expo`, `.eas`, `.android`, `.gradle`, Android SDK and user npm installation paths were absent. `java`, `adb`, `eas` and `expo` were not on PATH. EAS CLI 24.5.0 was then installed in workspace tooling. Both `whoami` and the new `local-access` probe hit the Windows profile error, so authenticated project access remains unverified. No replacement Expo project, signing key, APK, AAB, or OTA was created.
- Connected Vercel production was READY at `dpl_FPpB7nzKh4cKZErcQ3gQjyFFc5cB`, source `0b81bd4b28656bf86c946739deb1ae33f3816b1b`. The project listing retains the old repository name `evo-gaming`, while deployment metadata identifies `comeplayers`. No deployment from this recovery branch was found in the current listing, and this continuation did not deploy.
- Supabase `list_migrations`, the read-only migration query, and `list_projects` all returned connector internal errors. Current generation and aggregate inventory could not be reverified. The recorded applied migration remains `20260915134209`; it was not reapplied. No production SQL mutation, dry-run reset, release-evidence update, or reset was executed.

### Remaining access and cutover requirements

Use a functioning authorized local Expo/signing host, or configure `EXPO_TOKEN` directly in repository Actions secrets and rerun the existing preflight. For a local check, install `eas-cli@24.5.0` separately without release secrets, set `COMEPLAYERS_EAS_CLI_PATH` to the absolute `node_modules/eas-cli/bin/run` path, then run `node comeplayers-apps/scripts/recovery-release-preflight.mjs local-access`. This lists builds only. Never paste secrets into chat.

Reconnect the Supabase plugin before refreshing the actual migration/control/inventory state. Complete original-certificate Android artifact verification, remote version checking, an update install without clearing app data, two physical-device passkey/history restoration, and the supported Windows path before any reset. The prior scope approval remains valid; release readiness is still unfulfilled.


### Verified source checkpoint from this continuation

Implementation/test checkpoint: `dd52b147b01c507383349de7076d3e54b85854d7` (parent implementation `17dff0e58f9f6cceb1188aaac58233125a231b5d`). The subsequent evidence update is documentation only.

- [Account recovery checks, run 35028842059](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35028842059): source job `104582727160` and SQL job `104582727389` succeeded. Full web/mobile typechecks, 40 recovery/policy/storage/passkey/server tests, 32 private protocol/history/backup tests, helper parity and the web build passed. The build generated 231 pages with dummy configuration.
- [Browser and Android preflight, run 35028842141](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35028842141): browser job `104582297517` passed all 7 Chromium tests and 15 release-preflight tests. EAS job `104582297769` failed at the missing `EXPO_TOKEN` prerequisite. The workflow as a whole remains failed; it is not an Android build.
- Total across these four test groups: **94 passed**. Local synthetic tests are included in these groups, not additional unique tests.
- The first CI attempt at `17dff0e` exposed a pre-existing nondeterministic history-tampering fixture: replacing the first ciphertext byte with 00 sometimes did not change that byte. The follow-up always changes a hex digit and asserts that the fixture differs; the actual rejection/cursor/persistence assertions remain intact. No production cryptographic check was changed to make this pass.
- Public read-only checks returned HTTP 200 with `enabled: false` for `/api/account/session` and HTTP 200 with the original Android package/certificate in assetlinks. A range GET of the existing 0.13.0 APK returned HTTP 206 and a total size of 107,716,792 bytes. Only one byte was requested; its full hash/signature was not reverified here, and it is not a replacement recovery artifact.
- Web deployment, replacement APK/AAB/OTA, physical-device tests and database reset remain **not performed** in this continuation. Supabase live state remains unavailable through the failed connector. Do not turn these CI results into `verified_release` or `rollout_verified`.

## Signing guard and refreshed production audit — 16 September 2026

This entry supersedes the earlier connector-outage and debug-fallback status; earlier observations remain historical.

### Read-only database evidence

Supabase access succeeded. Migration history still contains `20260915134209 / account_recovery_policy`; it was not reapplied. Aggregate query time: `2026-09-16T01:42:40.540874+00:00`.

| State / inventory | Observed |
| --- | --- |
| generation / reset_at | 0 / null |
| require_passkey / rollout_verified / verified_release | false / false / null |
| Auth users / profiles | 67 / 67 |
| E2EE accounts / devices / rosters | 1 / 1 / 1 |
| E2EE epochs / events / event users / blobs / usage | 0 / 0 / 0 / 0 / 0 |
| Chat rooms / Community group rooms / legacy messages | 13 / 6 / 42 |
| Wallets / wallet transactions / wallet topups | 51 / 5 / 1 |
| Products / orders | 532 / 35 |
| Payroll employees / entries / periods / workspaces | 1 / 0 / 1 / 1 |
| Friendships | 1 |

The account generation trigger is enabled. Anonymous control-table SELECT and authenticated control-table UPDATE privileges are false. Foreign-key inspection found `cp_calls -> cp_secure_events` uses SET NULL; a future reset may clear that event reference but must preserve the call row. This is dependency evidence, not authorization for unrelated deletion. Refresh protected business counts and dependency/trigger evidence again before cutover; point-in-time counts alone do not prove row contents unchanged.

No production mutation, release-readiness flag update, dry-run reset or reset was performed. The reset script remains ROLLBACK-only until the real release/device prerequisites are fulfilled. Single-device sessions were not enabled.

### Android signing change

The local plugin no longer selects debug signing when release credentials are missing. It appends an explicit release configuration after Expo's template, so indentation changes cannot silently remove the override. Unsupported Gradle languages and stale generated guards fail clearly.

A Gradle task-graph guard checks the effective release configuration after EAS's late signing injection. It requires an existing signing key entry and compares its public certificate SHA256 with the fixed original ComePlayers certificate. Missing credentials, unreadable keystores and other certificates stop release tasks without printing credential values or paths. Release configuration caching is rejected because it could skip the verification callback. Debug tasks remain usable without release credentials. APK package/version/runtime/signature verification remains mandatory before distribution.

The integration order follows [Expo's Android build documentation](https://docs.expo.dev/build-reference/android-builds/). No EAS project, signing key or replacement Android artifact was created. No native-passkey OTA was published.

New checks use the locked Expo Gradle template plus isolated Gradle/JVM fixtures and Expo's already-public debug keystore. They generate no keystore. A test-only expected public fingerprint exercises the successful comparison; the unchanged production constant must reject the same debug certificate. These are guard tests, not a real Android build, original-credential validation, physical passkey test, or EAS signing verification.

### Access and deployment status

- Retrying the current-head EAS workflow still failed at the missing `EXPO_TOKEN` prerequisite (run `35029358444`, latest job `104633736275`). The browser job passed again. No build request was sent.
- The local EAS probe still fails with `uv_os_get_passwd / ENOMEM`; authenticated local access remains unverified.
- The existing Vercel project remains `prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3`; production is `dpl_FPpB7nzKh4cKZErcQ3gQjyFFc5cB`, source `0b81bd4b28656bf86c946739deb1ae33f3816b1b`. The available browser reached Vercel's login page. No recovery preview or production deployment was created by this step.
- Physical Android restore/update tests and Windows WebView PRF recovery remain outstanding. Do not populate production release evidence from these synthetic checks.
