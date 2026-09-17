# Mobile CPWallet and performance release — 2026-09-17

> **Latest continuation:** [Payroll access and audit release](PAYROLL_ACCESS_AUDIT_2026-09-17.md). This mobile release remains valid; follow the latest branch head for payroll changes.

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

## Verified release checkpoint
- Implementation commit: a8dbbd7dafc37179f8a9c3681948fa75a70fa7b9.
- Application CI 35174473770: web build, web/mobile typechecks, source checks and SQL policy/concurrency fixtures passed. 164 code tests passed, including 12 new mobile commerce/chat tests.
- Browser/preflight run 35174473872: real-browser-recovery passed. The separate EAS-access job still fails because GitHub Actions EXPO_TOKEN is absent. The existing authenticated Expo browser session successfully produced the APK below; no replacement project, keystore or token was created.
- Synthetic component browser checks passed: Profile balance, USD/IDR conversion, top-up quote showing exact IDR charge, pending reconciliation without credit, delivered-order filtering/detail, and web account overview. No console errors in these fixtures. Native components were rendered through a local adapter; this is not physical-device evidence.
- Application production deployment dpl_Ax7nbTKTZGc7TQvYTrX7EpJKTCCM is READY, source a8dbbd7, with www.comeplayers.com and comeplayers.com aliases.
- Production checks at 2026-09-17T02:48:11.789Z: account, wallet, top-up, app payment-return and health pages returned 200. Account commerce, wallet payments and order APIs rejected anonymous requests with 401; private/no-store headers remained present.
- Production error/fatal log scan since 2026-09-17T02:41:00Z returned no matching entries at this checkpoint. Real-user Speed Insights is not enabled; no measured physical-device speed claim is made.

## Android 20
- EAS build e290bb3b-a5b7-457e-8820-75c03d95ce7c, finished in 8m 47s from a8dbbd7.
- Version 0.14.0, versionCode 20, runtime 0.14.0, preview channel, com.comeplayers.app.
- APK size 138803610 bytes.
- SHA-256 e40ab1da352f8a25d8be74a2bac05b7b5fa77c2e5cffb610c71c4b1e21e4c396.
- Full apksigner verification passed (v2, one signer), matching the original certificate below. Backup remains disabled and the APK is not debuggable.
- Embedded bundle contains CPWallet, order confirmation and account-storage disclosure. It omits the retired passkey gate and manual 64-character key prompt.
- Staging commit 3e92a1b2ab1caf6871de77ab38684760c41edf86; R2 upload/full byte hash verified at 2026-09-17T02:47:52Z in deployment dpl_3PNXaPJAFAd9jHrF7qJSd8YwiQEW.
- Release key: app-releases/android/0.14.0-20/ComePlayers_0.14.0_20_android.apk.
- Normal Vercel build configuration was restored in d2d1ab745674bca70c74b8aa38526da91730e070. No release-upload command remains in the website build.
- Verified official URL: https://www.comeplayers.com/api/downloads/android/ComePlayers_0.14.0_20_android.apk
- Install over the previous app without uninstalling or clearing data. Physical installation remains unverified.

## Honest remaining verification
Use a real account/device to verify top-up approval, return to app, exact single wallet credit, wallet purchase, delivered/completed order progress, and chat/camera/microphone/call behavior. No live payment, refund, account reset, balance adjustment or physical-device timing measurement was performed.


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

## Final production/download verification
- Website production deployment: dpl_4TeYjdKmrd2DSbqhGWkNXQY8M7hj.
- Source: d2d1ab745674bca70c74b8aa38526da91730e070; READY, aliases www.comeplayers.com and comeplayers.com confirmed.
- Final release CI 35175933742: source-checks, web-build and sql-policy all passed. Browser job in 35175933784 passed; the separate Actions EAS-token job retains the documented missing-token failure.
- Homepage browser inspection confirms Download Android points at ComePlayers_0.14.0_20_android.apk.
- At 2026-09-17T02:58:59.414Z the website returned its signed 307 redirect, storage returned 200, and the complete downloaded file matched 138803610 bytes and SHA-256 e40ab1da352f8a25d8be74a2bac05b7b5fa77c2e5cffb610c71c4b1e21e4c396.
- Windows 0.5.3 download remained available: 307 redirect and HTTP 206 range response, total 4165396 bytes.
- Error/fatal log scan for this production deployment since 2026-09-17T02:53:00Z returned no matching entries at release verification.
- This final documentation commit changes no application runtime. Production intentionally stays on the tested release source above.

## Continue in another ChatGPT/Codex session
1. Inspect actual branch/local changes and PR #1. Fetch latest without reset/force push. The old ec004c0/13997a2 handoff checkpoints are historical, not the continuation head.
2. Start with this document. CPWallet/administration were already implemented and deployed; do not recreate them or replay their migrations.
3. Update the physical Android app to 0.14.0 (20) without uninstalling/clearing data. Collect genuine results for full-app responsiveness, opening/sending chats, media and calls.
4. Verify payment completion with the owner controlling provider approval: top-up once, return/resume reconciliation, exact balance/ledger credit, CPWallet purchase, delivery/completion and approved refund. Automated tests are not evidence of a live financial transaction.
5. If performance remains slow, record device model, app version, network and measured operation timings, then trace the specific API/render path. Do not label remaining delays as E2EE: the selected product mode is account-readable messaging.
6. Keep the same package, Expo project, signing certificate and multi-device sessions. Do not request tokens/passwords/keys in chat. The secure browser Expo build route works even though Actions EXPO_TOKEN is missing.
7. User approval for scoped fixes, website deployment and GitHub updates already exists. Never bypass tool approval or claim physical/financial tests that were not run.
