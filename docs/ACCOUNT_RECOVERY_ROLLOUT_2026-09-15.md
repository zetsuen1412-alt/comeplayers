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

### Verified signing checkpoint

Code checkpoint: `a62ce9eed974221516d21fe74fda5ddc32fb3ecd`.

- [Account recovery checks, run 35046090619](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35046090619) succeeded: source job `104637098176`, SQL job `104637098334`. Both TypeScript checks, 40 recovery/policy/storage/passkey/server tests, 32 private-protocol/history/backup tests, helper parity, isolated PostgreSQL and the dummy-config web build (231 pages) passed.
- All **15 signing checks passed, zero skipped** in that source job: 5 plugin/template cases and 10 real Gradle/JVM fixture cases. Local runs passed the 5 plugin cases; the 10 JVM cases were explicitly skipped locally because this host lacks Java. Do not confuse the local skip with the successful CI execution.
- [Browser and Android preflight, run 35046090639](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35046090639): browser job `104636095428` passed 7 WebAuthn/IndexedDB tests and 15 preflight tests. EAS job `104636095263` failed at the missing `EXPO_TOKEN` prerequisite. Total across the five test groups: **109 passed**. The preflight workflow is still failed overall.
- The duplicate push run `35046087925` was cancelled by workflow concurrency; its result is not the validation evidence above.
- Additional read-only audit at `2026-09-16T01:58:10.811272+00:00`: 3 call rows, 0 non-null encrypted-event references, and no non-internal DELETE triggers on the eight reset-allowlisted E2EE tables.
- Expo's dashboard also reached its login page. No Vercel CLI token or standard CLI authentication file was found. The direct Vercel deployment tool requires complete source files; its input-validation probes created no deployment. A final deployment listing still showed the same main production deployment. The partial local snapshot was not deployed.
- No replacement artifact, physical-device/Windows restore result, deployment or production reset is implied by these passes. The subsequent evidence commit changes documentation only.

## Connected Git deployment and web build fix — 16 September 2026

This entry supersedes the earlier Vercel login/deployment blocker. GitHub and Vercel browser sessions are now authenticated.

### Existing Vercel project repaired

The project `prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3` (`evo-gaming`) was still connected to the old `zetsuen1412-alt/evo-gaming` repository, ID `1247255641`. Its Create Deployment form rejected the ComePlayers commit URL as a different repository. The existing Vercel GitHub installation already listed ComePlayers. The same project was reconnected to `zetsuen1412-alt/comeplayers`, ID `1365296560`, and its previously empty Root Directory was set to `website`. No replacement Vercel project was created. Existing Supabase variable names/scopes were checked without revealing values: service-role key covers Production and Preview; public URL/anon key cover all environments.

The first recovery preview, `dpl_FxSXq9b7ovy54sW8FrganG4BtWQw` at `8a35ea8`, failed after compilation: the web TypeScript configuration included cross-platform tests that import native crypto, whose `hpke` dependency was not installed beside the mobile source. Prior CI installed both workspaces and therefore did not expose this deployment failure.

### Source fix and verified CI

Commit **`6e502159278f5b0544385a56ceaa33d22f7f5a06`** adds `website/tsconfig.build.json` and selects it in Next.js. It inherits the existing strict compiler options and excludes the test directory from the deployed web build. The original full `tsconfig.json`, full web/mobile typechecks and cross-platform tests remain unchanged. Production type checking is still enabled.

The web build now runs in its own CI job with sibling mobile source present but only locked website dependencies installed, matching Vercel's dependency boundary.

