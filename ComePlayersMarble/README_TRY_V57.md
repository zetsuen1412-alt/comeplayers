# ComePlayers Marble V57 — Supabase Realtime Rooms

## What V57 adds

V57 upgrades the V56 online foundation with an optional Supabase transport for cross-device room creation, invite-code joining, private Realtime Broadcast, Presence, ready-state sync, reconnect metadata, and latency checks. Local Solo, Team, Ranked, AI, replay, and career modes continue to work when Supabase is not configured.

V57 synchronizes the online lobby and room state. The authoritative board-turn protocol is intentionally left for the next networking milestone; do not market V57 as a finished public competitive multiplayer release.

## Requirements

- Cocos Creator 3.8.8
- Node.js 20 or newer
- A Supabase project for online-room testing

## Install dependencies

Open a terminal in the `ComePlayersMarble` folder:

```bash
npm ci
```

The project pins `@supabase/supabase-js` to the exact version in `package-lock.json`.

## Configure Supabase safely

Edit:

```text
assets/scripts/network/SupabaseProjectConfig.ts
```

Fill only the Project URL and the **publishable** key:

```ts
export const BUNDLED_SUPABASE_CONFIG = {
    projectUrl: 'https://YOUR_PROJECT_REF.supabase.co',
    publishableKey: 'sb_publishable_REPLACE_ME',
    privateChannels: true,
    autoAnonymousAuth: true,
} as const;
```

Never paste a `service_role` key or an `sb_secret_` key into the Cocos client. V57 rejects those values at runtime.

## Supabase dashboard setup

1. Enable Anonymous Sign-Ins in Authentication if you want guest players.
2. Open the SQL Editor.
3. Run:

```text
supabase/migrations/20260719031721_marble_v57_realtime_rooms.sql
```

4. In Realtime Settings, disable public channel access so private-channel authorization is enforced.
5. Keep the generated room and membership tables exposed only to the authenticated role with the included RLS policies.

## Preview online rooms

1. Add the `ComePlayersMarble` folder to Cocos Dashboard.
2. Open it with Cocos Creator 3.8.8.
3. Open `assets/scenes/Match.scene`.
4. Press Preview.
5. Open **ONLINE**.
6. Press **CREATE ONLINE ROOM**.
7. Copy the six-character invite code.
8. Open a second browser profile or Incognito window.
9. Open **ONLINE**, press **JOIN BY INVITE CODE**, and enter the code.
10. Toggle ready status, use **SYNC ROOM NOW**, and test **PING REALTIME**.
11. Reload one client and use **RECONNECT SERVER**.

## Offline fallback

Leave the two bundled config strings empty to use only local play. The Online Center will show `CONFIG_REQUIRED`, while all offline game modes remain available.

## Save migration

V56 local-save version 5 automatically migrates to V57 local-save version 6. The online profile upgrades from version 1 to version 2 and receives safe Realtime defaults. Existing settings, characters, inventory, career, missions, Ranked data, friend-room resume data, cloud manifests, and replay records are preserved.

## Verification boundary

The source was type-checked and tested with deterministic adapters. A live two-device Supabase session was not executed in the build environment because no project credentials were supplied. Apply the migration and perform the two-browser test before production deployment.
