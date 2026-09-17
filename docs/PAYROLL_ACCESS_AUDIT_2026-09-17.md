# Payroll delegated access and manual order codes — 2026-09-17

## Continue here
- Repository: `zetsuen1412-alt/comeplayers`; branch: `chatgpt/account-integrated-e2ee-recovery`; PR #1 remains draft and unmerged.
- Implementation: `001897376635aa478aad5cd6f52f814808aef701`.
- Verified production source: `ed99048d59d92a9fc0b17cd4418414105a900654`.
- This follow-up aligns the migration filename with the actual applied version and records the release. Do not reset to an earlier checkpoint.
- Preserve the user's preference: commit and push completed changes and update this handoff so ordinary ChatGPT can continue.

## Delivered behavior
- Admins can grant/revoke full operational payroll access for selected existing accounts at [Payroll access](https://www.comeplayers.com/admin/payroll/access).
- Members sign in with their own account and open [Payroll](https://www.comeplayers.com/admin/payroll) directly. No payroll entry was added to ordinary account menus. The admin workspace retains its entry button.
- Delegation does not change `profiles.role` or grant access to other admin APIs. Legacy payroll and permission management remain admin-only.
- History shows server-recorded editor name/email/ID, server time, revision, affected sections, and paginated before/after details. Permission grants/revocations have a separate audit.
- New payroll order codes must be entered manually. Codes are unique ignoring case and surrounding whitespace, 1–64 characters (letters, digits, dot, underscore, hyphen). Existing historical codes are preserved. Marketplace order IDs are unaffected.
- No additional real account has been granted access. An admin chooses a specific account in the access page.

## Implementation and safeguards
- `requirePayrollAccess` uses verified account authentication, the database profile and an active scoped permission. User metadata and caller-provided editor IDs cannot authorize changes.
- `cp_save_payroll_workspace` checks access again inside the transaction. Save and revocation use the same per-account advisory lock; workspace revision checks and atomic audit writes remain enforced.
- Browser workspace state is cleared after a 401/403 response. The existing visible-page refresh checks permission every 15 seconds while clean; writes always recheck permission.
- Client annotations receive server attribution. Acknowledged attribution is reconciled during overlapping autosaves.
- Duplicate manual codes cannot overwrite an existing order. Synchronous stock reservation and order insertion are batched, and success is shown only after the server acknowledges the save.
- Existing closing calculations, closed-order immutability and period locks are retained.

## Database — applied once
- Project: `uyehruetoxedmookyfcd`.
- Applied migration: **`20260917034322_payroll_delegated_access_audit`**. Do not apply again.
- The original local filename was `20260917031321_payroll_delegated_access_audit.sql`; this follow-up renames it and updates the SQL test include to match the actual Supabase migration version. SQL content is unchanged.
- Adds `cp_payroll_access`, `cp_payroll_access_audit`, server actor snapshots/changed keys on workspace audit, and scoped permission/save functions.
- Verified before/after: workspace revision **0**, empty payload, unchanged hash `99914b932bd37a50b983c5e7c90ae93b`; workspace audit **0**, delegated accounts **0**, permission audit **0**.
- All affected tables have RLS enabled. Authenticated browser roles cannot select ACL/audit tables directly; authorized server routes provide access.
- Security advisor delta: only two INFO notices for RLS enabled without browser policies on the two new server-only tables. This intentionally denies direct browser access. No new warning/error findings. [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- No financial, CPWallet, account, messaging or E2EE reset data was changed.

## Tests
- **16 payroll TypeScript tests pass**: closing calculations/locks, manual reference validation, historical references, duplicate rejection, actor stamping, immutable annotations, multi-section audit, admin/member/denied access, concurrent revocation, admin-only permission management, unauthorized history, clearing revoked browser state, batch rollback and overlapping saves.
- Actual migration and SQL assertions pass in isolated PGlite and PostgreSQL 17.
- [CI run 35178964212](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35178964212): **source-checks, sql-policy and web-build all succeeded**, including full website/mobile typechecks and existing marketplace/CPWallet/messaging/cryptographic regressions.
- Initial CI exposed a test-only cluster role inherited without BYPASSRLS. The isolated fixture now matches Supabase's verified service role; no production role was changed.
- [Browser/preflight run 35178964308](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35178964308): browser tests succeeded; EAS read-access still fails because GitHub Actions lacks EXPO_TOKEN. This pre-existing mobile CI limitation does not block this website release.
- Actual components tested in a browser against synthetic fixtures: admin search/grant/revoke and permission history; member access without admin links; editor identity/before-after history; manual code duplicate rejection; hidden workspace after revocation. No browser console errors.
- Synthetic fixtures did not contact production or grant real permissions.
- Production browser session was logged out: verified the login gate, not a signed-in production grant/save. Do not claim a real member end-to-end test.

## Website deployment — live
- Production deployment: **`dpl_Fs3qziHbE8phmizjnSKWJPuHFvtH`**, source `ed99048d59d92a9fc0b17cd4418414105a900654`, **READY**.
- Rebuilt using the existing project's production environment.
- Aliases verified: `www.comeplayers.com`, `comeplayers.com`.
- Deployment URL: https://evo-gaming-12cks55f9-ilham-evogaming-s-projects.vercel.app
- Live payroll/access/history/new-order page shells return HTTP 200; workspace/history/access/time APIs return HTTP 401 without authentication. Browser access page displays the login gate without exposing data.
- No error/fatal runtime logs found for this deployment during the release check.
- Previous production deployment for rollback: `dpl_4TeYjdKmrd2DSbqhGWkNXQY8M7hj` (source `d2d1ab745674bca70c74b8aa38526da91730e070`). Rolling back the website would remove delegated access UI/API support; do not undo the additive migration casually.

## Admin usage
1. Sign in as an existing admin and open `/admin/payroll/access`.
2. Search the intended account by username/email and verify its identity.
3. Click **Berikan akses payroll**, then copy the direct payroll link.
4. That person logs into the same account and opens the link. Use **Cabut akses** to revoke access.
5. Enter new payroll order codes manually; inspect **History Perubahan** for saved activity.

## Android and prior work
- Android remains **0.14.0 (20)** with the original signing identity; no APK rebuild in this payroll task.
- Download: https://www.comeplayers.com/api/downloads/android/ComePlayers_0.14.0_20_android.apk
- Previous release details: [Mobile CPWallet and performance](MOBILE_CPWALLET_PERFORMANCE_2026-09-17.md).
- The owner previously selected ordinary account login with server-readable messaging (not E2EE). Do not restore superseded passkey-only onboarding or repeat reset/migrations. Keep single-device sessions disabled.

## Remaining user action
No target member account was named. The admin can now select accounts in the live access page. Real signed-in member grant/save/revoke verification remains for the selected accounts; never invent that evidence or seed production payroll data for a test.
