# ComePlayers applications roadmap

## Native mobile foundation implemented

- Independent React Native interface with no website WebView.
- Native Home, Community, Marketplace, Messages, Conversation, and Profile screens.
- Shared Supabase login and session persistence.
- Shared marketplace, tournament, registration, and chat APIs.
- Native bottom navigation and Android back behavior.
- JavaScript/asset OTA update checks and Google Play binary updates.

## Production hardening next

- Device testing across compact Android phones, tablets, and iOS sizes.
- Push notifications when the app is closed.
- Native attachment and video picker for protected chat.
- OAuth with verified app links.
- Launcher unread badges and deep links.
- Dedicated native product detail and payment handoff states.
- Analytics, crash reporting, accessibility audit, and store review assets.

Voice, video, and screen sharing should be implemented separately with WebRTC/LiveKit, minimal permissions, foreground-service declarations, and Play/App Store testing.
