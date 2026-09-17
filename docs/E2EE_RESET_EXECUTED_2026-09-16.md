# Private E2EE reset executed — 16 September 2026

## Operator decision and scope

The owner explicitly requested immediate reset and waived the prerequisite results for two physical devices and Windows in the current Codex session. This supersedes that testing prerequisite for this one cutover only. It does not establish that physical update installation, passkey synchronization, history restoration or Windows recovery passed. The E2EE-only data scope and tool approvals remain unchanged.

The transaction committed at **2026-09-16T11:52:09.241719Z** on Supabase project `uyehruetoxedmookyfcd`. A separate read at **11:52:49.907633Z** confirmed the committed state.

- Generation: **0 → 1**; `require_passkey=true`.
- `rollout_verified=false`; `physicalPasskeyRestore=false`, `desktopPasskeyRestore=false`, `physicalUpdateInstallVerified=false`.
- `verified_release` records the actual released artifacts, unverified test status and explicit owner waiver. No false test evidence was inserted.
- Preparation migration `20260915134209` remains applied exactly once. No schema migration or single-device-session change occurred.

## Removed and preserved

| E2EE table | Removed | Remaining after reset |
| --- | ---: | ---: |
| cp_secure_accounts | 1 | 0 |
| cp_secure_devices | 1 | 0 |
| cp_secure_rosters | 1 | 0 |
| cp_secure_epochs | 0 | 0 |
| cp_secure_events | 0 | 0 |
| cp_secure_event_users | 0 | 0 |
| cp_secure_blobs | 0 | 0 |
| cp_secure_usage | 0 | 0 |

All 67 Auth accounts and 67 profiles remain. There are 13 rooms including 6 groups, 42 legacy messages and 1 friendship. No indexed encrypted blobs required R2 removal.

The transaction compared row counts and order-independent row fingerprints for **174 Auth and non-E2EE public tables** within a repeatable-read transaction; all matched. This includes login credentials/sessions, profiles/balances, wallet, products/orders/transactions, payroll and Community/legacy data. Row contents and fingerprints were not exported. The independent post-commit inventory confirmed the aggregate counts above.

## Reviewed transaction and checks

The archived operator script is `website/scripts/operations/reset-private-e2ee-owner-waiver-2026-09-16.sql`. It retains ROLLBACK for review; the executed copy differed only by COMMIT in that position. The original standard reset script remains unchanged.

The one-off exception requires generation zero, the exact inspected inventory (1 account, 1 device, 1 roster; all other reset tables empty), the reviewed account ID, no indexed blobs, no encrypted group data, an enabled generation guard, and no unexpected DELETE/control-table triggers. It locks the E2EE tables and the policy row, deletes only the eight fixed allowlisted tables and compares all protected row fingerprints. No TRUNCATE, broad CASCADE, runtime guard disabling, generation lowering or alternative approval route was used.

The ROLLBACK simulation passed before COMMIT. Both runs verified that the existing enrollment function rejects generation zero after the reset (SQLSTATE 40001) and rejects enrollment without a passkey backup at generation one (SQLSTATE 22023), without enrolling a test account. These are database guard tests, not authenticated end-to-end device tests.

## Releases and post-reset smoke

- Existing production remains `dpl_wntX269pLvtTbgtqfycD4Gu8R4Vn`, READY, web source `5842748604803bfa14eed26e29bd35c0abfe9cd4`.
- Existing APK 18 build `528222d7-3c51-4f66-b21e-e177764ffbb3`, Android source `dd0f459cd9d2df72199d09d140e4ebf650cf5703`.
- APK SHA-256 `86e9e45cff6abdbf7b51dee6b2302808cd83684d5e2c75fa41688046d0a8d1a6`; original certificate SHA-256 `0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2`.
- Official download: https://www.comeplayers.com/api/downloads/android/ComePlayers_0.13.0_18_android.apk
- Post-reset public smoke at **11:53:29 UTC**: live/ready 200 and database ready; secure account/history without login 401 and no private data; categories 200; assetlinks 200 with original signer.
- APK delivery remains 307 → 206 for a one-byte Range request, total 139,143,054 bytes. The earlier complete download/hash/signature evidence is retained; this was not another full download.
- No new web production deployment, APK, OTA, AAB or Windows installer was created for this reset. No main merge occurred.

## User follow-up and limits

Updated clients should fetch generation one, remove only their signed-in account's recognized E2EE vault/cache and offer fresh passkey-protected Messages setup. Reopen the updated app or reload the website. Login alone cannot reconstruct an E2EE secret.

Physical update installation, two-device recovery, Windows recovery and authenticated post-reset enrollment remain **unverified**. This reset does not remotely erase every offline copy, personal export, Drive backup or password-manager passkey. Do not restore old identity snapshots or decrease generation as an improvised rollback.
