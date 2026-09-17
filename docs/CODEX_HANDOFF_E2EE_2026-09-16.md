# Codex handoff: finish account-integrated E2EE recovery

> **Historical handoff — superseded on 17 September 2026.** Continue from [Payroll access and audit release](PAYROLL_ACCESS_AUDIT_2026-09-17.md) and the latest PR #1/branch head. The owner later selected ordinary account login with server-readable messaging (not E2EE). Website CPWallet/admin and Android 0.14.0 (20) are released. Do not restore an old checkpoint, repeat migrations/reset, or follow the original passkey-only product target below as current instructions.

Prepared 16 September 2026 at the owner's request to continue in Codex, using their selected GPT-6 Astra / Extra high reasoning setting. This file transfers project context; it does not launch Codex or change the actual model setting.

## Start from the existing work, not main alone

- Repository: `zetsuen1412-alt/comeplayers`.
- Working branch: `chatgpt/account-integrated-e2ee-recovery`.
- Existing PR: #1, Account passkey recovery and guarded private E2EE reset.
- Last verified implementation commit before this documentation-only handoff: `13997a2718f005675945d19fcc5403cbba23c499`.
- Original main baseline: `0b81bd4b28656bf86c946739deb1ae33f3816b1b`.

PR #1 was open, draft and unmerged when checked for this handoff. Fetch current branch/PR state before editing. This document's commit will advance the branch beyond the implementation checkpoint above. Do not reset the branch backwards to that checkpoint or overwrite subsequent work. Preserve uncommitted local work; inspect `git status` and remotes, and use a separate worktree when appropriate. Do not use `git reset --hard`, blanket cleanup, force pushes or blanket staging of secrets/build outputs.

Read the applicable AGENTS.md files and `website/AGENTS.md`; before changing Next.js code read the relevant installed `node_modules/next/dist/docs/` guidance. Also read:

1. `docs/ACCOUNT_RECOVERY_ROLLOUT_2026-09-15.md`.
2. The current PR #1 description, comments, changed files and check results.
3. `comeplayers-apps/ACCOUNT_RECOVERY_FOLLOWUP_2026-09-13.md` for historical signing/runtime evidence, not as the latest delivery status.
4. `comeplayers-apps/scripts/recovery-release-preflight.mjs` and the recovery workflows in `.github/workflows/`.

## Owner's goal and approved data scope

Finish the existing implementation so ordinary Messages setup/recovery does not ask players to type or save a 64-character recovery code. The agreed secure experience is ComePlayers account login, then the synced account passkey/device-security confirmation when necessary. Reuse an already verified local vault where valid. Do not promise that Google/email login alone can reconstruct a missing E2EE secret.

The owner explicitly approved resetting all E2EE account identities, encrypted key backups, E2EE device authorizations and old privately encrypted history. Do not ask again for the same scope merely because execution moves to Codex. That approval does not remove release-readiness checks, tool approvals or the need to clarify a newly expanded destructive scope.

Preserve login accounts/passwords/profiles, balances, wallets, products, orders, transactions, payroll, Community/group rooms, friendships and pre-E2EE legacy messages. Do not enable `SINGLE_DEVICE_SESSIONS_ENABLED` or apply the unrelated single-device-session migration. Do not treat old notes about automatic logout as permission to add it here.

Keep root secrets, device secrets, PRF output and plaintext backup-unlock material client-side. Cancellation or unsupported PRF/passkey providers must not silently fall back to plaintext messages or server-readable keys. Keep existing signature, device-proof and epoch-chain verification. This remains the existing account-root/HPKE/epoch protocol, not Signal Double Ratchet, and passing tests is not an independent security audit.

## Verified evidence and its limits

The following run results for implementation commit `13997a2718f005675945d19fcc5403cbba23c499` were read again for this handoff:

