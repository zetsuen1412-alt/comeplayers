# Application environment values

## Android and iOS

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_COMEPLAYERS_API_URL=https://www.comeplayers.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The mobile client is native and uses the API URL only for data requests. It does not render the website URL.

The Supabase URL and anonymous key must match the website project so the same account and row-level security rules apply. The public anonymous key is suitable for a client application when RLS is enforced. Never place a service-role key, payment secret, updater private key, or Google Play service-account credential in the app.

## Desktop

Create `apps/desktop/.env`:

```env
VITE_COMEPLAYERS_WEB_URL=https://www.comeplayers.com
VITE_COMEPLAYERS_API_URL=https://www.comeplayers.com
```
