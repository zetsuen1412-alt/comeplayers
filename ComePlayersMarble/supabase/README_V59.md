# ComePlayers Marble V59 — Authoritative Economy Server

Apply `20260719061200_marble_v59_authoritative_economy.sql` after the V57 and V58 migrations.

The migration adds:

- RPC-only property purchase, upgrade, Landmark, rent, and takeover decisions.
- Read-only RLS property snapshots for room members.
- Deterministic 70% asset liquidation and bankruptcy.
- Solo/Team victory and round-limit net-worth calculation.
- Extended append-only event kinds and command kinds.
- Migration of already-created V58 match state.

The client must use a publishable key. Never ship a service-role or secret key. Test with separate authenticated/anonymous sessions; two tabs sharing one session represent the same player and cannot occupy two seats.