- Account recovery checks, run `34977509242`: source job `104409467164` and SQL job `104409466743` succeeded. This covers full web/mobile TypeScript checks, 26 policy/passkey/storage/server tests, 32 private recovery/multi-device/history/backup tests, helper parity, the website build with dummy configuration, and isolated PostgreSQL checks.
- Recovery browser and Android preflight, run `34977509255`: browser job `104409310938` succeeded. Seven browser tests use real Chromium WebAuthn PRF and IndexedDB with a virtual authenticator and synthetic, network-isolated accounts. The Android configuration/signing-association check also succeeded.
- The same preflight run's EAS access job `104409310558` failed at the missing `EXPO_TOKEN` prerequisite. Therefore that workflow as a whole is not green. Do not mark this prerequisite as passed or skip it just to obtain green checks.

The recorded test total is 65 passed across the three test groups. There is no demonstrated synchronization through Google Password Manager across two physical devices, no newly published Android build from this work, and no demonstrated Windows WebView PRF recovery. Browser fixtures are not full production UI/device tests. Check new commits independently; these results apply to the implementation checkpoint, not arbitrary later changes.

Evidence:
- https://github.com/zetsuen1412-alt/comeplayers/pull/1
- https://github.com/zetsuen1412-alt/comeplayers/actions/runs/34977509242
- https://github.com/zetsuen1412-alt/comeplayers/actions/runs/34977509255

## Database preparation is already applied; reset is not

The recorded connected Supabase project is `uyehruetoxedmookyfcd`. The additive migration is already applied as version `20260915134209`:

`website/supabase/migrations/20260915134209_account_recovery_policy.sql`

Do not apply it a second time under the earlier prepared filename `20260915120000_account_recovery_policy.sql`. Do not rewrite remote migration history. Inspect the actual migration list and schema first.

Last recorded post-migration state on 15 September: generation 0; reset_at null; require_passkey false; rollout_verified false; 67 Auth users; 1 E2EE identity and 1 E2EE device; 0 encrypted events/blobs; 6 Community group rooms. These are historical inventory observations, not fixed expectations for today's production data. Re-query aggregate counts and control state immediately before any deployment/cutover. Never retrieve customer message contents or secrets just to prepare inventory.

No E2EE deletion, main merge, Vercel deployment or Android/OTA publication was performed by the preceding recovery work. This handoff changes documentation only. Verify actual connected state rather than assuming it remains unchanged since the last audit.

## First actions in Codex

1. Inspect the local worktree, current branch, PR and rollout record. Continue the existing implementation rather than rebuilding Messages or revisiting the approved design from scratch.
2. Determine which release tools/authentication are actually available in this Codex environment. The missing GitHub Actions `EXPO_TOKEN` does not prove the owner's local PC lacks an authenticated Expo CLI session. Check an existing authorized local Expo/EAS session or configured secure environment without printing token values. The previous chat did not confirm the owner added the secret. Do not assume it now exists.
3. Check the existing trusted local Android signing setup as an alternative to EAS when appropriate. Reuse the same application and signing identity; do not initialize a replacement EAS project or create a new keystore to get past a blocker. If access really is absent, ask only for the specific secure sign-in/secret configuration needed, while completing independent review/tests.
4. Review remaining integration risks and add targeted tests where needed: cancellation, concurrent enrollment and lost responses, account switching, generation changes during enrollment/sync/restore, interrupted cleanup, stale-device rejection, eight-device replacement, and offline/reconnect behavior. Keep non-Messages features usable when Messages setup cannot finish. Check generation-zero behavior for existing accounts before publishing a UI that removes manual recovery.
5. Read and run the actual workflow commands. Install the locked website and application workspaces before cross-platform checks. Run private protocol tests with the website TypeScript alias configuration; two earlier CI failures were configuration issues already corrected, not reasons to omit those tests. Re-run all affected checks after source changes.

## Release constraints

Android identity from the existing project:

