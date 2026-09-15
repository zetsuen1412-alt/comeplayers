# Account-integrated E2EE recovery — 15 September 2026

## Approval and scope

The owner explicitly approved resetting all E2EE identities, device authorizations and old encrypted private history in the ChatGPT conversation on 15 September 2026. This is NOT approval to delete ComePlayers login accounts or business records.

Preserve Google/email authentication accounts, passwords, profile IDs, balances, wallets, orders, products, transactions, payroll, Community/group rooms, friendships, and pre-E2EE legacy messages. Do not enable SINGLE_DEVICE_SESSIONS_ENABLED or its separate migration as part of this work.

Read-only production inventory during preparation: 67 Auth users, 1 cp_secure_accounts row, 1 cp_secure_devices row, 0 cp_secure_events, 0 cp_secure_epochs, 0 cp_secure_blobs, and 6 group rooms. These are a point-in-time observation, not hardcoded deletion predicates. No customer secrets or message bodies were read for the inventory.

## Delivery state

Work branch: chatgpt/account-integrated-e2ee-recovery. Original main baseline: 0b81bd4b28656bf86c946739deb1ae33f3816b1b. Previous mobile-only change: 4ac4ab1dfa710a468aaa3dfedade8d058ecb4c78.

This change prepares source and guarded rollout files. It does not itself deploy Vercel, publish an Android update, apply a Supabase migration, or execute a production reset. At the preparation checkpoint production still ran baseline 0b81bd4; do not describe this branch as live.

## User experience and security boundary

Normal flow: sign into ComePlayers, then confirm the account's synced passkey with the device's own security when necessary. No recovery-key input or plaintext recovery-key export is presented in the new enrollment screens. On an already verified device, account identity is checked and the local vault opens without re-enrollment.

This is NOT Google/email login alone cryptographically decrypting messages. A passkey with PRF support and backed-up status is still needed. Cancellation, an unsupported credential provider or a missing passkey never falls back to server-readable keys or plaintext messages. The PRF, root secret and derived backup key stay client-side. Existing cryptographic formats and signature validation remain in place.

The old numeric/hex recovery format remains in lower-level protocol/archive code for compatibility; removing an input is not the same as replacing established cryptographic algorithms. After the approved identity reset, backups for the old identity are not imported into the new identity.

## Source changes

- Web: separate the verified conversation view from enrollment; account passkey is the only enrollment path; explicit selection at the eight-device limit; re-check account and generation after passkey prompts; retry an acknowledged enrollment without inventing another identity after a lost response.
- Android: matching passkey enrollment, no auto-created credentials on mount, synchronous double-submit guard, safe refresh, and the ability to leave Messages setup to use other app features. Backup/restore actions unlock the account passkey directly, rather than keeping a manual recovery key in React state.
- Web/Android: the same recoveryPolicy.ts validates public reset metadata. A monotonically increasing generation authorizes deletion of only the signed-in account's old private vault. Missing accounts, errors and identity mismatch alone do not authorize deletion. Local Auth/application storage is not cleared.
- Database/API: an additive control row starts at generation zero. The new enrollment wrapper serializes with reset and checks the expected generation. A database trigger also rejects older deployment enrollment after cutover, even if a retained old API URL is called.
- Desktop: the Tauri launcher points to the hosted website, so the web enrollment change is shared. Native WebView passkey/PRF behavior still needs a real Windows test; this commit does not claim a newly built desktop installer.

## Verification recorded in this chat runtime

Executed: nine recovery-policy unit tests passed; the standalone policy helper passed strict TypeScript checking. The test harness uses transpilation plus Node's test runner. This is NOT a successful whole-project typecheck, build, native integration test or independent cryptographic audit.

A read-only GitHub Actions workflow is provided for locked-dependency website/mobile typechecks, existing cryptographic tests, policy parity, a website build with dummy configuration, and an isolated PostgreSQL test. Read the actual run status before claiming any of those passed. The SQL test deliberately stubs the existing authorization procedure and tests only the new SQL guard; existing signature/encryption tests cover the real protocol separately.

Not yet verified at this checkpoint: full application CI results, UI behavior with native credentials, two physical devices using the same synced password manager, Windows embedded-browser PRF, signed Android update installation, and production smoke tests. Installed node_modules/next/dist/docs were not available in the chat runtime; official Next.js Request/Route Handler documentation was consulted instead. Review the installed framework guidance during the full build.

## Required rollout order

1. Run CI and review this branch. Fix all new TypeScript/build/test failures. Test cancelled and unsupported passkeys, concurrent enrollment, eight-device replacement, interrupted reset cleanup, offline/reconnect, account switching and old-client rejection. Do not interpret mock tests as physical-device recovery tests.
2. Apply only website/supabase/migrations/20260915120000_account_recovery_policy.sql. It is additive: generation=0 and require_passkey=false. Existing production clients remain compatible at generation zero. Deploying the new account API before this migration yields a deliberate 503, so do not reverse this order.
3. Deploy and verify the web source, and ship a signed Android update using the existing signing identity and compatible runtime. No new native dependency is introduced here. Never publish the passkey-native bundle to the old 0.12 runtime. Confirm Windows passkey behavior or complete a reviewed desktop-compatible recovery path before marking desktop ready.
4. On isolated test accounts, verify enrollment and actual ciphertext restoration across two physical devices. Confirm no 64-character entry is needed, no private keys are sent in API payloads, and account/business features remain accessible if Messages setup is cancelled. Record exact web commit/deployment and signed APK SHA256 in verified_release, with physicalPasskeyRestore and desktopPasskeyRestore true only after those tests really pass. Set rollout_verified=true only after this release verification.
5. Recheck production inventory and run website/scripts/operations/reset-private-e2ee.sql as a dry run. It ends in ROLLBACK. It refuses to proceed without release evidence, if reset already ran, if group encrypted data is present, or if encrypted R2 objects exist. If blobs are present, stop and implement an exact-key, verified object cleanup before deleting their DB index; do not bulk-delete any bucket.
6. At controlled cutover, after an identical successful dry run, execute the reviewed reset transaction with COMMIT instead of its final ROLLBACK. The owner has already approved the narrow data scope; release readiness is a separate technical gate. Do not run the destructive step merely because the consent exists.
7. Verify generation=1, require_passkey=true, empty old E2EE rows, preserved Auth/profile/business/community records, fresh passkey enrollment, recovery on another device, and rejection of stale-device writes. Store aggregate counts, not private keys or message contents, in reset_summary.

## Operational limits

The reset script does not delete login accounts, user_security_devices, business tables, Community rooms or chat_messages. It does not delete personal exports, Google Drive files, old passkeys in password managers or copies on offline devices. Recognized local vault cleanup happens when a supported updated client next reaches the service; this is not a guarantee of remote physical erasure of every historical copy.

The first bootstrap now requires a successful account/policy check before exposing a local encrypted vault. Network failure therefore keeps Messages locked rather than silently trusting stale reset state; other application areas remain available on mobile. Test this behavior explicitly.

Before destructive cutover, code rollback and generation-zero compatibility remain possible. After cutover, reverting only the application code cannot recover deleted identities/history and the database guard intentionally blocks old enrollment. Do not disable the guard, reset generation backwards, or mix old snapshots with new identities as a quick rollback.