- [Account recovery checks, run 35053356423](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35053356423): source `104658293043`, SQL `104658293177`, and isolated web build `104658293251` all succeeded. Source logs confirm 40 recovery/policy/storage/passkey/server tests, 15 signing tests (zero skipped), and 32 private protocol/history/backup tests passed. Both typechecks and helper parity passed. The isolated web build generated 231 pages with dummy credentials.
- [Browser and Android preflight, run 35053356385](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35053356385): browser job `104658283863` passed 7 browser and 15 preflight tests. EAS job `104658284094` failed at the missing `EXPO_TOKEN` prerequisite. Total remains **109 tests passed**, with the EAS workflow failed overall.
- Local TypeScript configuration parsing confirmed strict mode, no configuration errors and no test files among build roots. The local source snapshot remains partial; this is not a local full-build claim.

### Ready preview and observed UI

Preview **`dpl_8SPkMM4Q5isVxUTrRPt6PTteP6D9`** is READY, source `6e502159278f5b0544385a56ceaa33d22f7f5a06`, completed at 03:52:59 UTC:

https://evo-gaming-kfbotxtue-ilham-evogaming-s-projects.vercel.app

Authenticated Vercel browser access opened the home page, Community sign-in gate, and private chat sign-in gate. Closing the chat login dialog and navigating to Marketplace successfully loaded the categories and game recommendations. No ComePlayers account was signed in and no customer message was opened or submitted. Direct connector API probes encountered Vercel protection/SSO redirects, and direct browser JSON navigation was blocked by the client; these probes are not counted as successful application API tests.

This is a Preview deployment. Production remains the earlier main deployment `dpl_FPpB7nzKh4cKZErcQ3gQjyFFc5cB`. No production promotion, main merge, Android publication or physical passkey restoration is implied. Actual authenticated recovery still needs the supported relying-party origin and real devices.

### Remaining Expo and reset gates

GitHub's repository secrets UI explicitly showed no repository or environment Actions secrets. Expo's GitHub sign-in reached **new-account onboarding**, not the existing ComePlayers account. No account was created. The official Expo login page was left open for the owner to sign into the existing account that controls project `a663aa70-99b7-4c8f-93ea-5f8637baa2df`. Local EAS/profile and signing-tool limitations recorded above remain unresolved. No new APK/AAB/OTA, signing key or Expo project was created.

A fresh read-only database check at **2026-09-16T03:48:13.278063+00:00** returned: migration version `20260915134209` appears once; generation 0; reset_at null; require_passkey false; rollout_verified false; verified_release null; 67 Auth users, 67 profiles, 1 E2EE account, 1 E2EE device, zero E2EE events and blobs. No production database mutation, migration reapply, reset dry run or reset occurred. The original narrow reset approval remains valid, but original-certificate Android release/update tests, two physical devices and Windows verification are still required.

## Existing Expo access and Android build preparation — 16 September 2026

The owner completed Expo login. Browser access now confirms the original **personal account `comeplayers`**, project `a663aa70-99b7-4c8f-93ea-5f8637baa2df`, and Android package `com.comeplayers.app`. The similarly named project in `comeplayerss-team` has no build history and was not selected for release. No account, project, or keystore was created or transferred.

### Signing evidence and its limits

The original project's Android credentials page lists the existing default JKS build credentials `ri4dNOy_7Y` (ID `f62c0517-e92b-482a-8b0d-c2059d3e412a`). Its displayed SHA256 is truncated, so this UI alone does not establish the full current remote fingerprint. No private keystore or password was downloaded or revealed.