- Package: `com.comeplayers.app`.
- EAS project: `a663aa70-99b7-4c8f-93ea-5f8637baa2df`, owner `comeplayers`.
- Source version/runtime checkpoint: 0.13.0; versionCode 15 before a new release.
- Expected original signing certificate SHA256: `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`.
- Domain association: `website/public/.well-known/assetlinks.json`.

Validate the actual candidate artifact's application ID, monotonically increasing versionCode, runtime compatibility, certificate and SHA256. Check remote versioning rather than assuming the next unused version number. A debug-signed or new-certificate APK cannot replace the installed release. Inspect the signing plugin/fallback and fail the release if the original signing setup is unavailable. Do not publish this native-passkey bundle to runtime 0.12.0. If considering an OTA for a compatible installed 0.13.0 build, verify runtime/native compatibility and the secure existing publication path explicitly; do not silently repoint channels or infer compatibility from a filename.

The desktop shell uses the hosted website, but a website build does not establish native Windows WebView PRF support. Test it or finish a reviewed compatible path. Do not claim an installer was built unless it was actually built and inspected.

Never request that tokens, passkeys, keystores or passwords be pasted into chat or committed. Keep release secrets in the already authorized secure build environment. Do not log them or pass them to unrelated dependency-install steps.

## Controlled cutover order

Review/test the code, verify the already-applied generation-zero database preparation, then deploy a compatible verified web release and ship the compatible signed Android update. Preserve current users during staging. Install the update over the old app without uninstalling or clearing user data. Test actual encrypted-history restoration across two physical devices using the same synced password manager and check the supported Windows path.

Only after actual release/device verification, record exact source commit, deployment ID, Android artifact SHA256 and genuine test results in `verified_release`. Never mark `physicalPasskeyRestore`, `desktopPasskeyRestore` or `rollout_verified` true using synthetic evidence.

Inspect and dry-run `website/scripts/operations/reset-private-e2ee.sql`. It ends in ROLLBACK and must retain the checks for release evidence, one-time generation, encrypted group data and encrypted object cleanup. Stop if indexed R2 blobs exist; implement verified deletion by exact object key before deleting the index. Never bulk-delete a bucket or use broad CASCADE deletion. Keep aggregate before/after proof for protected login/business/Community records.

At a genuinely ready cutover, execute only the reviewed narrow reset transaction using COMMIT instead of the final dry-run ROLLBACK. The owner's scope approval is already present, but all current tool/platform safeguards still apply. Verify new generation/enrollment, stale-client rejection and preserved protected data. Do not lower generation, disable the guard or mix old identity snapshots into new accounts as an improvised rollback.

This reset does not erase personal exports, Drive files, password-manager passkeys or every offline copy. Local cleanup can occur only when an updated client connects; report that accurately.

## Completion report to the owner

Respond in Indonesian; write code and comments in English. Report actual edits, branch/commit/PR, commands and test results, web deployment status, Android artifact/signature verification, device tests and database reset state separately. Distinguish done, not done and blocked. Update the rollout record and PR with verified evidence. Do not call the job complete merely because the UI no longer contains the recovery-code field, or merely repeat the previous plan without performing the next feasible work.


## 2026-09-16 11:52 UTC — reset executed with explicit device-test waiver

The owner subsequently instructed Codex to skip the two-physical-device and Windows test results and reset immediately. The E2EE-only reset committed at 11:52:09.241719 UTC. Generation is now 1 and passkey enrollment is required. The one identity, device and roster were removed; all 174 protected Auth/non-E2EE tables matched within the transaction. Physical/Windows tests and rollout_verified remain false; no test result was fabricated. This later explicit instruction supersedes the earlier device-test execution prerequisite for this cutover only, not the protected-data scope, runtime guards or tool approvals.

See [the executed reset record](E2EE_RESET_EXECUTED_2026-09-16.md) for exact inventory, releases, checks, unverified flows and the archived ROLLBACK script. Do not repeat the reset or lower generation.
