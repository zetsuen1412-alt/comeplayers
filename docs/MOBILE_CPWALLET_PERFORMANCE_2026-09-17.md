# Mobile CPWallet and performance release — 2026-09-17

## Continuation point
Continue branch `chatgpt/account-integrated-e2ee-recovery`, PR #1.
Base before this work: `f23f6ed2227e0e81b9f0b35a09a1c65d96c4212f`.
Do not reset to an earlier handoff/checkpoint. Read the latest commits and this document.

## Implemented
- Mobile Profile: account-scoped CPWallet balance, currency preference, top-up history/activity, order counts and delivery progress.
- Mobile checkout: signed server quote before creating an order; exact IDR amount before CPWallet debit or DOKU; PayPal USD quote before approval.
- DOKU card, virtual account, QRIS, DOKU Wallet, PayPal and CPWallet order payment UI. Top-ups use the methods enabled in hosted DOKU checkout and PayPal.
- Provider return URLs use the canonical website and a reference-only mobile deep link. A return never means paid. Owned intents reconcile against provider state. Unapproved PayPal remains pending.
- Web account overview: balance, top-up access, recent orders and status counts. Cursor-paginated buyer orders, restricted legacy email fallback.
- Message acknowledgements follow durable message/room writes without waiting for provider push delivery. Next.js after() handles notifications; failures are logged and do not report an already saved message as failed.
- Foreground conversation Realtime invalidation, coalesced refresh, 40-message initial page, unchanged snapshots retained, read receipts only when needed. Polling fallback remains available. In-flight HTTP requests are aborted on timeout.
- Marketplace FlatList virtualization, delayed loading of Community, News, Marketplace and call UI, stable profile requests across token refreshes, FX fetch deferred until commerce is used.
- Android runtime/app version 0.14.0 prevents an older 0.13.0 OTA from replacing this UI. Original Expo project/package/signing stay in place; EAS owns the remote version code.

## Local checks at implementation checkpoint
- Full native TypeScript check: passed.
- 12 new executable tests: status parity, owner filter, cursors, malicious links, IDR totals, payment reconciliation/owner checks, and saved-message acknowledgement independent of push failures.
- Windows tsx cannot call os.userInfo in this environment; a local TypeScript require loader ran the same tests. CI uses tsx normally.
- Supabase read-only inspection confirms chat_messages, chat_rooms and chat_message_reactions are already in supabase_realtime. Existing participant/channel SELECT policy remains unchanged.
- Production order status/required-column checks passed. No migration is needed for this release.

## Pending release work (do not claim completed)
1. CI website build/typecheck, new regression tests and existing recovery/payment/SQL checks.
2. Browser verification of web/native-component fixtures and production routes.
3. EAS preview APK build from the latest reviewed source; verify version, package and original signing certificate.
4. Publish the APK through the existing R2 release/download pipeline.
5. Deploy/promote the reviewed website and verify live routes.
6. Update this document and PR with actual build/deployment/test identifiers.

## Fixed identities and previous artifacts
Expo project: a663aa70-99b7-4c8f-93ea-5f8637baa2df; owner/slug comeplayers/comeplayers.
Android package: com.comeplayers.app.
Original certificate SHA-256: 0a75bc67bf7e34ba4e80a1dbb40cd9b8a3e91c6cb2204a742b5493512bd48cf2.
Previous APK: 0.13.0 (19), EAS build 09b3612f-d7c8-4eb4-92c8-690876b70ebb.
Previous APK URL: https://www.comeplayers.com/api/downloads/android/ComePlayers_0.13.0_19_android.apk
Previous production web deployment: dpl_FeGBgMfSb7URYotHJUPZtdyBLRyC, source 4e7f9a20cb7e620fa3397ed6f22f4668f35e2800.
Supabase: uyehruetoxedmookyfcd. Vercel project: prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3.

## Data/security boundaries
No balance changes, real payments, account resets or migrations performed in this work.
Do not replay migrations 20260916173800 or 20260916182015.
No repeat of the historical E2EE reset. Account-readable messaging was explicitly selected by the user; single-device sessions remain disabled.
Keep accounts, wallets, products, orders, Community and groups.
User authorized website deployment and GitHub updates. Never collect passwords, tokens or signing keys through chat.
Physical-device speed, incoming-call reliability and real provider payment completion still require genuine device/payment evidence; do not invent it.
