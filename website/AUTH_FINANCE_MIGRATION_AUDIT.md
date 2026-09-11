# Auth, Finance, and Migration Audit

Branch: `codex/auth-finance-migration-tests`

## Auth V23.1

- Login, register, forgot password, email verification, and reset password now use a shared `/auth/confirm` callback path for Supabase email links.
- Callback redirects are sanitized to local application paths only.
- `/auth/confirm` keeps the `useSearchParams()` logic behind a Suspense boundary, matching Next.js 16 prerendering guidance.
- Supabase browser client initialization is lazy to avoid Next.js 16 build-time environment access while still using static `NEXT_PUBLIC_*` references that can be bundled for the browser.
- Remember-me storage now migrates Supabase auth tokens between local and session storage and avoids resurrecting stale local tokens when session-only mode is selected.
- Auth modal and reset password page now expose status/error regions and HTML validation for key inputs.
- `components/LoginModal.tsx` appears to be legacy/unused; `app/components/MainHeader.tsx` uses the V23.1 `components/auth/AuthModal.tsx`.

## Finance Flow Audit

- Checkout order creation still uses `create_marketplace_order_v13` and immediately applies `cp_apply_seller_tax_v23`.
- If V23 seller tax snapshot creation fails, checkout releases the reservation and cancels the created order.
- Order completion still releases escrow through `complete_order_and_release_escrow_v23`.
- Withdrawal quotes still use `cp_quote_withdrawal_v23`.
- Admin withdrawal processing still uses `cp_admin_process_withdrawal_v23`.
- Dispute buyer-win refund paths still route through `cp_admin_finalize_order_refund`.
- Dispute seller-win completion still routes through `complete_order_and_release_escrow_v23`.
- Financial formulas were not changed.

## Migration Audit V3-V23

- Added `scripts/migration-registry.json` as an explicit dependency registry.
- V15 is recorded as a documented gap because V16 docs reference it but no V15 install or migration file is present.
- V17 is recorded as `no_schema_change`.
- Standalone SQL files are recorded separately because they were not part of the V3-V23 canonical chain.
- Static checks now prevent broad schema/table grants to `anon`, `authenticated`, or `PUBLIC`, and prevent deprecated `auth.role()` policies.
- Static checks now assert V22/V23 finance RPCs revoke browser roles and grant execute only to `service_role`.
- Runtime contract checks now assert checkout, escrow release, withdrawal quote/request/admin approval, and dispute refund paths do not call legacy V22 finance RPCs.

## Added Coverage

- Unit/integration tests cover auth redirect sanitization, remember-me session storage migration, seller-approved access boundaries, finance route contracts, and migration registry consistency.
- Playwright coverage was added for mocked register/email verification, forgot-password callback URL, auth callback token verification, reset-password accessibility, and gated finance lifecycle journeys.
- Finance lifecycle Playwright tests are intentionally opt-in via `E2E_FINANCE_CRITICAL=1` and seeded storage-state/fixture inputs because they mutate checkout, order, withdrawal, admin, dispute, and refund state.

## Remaining Live Verification

These require a connected Supabase project or local Supabase stack:

- Run Supabase advisors for RLS, SECURITY DEFINER, and exposed API grants.
- Compare live columns/functions against the registry chain after applying V3-V23.
- Confirm all public `SECURITY DEFINER` functions have expected EXECUTE grants in the live database.
- Run mutating Playwright finance lifecycle tests only against seeded staging fixtures.
- Install Playwright Chromium locally before running browser tests in this workspace.
