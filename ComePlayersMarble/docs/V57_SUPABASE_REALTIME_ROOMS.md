# V57 Supabase Realtime Room Architecture

## Scope

V57 implements the first real transport adapter for ComePlayers Marble. It connects the existing V56 profile and friend-room contracts to Supabase Auth, RPC, private Realtime Broadcast, and Presence while retaining a complete offline fallback.

The synchronized scope is:

- Authenticated room creation.
- Invite-code room joining.
- Four player slots and two spectator slots.
- Solo and Team room metadata.
- Presence join/leave state.
- Ready-state Broadcast.
- Host room-state Broadcast.
- Reconnect metadata and status.
- Round-trip heartbeat timing.

The board simulation remains local in V57. A later authoritative-match protocol must own dice requests, validated actions, timers, turn sequencing, anti-cheat checks, and snapshot recovery.

## Client security model

The Cocos client accepts only:

- `sb_publishable_...` keys.
- Legacy anon JWT keys for compatibility.

It rejects:

- `service_role` values.
- `sb_secret_...` values.
- Non-HTTPS project URLs except localhost development.

The bundled config is stored in `SupabaseProjectConfig.ts`. A runtime override may be installed through `globalThis.COMEPLAYERS_SUPABASE` before the game initializes.

## Database model

`marble_realtime_rooms` stores:

- Invite code.
- Private topic.
- Host authenticated user ID.
- Solo or Team mode.
- Lobby, Match, or Closed phase.
- Bounded settings JSON.
- Player and spectator capacity.
- Creation, update, and expiration timestamps.

`marble_realtime_room_members` stores:

- Authenticated user membership.
- ComePlayers profile identity.
- Display name.
- Player or spectator role.
- Ready state.
- Optional Blue or Gold team.
- Connected and last-seen state.

Both tables have RLS enabled. Direct unauthenticated access is revoked. Room creation and invite-code joining use narrowly scoped RPC functions that verify `auth.uid()` and return only the room registry needed by the client.

## Realtime authorization

Private channel topics use the form:

```text
marble-room:<room-uuid>
```

RLS policies on `realtime.messages` permit Broadcast and Presence only when the authenticated user has an active membership for the requested `realtime.topic()`.

The reconnect token is never included in the Broadcast room payload. It remains local resume metadata.

## Presence and Broadcast responsibilities

Presence is used for slow-changing connection state:

- Profile identity.
- Display name.
- Player or spectator role.
- Ready state at subscription time.
- Optional team.

Broadcast is used for low-latency room events:

- `room_state`
- `ready_state`
- `heartbeat`

Host room-state broadcasts are normalized before persistence. Incoming fields are bounded and sanitized before entering the local save.

## Failure behavior

When configuration is missing or a Realtime action fails:

- The saved connection state becomes `CONFIG_REQUIRED` or `ERROR`.
- The last error is bounded and displayed in Online Center.
- Existing local profile, room, career, and replay data remain intact.
- Offline matches remain playable.
- A failed persistence operation rolls the profile back to its prior value.

## Files

- `assets/scripts/network/SupabaseProjectConfig.ts`
- `assets/scripts/network/SupabaseRuntimeConfig.ts`
- `assets/scripts/network/SupabaseRealtimeRoomAdapter.ts`
- `assets/scripts/network/RealtimeMultiplayerService.ts`
- `assets/scripts/save/OnlineProfileData.ts`
- `assets/scripts/save/LocalSaveData.ts`
- `assets/scripts/save/LocalSaveService.ts`
- `assets/scripts/core/OnlineProfileService.ts`
- `assets/scripts/core/GameBootstrap.ts`
- `assets/scripts/ui/FrontEndCatalog.ts`
- `assets/scripts/ui/FrontEndShell.ts`
- `supabase/migrations/20260719031721_marble_v57_realtime_rooms.sql`

## Production checklist

- Use a dedicated Supabase project or isolated environment.
- Enable anonymous auth only when guest accounts are desired.
- Disable public Realtime channel access.
- Apply and review the migration.
- Verify RLS with two different authenticated users.
- Confirm a non-member cannot subscribe to a room topic.
- Confirm a room member can receive Presence and Broadcast.
- Confirm a service-role or secret key is never present in source, builds, logs, screenshots, or support exports.
- Load-test room joins before increasing capacity.
- Add server-authoritative match actions before enabling public Ranked multiplayer.