The existing successful production AAB, [build 74241b27-16e4-4718-9486-7bdf04795cfb](https://expo.dev/accounts/comeplayers/projects/comeplayers/builds/74241b27-16e4-4718-9486-7bdf04795cfb), was downloaded and inspected. It is historical version **0.7.0 (3)** from source `040826f`, not a replacement recovery release.

- Size: 52,986,781 bytes.
- Artifact SHA256: `8d218ed42e1bda5d8dd525c6a3b4962d70d354def9b79147712dfaba46dd557d`.
- Embedded signing certificate SHA256: `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`, matching the original expected certificate.
- PKCS7 certificate extraction is not complete JAR signature verification. The candidate APK still requires full signature, package, version, runtime and artifact-hash verification, in addition to the release signing guard.

### Build configuration and version gate

Both Android preview and production profiles now explicitly select `ubuntu-26.04-jdk-17-ndk-r27b-sdk-57`, the [documented SDK 57 build image](https://docs.expo.dev/build-reference/infrastructure/). An explicit image is a prerequisite for [builds through the Expo GitHub App](https://docs.expo.dev/build/building-from-github/). Preview remains an internal APK; production remains an AAB. This change does not run a build, submit to a store or publish an OTA.

Local static preflight and all **15 existing preflight tests passed**, zero skipped. These checks do not verify remote signing or version allocation and do not add 15 unique tests to the earlier 109-test total.

The latest listed EAS preview is **0.8.0 (3)**, build `ab573846-841b-48eb-aba6-3583a7c725ed`; the previously distributed local release is **0.13.0 (15)**. Historical build codes do not prove the current EAS remote counter. Keep `appVersionSource: remote`; before requesting a replacement build, read the actual counter with `eas build:version:get --platform android --profile preview --json --non-interactive` on an authorized functioning host. Reconcile it with the last distributed code using the supported version-set command if needed, never lower a newer remote counter, and ensure the candidate uses a new code greater than 15. Source app.json alone is not the effective version when remote versioning is enabled. See [Expo app version management](https://docs.expo.dev/build-reference/app-versions/).

### GitHub connection and remaining gates

The original project has no linked GitHub repository. The verified Expo GitHub App installation form is prepared for **only `zetsuen1412-alt/comeplayers`**. Installation remains pending the owner's action-time permission confirmation because it grants new repository access, including read/write code, workflows and administration. The final Install & Authorize action has not been performed. This is unrelated to the already approved narrow E2EE reset.

After authorization, link the existing project with base directory `comeplayers-apps/apps/mobile`, then verify version allocation and build the reviewed recovery branch. The existing EAS preview OTA workflow triggers on main/master pushes; the production OTA workflow is manual. Do not merge or publish an OTA as a side effect of connecting the repository.

Actions run `35053667129` on documentation head `c6250c0` still failed at the missing secure `EXPO_TOKEN` prerequisite (job `104659201343`); its browser/preflight job `104659201235` passed. Browser Expo login does not establish CLI authentication. The local EAS CLI host-profile error remains unresolved.

No replacement Android build was requested, and no APK/AAB/OTA was published. The verified web preview remains available; production remains on the earlier main commit. Two physical-device passkey/history restore tests and Windows verification remain outstanding. No database mutation, migration reapplication, readiness flag, reset dry run, reset or single-device-session change occurred in this step.

### Verified Android configuration checkpoint

Code/configuration checkpoint: **`6adc58dc2e08c823e13e25734c60ebda6434b23e`**. The subsequent evidence update changes documentation only.

- [Source, SQL and web build, run 35061539946](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35061539946): jobs `104682719175`, `104682719338`, and `104682719442` succeeded. Full web/mobile typechecks, helper parity and the isolated web dependency build (231 pages) passed.
- [Browser and preflight, run 35061539888](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35061539888): browser job `104682717638` passed; EAS job `104682717454` failed at the missing Actions token prerequisite.
- Logs confirm **109 tests passed, zero skipped**: 40 recovery/policy/storage/passkey/server, 32 protocol/history/backup, 15 signing, 7 browser, 15 preflight. This is not an EAS build or physical-device test result, and the preflight workflow remains failed overall.

## Connected EAS release preparation — 16 September 2026

This entry supersedes the earlier installation and remote-version blockers.

The owner authorized Expo GitHub App access. Existing installation `162106771` was restricted from all repositories to only `zetsuen1412-alt/comeplayers`. The original personal-account project `a663aa70-99b7-4c8f-93ea-5f8637baa2df` is now connected with base directory `/comeplayers-apps/apps/mobile`. No replacement account, project, signing key, or store submission was created.

### Verified version reconciliation

Manual, read-only workflow [01a0a8e3-5841-758c-b21b-b5815146bf7a](https://expo.dev/accounts/comeplayers/projects/comeplayers/workflows/01a0a8e3-5841-758c-b21b-b5815146bf7a), source `75da6d0acd6f0cf015421a89aee122ca81298333`, completed successfully and displayed the actual remote Android counter **3**, compared with the distributed code **15**.

Commit **`b40eb5a8319759f6801b4613d58cb88bc6c42fbf`** adds guarded manual reconciliation and 10 focused tests, includes those tests in source CI, and enables `preview.autoIncrement`. The script validates the original project, owner, package and remote-version source; checks for the independently observed value 3 twice; preserves counters already >=15; performs a non-retried version write to 15; and verifies the result. Unexpected or concurrent changes fail closed. It uses the existing EAS worker authorization and the query/mutation implementation from pinned EAS CLI 24.5.0, without exporting credentials.

Manual [reconciliation 01a0a8e9-7c1a-7867-bbc7-64d06552feae](https://expo.dev/accounts/comeplayers/projects/comeplayers/workflows/01a0a8e9-7c1a-7867-bbc7-64d06552feae) completed in 33 seconds at source `b40eb5a`. Its public report verified **before 3, after 15, changed true**. Do not rerun it to lower any counter allocated by later builds.

### Current source and browser checks

- [Account recovery checks 35063915781](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35063915781): source `104689947458`, SQL `104689947654`, and isolated web build `104689947703` succeeded. Web/mobile typechecks and helper parity passed.
- [Browser and preflight 35063915809](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35063915809): browser job `104691110424` succeeded; logs confirm 7 browser and 15 preflight passes, zero skipped. EAS-access job `104691110277` still failed at the missing Actions `EXPO_TOKEN` prerequisite.
- **119 tests passed**, zero skipped: 40 recovery/policy/storage/passkey/server, 32 protocol/history/backup, 15 signing, 7 browser, 15 preflight, and 10 version-reconciliation tests. These are synthetic/isolated checks, not physical-device evidence.
- Actual authenticated EAS worker reads, reconciliation and the GitHub-triggered candidate build establish available cloud access independently of the still-failing Actions token check.

### Candidate build and web preview

The exact source `b40eb5a8319759f6801b4613d58cb88bc6c42fbf` was submitted to the original project as an Android-only internal `preview` build. EAS allocated **0.13.0 (16)**, runtime **0.13.0**, channel **preview**. Auto-submit to stores was unchecked. Build: [97e757b5-48ff-4806-9c95-018cd1a1355c](https://expo.dev/accounts/comeplayers/projects/comeplayers/builds/97e757b5-48ff-4806-9c95-018cd1a1355c).

Existing preview environment configuration points to `https://www.comeplayers.com` and Supabase project `uyehruetoxedmookyfcd`, with its existing public client key. No variable values were changed or private signing material downloaded.

Expo Doctor reported 20/21 checks passing, with 16 Expo packages behind the currently recommended patch versions. Native compilation continued. This warning is not reported as a clean Doctor result.

Current web preview [dpl_BjYMm3uAxAv4q6d8oCnsdnmfoafM](https://vercel.com/ilham-evogaming-s-projects/evo-gaming/BjYMm3uAxAv4q6d8oCnsdnmfoafM) is READY from the same source. Its home page and Community sign-in gate were opened successfully. No authenticated application recovery result is implied.

### Database state

Read-only check at **2026-09-16 06:45:22.578433 UTC**: preparation migration `20260915134209` appears once; generation 0; reset_at null; require_passkey false; rollout_verified false; verified_release null; 67 Auth users, 67 profiles, 1 E2EE account, 1 E2EE device, 0 E2EE events/blobs, 6 group rooms and 42 legacy messages.

No production database mutation, migration reapplication, readiness-flag update, reset dry run, reset or single-device-session change has occurred. The owner's narrow reset authorization remains valid. Physical update installation, two-device synced-passkey/history recovery, and the supported Windows path remain required before reset.

### Finished APK and direct artifact verification

The EAS candidate completed successfully in **10m 59s** total (10m 50s build). The original release-signing guard remained enabled. The artifact was downloaded from the build's official Download build link and inspected using Android SDK Build Tools 36.0.0 `apksigner verify --verbose --print-certs` and `aapt2`, with a checksum-verified Eclipse Temurin 17 JRE installed only in workspace tooling.

- APK size: **139,142,070 bytes**.
- APK SHA256: **`e14d2bb92e5ea1de4f2636eceb40e900b978ef3fbf5879f018d8839625419066`**.
- Full signature verification: **passed**, one signer, APK Signature Scheme v2.
- Effective signer SHA256: **`0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`**, matching the original identity.
- Manifest package **`com.comeplayers.app`**, versionName **0.13.0**, versionCode **16**, minSdk **24**, targetSdk **36**, non-debuggable, Android backup disabled.
- The runtime resource referenced by the native manifest resolves to **0.13.0**. Native update URL points to the original EAS project; channel **preview**; automatic launch checks **NEVER**.
- APK download: https://expo.dev/artifacts/eas/COHgMagKgYkZummxLHbm1EpCjX0V--4tYwmMeANcMrE.apk

This is an internal candidate, not a Play Store submission or a replacement of the public website's existing Android download. No new AAB or OTA was published. Full signature verification does not establish a successful update installation or physical passkey restoration.

### Production web release and smoke verification

After artifact verification and a fresh read-only database check, Vercel rebuilt the same exact source using the existing Production environment. Production deployment **`dpl_BG787RNZW9RqtoCYddHPVqjMaNhe`** is **READY**, source **`b40eb5a8319759f6801b4613d58cb88bc6c42fbf`**, aliased to **www.comeplayers.com**, **comeplayers.com**, and the existing Vercel production alias.

Deployment: https://vercel.com/ilham-evogaming-s-projects/evo-gaming/BG787RNZW9RqtoCYddHPVqjMaNhe

This promotion did not merge main or trigger the main-push Expo OTA workflow. The previous web deployment is `dpl_FPpB7nzKh4cKZErcQ3gQjyFFc5cB`; database generation was not changed.

Read-only production smoke checks at **2026-09-16T06:56:12.339Z**:
- `/api/health/live`: 200, ok true.
- `/api/health/ready`: 200, database ready.
- `/api/messages/secure/account` and `/api/messages/secure/history`, without credentials: 401, authentication required, no account/history returned, no-store.
- `/api/game-categories`: 200, eight categories.
- `/.well-known/assetlinks.json`: 200, original Android certificate and package association present.
- Browser: production home and fully loaded Marketplace/categories/game recommendations opened successfully.
- Deployment-scoped 5xx log query for the initial smoke window returned no entries. This is a short observation, not a sustained reliability claim.

A post-deployment read-only check at **2026-09-16 06:56:45.761811 UTC** still returned generation 0, reset_at null, require_passkey false, rollout_verified false, verified_release null, 67 Auth users, 67 profiles, 1 E2EE account/device, 0 encrypted events/blobs, 6 group rooms and 42 legacy messages.

### Remaining release and reset gates

The owner must perform or provide access for genuine device testing: install candidate code 16 over the existing app without uninstall/clear-data, restore encrypted test history through the same synced passkey on a second physical device, and verify the supported Windows path. Record device/browser/provider versions and actual outcomes without collecting passwords, passkeys or customer messages. Cancellation and non-Messages usage must also be checked.

Do not fill `physicalPasskeyRestore`, `desktopPasskeyRestore`, `verified_release` or `rollout_verified` from the 119 automated tests, APK inspection, unauthenticated API smoke checks or an unanswered device-availability question. Only after real device evidence, complete Android distribution, refresh protected inventory, and perform the guarded reset dry run/cutover under the existing narrow approval.

## Passkey guidance correction and candidate 17 — 16 September 2026

This entry supersedes the candidate-16/current-production status above. Candidate 16 remains a historical verified build; no evidence from it is being relabeled as candidate 17.

### Source changes and checks

Source **`87326013f7ddefb1dca56f0a4b2853bd8a50b046`**, a fast-forward from documentation commit `0a8bdc7681fa97defe48e8f76dbd7c6a83bea797`, corrects two remaining ordinary-flow messages that suggested manual recovery-key use. The shared web/mobile PRF-unavailable message directs users to a supported browser and synced passkey provider. Account security directs users to finish Messages passkey setup/recovery or use a device with verified history. Legacy exported-file compatibility and cryptographic guards are unchanged.

The corrupt-ciphertext fixture now XORs the first byte instead of replacing it with 00, removing the 1/256 chance that the fixture made no change. No cryptographic implementation was changed.

- [Account recovery checks 35070096420](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35070096420): source job `104709370693`, web-build job `104709370735`, and SQL job `104709370796` succeeded. Web/mobile typechecks and helper parity passed.
- [Browser/preflight 35070096485](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35070096485): browser job `104709364535` succeeded. EAS-access job `104709364357` still failed at the missing Actions `EXPO_TOKEN` prerequisite; the workflow remains failed overall.
- Logs confirm **119 passed, zero failed, zero skipped** across the same six automated groups: 40 recovery/policy/storage/passkey/server, 32 protocol/history/backup, 15 signing, 7 browser, 15 preflight, 10 version guards. Virtual authenticators do not establish physical passkey synchronization.

### Verified Android artifact

The existing authenticated EAS/GitHub route built source `8732601` on the original project and existing signing identity. No replacement project/keystore, store submission or OTA was created.

- Build: [10763521-a510-4c4c-821f-bc011bf82091](https://expo.dev/accounts/comeplayers/projects/comeplayers/builds/10763521-a510-4c4c-821f-bc011bf82091), finished in **8m 57s** total (**8m 50s** build).
- Internal profile/environment/channel: **preview**.
- Package **com.comeplayers.app**; version **0.13.0 (17)**; runtime **0.13.0**. Remote autoIncrement allocated 17; no counter was lowered.
- APK size **139,142,102 bytes**; SHA256 **`9a522ea0634444d16547102251e075d42d93f573c920fb9db1f6843d2a2c573d`**.
- Full `apksigner verify --verbose --print-certs`: **passed**, APK Signature Scheme v2, one signer.
- Effective signer SHA256 **`0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`**, identical to the original release.
- aapt2 manifest/resources: minSdk 24, targetSdk 36, non-debuggable, allowBackup false; original EAS update project, preview channel, automatic checks NEVER, runtime resource 0.13.0.
- The embedded Android bundle contains the corrected passkey guidance and no occurrence of the replaced obsolete PRF-error message.
- Official artifact: https://expo.dev/artifacts/eas/KcOTQ27UuHNOPTmsZ6-FWy5lBJmQVFopFbHXbZmP23s.apk
- Expo Doctor remains **20/21**, with 16 packages behind recommended patches. Native build succeeded; Doctor is not reported as clean.

The APK is available as an internal test candidate. The public website Android download has not been replaced; no AAB, Play Store release or OTA was published. Update installation and physical recovery remain unverified.

### Production web

Preview `dpl_9JWdeDjuYcePKJxWSvXF6xvrEiDk` passed. Vercel rebuilt the same source using the existing Production environment: **`dpl_9WFpkutUdP6wL2X7uMvCjRqhQGmm`**, **READY**, aliased to **www.comeplayers.com**, **comeplayers.com** and the existing production alias.

Deployment: https://vercel.com/ilham-evogaming-s-projects/evo-gaming/9WFpkutUdP6wL2X7uMvCjRqhQGmm

Previous production: `dpl_BG787RNZW9RqtoCYddHPVqjMaNhe` (source `b40eb5a`). Main was not merged and its push-triggered OTA workflow was not invoked.

Read-only smoke checks at **2026-09-16T07:54:26.716Z** passed: live/ready 200 with database ready; unauthenticated E2EE account/history 401 with no account/history returned; categories 200 with eight categories; assetlinks matches the original Android signer. Browser home and fully loaded Marketplace opened successfully. A deployment-scoped initial 5xx query returned no entries. These are short, unauthenticated observations, not authenticated recovery or sustained reliability evidence.

### Database and remaining device gate

Before-deployment audit at **07:51:33 UTC** and after-deployment audit at **2026-09-16 07:54:28.684682 UTC** agree: generation **0**, reset_at **null**, require_passkey **false**, rollout_verified **false**, verified_release **null**; 67 Auth users, 67 profiles, 1 E2EE account/device, 0 encrypted events/blobs, 6 group rooms and 42 legacy messages. Preparation migration `20260915134209` is recorded exactly once.

**No reset, reset dry-run, migration reapplication or readiness-flag write was performed. Single-device sessions remain unchanged.** The existing narrow reset approval remains valid.

Physical evidence is still missing: Android update without uninstall/clear-data, history restoration through the same synced passkey on a second physical device, cancellation/non-Messages behavior, offline/reconnect and the supported Windows path. No answer to the device-installation question was available during this verification. Native device control/ADB is not available in this session; the OS hardware inventory query returned access denied, which does not prove no device is attached. Desktop source review confirms the existing hosted-site shell, not WebView PRF support. No Windows installer was built.

Use candidate **17** for the next update test; an already-installed candidate 16 can serve as its baseline. Record actual device/browser/provider metadata and outcomes, without secrets or personal-message contents. Do not promote automated tests or artifact inspection into physical evidence. Complete the Android distribution and guarded inventory/dry-run/cutover only once genuine device verification satisfies the handoff.

## Android locked-screen fixes and candidate 18 — 16 September 2026

Two owner-provided Android screenshots exposed defects still present in candidate 17: native Account recovery suggested a manual recovery key when no verified vault was available, and a locked private conversation displayed a mirrored empty state with a retry action that did nothing. These are source-confirmed defects; they must not all be dismissed as an old APK. The screenshots did not independently establish the installed versionCode or successful update installation.

### Implementation

Commit **`dd0f459cd9d2df72199d09d140e4ebf650cf5703`**, fast-forward from `cace94fe66e037869dcd38812a0294f826693d29`, changes only the two native screens:

- Account recovery offers **Open Messages verification** when the messenger is unavailable, closing settings and reopening the existing secure setup. Its missing-vault error no longer suggests entering a recovery key.
- Locked conversations show a dedicated verification state. Retry and the security-code action reopen verification when no messenger exists instead of silently doing nothing or dereferencing null.
- The message composer is hidden and private-call buttons are disabled while locked. Locked, loading and truly empty history are distinct.
- The additional `scaleY: -1` empty-state transform is removed. Installed React Native 0.86.3 already composes its Android inversion style onto `ListEmptyComponent`; the override caused the mirrored text.
- Existing passkey creation, verified-vault checks, cryptographic protocol, generation policy and server authorization are unchanged. Legacy exported-backup compatibility remains.

### Validation

[Account recovery checks 35074259380](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35074259380): source `104724277128`, SQL `104724276851`, and web build `104724277044` passed, including web/mobile typechecks and helper parity.

[Browser/preflight 35074259349](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35074259349): browser job `104722774530` passed; EAS-access job `104722773981` failed because Actions still lacks `EXPO_TOKEN`. This workflow remains failed overall. Duplicate push run `35074255395` was cancelled under the shared concurrency configuration; the subsequent PR run completed.

Logs confirm **119 automated tests passed, zero failed, zero skipped**: 40 recovery/policy/storage/passkey/server, 32 protocol/history/backup, 15 signing, 7 browser, 15 preflight, 10 version guards. Both edited TSX files also passed local syntax parsing. These tests do not establish native visual correctness or physical passkey restoration.

### Verified candidate 18

- EAS build: [528222d7-3c51-4f66-b21e-e177764ffbb3](https://expo.dev/accounts/comeplayers/projects/comeplayers/builds/528222d7-3c51-4f66-b21e-e177764ffbb3), source **`dd0f459cd9d2df72199d09d140e4ebf650cf5703`**.
- Android internal profile/environment/channel **preview**, original project **`a663aa70-99b7-4c8f-93ea-5f8637baa2df`**. No replacement keystore/project or automatic store submission.
- Native version **0.13.0 (18)**, package **com.comeplayers.app**, runtime **0.13.0**. Remote autoIncrement preserved increasing versionCodes.
- Build **9m 46s**, total **9m 54s**. Expo Doctor **20/21**, with 16 packages behind recommended patches; native build completed successfully.
- APK size **139,143,054 bytes**.
- APK SHA256 **`86e9e45cff6abdbf7b51dee6b2302808cd83684d5e2c75fa41688046d0a8d1a6`**.
- Full `apksigner verify --verbose --print-certs` **passed**, v2, one signer. Certificate SHA256 **`0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`**, matching the original release.
- aapt2 confirms minSdk 24, targetSdk 36, non-debuggable, allowBackup false, original EAS update URL, preview channel, runtime resource 0.13.0 and automatic launch checks NEVER. The app still has its existing explicit update checks; no OTA was published by this work.
- Embedded bundle contains **Open Messages verification** and **Tap to open account verification**. The screenshot's old missing-vault recovery-key message, old manual setup paragraph and **Verify and restore this device** label are absent.
- Official APK: https://expo.dev/artifacts/eas/jPvpoifHAlFCPQBuxNKeJlzI7yKP07fTxIG0LolBt9U.apk

This remains an internal candidate. Public website Android download, AAB/Play Store distribution and OTA were not changed. No Windows installer was produced.

### Web and database state

Web production remains **`dpl_9WFpkutUdP6wL2X7uMvCjRqhQGmm`**, **READY**, source **`87326013f7ddefb1dca56f0a4b2853bd8a50b046`**, aliased to www.comeplayers.com and comeplayers.com. The candidate-18 commit changes native screens only; no new web production promotion or main merge was performed.

Read-only database audit at **2026-09-16 08:35:41.928586 UTC**: generation 0, reset_at null, require_passkey false, rollout_verified false, verified_release null; 67 Auth users, 67 profiles, 1 E2EE account/device, **0 E2EE accounts with a passkey backup**, 0 encrypted events/blobs, 6 group rooms, 42 legacy messages. Preparation migration `20260915134209` appears once.

No reset, dry-run reset, readiness-flag write, migration reapplication or single-device-session change occurred. The approved narrow reset scope remains valid.

### Remaining physical verification

Install candidate 18 as an update without uninstall/clear-data and repeat the two reported screens. Confirm that settings and locked-chat actions reopen verification and that empty history is upright. Then verify actual history restore on a second physical device with the same synced passkey provider and the supported Windows path. No physical result is marked passed from the screenshots, source review, automated tests or artifact inspection.

An existing E2EE identity without a passkey cannot be unlocked merely by updating the APK. A previous verified device can enable the account passkey; if unavailable, use a separately owned test account suitable for pre-cutover passkey testing and keep the production legacy identity protected until all guarded reset prerequisites are genuinely met. Do not ask for a key, token, password or keystore in chat.
