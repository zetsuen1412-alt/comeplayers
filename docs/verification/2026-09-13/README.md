# Verification evidence — 13 September 2026

These JSON files record the completed release checks; they contain no user credentials, passkeys, private keys, or production message contents.

- `account-recovery-production-result.json`: public Android association, anonymous API protection, Auth relay validation, disabled session flag, homepage link and complete APK download hash.
- `android-013-smoke-result.json`: APK 0.13.0 installed as an update and login screen rendered on the isolated QA emulator, without clearing application data.
- `passkey-ui-result.json`: synthetic Messages UI enrollment and recovery after removing only the test vault. Backend payloads remained ciphertext; production data was not modified.
- `browser-passkey-result.json`: actual Chromium WebAuthn PRF using a virtual authenticator, including runtime-reset recovery and user-verification requirements.
- `session-migration-local-result.json`: local PGlite tests for the prepared single-device migration. This is **not** evidence that the production migration was applied.
- `account-session-ui-result.json`: synthetic replacement-session client behavior. Production session enforcement remains disabled.

Local screenshot paths inside the records identify QA artifacts on the original workstation; the screenshots are not included here. The physical-device Google Password Manager synchronization flow remains untested. These checks are not an independent cryptographic security audit.
