# ComePlayers application architecture

```text
ComePlayers Mobile (native React Native UI) --\
                                          +-- ComePlayers Next.js APIs
ComePlayers Website (responsive web UI) ---+-- Supabase Auth and Database
                                          +-- Chat, Marketplace, Tournaments
ComePlayers Windows -----------------------/
```

## Separate interfaces, shared platform

The Android/iOS app and website are different clients. Mobile uses native screens, lists, forms, navigation, authentication, and conversation views. It does not embed the website in a WebView.

Both clients remain integrated through the same public API and Supabase project:

- one user identity and persisted session;
- one marketplace product catalog;
- one tournament and registration source;
- one protected buyer/seller and community messaging system.

The secure checkout route may open externally because DOKU and payment redirects are already implemented and audited in the website transaction flow.

## Updates

- Website UI: deployed independently.
- Android/iOS JavaScript and compatible assets: EAS Update.
- Android native binary: Google Play App Bundle and Play In-App Updates.
- iOS native binary: App Store/TestFlight release.
- Windows: signed Tauri updater when configured.

A deployment cannot add or change native modules through OTA. Those changes always require a new store build.
