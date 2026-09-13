# ComePlayers E2EE follow-up — 12 September 2026

## Implemented

- Incoming encrypted-call alerts are mounted on the web chat and community Messages shells. They poll while the page is open, expire after 60 seconds, and open the selected private conversation. Answering still goes through the existing device-signed call API and E2EE media-key checks. Existing browser notification permission is respected; permission is not requested automatically.
- The `/chat` list now includes ordinary direct conversations as well as customer/seller chats. Direct contacts from the community contact panel route to the encrypted chat screen.
- Android Profile → Private chat backup & storage now offers Google Drive backup, restore latest Drive backup, encrypted file export and file import.
- Backup reads the active verified v2 vault. Only transferable history, conversation keys, downloaded media and call history are exported. Device credentials, authorization roster, outbox requests, synchronization cursors and root private credentials are excluded.
- Archives are authenticated and encrypted with the user's recovery key. Export verifies that key against the account's existing encrypted identity backup. Restore checks the account root, runs within a single local transaction, and authenticates the archive footer before commit. It never replaces the current device credentials.
- Restoring and replaying history preserve newer edits, deletions, stars and read receipts.
- Google Drive receives an encrypted `.cpbackup` in the app-specific hidden folder, using only `drive.appdata` OAuth permission. The recovery key and Google access token are not sent to ComePlayers. File transfer uses native file streaming instead of loading an entire archive into JavaScript memory.
- Drive backups are explicit user actions. No scheduled backup, cloud retention deletion or paid OTP service was enabled.

## Evidence

- Mobile TypeScript check: passed.
- Web TypeScript and targeted lint: passed.
- Protocol, backup, transfer and incoming-call tests: **47 passed, 0 failed**.
- Browser integration with synthetic accounts and mocked API: encrypted message persisted across reload; posted history contained ciphertext; incoming call opened an ordinary direct conversation from the mobile-width inbox while device verification remained required.
- Screenshots: `C:\Comeplayers-new\tmp\web-e2ee-ui.png`, `C:\Comeplayers-new\tmp\web-incoming-call.png`.
- Android emulator `cp011qa`, Android API 35 x86_64, WHPX acceleration: APK 0.12.1/versionCode 14 installed and launched to the Google/email login screen. No AndroidRuntime or ReactNativeJS error was present in the captured startup log. Screenshot: `C:\Comeplayers-new\tmp\comeplayers-0121-smoke.png`.
- The subsequent OTA smoke test also covers the new bundle: the installed APK 0.12.1 downloaded update `01a0966d-34a6-7fd9-8e18-bce183892581`, then launched it after a restart. Expo's local update database recorded successful_launch_count=1 and failed_launch_count=0 for that ID. No Expo Updates, ReactNativeJS or AndroidRuntime error was recorded on this final startup. Screenshot: `C:\Comeplayers-new\tmp\comeplayers-0121-ota.png`; error log: `C:\Comeplayers-new\tmp\comeplayers-0121-ota-errors.log`. No app data was cleared for this test.
- This smoke test does not validate the new Drive OAuth/transfer flow or two-device calling with real accounts.
- The bundle under `release/android/0.12.1-drive-backup-ota` is an OTA, not a new APK. Its size is 5,515,091 bytes, SHA256 `2ec7c3737d288ffebb9df6fbead3eaa31c55f4c70d2eb91ae8e8c3e1929e685d`.

## Release state

The user explicitly authorized publishing the website source/configuration to Vercel and the Android bundle/assets to Expo production. **Both publications are confirmed and verified.**

