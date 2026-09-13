# V58 Server-Authoritative Turns

V58 moves the first critical gameplay decisions away from the client. A player can request an action, but cannot choose the dice values, current turn, revision, movement destination, or START salary result.

## Security model

- The client uses only a Supabase publishable key.
- RPC functions derive identity from `auth.uid()`.
- Only ready room players are copied into an authoritative match.
- Only the room host may start the match.
- Only the player occupying the current seat may submit a command.
- Every command supplies an expected revision.
- Every command supplies an idempotency key.
- Direct table writes are not granted to `authenticated`.
- Room members receive private `match_event` Broadcast messages.

## Database objects

- `marble_authoritative_matches`
- `marble_authoritative_match_players`
- `marble_authoritative_match_events`
- `marble_authoritative_match_commands`
- `start_marble_authoritative_match`
- `get_marble_authoritative_match`
- `submit_marble_authoritative_command`

## Command flow

### ROLL

1. Lock the match row.
2. Validate match phase and expected revision.
3. Validate authenticated current-turn ownership.
4. Generate two d6 values with `pgcrypto` bytes.
5. Calculate movement and START pass on the server.
6. Increment revision.
7. Append `DICE_ROLLED`.
8. Broadcast `match_event` privately.

### END_TURN

1. Require a completed server roll.
2. Read the server-stored double result.
3. Keep the same seat for doubles, otherwise advance the seat.
4. Increment the round after wrapping to seat zero.
5. Increment revision.
6. Append `TURN_ENDED`.
7. Broadcast the event privately.

## Client modules

- `AuthoritativeMatchProtocol.ts`
- `SupabaseAuthoritativeMatchAdapter.ts`
- `AuthoritativeMatchNetworkService.ts`
- `RealtimeMultiplayerService.ts`
- Online Center Authority Console in `FrontEndShell.ts`

## Next reducer stage

The secure command table and revision protocol are designed to accept additional commands later: purchase, upgrade, rent settlement, takeover, card choice, travel destination, bankruptcy sale, and match result finalization.
