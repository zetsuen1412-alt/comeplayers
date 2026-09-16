# CPWallet and administration release — 2026-09-17

## Implemented application source
- CPWallet: `31e4a01705f8021f8060284ec76fdba2e082c8c1`, followed by safeguards in `0489aa127c23ade4b948f719fe907e4af49ff7b7`.
- Administration: `4e7f9a20cb7e620fa3397ed6f22f4668f35e2800`.
- Existing work branch: `chatgpt/account-integrated-e2ee-recovery`; PR #1 remains draft/unmerged.
- Production deployment: `dpl_FeGBgMfSb7URYotHJUPZtdyBLRyC`, from administration source above. Verified READY with www.comeplayers.com and comeplayers.com aliases.

## CPWallet behavior
- /wallet shows the authenticated user's balance, transaction history and top-up entry.
- Top-up input and display follow the user's currency preference. Ledger balances remain IDR, preserving existing money records.
- A short-lived server quote fixes the wallet credit and provider amount. DOKU charges IDR through merchant-enabled hosted payment channels. PayPal charges the saved USD quote and requires exact amount, currency and reference verification.
- Credit occurs only after verified provider confirmation, once per payment. Returning to a success URL cannot credit money.
- Marketplace purchases debit available wallet funds atomically. External provider claims prevent a simultaneous wallet payment for the same order.
- Approved order refunds credit the buyer's CPWallet once. Released seller funds and pending external refunds are guarded; restored inventory is protected from double restoration.
- Reversed or inconsistent top-ups are flagged for review and wallet protection. No user-to-user transfer or new bank-withdrawal flow was added.
- Existing manual top-up review remains available alongside automatic payment records.

## Administration
- Shared desktop/mobile workspace with grouped navigation, page finder, currency selection, account link and accessible dialogs.
- Overview uses one database aggregate snapshot, independent of the REST row limit. Completed paid sales and fees exclude unpaid, expired and refunded orders. Wallet customer funds are separate from revenue.
- Orders use server-side search, status filters and 25-row pagination. Order and payment statuses are separate. Financial actions require an explicit action and reason; existing server authorization and transaction guards remain authoritative.
- Legacy module styling is normalized. IDR formatting is corrected in finance, withdrawals, disputes and coupons. Product base prices retain their existing USD semantics.
- Payroll retains its existing authorization/layout. Decorative character art and fabricated trend charts are removed from the main workspace.
- Admin endpoints reject unauthenticated callers. The aggregate function is executable only by service_role, behind requireAdmin.

## Applied database migrations — do not repeat
- `20260916173800_cpwallet_payments`: applied once. Initially authored as `20260916165658`; the repository filename and isolated fixture references are aligned with the actual applied version in this documentation follow-up.
- `20260916182015_admin_workspace_overview`: applied once. Initially authored as `20260916174623`; likewise aligned with the actual version.
- CPWallet migration before/after: 51 wallets, total IDR 5,813,900; identical balance fingerprint `49b60f1c5ac163d2d49ffcd80065aaca`.
- Admin migration adds a read-only aggregate function. Verification: 51 wallets, IDR 5,813,900, 39 orders, 3 completed paid orders, IDR 71,000 completed sales, IDR 3,550 fees, 528 non-deleted products.
- Function privileges verified: anon=false, authenticated=false, service_role=true.
- No E2EE reset, account deletion or balance rewrite was performed in this release. Previously applied messaging and recovery migrations must not be repeated.

## Verification
- [Application CI](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35133681731): source-checks, web-build and sql-policy passed.
- 152 code tests passed; web and mobile typechecks passed.
- PostgreSQL: 50 concurrent credit replay attempts and 100 concurrent purchase attempts completed with zero failures. Ledger assertions, approved refunds and inventory restoration passed.
- Admin aggregate fixture adds 1,005 completed paid orders and verifies the full sum, unpaid/refunded exclusions, liability separation and function privileges.
- Isolated browser fixture used synthetic data and rejected writes: desktop/mobile navigation, search, order filters, currency switching, detail/refund disclosure, Escape focus return, and CPWallet payment administration. No page overflow at mobile width and no console warnings/errors in the checked fixture.
- Preview and production: built admin shell rendered and correctly required sign-in. Four production pages returned HTTP 200; admin overview/orders/wallet-payments and user wallet-payments rejected unauthenticated calls with HTTP 401. This browser has no signed-in ComePlayers admin session; authenticated production interaction has not been verified.
- No live top-up, charge, purchase or refund was executed. Real DOKU/PayPal payment completion remains unverified.
- [Browser/preflight](https://github.com/zetsuen1412-alt/comeplayers/actions/runs/35133681692): browser job passed; EAS-access job remains blocked because Actions EXPO_TOKEN is unavailable. This web release does not require a new Android build.

## Operations
- Review flagged payments at /admin/wallet-topups using saved provider references. Do not manually credit an already credited payment or approve a screenshot as an automatic provider confirmation.
- If only the administration UI needs rollback, `0489aa1` is the previous CPWallet production source. Keep the additive database migrations and financial safeguards; do not reapply or reverse migrations as a UI rollback.
- Android remains original-signed 0.13.0 (19), available through the existing website download endpoint. Its installation and physical device verification are outside this web release.
