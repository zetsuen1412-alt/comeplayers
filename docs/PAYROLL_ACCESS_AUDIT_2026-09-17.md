# Payroll delegated access and manual order codes — 2026-09-17

## User scope
- Admins may grant selected existing accounts full access to the operational payroll workspace without changing their marketplace role.
- Delegated members use `/admin/payroll` directly; no payroll entry is added to ordinary account menus. Admins manage permissions at `/admin/payroll/access`.
- History must identify the authenticated editor for all saved workspace sections.
- New payroll order references are manually entered, required, unique ignoring case and surrounding whitespace, and limited to 64 URL-safe characters (letters, numbers, dot, underscore, hyphen). Existing historical references remain readable.
- Continue updating this branch and this handoff for ChatGPT continuation.

## Implementation
- `requirePayrollAccess` uses the verified login plus database profile/active permission. Metadata and request-provided actors cannot authorize changes.
- Existing workspace/time APIs accept admins and delegated members; permission management and legacy payroll remain admin-only.
- Migration `20260917031321_payroll_delegated_access_audit.sql` adds scoped ACL and permission audit, extends workspace audit with server profile snapshots, and serializes saves with revocation. Revision comparison and atomic audit remain enforced.
- History reads paginated server audit, with before/after details loaded only on demand. The browser clears workspace data when it receives 401/403.
- Manual references no longer replace matching existing orders. Order creation waits for server acknowledgement; stock reservation and order insertion are grouped in the browser before the existing atomic workspace save.
- No additional production user has been granted access. An admin must choose the account in the access page.

## Verification checkpoint (implementation commit)
- 14 local TypeScript regression tests passed, covering existing closing calculations, manual references, forged editor identity, authorization, revocation, and server audit.
- Isolated PGlite executed the actual migration and assertions for admin-only grants, null-role denial, member saves, revocation, revision conflicts, actor snapshots and database privileges.
- Full project typecheck/build and PostgreSQL 17 fixture are configured in GitHub Actions; pending at this commit.
- Local partial-source typecheck cannot resolve unrelated files not downloaded into the isolated work directory; full GitHub CI is authoritative.

## Deployment checkpoint
- Database migration: NOT YET APPLIED at this implementation checkpoint.
- Website production: still the prior `d2d1ab745674bca70c74b8aa38526da91730e070` release until the release update below.
- Before migration, actual production workspace was revision 0 with an empty payload; audit had 0 rows. Recheck before and after migration; do not seed production test data or grant arbitrary accounts.
- Android remains version 0.14.0 (20), original signing identity. No Android change in this task.
- No CPWallet, financial, account messaging or E2EE reset data changes in this task.

## Continuation
1. Require full CI success, inspect the preview and synthetic admin/member/denied flows.
2. Apply only this new migration, verify empty ACL and preserved workspace, check security advisor delta.
3. Deploy/promote the existing Vercel project to production with its production environment.
4. Verify website routes and denied unauthenticated APIs, record actual deployment/migration versions and test results here, update PR #1.
5. Do not claim real member testing or grant real access without a specific account chosen by the user/admin.

Previous mobile/CPWallet release: [MOBILE_CPWALLET_PERFORMANCE_2026-09-17.md](MOBILE_CPWALLET_PERFORMANCE_2026-09-17.md).