- Website: Vercel `evo-gaming`, project `prj_J2lxF1Dv7PsmiWbyj9mea1hoYAl3`, team `team_kNZN2qsJPDid5AP0NJiYxXCZ`. Deployment `dpl_AEfZwwm78Y7e9xPJsdmXixtnwfij` is **READY**, production, with `www.comeplayers.com` and `comeplayers.com` aliases. Deployment URL: https://evo-gaming-9jo8qparr-ilham-evogaming-s-projects.vercel.app .
- A production-browser check with a synthetic account and intercepted backend APIs passed: the published inbox displayed the incoming video-call alert, opened an unselected ordinary direct conversation, and kept device verification required. No production database mutation was made. Screenshot: `C:\Comeplayers-new\tmp\web-incoming-call-production.png`.
- Android: Expo `@comeplayers/comeplayers`, project `a663aa70-99b7-4c8f-93ea-5f8637baa2df`, channel `production`. Current update group `f51e160d-2a3e-40ae-a20c-00a2227b8898`, Android ID `01a0966d-34a6-7fd9-8e18-bce183892581`, published 2026-09-12T16:22:14.438Z. Dashboard: https://expo.dev/accounts/comeplayers/projects/comeplayers/updates/f51e160d-2a3e-40ae-a20c-00a2227b8898 .
- APK 0.12.1/versionCode 14 actually embeds native runtime **0.12.0**, verified directly with `aapt2`. `android.runtimeVersion` in app.json is now explicitly `0.12.0` to match the installed binary. The same JavaScript bundle was first published for runtime 0.12.1 (group `59f6c437-96fa-4935-aa52-4496b9864b6b`), which existing APKs do not request; the subsequent 0.12.0 publication reaches them. No new native module was introduced by this change. Native-library hashes match between the released 0.12.0 and 0.12.1 APKs.
- Public manifest and CDN verification for runtime 0.12.0 confirmed the latest ID above and the exact local bundle size and SHA256. Asset requests used the per-asset headers supplied by Expo's manifest extensions. Evidence: `C:\Comeplayers-new\tmp\expo-production-0.12.0-verification.json`.
- Fingerprint diagnostic upload encountered a DNS failure at Google's storage endpoint; EAS still confirmed publication. Runtime matching, the CDN bundle hash and the actual emulator launch were verified separately.
- Earlier CLI attempts encountered network failures and automatic approval review required specific publication authorization. The user subsequently provided that authorization; approved publication commands proceeded without weakening TLS or changing credentials.
- Expo production currently has no configured public/sensitive environment variables. Its initial automatic rebuild omitted Google/Supabase login configuration and was stopped before update publication. The branch was checked afterward and still contained only the earlier 0.7.0 release. The corrected release uses `--skip-bundler --input-dir ../../release/android/0.12.1-drive-backup-ota` to publish the already reviewed archive, whose embedded public login configuration was verified without exposing its values.
- The website's `.vercelignore` excludes local environment files, signing keys, credentials and local output. Expo OTA publishes the compiled client bundle and assets; public client configuration is embedded as expected.

No additional publication authorization is pending. Before future automatic Expo rebuilds, configure the production public environment or explicitly use a verified prebuilt bundle; do not publish a bundle with missing login configuration.

To receive this OTA, open APK 0.12.1 while online, allow the background download to finish, then fully close and reopen it. The app version remains 0.12.1. Website users can reload the page.

Cleanup on 2026-09-13: the QA emulator was no longer running; no device was attached. The ADB server started for that check was stopped. Release notes and verification artifacts were confirmed on disk.

## Remaining product and security work

1. Confirm Google Drive API is enabled for the existing Google OAuth project, then test consent, upload, restore, quota errors and account selection on a Google-enabled Android device. No real Drive account transfer has been performed in this run.
2. Exercise two verified devices with real accounts for voice/video, media, recovery, revoked devices and interrupted backup restores.
3. Incoming alerts still require the mobile app or web page to be open. Background/terminated-app delivery requires a separate push and call-notification integration.
4. Current cryptography remains the existing HPKE/account-root/conversation-epoch protocol. This change does not implement Signal Double Ratchet, and the checks above are not an independent security audit.

## Independent-review scope and Signal migration preparation

Review account-root recovery and device roster authorization; identity pinning and safety-code verification; epoch key distribution and revocation; history replay and rollback resistance; attachment binding; request proofs; LiveKit encoded-frame E2EE; local encrypted storage; and archive recovery/transaction boundaries. Include compromised server, stolen device, malicious contact, stale backup, reordered history and modified ciphertext scenarios.

Migration to Signal must use a deliberately selected and reviewed client implementation across all supported endpoints. The official libsignal project exposes Java/Android, Swift and native Node/TypeScript interfaces. Its Node API is not a drop-in browser or React Native module. A native bridge, browser strategy, versioned protocol negotiation, multi-device persistence and migration tests are required before enabling a new protocol. Existing stored history must remain readable; never silently fall back to plaintext or claim Double Ratchet for the current epoch protocol.

Primary references:
- https://github.com/signalapp/libsignal
- https://github.com/signalapp/libsignal/blob/main/TESTING.md
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://react-native-google-signin.github.io/docs/api
- https://docs.expo.dev/versions/latest/sdk/filesystem/
