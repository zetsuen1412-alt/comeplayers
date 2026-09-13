# V56 Online Foundation and Replay Architecture

## Scope

V56 adds versioned contracts for an online identity, friend-room resume state, cloud-save manifests, and compact replay records. The current Cocos runtime remains fully playable offline and does not silently transmit data.

## Online profile

The profile save contains:

- Stable local profile ID.
- Display name and player tag.
- Six-character friend code.
- Presence state.
- Friend-list contract with a 24-entry cap.
- Active friend-room resume data.
- Cloud generation, checksum, and conflict state.

The first launch after migration replaces the placeholder profile ID with a deterministic device-local identity and persists it.

## Friend rooms

The room contract supports:

- Solo or Team mode.
- Four player slots.
- Two spectator slots.
- Six-character invite code.
- Host reconnect token.
- Ready, connected, and disconnected states.
- Team assignment for 2v2 rooms.
- Ten-minute reconnect window.

The V56 UI uses simulated guests to test slot capacity and reconnect behavior without claiming a live network connection.

## Cloud-save foundation

`OnlineProfileService.prepareCloudBackup()` creates a manifest from:

- Profile ID.
- Local save revision.
- Save update timestamp.
- Local cloud generation.
- Stable checksum.

The manifest is transport-neutral. A future backend adapter can upload it together with an authenticated save payload. V56 also models synced and conflict states and preserves local data when persistence fails.

## Replay recorder

Every completed match can store:

- Match mode and Ranked flag.
- AI difficulty and player count.
- Winner or winning team.
- Round and duration.
- Dice results.
- Movement paths.
- Important messages and actions.
- Final result event.
- Stable checksum.

Limits:

- Maximum 180 events per replay.
- Maximum 12 replays in the local library.
- Duplicate adjacent messages are ignored.
- Movement paths retain only the last sixteen tile indices per event.

This bounded event stream can later drive a replay camera or a read-only spectator client.

## Files

- `assets/scripts/save/OnlineProfileData.ts`
- `assets/scripts/save/ReplayLibraryData.ts`
- `assets/scripts/network/FriendRoomService.ts`
- `assets/scripts/core/OnlineProfileService.ts`
- `assets/scripts/core/MatchReplayRecorder.ts`
- `assets/scripts/core/ReplayLibraryService.ts`
- `assets/scripts/save/LocalSaveData.ts`
- `assets/scripts/save/LocalSaveService.ts`
- `assets/scripts/core/GameBootstrap.ts`
- `assets/scripts/ui/FrontEndCatalog.ts`
- `assets/scripts/ui/FrontEndShell.ts`
