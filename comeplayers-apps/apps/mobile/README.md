# ComePlayers Android & iOS

ComePlayers Mobile is a native Expo/React Native application. It does not display ComePlayers.com inside a WebView. Mobile and website interfaces are independent, while both use the same Supabase account, ComePlayers API, marketplace catalog, tournaments, and protected chat data.

## Native application areas

- Home and discovery feed
- Community rooms and tournament registration
- Marketplace browsing and product cards
- Buyer, seller, direct, and community messages
- Native email/password authentication and account profile
- Bottom-tab navigation and Android back-button behavior

Secure product checkout can open the ComePlayers transaction flow in the system browser. This keeps payment processing in the established DOKU/website flow while the rest of the app remains native.

## Configuration

Copy `.env.example` to `.env` and supply the same public Supabase values used by the website:

```powershell
EXPO_PUBLIC_COMEPLAYERS_API_URL=https://www.comeplayers.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Development and builds

From the `comeplayers-apps` directory:

```powershell
npm install
npm run android
npm run android:apk
npm run android:aab
npm run ios:preview
```

EAS Update delivers compatible JavaScript and asset changes. Native dependency changes still require a new Google Play/App Store binary. Google Play In-App Updates remains enabled for Android production builds.

Publishing iOS requires Apple Developer Program membership and App Store Connect. See `../../GOOGLE_PLAY_RELEASE.md` and `../../AUTO_UPDATE_SETUP.md`.
